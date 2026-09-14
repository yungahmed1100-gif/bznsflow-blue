import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const saveBusiness = internalMutation({
  args: {
    accountId: v.id("accounts"), businessName: v.string(), sector: v.string(), services: v.string(),
    prices: v.optional(v.string()), hours: v.optional(v.string()), location: v.optional(v.string()), humanContact: v.string(),
  },
  handler: async (ctx, args) => {
    const { accountId, ...profile } = args;
    const existing = await ctx.db.query("businesses").withIndex("by_account", q => q.eq("accountId", accountId)).unique();
    if (existing) { await ctx.db.patch(existing._id, profile); return existing._id; }
    return ctx.db.insert("businesses", { accountId, ...profile });
  },
});

export const getBusiness = internalQuery({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => ctx.db.query("businesses").withIndex("by_account", q => q.eq("accountId", accountId)).unique(),
});
