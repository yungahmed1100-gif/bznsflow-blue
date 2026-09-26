import { internalMutation } from './_generated/server';
import { v } from 'convex/values';
import { detachIntegration, executeReview, resetAttempts } from './reviewState.js';
export const profile = v.object({ businessName: v.string(), sector: v.string(), services: v.string(), prices: v.string(), hours: v.string(), location: v.string(), humanContact: v.string(), faqs:v.optional(v.array(v.object({question:v.string(),answer:v.string()}))), reviewed: v.boolean() });
export const path = v.union(v.literal('coexistence'), v.literal('new_number'), v.literal('existing_cloud'));
export const integration = v.object({ id: v.string(), app: v.string(), waba: v.string(), phone: v.string(), sender: v.string(), path, credential: v.object({ v: v.number(), iv: v.string(), data: v.string(), tag: v.string() }) });
export const execute = internalMutation({ args: {
  operation: v.union(...['create','get','profile','begin','await','claim','cancel','credential','claim_operation','result','pause','save_progress','preview_result','pending_selection','cancel_selection'].map(s => v.literal(s))),
  selection: v.optional(v.object({ waba: v.string(), path, candidates: v.array(v.object({ id: v.string(), sender: v.string() })), credential: v.object({ v: v.number(), iv: v.string(), data: v.string(), tag: v.string() }) })),
  diagnostic: v.optional(v.object({ reason: v.string(), stage: v.string(), at: v.number(), providerCode: v.optional(v.number()) })),
  connectionChecks: v.optional(v.object({ routing: v.boolean(), registered: v.boolean(), path: v.boolean(), nameStatus:v.optional(v.string()), portfolio:v.optional(v.object({ id:v.string(), name:v.string(), verificationStatus:v.string() })) })),
  journeyStep: v.optional(v.number()), profileVersion: v.optional(v.number()),
  preview: v.optional(v.object({ question: v.string(), text: v.string(), sourceFields: v.array(v.string()), needsHuman: v.boolean(), intent: v.string() })),
  sessionHash: v.string(), profile: v.optional(profile), attempt: v.optional(v.string()), stateHash: v.optional(v.string()), path: v.optional(path),
  preselect: v.optional(v.object({ business: v.optional(v.string()), waba: v.optional(v.string()) })),
  integration: v.optional(integration), operationId: v.optional(v.string()), effect: v.optional(v.union(v.literal('register'),v.literal('subscribe'),v.literal('refresh'))),
  status: v.optional(v.union(v.literal('connected'),v.literal('registration_required'),v.literal('reconciliation_required'),v.literal('failed'))),
}, handler: (ctx, args) => executeReview(ctx, args) });
// Operator-only (npx convex run); deliberately not reachable through execute or HTTP.
export const detach = internalMutation({ args: { email: v.string(), confirm: v.literal(true) }, handler: async (ctx, args) => {
  const result: { ok: boolean; reason?: string; value?: { detached: boolean } } = await detachIntegration(ctx, args);
  if (!result.ok) throw new Error(result.reason);
  return result.value;
} });
export const resetAttemptBudget = internalMutation({ args: { email: v.string(), confirm: v.literal(true) }, handler: async (ctx, args) => {
  const result: { ok: boolean; reason?: string; value?: { reset: boolean } } = await resetAttempts(ctx, args);
  if (!result.ok) throw new Error(result.reason);
  return result.value;
} });
export const cleanup = internalMutation({ args: {}, handler: async ctx => {
  const rows = await ctx.db.query('blueReviewSessions').withIndex('by_expiry', q => q.lte('expiresAt', Date.now())).take(100);
  for (const row of rows) {
    // Keep asset ownership reserved after anonymous content/credentials expire.
    if (row.integration) {
      const claim=await ctx.db.query('blueAssetClaims').withIndex('by_phone',q=>q.eq('phone',row.integration!.phone)).unique();
      if(!claim) await ctx.db.insert('blueAssetClaims',{phone:row.integration.phone,waba:row.integration.waba,sessionHash:row.sessionHash,createdAt:row.createdAt});
    }
    await ctx.db.delete(row._id);
  }
  // Legacy review records contain no verified connection and have their own TTL.
  const legacy = await ctx.db.query('reviewSessions').withIndex('by_expiry', q => q.lte('expiresAt', Date.now())).take(100);
  for (const row of legacy) await ctx.db.delete(row._id);
  const tests = await ctx.db.query('reviewTests').withIndex('by_expiry', q => q.lte('expiresAt', Date.now())).take(100);
  for (const row of tests) await ctx.db.delete(row._id);
} });
