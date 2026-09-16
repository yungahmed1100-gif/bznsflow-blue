import { PilotError } from './layla/config.js';

export const BLUE_CLOUD = 'https://quaint-nightingale-675.eu-west-1.convex.cloud';
export const BLUE_SITE = 'https://quaint-nightingale-675.eu-west-1.convex.site';

export function convexConfigured(env = process.env) {
  return env.CONVEX_CLOUD_URL === BLUE_CLOUD && (!env.VITE_CONVEX_URL || env.VITE_CONVEX_URL === BLUE_CLOUD)
    && /^[a-f0-9]{64}$/i.test(env.BLUE_REVIEW_SERVICE_SECRET || '') && !env.SUPABASE_URL && !env.SUPABASE_SERVICE_ROLE_KEY;
}

/** The shape a reason code must have to be forwarded to a caller unchanged. */
const REASON_CODE = /^[a-z_]{1,60}$/;

/**
 * Build a server-to-server client for one Convex HTTP route.
 *
 * There were six of these, written separately and drifting: the same
 * "check configured → POST with a bearer and a timeout → reject non-ok → map the
 * reason" body, with a different route, timeout, reason policy and status in
 * each. `convexClient` in layla/dashboard-store.js had already generalised most
 * of it; this is that version, promoted so all six share it.
 *
 * Every difference between the old six is a parameter here, so behaviour is
 * preserved exactly rather than approximately.
 *
 * `redirect: 'error'` matters: a redirect away from the Convex site would carry
 * the bearer token with it.
 *
 * @param {object} config
 * @param {string} config.route       path segment on BLUE_SITE
 * @param {string} config.fallback    reason used when the backend is unreachable,
 *                                    unconfigured, or answers with a reason we
 *                                    will not forward
 * @param {number} [config.timeout]   ms
 * @param {string[]|RegExp} [config.reasons] which reasons may cross the boundary:
 *                                    an explicit allowlist, or a shape
 * @param {(reason: string) => number} [config.status] status for a rejected call
 */
function convexStore({ route, fallback, timeout = 8000, reasons = REASON_CODE, status = () => 409 }) {
  const forwards = (reason) => Array.isArray(reasons) ? reasons.includes(reason) : reasons.test(reason || '');

  return ({ env = process.env, fetcher = fetch } = {}) => async (operation, args = {}) => {
    if (!convexConfigured(env)) throw new PilotError(fallback, 503);
    try {
      const response = await fetcher(`${BLUE_SITE}/${route}`, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(timeout),
        headers: { Authorization: `Bearer ${env.BLUE_REVIEW_SERVICE_SECRET}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation, ...args }),
      });
      if (!response.ok) throw Error('backend');
      // `fetcher` is injectable, so json() is `unknown` to the checker. The shape
      // is the Convex route contract: { ok, reason?, value? }.
      const body = /** @type {{ ok?: boolean, reason?: string, value?: unknown }} */ (await response.json());
      if (!body?.ok) {
        const reason = forwards(body?.reason) ? body.reason : fallback;
        throw new PilotError(reason, status(reason));
      }
      return body.value;
    } catch (error) {
      // A PilotError is already a decided answer; anything else is an
      // infrastructure failure and must not leak its shape to the caller.
      if (error instanceof PilotError) throw error;
      throw new PilotError(fallback, 503);
    }
  };
}

// Reasons the review flow is allowed to show a customer. Anything outside the
// list is a backend detail and collapses to `review_backend_unavailable`.
const REVIEW_REASONS = ['invalid_profile', 'profile_changed', 'refresh_throttled', 'session_expired',
  'attempt_used', 'attempt_expired', 'invalid_state', 'operation_conflict', 'asset_in_use', 'attempt_limit'];

const AUTH_REASONS = ['too_soon', 'too_many', 'code_invalid', 'session_expired', 'draft_not_claimable'];

// A dashboard call that fails for want of a session is a 401, not a conflict:
// the client retries it by signing in, not by changing the request.
const signInAware = (reason) => reason === 'sign_in_required' ? 401 : 409;

export const reviewStore = convexStore({ route: 'blue-review', fallback: 'review_backend_unavailable', reasons: REVIEW_REASONS });
export const catalogStore = convexStore({ route: 'blue-catalog', fallback: 'catalog_unavailable' });
export const blueAuthStore = convexStore({ route: 'blue-auth', fallback: 'account_unavailable', timeout: 6000, reasons: AUTH_REASONS });
export const dashboardStore = convexStore({ route: 'blue-dashboard', fallback: 'dashboard_unavailable', status: signInAware });
export const campaignStore = convexStore({ route: 'blue-campaign', fallback: 'campaign_unavailable', timeout: 6000, status: signInAware });
export const messagingStore = convexStore({ route: 'blue-messaging', fallback: 'messaging_unavailable', timeout: 6000 });
