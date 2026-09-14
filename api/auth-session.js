import { createBlueAuthHandler } from './_lib/blue-auth.js';
import { BLUE_CLOUD } from './_lib/convex.js';
// /api/auth-session — the session half of sign-in.
//
// Method-multiplexed rather than split across four files: they share the cookie
// handling, the CSRF check and the response shape, and separating them would
// duplicate all three for no gain.
//
//   GET     issue a CSRF token and report who is signed in (or nobody)
//   POST    verify a code, create the session, set bf_session
//   PATCH   complete the profile, then write the CRM row
//   DELETE  sign out
//
// GET is the only method that does not require a CSRF token, because GET is
// where the token comes from. It is also the only one that changes nothing.
//
// Request/response bodies are JSON; every response carries { ok }.

import { isAllowedOrigin, clientIp } from './_lib/guard.js';
import {
  parseCookies, verifyCsrf, ensureCsrfToken, randomToken,
  setSessionCookie, clearSessionCookie, SESSION_COOKIE, SESSION_MAX_AGE,
} from './_lib/cookies.js';
import {
  normalizeEmail, normalizeCode, hashCode, hashToken, validateProfile,
  authBuckets, SESSION_DAYS,
} from './_lib/auth.js';
import { checkRate, verifyCode, completeProfile, getSession, signOut, markSynced } from './_lib/db.js';
import { configuredProviders } from './_lib/oidc.js';
import { pushLead } from './_lib/mailer.js';
import { send as sendJson, readBody, limit } from './_lib/http.js';
import { RATE_IP_PER_MIN, RATE_GLOBAL_PER_DAY } from './auth-code.js';

// Every response here varies by cookie — it carries identity, and a shared cache
// keying without this would serve one visitor's account to another.
function send(res, status, payload) {
  return sendJson(res, status, payload, { vary: 'Cookie' });
}

// A visitor mistypes a code far more often than they request a new one, so
// verification gets a looser per-IP allowance than sending does — but still a
// bounded one, or this becomes a free oracle for guessing across many addresses.
const VERIFY_IP_MULTIPLIER = 4;

/** The raw session token from the cookie, or '' when there is none. */
function sessionToken(req) {
  return parseCookies(req)[SESSION_COOKIE] || '';
}

export default async function handler(req, res) {
  if (process.env.CONVEX_CLOUD_URL === BLUE_CLOUD) return createBlueAuthHandler()(req,res,'session');
  const method = String(req.method || '').toUpperCase();

  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method)) {
    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return send(res, 405, { ok: false, reason: 'method' });
  }

  if (!isAllowedOrigin(req)) {
    return send(res, 403, { ok: false, reason: 'origin' });
  }

  if (method !== 'GET' && !verifyCsrf(req)) {
    return send(res, 403, { ok: false, reason: 'csrf' });
  }

  if (method === 'GET') return handleGet(req, res);
  if (method === 'POST') return handleVerify(req, res);
  if (method === 'PATCH') return handleProfile(req, res);
  return handleSignOut(req, res);
}

/**
 * Who am I — and here is a CSRF token.
 *
 * The page calls this on mount. It has to, because the site is prerendered by
 * vite-react-ssg: there is no server render that could have set the token
 * cookie, so the first request of the session is what mints it.
 *
 * Two callers now: /signin, which needs the token before it can POST, and the
 * navbar on every page, which needs only `account`. ensureCsrfToken keeps the
 * second from invalidating the first — see its comment in _lib/cookies.js.
 */
async function handleGet(req, res) {
  const csrfToken = ensureCsrfToken(req, res);
  const token = sessionToken(req);

  // Which social buttons to render. The page is prerendered by vite-react-ssg,
  // so it cannot know at build time which provider secrets this deployment
  // actually has — and a button that dead-ends in a 500 because nobody set
  // MS_CLIENT_SECRET is worse than no button.
  const providers = configuredProviders();

  if (!token) return send(res, 200, { ok: true, csrfToken, providers, account: null });

  let session;
  try {
    session = await getSession(hashToken(token));
  } catch (err) {
    // Degrade to signed-out rather than failing. The visitor can sign in again;
    // a hard error here would leave the page unable to render at all.
    console.error('[auth-session] getSession failed:', err.message);
    return send(res, 200, { ok: true, csrfToken, providers, account: null });
  }

  if (!session?.ok) {
    // Expired or unknown — clear the stale cookie so the browser stops sending it.
    clearSessionCookie(res);
    return send(res, 200, { ok: true, csrfToken, providers, account: null });
  }

  return send(res, 200, {
    ok: true,
    csrfToken,
    providers,
    account: session.account,
    needsProfile: !!session.needs_profile,
  });
}

