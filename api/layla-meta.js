import { randomUUID } from 'node:crypto';
import { createMessagingApi } from './_lib/layla/blue-messaging.js';
import { createDashboardApi } from './_lib/layla/dashboard-api.js';
import { settings, PilotError } from './_lib/layla/config.js';
import { owner } from './_lib/layla/owner.js';
import { send, readBody } from './_lib/http.js';
import { createStore, transact } from './_lib/layla/store.js';
import { answer, accept, reviewProfile, summary, maintain } from './_lib/layla/domain.js';
import { runOne } from './_lib/layla/gateway.js';
import { createHandler as activationApi } from './_lib/layla/activation-api.js';
import { createHandler as testApi } from './_lib/layla/test-api.js';
import { createHandler as openApi } from './_lib/layla/open-api.js';
import { createHandler as customerApi } from './_lib/layla/customer-api.js';
import { createHandler as eligibilityApi } from './_lib/layla/eligibility.js';
import { demoOptions } from './_lib/layla/blue-demo.js';
import { createReviewHandler, reviewAvailable } from './_lib/layla/review-api.js';
export function createHandler({ store = createStore(), configuration = settings, sessionLookup, now = Date.now, fetcher = fetch, env = process.env } = {}) {
  const activation = activationApi({ store, configuration, sessionLookup, now, fetcher });
  const supervised = testApi({ store, configuration, sessionLookup, now });
  const open = openApi({ store, configuration, sessionLookup, now, fetcher, env });
  const customer = customerApi({ configuration, sessionLookup, now, fetcher, env });
  const eligibility = eligibilityApi({ store, configuration, sessionLookup, now, fetcher, env });
  return async (req, res) => {
    try {
      // Rewrites keep these isolated owner APIs within the existing function quota.
      const url = new URL(req.url || '/api/layla-meta', 'https://internal.invalid');
      const surface = req.query?.surface || url.searchParams.get('surface');
      if (surface === 'eligibility') return eligibility(req, res);
      if (surface === 'customer') return customer(req, res);
      if (surface === 'open' || url.pathname === '/api/layla-meta-open') return open(req, res);
      if (surface === 'activation' || url.pathname === '/api/layla-meta-activation') return activation(req, res);
      if (surface === 'test' || url.pathname === '/api/layla-meta-test') return supervised(req, res);
      if (!['GET','POST'].includes(req.method)) { res.setHeader('Allow','GET, POST'); throw new PilotError('method',405); }
      const c = configuration();
      await owner(req, c, sessionLookup);
      if (req.method === 'POST') {
        const body = readBody(req);
        if (JSON.stringify(body).length > 10000) throw new PilotError('body_too_large',413);
        if (body.action === 'preview') {
          if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 1000) throw new PilotError('invalid_text');
          const { state } = await store.read(c);
          if (!state.profile.reviewed) throw new PilotError('profile_unreviewed',409);
          return send(res,200,{ ok: true, synthetic: true, ...answer(body.text,state.profile) }, { vary:'Cookie' });
        }
        if (body.action === 'work') await runOne({store, config: configuration, now});
        else await transact(store,c,s => {
          maintain(s,now());
          if (body.action === 'profile') { s.profile = reviewProfile(body.profile); s.paused = true; }
          else if (body.action === 'pause') {
            if (typeof body.paused !== 'boolean') throw new PilotError('invalid_pause');
            if (!body.paused && !s.profile.reviewed) throw new PilotError('profile_unreviewed',409);
            s.paused = body.paused;
          } else if (body.action === 'takeover') {
            if (typeof body.number !== 'string' || !/^\d{7,15}$/.test(body.number) || !s.contacts[body.number] || typeof body.paused !== 'boolean') throw new PilotError('invalid_contact');
            s.contacts[body.number].takeover = body.paused;
            s.contacts[body.number].handoffJobId = null;
            // Old queued messages are never revived by resuming human takeover.
            for (const j of Object.values(s.jobs)) if (j.from === body.number && j.status === 'queued') { j.status = 'blocked'; j.error = 'owner_takeover'; j.text = null; }
          } else if (body.action === 'simulate') {
            if (c.mode !== 'mock') throw new PilotError('mock_only',403);
            if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 1000) throw new PilotError('invalid_text');
            accept(s,[{kind:'message', id:`mock.in.${randomUUID()}`,from:'999000000000',at:now(),text:body.text}],now());
          } else if (body.action === 'simulate_delivery') {
            if (c.mode !== 'mock') throw new PilotError('mock_only',403);
            const j = Object.values(s.jobs).find(j => j.status === 'submitted' && j.providerId?.startsWith('mock.'));
            if (!j) throw new PilotError('no_mock_submission',409);
            accept(s,[{kind:'receipt',id:j.providerId,recipient:j.from,at:now(),status:'delivered',intent:j.intentId}],now());
          } else throw new PilotError('unknown_action');
          s.audit.push({at:now(),action:body.action,actor:c.owner});
        });
      }
      const { state } = await store.read(c);
      return send(res,200,{ok:true,...summary(state,c,now())},{vary:'Cookie'});
    } catch (error) {
      return send(res,error instanceof PilotError ? error.status : 503,{ok:false,reason:error instanceof PilotError ? error.code : 'unavailable'},{vary:'Cookie'});
    }
  };
}
export const customerAvailable = reviewAvailable;
const reviewCustomer = createReviewHandler({reviewMode:true});
const savedCustomer = createReviewHandler({reviewMode:false});
export default function blueHandler(req, res) {
  const surface = req.query?.surface || new URL(req.url || '/', 'https://internal.invalid').searchParams.get('surface');
  if (surface === 'messaging') return createMessagingApi()(req,res);
  // Owner dashboard shares this function to stay inside the Vercel function quota.
  if (surface === 'dashboard') return createDashboardApi()(req,res);
  if (surface === 'customer-status') {
    if (req.method !== 'GET') return send(res,405,{ok:false,reason:'method'});
    return send(res,200,{ok:true,available:customerAvailable()},{vary:'Cookie'});
  }
  if (surface === 'customer-review') return reviewCustomer(req, res);
  // Customer requests never receive the synthetic owner session or configuration.
  if (surface === 'customer') {
    return savedCustomer(req,res);
  }
  return createHandler(demoOptions(req, res))(req, res);
}
