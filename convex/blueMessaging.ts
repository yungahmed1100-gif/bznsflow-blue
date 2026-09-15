import { internalMutation, internalAction } from './_generated/server';
import { internal } from './_generated/api';
import { v, type Value } from 'convex/values';
import { executeMessaging } from './blueMessagingState.js';

const event = v.object({kind:v.string(),id:v.optional(v.string()),from:v.optional(v.string()),at:v.optional(v.number()),text:v.optional(v.string()),reply:v.optional(v.union(v.string(),v.null())),intent:v.optional(v.union(v.string(),v.null())),handoff:v.optional(v.boolean()),recipient:v.optional(v.string()),status:v.optional(v.string()),profileName:v.optional(v.string()),errorCode:v.optional(v.number())});
export const execute = internalMutation({args:{operation:v.union(...['health_context','health_result','binding','state','activate','pause','resume_conversation','takeover','manual_reply','ingest','claim','send_gate','result'].map(s=>v.literal(s))),sessionHash:v.optional(v.string()),waba:v.optional(v.string()),phone:v.optional(v.string()),integrationId:v.optional(v.string()),profileVersion:v.optional(v.number()),connected:v.optional(v.boolean()),events:v.optional(v.array(event)),conversationId:v.optional(v.id('blueConversations')),text:v.optional(v.string()),requestId:v.optional(v.string()),jobId:v.optional(v.id('blueMessages')),intent:v.optional(v.string()),status:v.optional(v.string()),reason:v.optional(v.string()),providerId:v.optional(v.string()),errorCode:v.optional(v.number())},handler:(ctx,args):Promise<{ok:boolean;value?:Value;reason?:string}>=>executeMessaging(ctx,{...args,workerFunction:internal.blueMessaging.dispatch,hashSecret:process.env.BLUE_REVIEW_SERVICE_SECRET})});

export const dispatch = internalAction({args:{jobId:v.optional(v.id('blueMessages')),integrationId:v.optional(v.string()),campaignJobId:v.optional(v.id('blueCampaignRecipients')),campaignStartId:v.optional(v.id('blueCampaigns'))},handler:async(_ctx,args)=>{
  const secret=process.env.BLUE_MESSAGING_WORKER_SECRET;
  if(!secret) throw new Error('blue_worker_not_configured');
  const response=await fetch('https://bznsflow-blue.vercel.app/api/layla-meta-worker',{method:'POST',redirect:'error',signal:AbortSignal.timeout(55000),headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},body:JSON.stringify(args)});
  if(!response.ok) throw new Error('blue_worker_failed');
}});

// Internal-only operational brake. It never enables any individual account.
export const setEnabled = internalMutation({args:{enabled:v.boolean()},handler:async(ctx,args)=>{
  const row=await ctx.db.query('blueMessagingSettings').withIndex('by_key',q=>q.eq('key','global')).unique();
  if(row) await ctx.db.patch(row._id,args);else await ctx.db.insert('blueMessagingSettings',{key:'global',...args});
  if(!args.enabled) {
    const controls=await ctx.db.query('blueMessagingControls').withIndex('by_active_health',q=>q.eq('active',true)).take(100);
    for(const control of controls) await ctx.db.patch(control._id,{active:false,reason:'global_paused'});
    if(controls.length===100) await ctx.scheduler.runAfter(0,internal.blueMessaging.setEnabled,{enabled:false});
  }
}});

export const maintain = internalMutation({args:{},handler:async ctx=>{
  const now=Date.now();
  const health=await ctx.db.query('blueMessagingControls').withIndex('by_active_health',q=>q.eq('active',true).lt('healthAt',now-300000)).take(50);
  for(const control of health) {await ctx.db.patch(control._id,{healthAt:now});await ctx.scheduler.runAfter(0,internal.blueMessaging.dispatch,{integrationId:control.integrationId});}
  const queued=await ctx.db.query('blueMessages').withIndex('by_status_at',q=>q.eq('status','queued').lt('at',now-60000)).take(100);
  for(const job of queued) await ctx.scheduler.runAfter(0,internal.blueMessaging.dispatch,{jobId:job._id});
  const attempting=await ctx.db.query('blueMessages').withIndex('by_status_at',q=>q.eq('status','attempting')).take(100);
  for(const job of attempting) if((job.attemptAt || 0)<now-120000) {
    await ctx.db.patch(job._id,{status:'ambiguous',reason:'worker_outcome_unknown'});
    const control=await ctx.db.query('blueMessagingControls').withIndex('by_integration',q=>q.eq('integrationId',job.integrationId)).unique();
    if(control) await ctx.db.patch(control._id,{active:false,reason:'send_outcome_unknown'});
  }
  const texts=await ctx.db.query('blueMessages').withIndex('by_text_expiry',q=>q.lt('textExpiresAt',now)).take(100);
  for(const row of texts) await ctx.db.patch(row._id,{text:undefined,textExpiresAt:Number.MAX_SAFE_INTEGER});
  for(const table of ['blueMessages','blueMessageRates'] as const) {
    const rows=await ctx.db.query(table).withIndex('by_expiry',q=>q.lt('expiresAt',now)).take(100);
    for(const row of rows) await ctx.db.delete(row._id);
  }
}});
