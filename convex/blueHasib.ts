import { internalMutation } from './_generated/server';
import { v, type Value } from 'convex/values';
import { executeHasib, HASIB_OPERATIONS } from './hasib/hasibState.js';

type Result = Promise<{ ok: boolean; value?: Value; reason?: string }>;
const option = v.object({ key: v.string(), value: v.string() });
const line = v.object({ variantId: v.optional(v.string()), name: v.optional(v.string()), qty: v.number(), unitPriceMinor: v.optional(v.number()), discountMinor: v.optional(v.number()) });
const variant = v.object({ variantId: v.optional(v.string()), sku: v.string(), options: v.array(option), priceMinor: v.number(), costMinor: v.optional(v.number()), reorderPoint: v.optional(v.number()), openingStock: v.optional(v.number()) });

// Every call is resolved to one tenant from sessionHash inside executeHasib.
export const execute = internalMutation({
  args: {
    operation: v.union(...HASIB_OPERATIONS.map(s => v.literal(s))),
    sessionHash: v.string(), requestId: v.optional(v.string()), cursor: v.optional(v.string()), limit: v.optional(v.number()), search: v.optional(v.string()), status: v.optional(v.string()),
    itemId: v.optional(v.string()), variantId: v.optional(v.string()), orderId: v.optional(v.string()), contactId: v.optional(v.string()), conversationId: v.optional(v.string()),
    item: v.optional(v.object({ kind: v.string(), nameAr: v.string(), nameEn: v.string(), category: v.string(), unit: v.string(), trackStock: v.boolean(), catalogEntryKey: v.optional(v.string()) })),
    variants: v.optional(v.array(variant)),
    delta: v.optional(v.number()), reason: v.optional(v.string()), unitCostMinor: v.optional(v.number()), note: v.optional(v.string()),
    channel: v.optional(v.string()), lines: v.optional(v.array(line)), deliveryFeeMinor: v.optional(v.number()), confirm: v.optional(v.boolean()),
    fulfilment: v.optional(v.object({ type: v.string(), area: v.optional(v.string()), dueAt: v.optional(v.number()) })),
    customFields: v.optional(v.array(option)), notes: v.optional(v.string()), customerName: v.optional(v.string()),
    to: v.optional(v.string()), version: v.optional(v.number()), amountMinor: v.optional(v.number()), method: v.optional(v.string()), reference: v.optional(v.string()),
    vat: v.optional(v.object({ registered: v.boolean(), rateBps: v.number(), pricesIncludeVat: v.boolean(), vatin: v.optional(v.string()) })),
    stockPolicy: v.optional(v.string()),
    expenseId: v.optional(v.string()), category: v.optional(v.string()), vatMinor: v.optional(v.number()), vendor: v.optional(v.string()), paidOn: v.optional(v.string()), period: v.optional(v.string()),
  },
  handler: (ctx, args): Result => executeHasib(ctx, { ...args, hashSecret: process.env.BLUE_REVIEW_SERVICE_SECRET }),
});

/** Durable operator gate. Off refuses every Hasib operation; data is kept. */
export const setEnabled = internalMutation({ args: { enabled: v.boolean() }, handler: async (ctx, args) => {
  const row = await ctx.db.query('blueMessagingSettings').withIndex('by_key', q => q.eq('key', 'hasib')).unique();
  if (row) await ctx.db.patch(row._id, { enabled: args.enabled }); else await ctx.db.insert('blueMessagingSettings', { key: 'hasib', enabled: args.enabled });
  return { enabled: args.enabled };
} });
