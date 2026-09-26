// The durable Hasib gate, shared by the API executor and Layla's ingest hook.
export async function hasibEnabled(ctx) {
  const row = await ctx.db.query('blueMessagingSettings').withIndex('by_key', q => q.eq('key', 'hasib')).unique();
  return row?.enabled === true;
}
