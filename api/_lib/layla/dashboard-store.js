import { BLUE_SITE, convexConfigured } from '../convex.js';
import { PilotError } from './config.js';

// Server-to-server clients for the dashboard and campaign Convex routes. Reasons
// cross the boundary only as short machine codes; anything else is unavailable.
function convexClient(route, fallback, { env, fetcher, timeout }) {
  return async (operation, args = {}) => {
    if (!convexConfigured(env)) throw new PilotError(fallback, 503);
    try {
      const r = await fetcher(`${BLUE_SITE}/${route}`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeout),
        headers: { Authorization: `Bearer ${env.BLUE_REVIEW_SERVICE_SECRET}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ operation, ...args }) });
      if (!r.ok) throw Error('backend');
      const body = await r.json();
      if (!body?.ok) throw new PilotError(/^[a-z_]{1,60}$/.test(body?.reason) ? body.reason : fallback, body?.reason === 'sign_in_required' ? 401 : 409);
      return body.value;
    } catch (e) { if (e instanceof PilotError) throw e; throw new PilotError(fallback, 503); }
  };
}
export const dashboardStore = ({ env = process.env, fetcher = fetch } = {}) => convexClient('blue-dashboard', 'dashboard_unavailable', { env, fetcher, timeout: 8000 });
export const campaignStore = ({ env = process.env, fetcher = fetch } = {}) => convexClient('blue-campaign', 'campaign_unavailable', { env, fetcher, timeout: 6000 });
