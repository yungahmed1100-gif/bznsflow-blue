import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const findByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => ctx.db.query("accounts").withIndex("by_email", q => q.eq("email", email.toLowerCase().trim())).unique(),
});

export const createAccount = internalMutation({
  args: { email: v.string(), name: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();
    const existing = await ctx.db.query("accounts").withIndex("by_email", q => q.eq("email", email)).unique();
    if (existing) return existing._id;
    return ctx.db.insert("accounts", { ...args, email, role: "customer", createdAt: Date.now() });
  },
});
