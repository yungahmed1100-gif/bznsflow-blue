import { internalMutation } from './_generated/server';
import { internal } from './_generated/api';
import { v, type Value } from 'convex/values';
import { executeCampaignWorker, maintainCampaigns } from './blueCampaignState.js';

// Worker-only operations; reached through the bearer-authenticated HTTP route.
export const execute = internalMutation({
  args: {
    operation: v.union(...['start_context', 'start_result', 'claim', 'gate', 'result'].map(s => v.literal(s))),
    campaignId: v.optional(v.id('blueCampaigns')), jobId: v.optional(v.id('blueCampaignRecipients')), intent: v.optional(v.string()),
    ready: v.optional(v.boolean()), reason: v.optional(v.string()), allowance: v.optional(v.number()), status: v.optional(v.string()),
    providerId: v.optional(v.string()), errorCode: v.optional(v.number()), campaignBlock: v.optional(v.string()),
  },
  handler: (ctx, args): Promise<{ ok: boolean; value?: Value; reason?: string }> => executeCampaignWorker(ctx, { ...args, workerFunction: internal.blueMessaging.dispatch }),
});

export const maintain = internalMutation({ args: {}, handler: async (ctx): Promise<void> => { await maintainCampaigns(ctx, { workerFunction: internal.blueMessaging.dispatch }); } });

// Internal-only broadcast brake, independent of Layla's conversational gate.
export const setBroadcastEnabled = internalMutation({ args: { enabled: v.boolean() }, handler: async (ctx, args) => {
  const row = await ctx.db.query('blueMessagingSettings').withIndex('by_key', q => q.eq('key', 'broadcast')).unique();
  if (row) await ctx.db.patch(row._id, { enabled: args.enabled }); else await ctx.db.insert('blueMessagingSettings', { key: 'broadcast', enabled: args.enabled });
  if (!args.enabled) {
    for (const status of ['scheduled', 'starting', 'processing']) {
      const campaigns = await ctx.db.query('blueCampaigns').withIndex('by_status_scheduled', q => q.eq('status', status)).take(100);
      for (const c of campaigns) await ctx.db.patch(c._id, { status: 'blocked', reason: 'broadcast_paused', updatedAt: Date.now() });
    }
  }
} });
