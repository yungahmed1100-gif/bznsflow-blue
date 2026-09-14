import { settings, PilotError } from './config.js';
import { owner } from './owner.js';
import { createStore, transact } from './store.js';
import { testView, previewTest, stopTest, confirmTest, acceptTestEvents } from './supervised.js';
import { readBody, send } from '../http.js';

export function createHandler({ configuration = settings, store = createStore(), sessionLookup, now = Date.now, mockSend } = {}) {
  return async (req, res) => {
    try {
      if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); throw new PilotError('method', 405); }
      const c = configuration(); await owner(req, c, sessionLookup);
      if (req.method === 'POST') {
        const body = readBody(req);
        if (!body || JSON.stringify(body).length > 2000) throw new PilotError('invalid_body');
        if (body.action === 'send') throw new PilotError('test_transport_disabled', 403);
        if (body.action !== 'stop' && c.mode !== 'mock') throw new PilotError('mock_only', 403);
        if (body.action === 'confirm_mock') await confirmTest({ store, c, reviewId: body.reviewId, now, mockSend });
        else await transact(store, c, s => {
          if (body.action === 'preview') previewTest(s, body, now());
          else if (body.action === 'stop') stopTest(s);
          else if (body.action === 'receipt_mock') {
            const job = s.supervised?.events.find(j => j.status === 'accepted');
            if (!job) throw new PilotError('no_mock_submission', 409);
            acceptTestEvents(s, [{ kind: 'receipt', id: job.providerId, recipient: job.recipient, intent: job.id, at: now(), status: 'delivered' }], now());
          } else throw new PilotError('unknown_action');
        });
      }
      return send(res, 200, { ok: true, ...testView((await store.read(c)).state, now()) }, { vary: 'Cookie' });
    } catch (error) {
      return send(res, error instanceof PilotError ? error.status : 503, { ok: false, reason: error instanceof PilotError ? error.code : 'unavailable' }, { vary: 'Cookie' });
    }
  };
}
export default createHandler();
