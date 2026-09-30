import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { instagramStore, messagingStore, convexConfigured } from '../convex.js';
import { blueAccount, blueAuthStore } from '../blue-auth.js';
import { ensureCsrfToken, verifyCsrf } from '../cookies.js';
import { readBody, send, sendPilotError } from '../http.js';
import { PilotError } from './config.js';
import { sealToken, openToken, credentialContext } from './customer-meta.js';

export const INSTAGRAM_ORIGIN='https://bznsflow-blue.vercel.app';
// Instagram returns to this address without any query string, so it must have none.
// The router recognises the return by our 64-hex state (requestSurface in api/layla-meta.js).
export const INSTAGRAM_CALLBACK=`${INSTAGRAM_ORIGIN}/api/layla-meta`;
export const INSTAGRAM_SCOPES=['instagram_business_basic','instagram_business_manage_messages'];
// subscribed_apps on graph.instagram.com reports our app under its Instagram-side
// ID, not the Instagram app ID or the parent Meta app ID (observed live 2026-09-24).
const INSTAGRAM_APP_ALIASES={'1674756910890232':['18118498949004481']};
const digest=s=>createHash('sha256').update(s).digest('hex');
// The only failure reasons the OAuth callback passes back to the setup page.
// Anything else becomes a plain "could not connect", so provider or internal
// error codes are never reflected into a URL.
export const INSTAGRAM_CALLBACK_REASONS=['asset_in_use','different_account','connection_busy','instagram_permissions_missing','invalid_oauth_state','sign_in_required','instagram_unavailable','instagram_subscription_failed','instagram_provider_failed','instagram_provider_unavailable','instagram_rate_limited'];
const asset=s=>typeof s==='string' && /^\d{1,30}$/.test(s);

export function instagramConfig(env=process.env, requireEnabled=true) {
  if (!convexConfigured(env) || (requireEnabled && env.BLUE_INSTAGRAM_ENABLED!=='true') || !asset(env.BLUE_INSTAGRAM_APP_ID) || !env.BLUE_INSTAGRAM_APP_SECRET) throw new PilotError('instagram_unavailable',503);
  const version=env.BLUE_INSTAGRAM_GRAPH_VERSION || 'v25.0';
  if (!/^v\d{1,3}\.0$/.test(version)) throw new PilotError('instagram_unavailable',503);
  return {app:env.BLUE_INSTAGRAM_APP_ID,secret:env.BLUE_INSTAGRAM_APP_SECRET,parent:env.LAYLA_META_APP_ID || '1388038082832745',version};
}

