import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Internal by design: this cannot be called from the browser. Invoke it only
// after reviewing a redacted Green export and provisioning the Blue deployment.
export const importReviewed = internalMutation({
  args: {
    accounts: v.array(v.object({ email: v.string(), name: v.optional(v.string()), role: v.union(v.literal("owner"), v.literal("customer")) })),
    businesses: v.array(v.object({ email: v.string(), businessName: v.string(), sector: v.string(), services: v.string(), prices: v.optional(v.string()), hours: v.optional(v.string()), location: v.optional(v.string()), humanContact: v.string() })),
  },
  handler: async (ctx, { accounts, businesses }) => {
    const ids = new Map();
    for (const account of accounts) {
      const email = account.email.toLowerCase().trim();
      const existing = await ctx.db.query("accounts").withIndex("by_email", q => q.eq("email", email)).unique();
      const id = existing?._id ?? await ctx.db.insert("accounts", { ...account, email, createdAt: Date.now(), migratedFromGreen: true });
      ids.set(email, id);
    }
    for (const business of businesses) {
      const accountId = ids.get(business.email.toLowerCase().trim());
      if (!accountId) continue;
      const { email: _email, ...profile } = business;
      const existing = await ctx.db.query("businesses").withIndex("by_account", q => q.eq("accountId", accountId)).unique();
      if (existing) await ctx.db.patch(existing._id, profile);
      else await ctx.db.insert("businesses", { accountId, ...profile });
    }
    return { accounts: accounts.length, businesses: businesses.length };
  },
});
