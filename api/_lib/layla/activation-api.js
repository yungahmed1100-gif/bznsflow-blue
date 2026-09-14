import { settings, PilotError } from './config.js';
import { owner } from './owner.js';
import { createStore } from './store.js';
import { activationView, prepareActivation, activate, recoverSubscription } from './activation.js';
import { readBody, send } from '../http.js';

function clearRequestBody(req) {
  // Vercel can expose a configurable getter-only body. Clearing must neither
  // invoke that getter nor throw after an otherwise successful response.
  const descriptor = Object.getOwnPropertyDescriptor(req, 'body');
  if (descriptor?.configurable) delete req.body;
  else if (descriptor?.writable) req.body = undefined;
}

export function createHandler({ configuration = settings, store = createStore(), sessionLookup, fetcher = fetch, now = Date.now } = {}) {
  return async (req, res) => {
    let body;
    try {
      if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); throw new PilotError('method', 405); }
      const c = configuration();
      await owner(req, c, sessionLookup);
      if (req.method === 'POST') {
        body = readBody(req);
        clearRequestBody(req);
        if (!body || JSON.stringify(body).length > 1000) throw new PilotError('invalid_body');
        if (body.action === 'prepare') return send(res, 200, { ok: true, ...await prepareActivation(store, c, now()) }, { vary: 'Cookie' });
        if (body.action === 'recover_subscription') await recoverSubscription({ store, c, now, fetcher });
        else if (body.action === 'activate') await activate({ store, c, challenge: body.challenge, pin: body.pin, now, fetcher });
        else throw new PilotError('unknown_action');
      }
      return send(res, 200, { ok: true, ...activationView(c, (await store.read(c)).state) }, { vary: 'Cookie' });
    } catch (error) {
      return send(res, error instanceof PilotError ? error.status : 503, { ok: false, reason: error instanceof PilotError ? error.code : 'unavailable' }, { vary: 'Cookie' });
    } finally { if (body && typeof body === 'object') delete body.pin; clearRequestBody(req); }
  };
}
export default createHandler();
