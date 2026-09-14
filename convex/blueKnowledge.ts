import { internalMutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';

const chunk = v.object({ tenantId:v.string(), revision:v.number(), locale:v.string(), text:v.string(), searchText:v.optional(v.string()), source:v.string(), docType:v.optional(v.string()), effectiveDate:v.optional(v.string()), sectionPath:v.optional(v.string()), approved:v.boolean(), contentHash:v.string(), embedding:v.optional(v.array(v.float64())), updatedAt:v.number() });

export const publish = internalMutation({
  args: { tenantId:v.string(), revision:v.number(), chunks:v.array(chunk) },
  handler: async (ctx, args) => {
    if (!args.tenantId || args.chunks.length > 200) throw new Error('invalid knowledge publication');
    const existing = await ctx.db.query('blueKnowledgeChunks').withIndex('by_tenant_revision', q => q.eq('tenantId', args.tenantId).eq('revision', args.revision)).collect();
    for (const row of existing) await ctx.db.delete(row._id);
    for (const row of args.chunks) {
      if (row.tenantId !== args.tenantId || row.revision !== args.revision || row.text.length > 12000) throw new Error('invalid tenant knowledge row');
      await ctx.db.insert('blueKnowledgeChunks', row);
    }
    return { tenantId:args.tenantId, revision:args.revision, count:args.chunks.length };
  },
});

export const listApproved = internalQuery({
  args: { tenantId:v.string(), revision:v.number(), locale:v.optional(v.string()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query('blueKnowledgeChunks').withIndex('by_tenant_revision', q => q.eq('tenantId', args.tenantId).eq('revision', args.revision)).collect();
    return rows.filter(row => row.approved && (!args.locale || row.locale === args.locale)).map(({ _id, _creationTime, ...row }) => ({ id:_id, ...row }));
  },
});
