import { PilotError } from './layla/config.js';
export const BLUE_CLOUD = 'https://quaint-nightingale-675.eu-west-1.convex.cloud';
export const BLUE_SITE = 'https://quaint-nightingale-675.eu-west-1.convex.site';
export function convexConfigured(env = process.env) {
  return env.CONVEX_CLOUD_URL === BLUE_CLOUD && (!env.VITE_CONVEX_URL || env.VITE_CONVEX_URL === BLUE_CLOUD)
    && /^[a-f0-9]{64}$/i.test(env.BLUE_REVIEW_SERVICE_SECRET || '') && !env.SUPABASE_URL && !env.SUPABASE_SERVICE_ROLE_KEY;
}
export function reviewStore({ env = process.env, fetcher = fetch } = {}) {
  return async (operation, args = {}) => {
    if (!convexConfigured(env)) throw new PilotError('review_backend_unavailable', 503);
    try {
      const r = await fetcher(`${BLUE_SITE}/blue-review`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Bearer ${env.BLUE_REVIEW_SERVICE_SECRET}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation, ...args }) });
      if (!r.ok) throw Error('backend');
      const result = await r.json();
      if (!result?.ok) throw new PilotError(['invalid_profile','profile_changed','refresh_throttled','session_expired','attempt_used','attempt_expired','invalid_state','operation_conflict','asset_in_use','attempt_limit'].includes(result?.reason) ? result.reason : 'review_backend_unavailable', 409);
      return result.value;
    } catch (e) { if (e instanceof PilotError) throw e; throw new PilotError('review_backend_unavailable', 503); }
  };
}
export function catalogStore({env=process.env,fetcher=fetch}={}){
  return async(operation,args={})=>{if(!convexConfigured(env))throw new PilotError('catalog_unavailable',503);try{const r=await fetcher(`${BLUE_SITE}/blue-catalog`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{Authorization:`Bearer ${env.BLUE_REVIEW_SERVICE_SECRET}`,'Content-Type':'application/json'},body:JSON.stringify({operation,...args})});if(!r.ok)throw Error('backend');const result=await r.json();if(!result?.ok)throw new PilotError(/^[a-z_]{1,60}$/.test(result?.reason)?result.reason:'catalog_unavailable',409);return result.value;}catch(e){if(e instanceof PilotError)throw e;throw new PilotError('catalog_unavailable',503);}};
}
