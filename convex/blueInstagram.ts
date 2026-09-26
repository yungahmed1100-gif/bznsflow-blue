import { internalMutation } from './_generated/server';
import { internal } from './_generated/api';
import { v, type Value } from 'convex/values';
import { instagramCredential, instagramIntegration } from './schema';
import { executeInstagram, purgeInstagram } from './blueInstagramState.js';

export const execute = internalMutation({args:{
  operation:v.union(...['deletion_status','state','context','begin','consume','connect','checked','disconnect','disconnected','revoke','refresh_context','refresh_result'].map(s=>v.literal(s))),
  deletionCode:v.optional(v.string()),sessionHash:v.optional(v.string()),stateHash:v.optional(v.string()),lang:v.optional(v.string()),integration:v.optional(instagramIntegration),
  integrationId:v.optional(v.string()),igAccount:v.optional(v.string()),tokenExpiresAt:v.optional(v.number()),credential:v.optional(instagramCredential),
  expectedUpdatedAt:v.optional(v.number()),issuedAt:v.optional(v.number()),connected:v.optional(v.boolean()),deleteData:v.optional(v.boolean()),
},handler:(ctx,args):Promise<{ok:boolean;value?:Value;reason?:string}>=>executeInstagram(ctx,{...args,purgeFunction:internal.blueInstagram.purge})});

// Deletes a connection's Instagram data in batches, rescheduling itself until done.
export const purge = internalMutation({args:{connectionId:v.id('blueInstagramConnections')},handler:async(ctx,{connectionId})=>{
  if (!(await purgeInstagram(ctx,connectionId,Date.now()))) await ctx.scheduler.runAfter(0,internal.blueInstagram.purge,{connectionId});
}});

export const maintain = internalMutation({args:{},handler:async ctx=>{
  const now=Date.now();
  const due=await ctx.db.query('blueInstagramConnections').withIndex('by_status_refresh',q=>q.eq('status','connected').lt('refreshAt',now)).take(25);
  for (const connection of due) {
    // The next attempt is durable; a network failure never loops rapidly.
    await ctx.db.patch(connection._id,{refreshAt:now+3600000});
    await ctx.scheduler.runAfter(0,internal.blueMessaging.dispatch,{instagramRefreshId:connection.integrationId});
  }
  const attempts=await ctx.db.query('blueInstagramAttempts').withIndex('by_expiry',q=>q.lt('expiresAt',now)).take(100);
  for (const attempt of attempts) await ctx.db.delete(attempt._id);
  // Deletion starts the moment Meta asks; this only restarts any that stalled.
  const deletions=await ctx.db.query('blueInstagramConnections').withIndex('by_delete',q=>q.eq('deletePending',true)).take(10);
  for (const connection of deletions) await ctx.scheduler.runAfter(0,internal.blueInstagram.purge,{connectionId:connection._id});
}});
