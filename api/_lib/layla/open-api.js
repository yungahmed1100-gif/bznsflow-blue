import { randomUUID } from 'node:crypto';
import { settings, PilotError } from './config.js';
import { owner } from './owner.js';
import { createStore, transact } from './store.js';
import { checkMetaReadiness } from './readiness.js';
import { openView, prepareOpen, startOpen, stopOpen, feedbackOpen, maintainOpen } from './open-test.js';
import { readBody, send } from '../http.js';

export function createHandler({ configuration = settings, store = createStore(), sessionLookup, now = Date.now, fetcher = fetch, env = process.env } = {}) {
  return async (req, res) => {
    try {
      if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); throw new PilotError('method', 405); }
      const c = configuration(); await owner(req, c, sessionLookup);
      let challenge;
      if (req.method === 'POST') {
        const body = readBody(req);
        if (!body || JSON.stringify(body).length > 4000) throw new PilotError('invalid_body');
        if (['prepare', 'start'].includes(body.action)) {
          const readiness = await checkMetaReadiness(c, fetcher);
          if (!readiness.ready) throw new PilotError('readiness_incomplete', 409);
          challenge = body.action === 'prepare' ? randomUUID() : undefined;
          const id = randomUUID();
          await transact(store, c, s => {
            if (!s.activation) throw new PilotError('readiness_incomplete', 409);
            s.activation.readiness = readiness;
            if (body.action === 'prepare') prepareOpen(s, c, env, body.profile, now(), challenge);
            else startOpen(s, c, env, body.challenge, now(), id);
          });
        } else await transact(store, c, s => {
          if (body.action === 'stop') stopOpen(s, now());
          else if (body.action === 'feedback') feedbackOpen(s, body, now());
          else throw new PilotError('unknown_action');
        });
      }
      await transact(store, c, s => maintainOpen(s, now()));
      return send(res, 200, { ok: true, ...openView((await store.read(c)).state, c, env, now()), ...(challenge ? { challenge } : {}) }, { vary: 'Cookie' });
    } catch (e) { return send(res, e instanceof PilotError ? e.status : 503, { ok: false, reason: e instanceof PilotError ? e.code : 'unavailable' }, { vary: 'Cookie' }); }
  };
}
