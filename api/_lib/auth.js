// Sign-in validation, code generation and hashing.
//
// Pure logic plus node:crypto — no I/O and no network, matching guard.js. The
// one thing it reads from the environment is AUTH_OTP_PEPPER, and only inside
// the hash function so an unset pepper fails loudly at the point of use rather
// than at import time (which would take the whole function down on a cold start).
//
// Validation is hand-rolled rather than schema-driven: the project carries no
// runtime dependencies at all, and this is not the feature that should introduce
// one for four fields.

import { createHash, randomInt } from 'node:crypto';
import { INDUSTRY_IDS } from '../../src/lib/industries.js';
import { COUNTRY_CODES, dialFor } from '../../src/lib/countries.js';

// Field caps. Generous enough not to reject a real person, tight enough that a
// row cannot be used as storage.
export const LIMITS = { name: 100, email: 254, phoneDigits: 15 };
// Exported because /api/lead applies the same floor to the playbook form's
// phone field. Two different numbers for "too short to be a phone number" is
// how the same visitor passes one form and fails the other.
export const MIN_PHONE_DIGITS = 4;

export const CODE_TTL_MINUTES = 10;
export const SESSION_DAYS = 30;

// Deliberately not a full RFC 5322 implementation: that regex is famously
// unreadable and still accepts addresses no mail server will take. This rejects
// the obviously-wrong shapes, and the code we send is what actually proves the
// address exists — the only proof that matters here.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** Lowercase and trim. The database stores and compares this form. */
export function normalizeEmail(raw) {
  return String(raw ?? '').trim().toLowerCase();
}

/** @returns {boolean} */
export function isValidEmail(raw) {
  const email = normalizeEmail(raw);
  return email.length > 0 && email.length <= LIMITS.email && EMAIL_RE.test(email);
}

/**
 * A 6-digit code as a zero-padded string.
 *
 * randomInt is rejection-sampled by Node, so every value in [0, 1000000) is
 * equally likely. The obvious `randomBytes(4) % 1000000` is not — it biases the
 * low end, which is exactly the sort of quiet weakness that makes a short code
 * worse than its digit count suggests.
 */
export function generateCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** Codes are compared as digits only, so a pasted "123 456" still works. */
export function normalizeCode(raw) {
  return String(raw ?? '').replace(/\D/g, '');
}

/**
 * Hash a code for storage.
 *
 * Salted with the email so the same code issued to two people yields different
 * hashes, and peppered from the environment so a database dump alone cannot
 * brute-force the 10^6 space offline. Fast hashing is fine here — what bounds
 * online guessing is the five-attempt limit and the ten-minute expiry, not the
 * cost of the hash.
 */
export function hashCode(code, email) {
  const pepper = process.env.AUTH_OTP_PEPPER;
  if (!pepper) throw new Error('AUTH_OTP_PEPPER is not configured');
  return createHash('sha256')
    .update(`${normalizeCode(code)}:${normalizeEmail(email)}:${pepper}`)
    .digest('hex');
}

/**
 * Hash a session token for storage.
 *
 * No pepper and no salt on purpose: the token is already 256 bits of CSPRNG
 * output, so there is no guessable input to protect. The hash exists only so
 * that read access to web_sessions is not enough to impersonate anyone.
 */
export function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

/**
 * Validate the profile step.
 *
 * The phone arrives split — an ISO country from the dropdown and the national
 * number typed by hand — and leaves as one E.164 string, because that is the
 * only form both WhatsApp and the CRM sheet can use without further guessing.
 * A leading 0 is a national trunk prefix and is dropped: someone selecting UAE
 * and typing 050... means +97150..., not +9710 50....
 *
 * @returns {{ ok: true, profile: object } | { ok: false, field: string }}
 */
export function validateProfile(input) {
  const src = input && typeof input === 'object' ? input : {};

  const name = String(src.name ?? '').trim();
  if (!name || name.length > LIMITS.name) return { ok: false, field: 'name' };

  const country = String(src.country ?? '').trim().toUpperCase();
  if (!COUNTRY_CODES.has(country)) return { ok: false, field: 'country' };

  const digits = String(src.phone ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length < MIN_PHONE_DIGITS || digits.length > LIMITS.phoneDigits) {
    return { ok: false, field: 'phone' };
  }

  const industry = String(src.industry ?? '').trim();
  if (!INDUSTRY_IDS.has(industry)) return { ok: false, field: 'industry' };

  const lang = src.lang === 'ar' ? 'ar' : 'en';

  return {
    ok: true,
    profile: { name, phone: `+${dialFor(country)}${digits}`, country, industry, lang },
  };
}

/**
 * Rate-limit bucket keys for the sign-in endpoints.
 *
 * Deliberately not guard.js's bucketKeys(), which returns `ip:<ip>:<minute>` and
 * is already incremented by every chat message. Sharing those keys would let
 * ordinary chatting exhaust the sign-in allowance and vice versa — same
 * web_rate_limits table, separate namespace.
 */
export function authBuckets(ip, now = new Date()) {
  return {
    ip: `auth:ip:${ip}:${now.toISOString().slice(0, 16)}`,
    global: `auth:global:${now.toISOString().slice(0, 10)}`,
  };
}
