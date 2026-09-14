// POST /api/lead — capture a lead and, for the playbook, trigger its email.
//
// This exists to get the browser out of the middle of a Google Apps Script call.
//
// PlaybookModal used to post straight to the /exec URL with `mode: 'no-cors'`,
// because Apps Script 302s to a googleusercontent origin that sends no CORS
// headers. That had three consequences, all bad:
//
//   1. The response was opaque, so the page could not tell success from failure
//      and fired the Meta `Lead` event either way.
//   2. There was no timeout, and `doPost` synchronously downloads the teaser and
//      the PDF before replying — so a slow Apps Script left the modal's submit
//      button disabled with the page's scroll locked. That is the "tab freezes"
//      report, and it was never a freeze; it was an unbounded await.
//   3. It forced `Content-Type: text/plain` to dodge a preflight Apps Script
//      cannot answer.
//
// Server-side none of that applies: no CORS, fetch follows the redirect, and the
// real JSON comes back. Same reasoning as api/_lib/mailer.js, which this reuses.
//
// Request   { name?, email, phone?, industry?, sourceCta?, language?, pageUrl?,
//             playbook?: boolean }
// Response  { ok: true, emailed?: boolean } | { ok: false, reason: string }

import { isAllowedOrigin, clientIp } from './_lib/guard.js';
import { isValidEmail, normalizeEmail, authBuckets, LIMITS, MIN_PHONE_DIGITS } from './_lib/auth.js';
import { INDUSTRY_IDS } from '../src/lib/industries.js';
import { checkRate } from './_lib/db.js';
import { pushLead } from './_lib/mailer.js';
import { send, readBody } from './_lib/http.js';

const SITE = 'https://www.bznsflowai.com';

// Kept in step with src/lib/constants.js by tests/contracts.test.mjs — the drift
// this path already suffered once is the whole reason /api/lead passes it at all.
const PLAYBOOK_PDF = '/bznsflow-sme-operating-playbook.pdf';

/**
 * Keep a usable phone number, or nothing.
 *
 * Deliberately lenient, and deliberately never fatal. The form asks for a dial
 * code because it offers no country selector, so what arrives is whatever the
 * visitor typed. This file already lets a lead through when the rate-limit
 * check itself fails, on the grounds that a lead is revenue; losing one over a
 * mistyped digit would be the same mistake with a smaller excuse.
 */
export function cleanPhone(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length < MIN_PHONE_DIGITS || digits.length > LIMITS.phoneDigits) return undefined;
  // Preserved as typed, minus the noise. Unlike the sign-in profile there is no
  // country here to derive a dial code from, so none is invented.
  return `+${digits}`;
}

/** Keep the sector only if it is one we actually defined. Same rule, no 400. */
export function cleanIndustry(raw) {
  const id = String(raw ?? '').trim();
  return INDUSTRY_IDS.has(id) ? id : undefined;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { ok: false, reason: 'method' });
  }

  if (!isAllowedOrigin(req)) {
    return send(res, 403, { ok: false, reason: 'origin' });
  }

  // No CSRF here, deliberately. This endpoint is an unauthenticated public form
  // that carries no session and grants no privilege, so there is nothing for a
  // forged request to escalate — the same reasoning that leaves /api/chat open.
  // Metering is what bounds abuse.
  const buckets = authBuckets(clientIp(req));
  try {
    const rate = await checkRate(buckets.ip, buckets.global);
    if (Number(rate?.ip_hits || 0) > Number(process.env.LEAD_RATE_IP_PER_MIN || 5)) {
      return send(res, 429, { ok: false, reason: 'rate_ip' });
    }
  } catch (err) {
    // Fail OPEN, unlike the auth endpoints. A lead is revenue and this path
    // sends mail only to the address the visitor typed, so the worst case of a
    // database blip is an unmetered form — not an open relay.
    console.error('[lead] rate limit check failed, allowing:', err.message);
  }

  const body = readBody(req);

  if (!isValidEmail(body.email)) {
    return send(res, 400, { ok: false, reason: 'email' });
  }

  const name = String(body.name ?? '').trim().slice(0, LIMITS.name);
  const wantsPlaybook = body.playbook === true;

  try {
    const result = await pushLead({
      name,
      email: normalizeEmail(body.email),
      phone: cleanPhone(body.phone),
      industry: cleanIndustry(body.industry),
      sourceCta: String(body.sourceCta ?? 'Playbook Popup').slice(0, 80),
      lang: body.language === 'ar' ? 'ar' : 'en',
      pageUrl: typeof body.pageUrl === 'string' ? body.pageUrl.slice(0, 500) : '',
      playbook: wantsPlaybook,
      // Absolute, because Apps Script fetches it from the open internet.
      playbookUrl: wantsPlaybook ? `${SITE}${PLAYBOOK_PDF}` : undefined,
    });

    // `emailed: false` means the row saved but the mail failed — the exact state
    // that went unnoticed for weeks when the PDF 404'd. Surfaced, not swallowed.
    if (wantsPlaybook && result?.emailed === false) {
      console.error('[lead] row saved but playbook email failed:', result.emailError);
      return send(res, 200, { ok: true, emailed: false });
    }

    return send(res, 200, { ok: true, emailed: wantsPlaybook ? true : undefined });
  } catch (err) {
    console.error('[lead] capture failed:', err.message);
    return send(res, 502, { ok: false, reason: 'capture_failed' });
  }
}
