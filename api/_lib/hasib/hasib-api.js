// Authenticated Hasib API: /api/layla-meta?surface=hasib
// Same boundary as the Layla dashboard: exact Blue host and origin, the
// __Host-blue_account session, CSRF double-submit. The tenant is always the
// signed-in account's saved draft; request bodies never name an account.
import { hasibStore } from '../convex.js';
import { blueAccount, blueAuthStore } from '../blue-auth.js';
import { ensureCsrfToken, verifyCsrf } from '../cookies.js';
import { readBody, send, sendPilotError } from '../http.js';
import { PilotError } from '../layla/config.js';
import { dashboardAvailable } from '../layla/dashboard-api.js';
import { hasibArgs } from './validate.js';

const HOST = 'bznsflow-blue.vercel.app', ORIGIN = `https://${HOST}`;
const LIMITS = { item_save: 40000, order_create: 40000 };
const DEFAULT_BODY_LIMIT = 6000;

export const hasibAvailable = (env = process.env) => dashboardAvailable(env) && env.BLUE_HASIB_ENABLED === 'true';

export function createHasibApi({ env = process.env, fetcher = fetch, accounts = blueAuthStore({ env, fetcher }), store = hasibStore({ env, fetcher }) } = {}) {
  return async (req, res) => {
    try {
      if (req.headers?.host !== HOST || (req.method !== 'GET' && req.headers?.origin !== ORIGIN)) throw new PilotError('origin', 403);
      if (!['GET', 'POST'].includes(req.method)) throw new PilotError('method', 405);
      if (!hasibAvailable(env)) throw new PilotError('hasib_unavailable', 503);
      const account = await blueAccount(req, accounts);
      if (!account) throw new PilotError('sign_in_required', 401);
      if (!account.draftHash) throw new PilotError('setup_required', 409);
      const sessionHash = account.draftHash;
      const csrfToken = ensureCsrfToken(req, res);
      const reply = value => send(res, 200, { ok: true, ...value, csrfToken }, { vary: 'Cookie' });

      if (req.method === 'GET') return reply(await store('overview', { sessionHash }));
      if (!verifyCsrf(req)) throw new PilotError('csrf', 403);
      const body = readBody(req);
      const action = typeof body.action === 'string' ? body.action : '';
      if (JSON.stringify(body).length > (LIMITS[action] || DEFAULT_BODY_LIMIT)) throw new PilotError('body_too_large', 413);
      return reply(await store(action, { sessionHash, ...hasibArgs(action, body) }));
    } catch (e) {
      return sendPilotError(res, e, { fallback: 'hasib_unavailable', vary: 'Cookie' });
    }
  };
}
