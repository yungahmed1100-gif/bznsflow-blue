import { removeDemandFor } from './demandState.js';
// Called from contact deletion. Orders are tax and business records, so their
// amounts stay; anything that identifies the person is removed.
const CLEANUP_SCAN = 2000;
export async function anonymizeContactOrders(ctx, contact, now) {
  await removeDemandFor(ctx, contact._id);
  // Neither table has a contact index; scan the shop's own rows, newest first, within one mutation's budget.
  const ownRows = table => ctx.db.query(table).withIndex(table === 'hasibFollowups' ? 'by_account_due' : 'by_account_created', q => q.eq('accountId', contact.accountId)).order('desc').take(CLEANUP_SCAN);
  // A waiting request for a person who is gone can never be filled.
  for (const r of await ownRows('hasibProductRequests')) {
    if (r.contactId === contact._id && r.status === 'waiting') await ctx.db.patch(r._id, { status: 'cancelled', version: r.version + 1, updatedAt: now });
  }
  // A follow-up's reason is free text about the person, so the whole follow-up goes.
  for (const f of await ownRows('hasibFollowups')) if (f.contactId === contact._id) await ctx.db.delete(f._id);
  // Repairs and trade-ins keep the device and amounts; the person's typed name goes.
  for (const table of ['hasibRepairs', 'hasibTradeIns']) {
    for (const r of await ctx.db.query(table).withIndex('by_contact', q => q.eq('contactId', contact._id)).take(500)) {
      if (r.accountId === contact.accountId) await ctx.db.patch(r._id, { customerName: undefined, ...(table === 'hasibRepairs' ? { conversationId: undefined } : {}) });
    }
  }
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