/** Verify a code and open a session. */
async function handleVerify(req, res) {
  const buckets = authBuckets(clientIp(req));
  try {
    const rate = await checkRate(buckets.ip, buckets.global);
    const perIpPerMin = limit('AUTH_RATE_IP_PER_MIN', RATE_IP_PER_MIN) * VERIFY_IP_MULTIPLIER;
    if (Number(rate?.ip_hits || 0) > perIpPerMin) {
      return send(res, 429, { ok: false, reason: 'rate_ip' });
    }
    // The global ceiling was missing here. authBuckets increments the same
    // shared global bucket that /api/auth-code reads, so verification traffic
    // was CONSUMING the daily allowance without ever being BOUNDED by it —
    // leaving a hole exactly where the brute-force pressure is.
    if (Number(rate?.global_hits || 0) > limit('AUTH_RATE_GLOBAL_PER_DAY', RATE_GLOBAL_PER_DAY)) {
      return send(res, 429, { ok: false, reason: 'rate_global' });
    }
  } catch (err) {
    // Fail closed, as in auth-code.js: the per-code attempt counter is the main
    // defence, but it is per code, and this is what bounds attempts ACROSS codes.
    console.error('[auth-session] rate limit check failed, refusing:', err.message);
    return send(res, 503, { ok: false, reason: 'unavailable' });
  }

  const body = readBody(req);
  const email = normalizeEmail(body.email);
  const code = normalizeCode(body.code);
  if (!email || code.length !== 6) {
    return send(res, 400, { ok: false, reason: 'invalid' });
  }

  // Minted here, never accepted from the client — a token the browser can choose
  // is a token an attacker can choose. Only its hash reaches the database.
  const token = randomToken();

  let result;
  try {
    result = await verifyCode(email, hashCode(code, email), hashToken(token), SESSION_DAYS);
  } catch (err) {
    console.error('[auth-session] verifyCode failed:', err.message);
    return send(res, 503, { ok: false, reason: 'unavailable' });
  }

  if (!result?.ok) {
    return send(res, 401, {
      ok: false,
      reason: result?.reason || 'bad_code',
      attemptsLeft: result?.attempts_left,
    });
  }

  setSessionCookie(res, token, SESSION_MAX_AGE);

  return send(res, 200, {
    ok: true,
    account: result.account,
    needsProfile: !!result.needs_profile,
  });
}

/**
 * Complete the profile, then write the CRM row.
 *
 * Authorised by the session cookie alone. The browser never says which account
 * it is editing, so there is no id to tamper with — auth_complete_profile
 * resolves the account from the session hash itself.
 */
async function handleProfile(req, res) {
  const token = sessionToken(req);
  if (!token) return send(res, 401, { ok: false, reason: 'no_session' });

  const body = readBody(req);
  const valid = validateProfile(body);
  if (!valid.ok) {
    return send(res, 400, { ok: false, reason: 'invalid', field: valid.field });
  }

  let result;
  try {
    result = await completeProfile(hashToken(token), valid.profile);
  } catch (err) {
    console.error('[auth-session] completeProfile failed:', err.message);
    return send(res, 503, { ok: false, reason: 'unavailable' });
  }

  if (!result?.ok) {
    return send(res, 401, { ok: false, reason: result?.reason || 'no_session' });
  }

  const account = result.account;

  // The CRM push is the one thing here allowed to fail quietly. The account is
  // already saved and the visitor has already proved their address; refusing the
  // sign-in because a Google Apps Script call timed out would punish them for an
  // outage on our side. sheet_synced stays false, which is how a failed push
  // stays findable — `select * from web_accounts where not sheet_synced`.
  try {
    await pushLead({
      name: account.name,
      email: account.email,
      phone: account.phone,
      country: account.country,
      industry: account.industry,
      lang: account.lang,
      pageUrl: typeof body.pageUrl === 'string' ? body.pageUrl.slice(0, 500) : '',
    });
    await markSynced(account.id);
    account.sheet_synced = true;
  } catch (err) {
    console.error('[auth-session] CRM push failed, sign-in still complete:', err.message);
  }

  return send(res, 200, { ok: true, account, needsProfile: false });
}

/** Sign out. Idempotent, and clears the cookie even if the delete failed. */
async function handleSignOut(req, res) {
  const token = sessionToken(req);
  if (token) {
    try {
      await signOut(hashToken(token));
    } catch (err) {
      // The cookie is cleared regardless, so the browser stops presenting it.
      // The row expires on its own and is pruned by auth_request_code.
      console.error('[auth-session] signOut failed:', err.message);
    }
  }
  clearSessionCookie(res);
  return send(res, 200, { ok: true, account: null });
}
