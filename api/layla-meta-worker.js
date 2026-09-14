import { settings, PilotError } from './_lib/layla/config.js';
import { createBlueWorker } from './_lib/layla/blue-messaging.js';
import { safeEqual } from './_lib/cookies.js';
import { send } from './_lib/http.js';
import { createStore, transact } from './_lib/layla/store.js';
import { runOne } from './_lib/layla/gateway.js';
import { runOpen, maintainOpen } from './_lib/layla/open-test.js';
import { customerStore } from './_lib/layla/customer-store.js';
export function createHandler({store=createStore(), configuration=settings, env=process.env, now=Date.now, fetcher=fetch}={}) {
  return async (req,res) => {
    if (req.method !== 'POST') { res.setHeader('Allow','POST'); return send(res,405,{ok:false,reason:'method'}); }
    const expected=env.LAYLA_META_WORKER_SECRET;
    if (!expected || !safeEqual(req.headers?.authorization || '',`Bearer ${expected}`)) return send(res,401,{ok:false,reason:'worker_auth'});
    try {
      const c = configuration();
      if (env.LAYLA_CUSTOMER_ONBOARDING_ENABLED === 'true') await customerStore({ env }).cleanup();
      await transact(store, c, s => { s.openWorkerAt = now(); maintainOpen(s, now()); });
      if ((await store.read(c)).state.openTest) return send(res,200,{ok:true,...await runOpen({store,configuration,env,now,fetcher})});
      return send(res,200,{ok:true,...await runOne({store,config:configuration,now,fetcher})});
    }
    catch(e) { return send(res,e instanceof PilotError ? e.status : 503,{ok:false,reason:e instanceof PilotError ? e.code : 'unavailable'}); }
  };
}
const ownerWorker=createHandler();
export default function handler(req,res) {
  if(process.env.CONVEX_CLOUD_URL==='https://quaint-nightingale-675.eu-west-1.convex.cloud') return createBlueWorker()(req,res);
  return ownerWorker(req,res);
}
