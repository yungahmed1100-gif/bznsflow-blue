// Called from contact deletion. Orders are tax and business records, so their
// amounts stay; anything that identifies the person is removed.
export async function anonymizeContactOrders(ctx, contact, now) {
  const rows = await ctx.db.query('hasibOrders').withIndex('by_contact_created', q => q.eq('contactId', contact._id)).take(2000);
  for (const o of rows) {
    if (o.accountId !== contact.accountId) continue;
    await ctx.db.patch(o._id, { customerName: undefined, conversationId: undefined, notes: undefined,
      fulfilment: { type: o.fulfilment.type, ...(o.fulfilment.dueAt ? { dueAt: o.fulfilment.dueAt } : {}) }, customFields: [], updatedAt: now });
    // Payment references are free text a cashier may have filled with a name or number.
    for (const p of await ctx.db.query('hasibPayments').withIndex('by_order_at', q => q.eq('orderId', o._id)).take(100)) {
      if (p.reference) await ctx.db.patch(p._id, { reference: undefined });
    }
  }
}
