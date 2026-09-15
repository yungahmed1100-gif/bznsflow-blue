import { internalMutation } from './_generated/server';
import { v } from 'convex/values';
import { executeBlueAuth } from './blueAuthState.js';
export const execute = internalMutation({args:{
  operation:v.union(...['review_access','request_code','code_sent','verify_code','session','signout','claim_draft','limit_import'].map(s=>v.literal(s))),
  accessHash:v.optional(v.string()),
  credential:v.optional(v.object({v:v.number(),iv:v.string(),data:v.string(),tag:v.string()})),
  email:v.optional(v.string()),codeHash:v.optional(v.string()),ipHash:v.optional(v.string()),challengeId:v.optional(v.string()),tokenHash:v.optional(v.string()),sessionHash:v.optional(v.string()),draftHash:v.optional(v.string()),
},handler:(ctx,args)=>executeBlueAuth(ctx,args)});
export const cleanup = internalMutation({args:{},handler:async ctx=>{
  for (const table of ['blueReviewerAccess','blueAuthChallenges','blueAuthLimits','sessions'] as const) {
    const rows=await ctx.db.query(table).withIndex('by_expiry',q=>q.lte('expiresAt',Date.now())).take(100);
    for(const row of rows) await ctx.db.delete(row._id);
  }
}});
// Meta asks that reviewer credentials stay valid for one year after submission.
const REVIEW_ACCESS_TTL_MS=365*86400000;
export const issueReviewAccess=internalMutation({args:{accessHash:v.string()},handler:async(ctx,args)=>{
  if(!/^[a-f0-9]{64}$/.test(args.accessHash)) throw Error('invalid_access_hash');
  const old=await ctx.db.query('blueReviewerAccess').withIndex('by_hash',q=>q.eq('tokenHash',args.accessHash)).unique();
  if(old) return {expiresAt:old.expiresAt};
  const now=Date.now(),expiresAt=now+REVIEW_ACCESS_TTL_MS;
  const accountId=await ctx.db.insert('accounts',{email:`meta-review-${args.accessHash.slice(0,16)}@bznsflow.invalid`,name:'Meta Reviewer',role:'customer',createdAt:now});
  await ctx.db.insert('blueReviewerAccess',{tokenHash:args.accessHash,accountId,expiresAt});
  return {expiresAt};
}});
// Ends a reviewer link and every session it opened. The reviewer account and its
// business records stay, so nothing a reviewer connected is silently detached.
export const revokeReviewAccess=internalMutation({args:{accessHash:v.string()},handler:async(ctx,args)=>{
  if(!/^[a-f0-9]{64}$/.test(args.accessHash)) throw Error('invalid_access_hash');
  const access=await ctx.db.query('blueReviewerAccess').withIndex('by_hash',q=>q.eq('tokenHash',args.accessHash)).unique();
  if(!access) return {revoked:false,sessions:0};
  const sessions=await ctx.db.query('sessions').withIndex('by_account',q=>q.eq('accountId',access.accountId)).collect();
  for(const session of sessions) await ctx.db.delete(session._id);
  await ctx.db.delete(access._id);
  return {revoked:true,sessions:sessions.length};
}});