// Every Graph answer resolves to a value or one of four errors:
// instagram_reconnect_required (the token is dead: 190/102), instagram_rate_limited
// (Meta is throttling us), instagram_provider_failed (Meta answered with another
// error) or instagram_provider_unavailable (no usable answer).
const RATE_LIMIT_CODES=[4,17,32,613];
async function request(url, options, fetcher, timeout=8000) {
  try {
    const r=await fetcher(url,{...options,redirect:'error',signal:AbortSignal.timeout(timeout)});
    const raw=await r.text();
    if (raw.length>100000) throw Error('response_limit');
    const value=JSON.parse(raw);
    if (!r.ok || value?.error || value?.error_type) {
      // Server log only: Meta's error type/code/message, never the request URL or body (they carry codes and tokens).
      const detail=value?.error || value || {}, {host,pathname}=new URL(url);
      console.error('instagram_provider_error',JSON.stringify({host,path:pathname,status:r.status,type:String(detail.type || detail.error_type || '').slice(0,80),code:detail.code ?? null,subcode:detail.error_subcode ?? null,message:String(detail.message || detail.error_message || '').slice(0,300)}));
      const code=value?.error?.code;
      if ([190,102].includes(code)) throw new PilotError('instagram_reconnect_required',502);
      if (RATE_LIMIT_CODES.includes(code) || value?.error?.error_subcode===2534040) throw new PilotError('instagram_rate_limited',429);
      throw new PilotError('instagram_provider_failed',502);
    }
    return value;
  } catch(e) {if(e instanceof PilotError) throw e;throw new PilotError('instagram_provider_unavailable',502);}
}
export function instagramGraph(c,path,token,fetcher=fetch,body,method,timeout) {
  return request(`https://graph.instagram.com/${c.version}/${path}`,{method:method || (body?'POST':'GET'),headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})},fetcher,timeout);
}
// User Profile API: the @username of someone who messaged the account. A display
// nicety only, so it is short-fused and any failure is just "no name".
export async function instagramUsername(c,id,token,fetcher=fetch) {
  try {
    const value=await instagramGraph(c,`${id}?fields=username`,token,fetcher,undefined,'GET',3000);
    return typeof value?.username==='string' && /^[a-zA-Z0-9_.]{1,30}$/.test(value.username)?`@${value.username}`:null;
  } catch {return null;}
}
export async function exchangeInstagram({c,code,fetcher=fetch,now=Date.now}) {
  // Meta documents a trailing "#_" on the returned code that is not part of it.
  if (typeof code==='string') code=code.replace(/#_$/,'');
  if (typeof code!=='string' || !code || code.length>4096) throw new PilotError('invalid_oauth_code');
  const raw=await request('https://api.instagram.com/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:c.app,client_secret:c.secret,grant_type:'authorization_code',redirect_uri:INSTAGRAM_CALLBACK,code}).toString()},fetcher);
  const short=raw.data?.[0] || raw;
  const scopes=Array.isArray(short.permissions)?short.permissions:String(short.permissions || '').split(',').map(s=>s.trim());
  if (!INSTAGRAM_SCOPES.every(s=>scopes.includes(s)) || typeof short.access_token!=='string') throw new PilotError('instagram_permissions_missing',409);
  const long=await request(`https://graph.instagram.com/access_token?${new URLSearchParams({grant_type:'ig_exchange_token',client_secret:c.secret,access_token:short.access_token})}`,{},fetcher);
  if (typeof long.access_token!=='string' || long.access_token.length>8192 || !Number.isFinite(long.expires_in) || long.expires_in<=0) throw new PilotError('instagram_invalid_token',502);
  const me=await instagramGraph(c,'me?fields=user_id,username',long.access_token,fetcher);
  const igAccount=String(me.user_id || me.id || '');
  if (!asset(igAccount) || typeof me.username!=='string' || !/^[a-zA-Z0-9_.]{1,30}$/.test(me.username)) throw new PilotError('instagram_identity_invalid',502);
  return {token:long.access_token,igAccount,oauthUserId:String(short.user_id || me.id || igAccount),username:me.username,tokenExpiresAt:now()+long.expires_in*1000};
}
// Meta rate-limits /subscribed_apps hard (code 613 after a handful of calls), so
// the subscription is proven at connect and refreshed at most this often.
// Everyday checks use checkInstagramToken, which only reads /me.
export const SUBSCRIPTION_PROOF_MS=24*3600000;
export async function checkInstagramToken({c,integration,token,fetcher=fetch}) {
  if (integration.channel!=='instagram' || integration.app!==c.app) return {connected:false,reason:'identity'};
  const me=await instagramGraph(c,'me?fields=user_id,username',token,fetcher);
  return String(me.user_id || me.id)===integration.igAccount?{connected:true,reason:null}:{connected:false,reason:'identity'};
}
// The full read-back, used only when a subscribe did not confirm itself.
// A definite answer about one connection. reason says what an owner must do:
// 'identity' means reconnect (the token is for another account or app), and
// 'subscription' means Meta is not delivering this account's messages to us.
// Anything Meta fails to answer is thrown instead, so callers never mistake an
// outage for a broken connection.
export async function inspectInstagram({c,integration,token,fetcher=fetch}) {
  if (integration.channel!=='instagram' || integration.app!==c.app) return {connected:false,reason:'identity'};
  const me=await instagramGraph(c,'me?fields=user_id,username',token,fetcher);
  if (String(me.user_id || me.id)!==integration.igAccount) return {connected:false,reason:'identity'};
  const subs=await instagramGraph(c,`${integration.igAccount}/subscribed_apps`,token,fetcher);
  const apps=Array.isArray(subs.data)?subs.data:[];
  const fields=a=>Array.isArray(a.subscribed_fields)?a.subscribed_fields:String(a.subscribed_fields || '').split(',').map(f=>f.trim());
  const ours=[c.app,c.parent,...(INSTAGRAM_APP_ALIASES[c.app] || [])];
  const connected=apps.some(a=>ours.includes(String(a.id ?? a.app_id)) && fields(a).includes('messages'));
  if (!connected) console.warn('instagram_subscription_check',JSON.stringify({expected:ours,found:apps.slice(0,5).map(a=>({id:String(a.id ?? a.app_id ?? ''),fields:fields(a)}))}));
  return {connected,reason:connected?null:'subscription'};
}
// Meta documents subscribed_fields as a query parameter on this POST.
export const subscribeInstagram=(c,igAccount,token,fetcher)=>instagramGraph(c,`${igAccount}/subscribed_apps?subscribed_fields=messages`,token,fetcher,undefined,'POST');

// The Send API call itself. It returns Meta's raw answer and lets a network
// failure throw: after a send has started, only the caller can decide the
// outcome is unknown rather than failed.
export async function postInstagramMessage({c,integration,recipient,text,message=text===undefined?undefined:{text},token,fetcher=fetch}) {
  const response=await fetcher(`https://graph.instagram.com/${c.version}/${integration.igAccount}/messages`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({recipient:{id:recipient},message})});
  return {status:response.status,payload:await response.json().catch(()=>null)};
}
// Meta's messaging error codes (Messenger Platform error reference), mapped to
// reasons the owner can act on. A coded error is a definite "not sent".
function instagramSendReason(code, subcode) {
  if ([2534022,2018278].includes(subcode)) return 'outside_window';
  if (code===551 || [1545041,2018108].includes(subcode)) return 'recipient_unavailable';
  if (subcode===2534041) return 'messages_access_off';
  if (code===190) return 'reconnect_required';
  if (code===613 || code===4 || subcode===2534040) return 'rate_limited';
  if ([2534014,2018001].includes(subcode)) return 'invalid_recipient';
  return 'instagram_send_rejected';
}
export function instagramSendResult(status, payload, recipient) {
  if (status>=200 && status<300 && payload?.recipient_id===recipient && typeof payload.message_id==='string' && payload.message_id.length<=220) return {status:'submitted',providerId:payload.message_id};
  if (status>=400 && payload?.error && Number.isSafeInteger(payload.error.code)) return {status:'failed',error:instagramSendReason(payload.error.code,payload.error.error_subcode),errorCode:payload.error.code};
  return {status:'ambiguous',error:'provider_outcome_unknown'};
}

export async function refreshInstagram({integrationId,env,store=instagramStore({env}),fetcher=fetch,now=Date.now}) {
  instagramConfig(env);
  const connection=await store('refresh_context',{integrationId});
  if (!connection) return;
  try {
    const token=openToken(connection.integration.credential,credentialContext(connection.sessionHash,connection.integration),env);
    const next=await request(`https://graph.instagram.com/refresh_access_token?${new URLSearchParams({grant_type:'ig_refresh_token',access_token:token})}`,{},fetcher);
    if (typeof next.access_token!=='string' || !Number.isFinite(next.expires_in) || next.expires_in<=0) throw new PilotError('instagram_invalid_token',502);
    await store('refresh_result',{integrationId,expectedUpdatedAt:connection.updatedAt,credential:sealToken(next.access_token,credentialContext(connection.sessionHash,connection.integration),env),tokenExpiresAt:now()+next.expires_in*1000});
  } catch(e) {
    if (e.code==='instagram_reconnect_required') await store('refresh_result',{integrationId,expectedUpdatedAt:connection.updatedAt});
    throw e;
  }
}

export function verifiedInstagramRequest(signed,secret,now=Date.now()) {
  if (typeof signed!=='string' || signed.length>12000 || !secret) throw new PilotError('invalid_signed_request',403);
  try {
    const [sig,payload,extra]=signed.split('.');
    if (!sig || !payload || extra) throw Error('shape');
    const given=Buffer.from(sig,'base64url'),expected=createHmac('sha256',secret).update(payload).digest();
    if (given.length!==expected.length || !timingSafeEqual(given,expected)) throw Error('signature');
    const data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
    if (data.algorithm!=='HMAC-SHA256' || !asset(String(data.user_id || '')) || !Number.isFinite(data.issued_at) || data.issued_at*1000>now+300000) throw Error('payload');
    return {igAccount:String(data.user_id),issuedAt:data.issued_at*1000};
  } catch {throw new PilotError('invalid_signed_request',403);}
}

async function instagramCallback({req,url,env,fetcher,store,accounts,now,redirect}) {
  let lang='ar';
  const cancelled=url.searchParams.has('error');
  try {
    if(req.method!=='GET') throw new PilotError('method',405);
    const c=instagramConfig(env);
    const account=await blueAccount(req,accounts);
    if(!account?.draftHash) throw new PilotError('sign_in_required',401);
    const sessionHash=account.draftHash;
    const state=url.searchParams.get('state');
    if(!/^[a-f0-9]{64}$/.test(state || '')) throw new PilotError('invalid_oauth_state',403);
    const stateHash=digest(state),attempt=await store('consume',{sessionHash,stateHash});
    lang=attempt?.lang || lang;
    if(cancelled) return redirect(lang,'cancelled');
    const result=await exchangeInstagram({c,code:url.searchParams.get('code'),fetcher,now});
    const integration={id:randomUUID(),channel:'instagram',app:c.app,igAccount:result.igAccount,oauthUserId:result.oauthUserId,username:result.username};
    integration.credential=sealToken(result.token,credentialContext(sessionHash,integration),env);
    // Check account ownership before any subscription changes.
    await store('connect',{sessionHash,stateHash,integration,tokenExpiresAt:result.tokenExpiresAt});
    try {
      const subscribed=await subscribeInstagram(c,integration.igAccount,result.token,fetcher);
      // Meta's success:true is authoritative and costs nothing more; only an
      // unconfirmed subscribe spends a read-back on the throttled subscribed_apps.
      if (subscribed?.success!==true && !(await inspectInstagram({c,integration,token:result.token,fetcher})).connected) throw new PilotError('instagram_subscription_failed',502);
      await store('checked',{sessionHash,integrationId:integration.id,connected:true});
    } catch(e) {await store('checked',{sessionHash,integrationId:integration.id,connected:false});throw e;}
    return redirect(lang,'connected');
  } catch(e) {
    // Declining on Instagram's screen is a cancel even when the state is gone.
    if(cancelled) return redirect(lang,'cancelled');
    console.error('instagram_callback_failed',JSON.stringify({reason:String(e?.code || e?.name || 'unknown').slice(0,80)}));
    return redirect(lang,'connection_failed',e?.code);
  }
}

export function createInstagramApi({env=process.env,fetcher=fetch,store=instagramStore({env,fetcher}),accounts=blueAuthStore({env,fetcher}),now=Date.now}={}) {
  return async(req,res,surface='instagram')=>{
    const url=new URL(req.url || '/',INSTAGRAM_ORIGIN);
    const redirect=(lang,status,reason)=>{
      const query=new URLSearchParams({instagram:status,...(INSTAGRAM_CALLBACK_REASONS.includes(reason)?{reason}:{})});
      res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Location',`${INSTAGRAM_ORIGIN}/${lang==='ar'?'':'en/'}layla/setup?${query}`);res.status(303);res.end();
    };
    try {
      if(req.headers?.host!==new URL(INSTAGRAM_ORIGIN).host) throw new PilotError('origin',403);
      // The callback is a browser navigation back from Instagram, so every
      // outcome, including a failure before we know the page language, lands
      // on the setup page with a readable reason instead of a JSON body.
      if(surface==='instagram-callback') return await instagramCallback({req,url,env,fetcher,store,accounts,now,redirect});
      const callback=['instagram-deauthorize','instagram-delete','instagram-deletion-status'].includes(surface);
      const c=instagramConfig(env,!callback);
      if(surface==='instagram-deletion-status') {
        const deletionCode=url.searchParams.get('code');
        if(req.method!=='GET' || !/^[a-f0-9]{64}$/.test(deletionCode || '')) throw new PilotError('invalid_request');
        return send(res,200,{ok:true,...await store('deletion_status',{deletionCode})});
      }
      if (['instagram-deauthorize','instagram-delete'].includes(surface)) {
        if(req.method!=='POST') throw new PilotError('method',405);
        const body=typeof req.body==='string'?Object.fromEntries(new URLSearchParams(req.body)):readBody(req);
        const {igAccount,issuedAt}=verifiedInstagramRequest(body?.signed_request,c.secret,now());
        let deletionCode=randomBytes(32).toString('hex');
        const receipt=await store('revoke',{igAccount,issuedAt,deleteData:surface==='instagram-delete',...(surface==='instagram-delete'?{deletionCode}:{})});
        deletionCode=receipt?.deletionCode || deletionCode;
        return send(res,200,surface==='instagram-delete'?{url:`${INSTAGRAM_ORIGIN}/api/layla-meta?surface=instagram-deletion-status&code=${deletionCode}`,confirmation_code:deletionCode}:{success:true});
      }
      const account=await blueAccount(req,accounts);
      // An employee reads the manager's Instagram state; connecting and disconnecting stay with the manager.
      const sessionHash=account?.workspaceDraftHash || account?.draftHash;
      if(!sessionHash) throw new PilotError('sign_in_required',401);
      if(req.method==='POST' && account.workspaceRole==='employee') throw new PilotError('manager_required',403);
      if(req.method==='GET') {
        // pendingSignIn: a login began and Instagram has not sent the person back,
        // so the card can offer to finish it (Instagram sometimes strands people on its feed).
        const {connection=null,pendingSignIn=false}=await store('state',{sessionHash}) || {};
        const state=connection?.status==='connected'?await messagingStore({env,fetcher})('state',{sessionHash,channel:'instagram'}):null;
        return send(res,200,{ok:true,connection,pendingSignIn,active:env.BLUE_INSTAGRAM_SEND_ENABLED==='true' && !!state?.active,sendingEnabled:env.BLUE_INSTAGRAM_SEND_ENABLED==='true',csrfToken:ensureCsrfToken(req,res)},{vary:'Cookie'});
      }
      if(req.method!=='POST') throw new PilotError('method',405);
      if(req.headers.origin!==INSTAGRAM_ORIGIN || !verifyCsrf(req)) throw new PilotError('csrf',403);
      const body=readBody(req);
      if(JSON.stringify(body).length>2000) throw new PilotError('body_too_large',413);
      if(body.action==='connect') {
        const state=randomBytes(32).toString('hex');
        await store('begin',{sessionHash,stateHash:digest(state),lang:body.lang==='ar'?'ar':'en'});
        // Instagram sometimes drops a fresh sign-in on its feed and never returns.
        // A retry comes from a browser that is now signed in, so skip the forced
        // login and Instagram goes straight to the Allow screen.
        const params={client_id:c.app,redirect_uri:INSTAGRAM_CALLBACK,response_type:'code',scope:INSTAGRAM_SCOPES.join(','),state,...(body.retry===true?{}:{force_reauth:'true'})};
        return send(res,200,{ok:true,url:`https://www.instagram.com/oauth/authorize?${new URLSearchParams(params)}`});
      }
      if(body.action==='disconnect' && body.confirm===true) {
        const connection=await store('disconnect',{sessionHash});
        // The owner asked to disconnect; Blue always finishes its side. If Meta
        // refuses the revoke, the owner removes the app in Instagram settings.
        let revoked=!connection.integration.credential;
        if(connection.integration.credential) {
          try {
            const token=openToken(connection.integration.credential,credentialContext(sessionHash,connection.integration),env);
            await instagramGraph(c,'me/permissions',token,fetcher,undefined,'DELETE');
            revoked=true;
          } catch(e) {
            revoked=e?.code==='instagram_reconnect_required';
            if(!revoked) console.error('instagram_revoke_failed',JSON.stringify({reason:String(e?.code || 'unknown').slice(0,80)}));
          }
        }
        await store('disconnected',{sessionHash,integrationId:connection.integrationId});
        return send(res,200,{ok:true,revoked});
      }
      throw new PilotError('invalid_action');
    } catch(e) {return sendPilotError(res,e,{fallback:'instagram_unavailable',vary:'Cookie'});}
  };
}
