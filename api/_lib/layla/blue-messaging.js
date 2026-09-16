import { randomUUID } from 'node:crypto';
import { convexConfigured, messagingStore, reviewStore } from '../convex.js';
import { blueAccount, blueAuthStore } from '../blue-auth.js';
import { ensureCsrfToken, verifyCsrf, safeEqual } from '../cookies.js';
import { send, readBody } from '../http.js';
import { PilotError } from './config.js';
import { classify, answer } from './domain.js';
import { previewAnswer } from './review-profile.js';
import { credentialContext, openToken } from './customer-meta.js';
import { inspectPortfolio, inspectReviewConnection } from './review-api.js';
import { parseEvents } from './webhook.js';
import { providerResult } from './gateway.js';
import { campaignStore } from './dashboard-store.js';
import { runCampaignSend, runCampaignStart } from './campaign-worker.js';

// messagingStore is built in ../convex.js with the other five route clients;
// re-exported here because this module is where its callers look.
export { messagingStore };

export function liveAnswer(text,profile,catalog=[]) {
  const intent=classify(text);
  if(intent==='optout') return {intent,reply:null,handoff:false};
  if(intent==='human') return {intent,reply:answer(text,profile,true).text,handoff:true};
  const result=previewAnswer(text,profile,catalog);
  return {intent:result.intent,reply:result.text,handoff:result.needsHuman};
}
const STOP_BUTTON=/^(stop promotions?|stop|unsubscribe|opt out|إيقاف العروض|ايقاف العروض|إيقاف|ايقاف|إلغاء الاشتراك|الغاء الاشتراك)$/i;
// WhatsApp profile names keyed by wa_id. Only ever used as a display fallback.
export function profileNames(value) {
  const names=new Map();
  for(const c of Array.isArray(value?.contacts)?value.contacts.slice(0,100):[]) {
    const name=typeof c?.profile?.name==='string'?c.profile.name.replace(/[\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim().slice(0,80):'';
    if(/^\d{7,15}$/.test(c?.wa_id || '') && name) names.set(c.wa_id,name);
  }
  return names;
}
// Template quick-reply and interactive button taps carry the button title, not text.
export function buttonTitle(m) {
  const title=m?.type==='button'?m.button?.text:m?.type==='interactive'?(m.interactive?.button_reply?.title || m.interactive?.list_reply?.title):null;
  return typeof title==='string'?title.trim().slice(0,100):null;
}
// This function receives only an envelope whose raw signature was verified.
export async function ingestBlueEnvelope(envelope,{store=messagingStore(),now=Date.now}={}) {
  if(!Array.isArray(envelope.entry) || envelope.entry.length>100) throw new PilotError('invalid_envelope');
  const groups=new Map();
  for(const entry of envelope.entry) {
    if(!/^\d{1,30}$/.test(entry?.id || '') || !Array.isArray(entry.changes) || entry.changes.length>100) throw new PilotError('invalid_envelope');
    for(const change of entry.changes) {
      if(!['messages','smb_message_echoes'].includes(change?.field)) continue;
      const phone=change.value?.metadata?.phone_number_id;
      if(!/^\d{1,30}$/.test(phone || '')) throw new PilotError('invalid_envelope');
      const key=`${entry.id}:${phone}`;
      if(!groups.has(key)) groups.set(key,{waba:entry.id,phone,changes:[]});
      groups.get(key).changes.push(change);
    }
  }
  if(groups.size>10) throw new PilotError('too_many_bindings',413);
  let total=0;
  for(const group of groups.values()) {
    const binding=await store('binding',{waba:group.waba,phone:group.phone});
    if(!binding || binding.app!=='1388038082832745') continue;
    const raw=Buffer.from(JSON.stringify({object:'whatsapp_business_account',entry:[{id:group.waba,changes:group.changes}]}));
    const names=new Map(group.changes.flatMap(change=>[...profileNames(change.value)]));
    const errors=new Map(group.changes.flatMap(change=>(change.value?.statuses || []).map(s=>[`${s?.id}:${s?.status}`,Number(s?.errors?.[0]?.code)]).filter(([,code])=>Number.isSafeInteger(code))));
    const events=parseEvents(raw,binding,now()).map(e=>{
      if(e.kind==='message') return {...e,...liveAnswer(e.text,binding.profile,binding.catalog || []),...(names.get(e.from)?{profileName:names.get(e.from)}:{})};
      if(e.kind==='receipt' && errors.has(`${e.id}:${e.status}`)) return {...e,errorCode:errors.get(`${e.id}:${e.status}`)};
      return e;
    });
    for(const change of group.changes) {
      for(const echo of change.value.message_echoes || []) {
        if(typeof echo.text?.body==='string') events.push({kind:'echo',id:echo.id,from:echo.to,at:now(),text:echo.text.body.slice(0,1000)});
      }
      for(const m of change.value.messages || []) {
        if(m.type==='text' && typeof m.text?.body==='string' && m.text.body.length<=1000) continue;
        if(!/^[A-Za-z0-9_.:=/-]{1,220}$/.test(m.id || '') || !/^\d{7,15}$/.test(m.from || '') || m.from===binding.sender || m.from_business===true) continue;
        const title=buttonTitle(m);
        const profile=names.get(m.from)?{profileName:names.get(m.from)}:{};
        if(title && STOP_BUTTON.test(title)) {
          // A marketing "Stop promotions" tap is an opt-out, recorded as the tapped title.
          events.push({kind:'message',id:m.id,from:m.from,at:Number(m.timestamp)*1000,text:title,intent:'optout',reply:null,handoff:false,...profile});
          continue;
        }
        events.push({kind:'message',id:m.id,from:m.from,at:Number(m.timestamp)*1000,text:title || '[Message needs human attention]',intent:'human',handoff:true,...profile});
      }
    }
    total+=events.length;if(total>100) throw new PilotError('too_many_events',413);
    if(events.length) await store('ingest',{integrationId:binding.integrationId,profileVersion:binding.profileVersion,events});
  }
}

export function createMessagingApi({env=process.env,fetcher=fetch,store=messagingStore({env,fetcher}),accounts=blueAuthStore({env,fetcher}),reviews=reviewStore({env,fetcher}),inspect=inspectReviewConnection,portfolio=inspectPortfolio}={}) {
  return async(req,res)=>{
    try {
      if(!convexConfigured(env)) throw new PilotError('messaging_unavailable',503);
      if(req.headers?.host!=='bznsflow-blue.vercel.app' || (req.method!=='GET' && req.headers?.origin!=='https://bznsflow-blue.vercel.app')) throw new PilotError('origin',403);
      if(!['GET','POST'].includes(req.method)) throw new PilotError('method',405);
      const account=await blueAccount(req,accounts);
      if(!account?.draftHash) throw new PilotError('sign_in_required',401);
      const sessionHash=account.draftHash;
      let operation='state',args={sessionHash};
      if(req.method==='POST') {
        if(!verifyCsrf(req)) throw new PilotError('csrf',403);
        const body=readBody(req);
        if(!body || JSON.stringify(body).length>2500 || !['activate','pause','manual_reply','takeover','resume_conversation','check_connection'].includes(body.action)) throw new PilotError('invalid_action');
        operation=body.action==='check_connection'?'state':body.action;
        args={sessionHash,...(body.conversationId?{conversationId:body.conversationId}:{}),...(body.text?{text:body.text}:{}),...(body.requestId?{requestId:body.requestId}:{})};
        if(['activate','manual_reply'].includes(operation) && env.BLUE_LIVE_MESSAGING_ENABLED!=='true') throw new PilotError('messaging_unavailable',503);
        if(operation==='activate' || body.action==='check_connection') {
          const row=await reviews('get',{sessionHash});
          if(!row.integration || row.accountId!==account.id) throw new PilotError('activation_not_ready',409);
          // Signup may have verified this connection moments ago. Reuse that
          // fresh proof rather than hitting the read-only refresh throttle.
          // An explicit health check always asks Meta again.
          if(body.action==='check_connection' || Date.now()-(row.checkedAt || 0)>=5000 || !row.connectionChecks?.routing || !row.connectionChecks?.registered || !row.connectionChecks?.path) {
          const operationId=randomUUID();
          await reviews('claim_operation',{sessionHash,operationId,effect:'refresh'});
          try {
            const token=openToken(row.integration.credential,credentialContext(sessionHash,row.integration),env);
            const c={app:row.integration.app,version:'v25.0',secret:env.LAYLA_META_APP_SECRET};
            const proof=await inspect({c,integration:row.integration,token,fetcher});
            // Each result replaces the stored checks, so the portfolio is read again with them.
            const owner=await portfolio({c,integration:row.integration,token,fetcher});
            await reviews('result',{sessionHash,operationId,status:proof.connected?'connected':'reconciliation_required',connectionChecks:{routing:!!proof.isolated,registered:!!proof.registered,path:!!proof.pathVerified,nameStatus:proof.nameStatus || 'UNKNOWN',...(owner?{portfolio:owner}:{})}});
            if(!proof.connected) throw new PilotError(body.action==='check_connection'?'connection_not_ready':'activation_not_ready',409);
          } catch(e) {
            await reviews('result',{sessionHash,operationId,status:'reconciliation_required'}).catch(()=>{});
            throw e;
          }
          }
        }
      }
      const state=await store(operation,args);
      if(env.BLUE_LIVE_MESSAGING_ENABLED!=='true') {state.available=false;state.active=false;state.reason='messaging_unavailable';}
      return send(res,200,{ok:true,...state,csrfToken:ensureCsrfToken(req,res)},{vary:'Cookie'});
    } catch(e) {return send(res,e instanceof PilotError?e.status:503,{ok:false,reason:e instanceof PilotError?e.code:'messaging_unavailable'},{vary:'Cookie'});}
  };
}

export function createBlueWorker({env=process.env,fetcher=fetch,store=messagingStore({env,fetcher}),campaigns=campaignStore({env,fetcher}),inspect=inspectReviewConnection}={}) {
  return async(req,res)=>{
    if(req.method!=='POST') return send(res,405,{ok:false,reason:'method'});
    if(!env.BLUE_MESSAGING_WORKER_SECRET || !safeEqual(req.headers?.authorization || '',`Bearer ${env.BLUE_MESSAGING_WORKER_SECRET}`)) return send(res,401,{ok:false,reason:'worker_auth'});
    let job,sendStarted=false;
    try {
      if(env.BLUE_LIVE_MESSAGING_ENABLED!=='true' || !convexConfigured(env)) throw new PilotError('messaging_unavailable',503);
      const body=readBody(req);
      // Broadcast jobs use their own store, limits and failure state.
      if(typeof body?.campaignStartId==='string' && body.campaignStartId.length<=100) return send(res,200,{ok:true,...await runCampaignStart({campaignId:body.campaignStartId,env,store:campaigns,fetcher,inspect})});
      if(typeof body?.campaignJobId==='string' && body.campaignJobId.length<=100) return send(res,200,{ok:true,...await runCampaignSend({jobId:body.campaignJobId,env,store:campaigns,fetcher,inspect})});
      if(body?.integrationId && !body.jobId) {
        const context=await store('health_context',{integrationId:body.integrationId});
        if(context) {
          let connected=false;
          try {
            const token=openToken(context.integration.credential,credentialContext(context.sessionHash,context.integration),env);
            connected=!!(await inspect({c:{app:context.integration.app,version:'v25.0',secret:env.LAYLA_META_APP_SECRET},integration:context.integration,token,fetcher})).connected;
          } finally {await store('health_result',{integrationId:body.integrationId,connected});}
        }
        return send(res,200,{ok:true});
      }
      if(!body || typeof body.jobId!=='string' || body.jobId.length>100) throw new PilotError('invalid_job');
      job=await store('claim',{jobId:body.jobId,intent:randomUUID()});
      if(!job) return send(res,200,{ok:true,processed:false});
      let outcome={status:'blocked',reason:'connection_not_ready'};
      const token=openToken(job.integration.credential,credentialContext(job.sessionHash,job.integration),env);
      const proof=await inspect({c:{app:job.integration.app,version:'v25.0',secret:env.LAYLA_META_APP_SECRET},integration:job.integration,token,fetcher});
      if(proof.connected && await store('send_gate',{jobId:job.jobId,intent:job.intent})) {
        sendStarted=true;
        try {
          const response=await fetcher(`https://graph.facebook.com/v25.0/${job.integration.phone}/messages`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:job.number,type:'text',text:{preview_url:false,body:job.text},biz_opaque_callback_data:job.intent})});
          const result=providerResult(response.status,await response.json().catch(()=>null));
          outcome={status:result.status,...(result.providerId?{providerId:result.providerId}:{}),...(result.error?{reason:result.error}:{}),...(result.errorCode?{errorCode:result.errorCode}:{})};
        } catch {outcome={status:'ambiguous',reason:'provider_outcome_unknown'};}
      }
      await store('result',{jobId:job.jobId,intent:job.intent,...outcome});
      return send(res,200,{ok:true,processed:true,status:outcome.status});
    } catch(e) {
      if(job) await store('result',{jobId:job.jobId,intent:job.intent,status:sendStarted?'ambiguous':'blocked',reason:sendStarted?'provider_outcome_unknown':'connection_check_failed'}).catch(()=>{});
      return send(res,e instanceof PilotError?e.status:503,{ok:false,reason:e instanceof PilotError?e.code:'worker_unavailable'});
    }
  };
}
