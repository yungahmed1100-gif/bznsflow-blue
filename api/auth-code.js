import { createBlueAuthHandler } from './_lib/blue-auth.js';
import { BLUE_CLOUD } from './_lib/convex.js';
// POST /api/auth-code — send a one-time sign-in code.
//
// Same-origin with the site, so there is no CORS layer here, matching api/chat.js.
//
// Request   { email: string, lang?: 'ar'|'en' }  + the x-csrf-token header
// Response  { ok: true } | { ok: false, reason: string }
//
// THE INVARIANT: the response is identical whether or not an account exists for
// that address. This endpoint is public and unauthenticated, so anything that
// distinguished "we know you" from "we don't" would turn it into a customer-list
// oracle — type an address, read the answer, repeat. Nothing below ever looks up
// an account; auth_request_code does not join web_accounts at all.
//
// Reasons are machine-readable codes, not prose. The page owns the wording
// because it already carries both languages; replies.js exists for the chat
// widget, which has no i18n bundle of its own.

import { clientIp, isAllowedOrigin } from './_lib/guard.js';
import { verifyCsrf } from './_lib/cookies.js';
import {
  isValidEmail, normalizeEmail, generateCode, hashCode, authBuckets, CODE_TTL_MINUTES,
} from './_lib/auth.js';
import { checkRate, requestCode } from './_lib/db.js';
import { sendOtpEmail } from './_lib/mailer.js';
import { send, readBody, limit } from './_lib/http.js';

export const RATE_IP_PER_MIN = 5;
export const RATE_GLOBAL_PER_DAY = 300;

export default async function handler(req, res) {
  if (process.env.CONVEX_CLOUD_URL === BLUE_CLOUD) return createBlueAuthHandler()(req,res,'code');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { ok: false, reason: 'method' });
  }

  if (!isAllowedOrigin(req)) {
    return send(res, 403, { ok: false, reason: 'origin' });
  }

  // Unlike the chat, this endpoint is worth forging: it sends mail from our
  // domain to an address the attacker chooses. The token comes from
  // GET /api/auth-session, which the page calls on mount.
  if (!verifyCsrf(req)) {
    return send(res, 403, { ok: false, reason: 'csrf' });
  }

  const buckets = authBuckets(clientIp(req));
  try {
    const rate = await checkRate(buckets.ip, buckets.global);
    if (Number(rate?.ip_hits || 0) > limit('AUTH_RATE_IP_PER_MIN', RATE_IP_PER_MIN)) {
      return send(res, 429, { ok: false, reason: 'rate_ip' });
    }
    if (Number(rate?.global_hits || 0) > limit('AUTH_RATE_GLOBAL_PER_DAY', RATE_GLOBAL_PER_DAY)) {
      return send(res, 429, { ok: false, reason: 'rate_global' });
    }
  } catch (err) {
    // Fail CLOSED — the opposite of api/chat.js, and deliberately so. There the
    // limiter guards a cost ceiling and a degraded chat beats no chat. Here it
    // is the only thing standing between a database blip and an unmetered
    // mail cannon pointed at arbitrary inboxes.
    console.error('[auth-code] rate limit check failed, refusing:', err.message);
    return send(res, 503, { ok: false, reason: 'unavailable' });
  }

  const body = readBody(req);
  if (!isValidEmail(body.email)) {
    return send(res, 400, { ok: false, reason: 'email' });
  }
  const email = normalizeEmail(body.email);
  const lang = body.lang === 'ar' ? 'ar' : 'en';

  const code = generateCode();

  let stored;
  try {
    stored = await requestCode(email, hashCode(code, email), CODE_TTL_MINUTES);
  } catch (err) {
    console.error('[auth-code] requestCode failed:', err.message);
    return send(res, 503, { ok: false, reason: 'unavailable' });
  }

  if (!stored?.ok) {
    // too_soon / too_many. Both are about this address's own recent requests and
    // say nothing about whether it has an account, so they are safe to return.
    return send(res, 429, { ok: false, reason: stored?.reason || 'throttled' });
  }

  try {
    await sendOtpEmail({ email, code, lang });
  } catch (err) {
    // The code row is already stored. Reporting success here would leave the
    // visitor waiting for a message that does not exist, so this fails loudly —
    // the one place in this feature where a downstream failure is fatal.
    console.error('[auth-code] send failed:', err.message);
    return send(res, 502, { ok: false, reason: 'send_failed' });
  }

  return send(res, 200, { ok: true });
}
