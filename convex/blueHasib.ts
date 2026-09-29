import { hasibEntryArgs } from './hasib/entryArgs.js';
import { internalMutation } from './_generated/server';
import { internal } from './_generated/api';
import { v, type Value } from 'convex/values';
import { executeHasib } from './hasib/hasibState.js';
import { grantPlan as grant, revokePlan as revoke } from './hasib/plans.js';
import { sweepOrphanPhotos } from './hasib/catalogState.js';

type Result = Promise<{ ok: boolean; value?: Value; reason?: string }>;
// Every call is resolved to one tenant from sessionHash inside executeHasib.
export const execute = internalMutation({
  args: hasibEntryArgs,
  handler: (ctx, args): Result => executeHasib(ctx, { ...args, workerFunction: internal.blueMessaging.dispatch, hashSecret: process.env.BLUE_REVIEW_SERVICE_SECRET }),
});

/** Durable operator gate. Off refuses every Hasib operation; data is kept. */
export const setEnabled = internalMutation({ args: { enabled: v.boolean() }, handler: async (ctx, args) => {
  const row = await ctx.db.query('blueMessagingSettings').withIndex('by_key', q => q.eq('key', 'hasib')).unique();
  if (row) await ctx.db.patch(row._id, { enabled: args.enabled }); else await ctx.db.insert('blueMessagingSettings', { key: 'hasib', enabled: args.enabled });
  return { enabled: args.enabled };
} });

/** Operator: give an account Ascend or Apex (Hasib included), optionally straight into a live pack. */
export const grantPlan = internalMutation({ args: { email: v.string(), plan: v.string(), packId: v.optional(v.string()), note: v.optional(v.string()) },
  handler: (ctx, args) => grant(ctx, args, Date.now()) });

/** Operator: end an account's Hasib plan. Its orders, stock and expenses are kept. */
export const revokePlan = internalMutation({ args: { email: v.string() }, handler: (ctx, args) => revoke(ctx, args, Date.now()) });


/** Hourly: remove photo uploads that were never attached to a product. */
export const sweepPhotos = internalMutation({ args: {}, handler: (ctx) => sweepOrphanPhotos(ctx, Date.now()) });
