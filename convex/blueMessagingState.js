import { instagramConnection, instagramRow, rowForIntegration } from './blueInstagramState.js';
// Atomic tenant messaging transitions. Network requests happen only after a
// durable outbound intent has been claimed; uncertain sends are never retried.
import { applyInbound, applyOptout, linkConversation, recordQuestions, sectorFor, TEXT_RETENTION_MS, MESSAGE_RETENTION_MS } from './blueContacts.js';
import { recordDemand } from './hasib/demandState.js';
import { commerceTurn } from './hasib/laylaOrders.js';
// Router intents whose generic answer is replaced by a live stock line when a product is named.
const GENERIC_INTENTS=new Set(['prices','services','unknown']);
const DAY = 86400000;
const terminal = new Set(['sent','delivered','read','failed','ambiguous','blocked']);
const receiptRank = {attempting:0,ambiguous:0,submitted:1,failed:2,sent:3,delivered:4,read:5};
const MAX_REPLY_LENGTH = 1000;
/**
 * A saved and connected account whose owner confirmed the business facts when
 * saving them. That confirmation is the one review: later edits go live as soon
 * as they are saved, with no separate preview approval.
 */
export function messagingReady(row, now) {
  return !!(row?.accountId && row.expiresAt>now && ['connected','paused'].includes(row.status) && row.profile?.reviewed && row.profile.humanContact);
}
export async function executeMessaging(ctx, a, now = Date.now()) {
  const ok = value => ({ok:true,value}), fail = reason => ({ok:false,reason});
  const find = (table,index,field,value) => ctx.db.query(table).withIndex(index,q=>q.eq(field,value)).unique();
  const global = await find('blueMessagingSettings','by_key','key','global');
  const enabled = global?.enabled === true;
  const controls = id => find('blueMessagingControls','by_integration','integrationId',id);
  const conversation = key => find('blueConversations','by_key','key',key);
  const message = key => find('blueMessages','by_key','key',key);
  const schedule = job => ctx.scheduler.runAfter(0, a.workerFunction, {jobId:job});
  async function stopQueued(integrationId,personId,reason) {
    const jobs=await ctx.db.query('blueMessages').withIndex('by_integration_status',q=>q.eq('integrationId',integrationId).eq('status','queued')).take(100);
    for(const job of jobs) if(!personId || job.conversationId===personId) await ctx.db.patch(job._id,{status:'blocked',reason});
  }
  async function approvedCatalog(accountId, limit = 1000) {
    const rows = await ctx.db.query('blueCatalogEntries').withIndex('by_owner_status_order',q=>q.eq('ownerKey',String(accountId)).eq('status','approved')).take(limit);
    return rows.map(({nameEn,nameAr,prices,benefitEn,benefitAr,descriptionEn,descriptionAr})=>({nameEn,nameAr,prices,benefitEn,benefitAr,descriptionEn,descriptionAr}));
  }
  async function reconcileCampaignReceipt(e) {
    let target=e.intent?await find('blueCampaignRecipients','by_intent','intent',e.intent):null;
    if(!target) target=await ctx.db.query('blueCampaignRecipients').withIndex('by_provider',q=>q.eq('providerId',e.id)).unique();
    if(!target || target.integrationId!==a.integrationId || (target.waId && target.waId!==e.recipient) || (target.providerId && target.providerId!==e.id)) return;
    if((receiptRank[e.status] || 0)<=(receiptRank[target.status] || 0)) return;
    await ctx.db.patch(target._id,{status:e.status,providerId:e.id,updatedAt:now,...(e.status==='failed'&&Number.isSafeInteger(e.errorCode)?{errorCode:e.errorCode,reason:'provider_delivery_failed'}:{})});
  }
  async function rowForControl(control) {
    if (!control) return null;
    const row=await find('blueReviewSessions','by_hash','sessionHash',control.sessionHash);
    return rowForIntegration(ctx,row,control.integrationId,now);
  }
  /** A job's connection: through Layla's control when there is one, else through the owning account (owner replies never need Layla). */
  async function rowForJob(job, control) {
    if (control) return rowForControl(control);
    if (!job?.manual) return null;
    const account=await ctx.db.get(job.accountId);
    const row=account?.draftHash && await find('blueReviewSessions','by_hash','sessionHash',account.draftHash);
    return row ? rowForIntegration(ctx,row,job.integrationId,now) : null;
  }
  const ready = row => messagingReady(row, now);
  async function queue(row, person, text, key, manual = false, handoff = false) {
    const pending = await ctx.db.query('blueMessages').withIndex('by_integration_status',q=>q.eq('integrationId',row.integration.id).eq('status','queued')).take(100);
    const record = {key,integrationId:row.integration.id,accountId:row.accountId,conversationId:person._id,conversationVersion:person.version || 0,profileVersion:row.profileVersion || 1,direction:'out',text,at:now,expiresAt:now+MESSAGE_RETENTION_MS,textExpiresAt:now+TEXT_RETENTION_MS,status:pending.length>=100?'blocked':'queued',manual,handoff,...(pending.length>=100?{reason:'queue_limit'}:{})};
    const id=await ctx.db.insert('blueMessages',record);
    if(record.status==='queued') await schedule(id);
    return id;
  }
  if(a.operation==='binding' && a.channel==='instagram') {
    const connection=await find('blueInstagramConnections','by_ig_account','igAccount',a.igAccount);
    const row=connection && await find('blueReviewSessions','by_hash','sessionHash',connection.sessionHash);
    const bound=instagramRow(row,connection,now);
    // Server-only answer: the sealed credential lets the webhook look up the sender's @username.
    return ok(bound && row.expiresAt>now ? {integrationId:connection.integrationId,channel:'instagram',app:connection.integration.app,igAccount:connection.igAccount,sessionHash:connection.sessionHash,integration:connection.integration,profile:row.profile,profileVersion:row.profileVersion || 1,catalog:await approvedCatalog(row.accountId,100)}:null);
  }
  if(a.operation==='binding') {
    const row=await ctx.db.query('blueReviewSessions').withIndex('by_phone',q=>q.eq('phone',a.phone)).unique();
    return ok(row?.accountId && row.expiresAt>now && row.integration?.waba===a.waba ? {integrationId:row.integration.id,app:row.integration.app,waba:row.integration.waba,phone:row.integration.phone,sender:row.integration.sender,profile:row.profile,profileVersion:row.profileVersion || 1,catalog:await approvedCatalog(row.accountId,100)}:null);
  }
  if(a.operation==='health_context') {
    const control=await controls(a.integrationId),row=await rowForControl(control);
    return ok(enabled && control?.active && ready(row)?{integration:row.integration,sessionHash:row.sessionHash}:null);
  }
  if(a.operation==='health_result') {
    const control=await controls(a.integrationId);
    if(control && !a.connected) await ctx.db.patch(control._id,{active:false,reason:'connection_not_ready'});
    return ok(null);
  }
  if(['context','disconnect','state','activate','pause','resume_conversation','takeover','manual_reply'].includes(a.operation)) {
    let row=await find('blueReviewSessions','by_hash','sessionHash',a.sessionHash);
    if (row?.accountId && a.conversationId) {
      const person=await ctx.db.get(a.conversationId);
      if (!person || person.accountId!==row.accountId) return fail('conversation_not_found');
      row=await rowForIntegration(ctx,row,person.integrationId,now);
    } else if (row?.accountId && a.channel==='instagram') {
      // A signed-in owner whose Instagram is missing, stopped or expired needs a
      // reconnect; "sign in again" would send them the wrong way.
      const bound=instagramRow(row,await instagramConnection(ctx,row.accountId),now);
      if (!bound && row.expiresAt>now) return fail('instagram_reconnect_required');
      row=bound;
    }
    if(!row?.accountId || row.expiresAt<=now || !row.integration) return fail('sign_in_required');
    if(a.operation==='context') return ok({channel:row.integration.channel || 'whatsapp'});
    let control=await controls(row.integration.id);
    if(a.operation==='disconnect') {
      if(a.confirm!==true || row.integration.channel==='instagram') return fail('confirmation_required');
      await stopQueued(row.integration.id,null,'disconnected');
      if(control) await ctx.db.delete(control._id);
      const claim=await find('blueAssetClaims','by_phone','phone',row.integration.phone);
      if(claim?.sessionHash===row.sessionHash) await ctx.db.delete(claim._id);
      const templates=await ctx.db.query('blueTemplates').withIndex('by_account_template',q=>q.eq('accountId',row.accountId)).take(500);
      for(const template of templates) if(template.integrationId===row.integration.id) await ctx.db.delete(template._id);
      // Clear every connection field, as review:detach does, so the next connect starts clean.
      await ctx.db.patch(row._id,{integration:undefined,phone:undefined,waba:undefined,connectionChecks:undefined,checkedAt:undefined,status:'draft',attempt:undefined,operation:undefined,operationAt:undefined,operationEffect:undefined,pendingSelection:undefined,diagnostic:undefined,subscriptionAttempted:undefined,registrationAttempted:undefined});
      return ok({disconnected:true});
    }
    if(a.operation==='activate') {
      if(!enabled) return fail('messaging_unavailable');
      const uncertain=await ctx.db.query('blueMessages').withIndex('by_integration_status',q=>q.eq('integrationId',row.integration.id).eq('status','ambiguous')).take(1);
      if(uncertain.length) return fail('send_outcome_unknown');
      if(!ready(row) || now-(row.checkedAt || 0)>60000 || !row.connectionChecks?.routing || !row.connectionChecks?.registered || !row.connectionChecks?.path) return fail('activation_not_ready');
      const value={integrationId:row.integration.id,sessionHash:row.sessionHash,accountId:row.accountId,active:true,reason:'',activatedAt:now,healthAt:now,profileVersion:row.profileVersion || 1};
      if(control) await ctx.db.patch(control._id,value); else await ctx.db.insert('blueMessagingControls',value);
    } else if(a.operation==='pause' && control) {
      await ctx.db.patch(control._id,{active:false,reason:'owner_paused'});
      await stopQueued(row.integration.id,null,'owner_paused');
    }
    else if(['resume_conversation','takeover','manual_reply'].includes(a.operation)) {
      const person=await ctx.db.get(a.conversationId);
      if(!person || person.accountId!==row.accountId || person.integrationId!==row.integration.id) return fail('conversation_not_found');
      if(a.operation==='resume_conversation') {
        if(person.optout) return fail('contact_opted_out');
        await stopQueued(row.integration.id,person._id,'human_takeover');
        await ctx.db.patch(person._id,{takeover:false,updatedAt:now,version:(person.version || 0)+1});
      } else if(a.operation==='takeover') {await stopQueued(row.integration.id,person._id,'human_takeover');await ctx.db.patch(person._id,{takeover:true,updatedAt:now,version:(person.version || 0)+1});}
      else {
        // The owner's own reply never depends on Layla (paused, taken over or never activated);
        // it needs a ready connection, a customer who has not opted out and the 24h window.
        if(!enabled) return fail('messaging_paused_by_operator');
        if(!ready(row)) return fail('connection_not_ready');
        if(person.optout) return fail('contact_opted_out');
        if(now-person.lastInbound>=DAY) return fail('window_closed');
        if(typeof a.text!=='string' || !a.text.trim() || a.text.length>1000 || !/^[a-f0-9-]{36}$/.test(a.requestId || '')) return fail('invalid_text');
        const key=`manual:${row.integration.id}:${a.requestId}`;
        if(!await message(key)) {
          await stopQueued(row.integration.id,person._id,'human_takeover');
          const version=(person.version || 0)+1;
          await ctx.db.patch(person._id,{takeover:true,updatedAt:now,version});
          await queue(row,{...person,version},a.text.trim(),key,true);
        }
      }
    }
    control=await controls(row.integration.id);
    const people=await ctx.db.query('blueConversations').withIndex('by_account_updated',q=>q.eq('accountId',row.accountId)).order('desc').take(50);
    const msgs=await ctx.db.query('blueMessages').withIndex('by_account_at',q=>q.eq('accountId',row.accountId)).order('desc').take(100);
    const rate=await find('blueMessageRates','by_key','key',`day:${row.integration.id}:${Math.floor(now/DAY)}`);
    const active=enabled && control?.active===true && ready(row);
    return ok({available:enabled,active,reason:!enabled?'messaging_unavailable':active?'':control?.reason || (control?.active?'activation_not_ready':'not_activated'),limits:{perMinute:10,perDay:100,usedToday:rate?.count || 0},conversations:people.map(p=>({id:p._id,number:p.number,takeover:p.takeover,optout:p.optout,lastInbound:p.lastInbound})),messages:msgs.reverse().map(m=>({id:m._id,conversationId:m.conversationId,direction:m.direction,text:m.textExpiresAt>now?m.text:undefined,status:m.status,reason:m.reason,at:m.at}))});
  }
  if(a.operation==='ingest') {
    const control=await controls(a.integrationId), row=await rowForControl(control);
    if(!row?.accountId || row.expiresAt<=now || row.integration?.id!==a.integrationId) return ok(null);
    if(a.profileVersion!==undefined && a.profileVersion!==(row.profileVersion || 1)) return fail('profile_changed');
    // Takeover and opt-out events are applied before any message in this batch.
    let incoming=a.events;
    if(row.integration.channel==='instagram') {
      const kept=[];
      for(const e of incoming) {
        if(e.kind==='echo') {
          const known=await ctx.db.query('blueMessages').withIndex('by_provider',q=>q.eq('providerId',e.id)).unique();
          if(known?.integrationId===a.integrationId && known.direction==='out') continue;
          const pending=await ctx.db.query('blueMessages').withIndex('by_integration_status',q=>q.eq('integrationId',a.integrationId).eq('status','attempting')).take(1);
          if(pending.length) return fail('echo_pending');
        }
        kept.push(e);
      }
      incoming=kept;
    }
    const deleted=new Set(incoming.filter(e=>e.kind==='deleted').map(e=>e.id));
    const events=[...incoming].sort((x,y)=>Number(['optout','takeover'].includes(y.kind))-Number(['optout','takeover'].includes(x.kind)));
    const sectorId=sectorFor(row);
    let catalog=null;
    for(const e of events) {
      if(e.kind==='deleted') {
        const original=await message(`incoming:${a.integrationId}:${e.id}`);
        if(!original && e.from) {
          const key=`${a.integrationId}:${e.from}`;
          let person=await conversation(key);
          if(!person) person=await ctx.db.get(await ctx.db.insert('blueConversations',{key,integrationId:a.integrationId,accountId:row.accountId,channel:'instagram',igAccount:row.integration.igAccount,number:e.from,lastInbound:0,takeover:false,optout:false,updatedAt:now}));
          await ctx.db.insert('blueMessages',{key:`incoming:${a.integrationId}:${e.id}`,integrationId:a.integrationId,accountId:row.accountId,conversationId:person._id,direction:'in',at:now,expiresAt:now+MESSAGE_RETENTION_MS,textExpiresAt:Number.MAX_SAFE_INTEGER,status:'deleted'});
        }
        if(original) {
          await ctx.db.patch(original._id,{text:undefined,textExpiresAt:Number.MAX_SAFE_INTEGER});
          const person=await ctx.db.get(original.conversationId);
          if(person) {await stopQueued(a.integrationId,person._id,'message_deleted');await ctx.db.patch(person._id,{version:(person.version || 0)+1});}
        }
        continue;
      }
      if(e.kind==='message' && deleted.has(e.id)) continue;
      if(e.kind==='receipt') {
        let target=e.intent?await find('blueMessages','by_intent','intent',e.intent):null;
        if(!target) target=await ctx.db.query('blueMessages').withIndex('by_provider',q=>q.eq('providerId',e.id)).unique();
        if(!target) {await reconcileCampaignReceipt(e);continue;}
        if(target.integrationId!==a.integrationId || target.direction!=='out') continue;
        const person=await ctx.db.get(target.conversationId);
        if(person?.number!==e.recipient || (target.providerId && target.providerId!==e.id)) continue;
        if((receiptRank[e.status] || 0)>(receiptRank[target.status] || 0)) await ctx.db.patch(target._id,{status:e.status,providerId:e.id,...(e.status==='failed'&&Number.isSafeInteger(e.errorCode)?{errorCode:e.errorCode}:{})});
        continue;
      }
      const key=`${a.integrationId}:${e.from}`;
      let person=await conversation(key);
      if(!person) person=await ctx.db.get(await ctx.db.insert('blueConversations',{key,integrationId:a.integrationId,accountId:row.accountId,...(row.integration.channel==='instagram'?{channel:'instagram',igAccount:row.integration.igAccount}:{}),number:e.from,lastInbound:0,takeover:false,optout:false,updatedAt:now}));
      let contact=await linkConversation(ctx,person,{sectorId,now,secret:a.hashSecret,igAccount:row.integration.igAccount});
      if(typeof e.profileName==='string' && e.profileName.trim() && contact.profileName!==e.profileName.trim().slice(0,80)) {
        contact={...contact,profileName:e.profileName.trim().slice(0,80)};
        await ctx.db.patch(contact._id,{profileName:contact.profileName,updatedAt:now});
      }
      if(['optout','takeover'].includes(e.kind)) {
        await ctx.db.patch(person._id,{[e.kind==='optout'?'optout':'takeover']:true,updatedAt:now,version:(person.version || 0)+1});
        await stopQueued(a.integrationId,person._id,'human_takeover');
        if(e.kind==='optout') await applyOptout(ctx,contact,now);
        continue;
      }
      if(e.kind!=='message' && e.kind!=='echo') continue;
      const msgKey=`incoming:${a.integrationId}:${e.id}`;
      if(await message(msgKey)) continue;
      await ctx.db.insert('blueMessages',{key:msgKey,integrationId:a.integrationId,accountId:row.accountId,conversationId:person._id,direction:e.kind==='echo'?'human':'in',text:e.text,at:e.at,expiresAt:now+MESSAGE_RETENTION_MS,textExpiresAt:now+TEXT_RETENTION_MS,status:'received'});
      if(e.kind==='echo') {
        await ctx.db.patch(person._id,{takeover:true,updatedAt:now,version:(person.version || 0)+1});
        await stopQueued(a.integrationId,person._id,'human_takeover');
        await ctx.db.patch(contact._id,{lastActivityAt:Math.max(contact.lastActivityAt || 0,e.at || now),updatedAt:now});
        continue;
      }
      if(e.intent==='optout' || e.handoff) await stopQueued(a.integrationId,person._id,e.intent==='optout'?'contact_opted_out':'human_takeover');
      const version=(person.version || 0)+(e.intent==='optout' || e.handoff?1:0);
      await ctx.db.patch(person._id,{version,lastInbound:Math.max(person.lastInbound,e.at),updatedAt:now,...(e.intent==='optout'?{optout:true}:{}),...(e.handoff?{takeover:true}:{})});
      if(e.intent==='optout') {await applyOptout(ctx,contact,now);continue;}
      catalog ??= await approvedCatalog(row.accountId);
      // Fields are captured even while a person has taken over the chat.
      const applied=await applyInbound(ctx,contact,{text:e.text,intent:e.intent,handoff:!!e.handoff,at:e.at,now,sectorId,catalog});
      // Hasib's lost-demand report: a product question becomes a PII-free signal (no-op while Hasib is off).
      // Hasib must never stop Layla replying: a failed signal is logged and the message carries on.
      try { await recordDemand(ctx,{accountId:row.accountId,contact:applied.contact,conversationId:person._id,updates:applied.updates,intent:e.intent,at:e.at}); }
      catch(err) { console.error('hasib_demand_failed',err?.message); }
      // Layla's commerce turn (Ascend): answer from stock, file and confirm the order; the same isolation applies.
      let commerce=null;
      try { commerce=await commerceTurn(ctx,{row,person,contact:applied.contact,text:e.text,intent:e.intent,now,secret:a.hashSecret}); }
      catch(err) { console.error('hasib_order_failed',err?.message); }
      if(!enabled || !control.active || !ready(row) || person.optout || person.takeover || contact.optout || now-e.at>=DAY || !e.reply) continue;
      // Stock facts replace a generic price/services/unknown answer and follow anything else (a greeting, hours).
      const lead=commerce?.facts ? (GENERIC_INTENTS.has(e.intent) ? [commerce.facts] : [e.reply,commerce.facts]) : [e.reply];
      const reply=[...lead,commerce?.ack,applied.plan.text].filter(Boolean).join('\n\n').slice(0,MAX_REPLY_LENGTH);
      await queue(row,{...person,version},reply,`reply:${a.integrationId}:${e.id}`,false,!!e.handoff);
      await recordQuestions(ctx,applied.contact,applied.plan.text && reply.endsWith(applied.plan.text)?applied.plan.keys:[],now);
    }
    return ok(null);
  }
  if(a.operation==='claim') {
    const job=await ctx.db.get(a.jobId);
    if(!job || job.status!=='queued') return ok(null);
    const inflight=await ctx.db.query('blueMessages').withIndex('by_integration_status',q=>q.eq('integrationId',job.integrationId).eq('status','attempting')).take(1);
    if(inflight.length) return ok(null);
    const control=await controls(job.integrationId), row=await rowForJob(job,control), person=await ctx.db.get(job.conversationId);
    if(job.profileVersion!==(row?.profileVersion || 1) || job.conversationVersion!==(person?.version || 0)) {await ctx.db.patch(job._id,{status:'blocked',reason:'conversation_or_profile_changed'});return ok(null);}
    const reason=!enabled?'global_paused':!ready(row)?'activation_not_ready':!control?.active && !job.manual?'owner_paused':person?.optout?'contact_opted_out':person?.takeover && !job.manual && !job.handoff?'human_takeover':!person || now-person.lastInbound>=DAY || now-job.at>=DAY?'window_expired':null;
    if(reason) {await ctx.db.patch(job._id,{status:'blocked',reason});return ok(null);}
    for(const [key,max,expiresAt] of [[`minute:${job.integrationId}:${Math.floor(now/60000)}`,10,now+120000],[`day:${job.integrationId}:${Math.floor(now/DAY)}`,100,now+2*DAY],[`global:${Math.floor(now/DAY)}`,500,now+2*DAY]]) {
      const r=await find('blueMessageRates','by_key','key',key);
      if(r?.count>=max) {await ctx.db.patch(job._id,{status:'blocked',reason:'rate_limit'});return ok(null);}
      if(r) await ctx.db.patch(r._id,{count:r.count+1});else await ctx.db.insert('blueMessageRates',{key,count:1,expiresAt});
    }
    await ctx.db.patch(job._id,{status:'attempting',intent:a.intent,attemptAt:now});
    return ok({jobId:job._id,intent:a.intent,number:person.number,text:job.text,integration:row.integration,sessionHash:row.sessionHash,profileVersion:row.profileVersion || 1});
  }
  if(a.operation==='send_gate') {
    const job=await ctx.db.get(a.jobId), control=job && await controls(job.integrationId), row=await rowForJob(job,control), person=job && await ctx.db.get(job.conversationId);
    return ok(!!(job?.status==='attempting' && job.intent===a.intent && job.profileVersion===(row?.profileVersion || 1) && job.conversationVersion===(person?.version || 0) && enabled && ready(row) && (control?.active || job.manual) && !person?.optout && (!person?.takeover || job.manual || job.handoff) && now-person.lastInbound<DAY));
  }
  if(a.operation==='result') {
    const job=await ctx.db.get(a.jobId);
    if(!job || job.intent!==a.intent || !['submitted','ambiguous','failed','blocked'].includes(a.status)) return fail('invalid_state');
    if(!terminal.has(job.status)) await ctx.db.patch(job._id,{status:a.status,...(a.reason?{reason:a.reason}:{}),...(a.providerId?{providerId:a.providerId}:{}),...(a.status==='failed'&&Number.isSafeInteger(a.errorCode)?{errorCode:a.errorCode}:{})});
    if(a.status==='ambiguous' || a.status==='failed' || ['connection_not_ready','connection_check_failed'].includes(a.reason)) {
      const control=await controls(job.integrationId);
      if(control) await ctx.db.patch(control._id,{active:false,reason:a.status==='ambiguous'?'send_outcome_unknown':'provider_failed'});
    }
    const next=await ctx.db.query('blueMessages').withIndex('by_integration_status',q=>q.eq('integrationId',job.integrationId).eq('status','queued')).take(1);
    if(next.length) await schedule(next[0]._id);
    return ok(null);
  }
  return fail('invalid_state');
}
