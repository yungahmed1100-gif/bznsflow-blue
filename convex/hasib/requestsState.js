// A request names the exact catalogue variant; another size/colour cannot fill it.
import { owned } from '../blueTenant.js';
import { displayName } from '../blueContacts.js';
import { ok, fail, REQUEST_ID, byRequest, sellableVariant, clampLimit } from './shared.js';
// A sale fills a request once stock has left for that customer: confirmed, and anything after it short of a reversal.
const FILLING_STATUSES = Object.freeze(['confirmed', 'ready', 'out_for_delivery', 'failed_delivery', 'delivered', 'completed']);
const FILTER_PAGES = 5;
async function publicRequest(ctx, row) {
  const found = await sellableVariant(ctx, row.accountId, row.variantId);
  const variant = found?.variant;
  const { _id, _seq, table, accountId, requestId, ...rest } = row;
  // Names come with the request so the list never has to load every contact and product.
  const contact = await ctx.db.get(row.contactId);
  const person = contact?.accountId === row.accountId && contact.state === 'active' ? contact : null;
  const chat = person ? (await ctx.db.query('blueConversations').withIndex('by_contact', q => q.eq('contactId', person._id)).take(5)).find(c => c.accountId === row.accountId) : null;
  return { id: _id, ...rest, availableNow: row.status === 'waiting' && !!variant && !variant.archived && variant.onHand >= row.qty, options: variant?.options || [],
    product: found ? { nameEn: found.item.nameEn || '', nameAr: found.item.nameAr || '' } : null, contactName: person ? displayName(person).name : null, conversationId: chat?._id || null };
}
export async function executeRequests(ctx, tenant, a, now) {
  const accountId = tenant.accountId, w = a.workflow || {};
  if (a.operation === 'product_requests') {
    // Filters run after each page, so keep reading (a few pages at most) until the page is full.
    const limit = clampLimit(a.limit, 200), wanted = r => (!a.status || r.status === a.status) && (!a.variantId || r.variantId === a.variantId);
    let cursor = a.cursor || null, rows = [], done = false;
    for (let reads = 0; reads < FILTER_PAGES && rows.length < limit && !done; reads++) {
      const page = await ctx.db.query('hasibProductRequests').withIndex('by_account_created', q => q.eq('accountId', accountId)).order('desc').paginate({ numItems: limit, cursor });
      rows = [...rows, ...page.page.filter(wanted)];
      cursor = page.continueCursor;
      done = page.isDone;
    }
    return ok({ cursor: done ? null : cursor, items: await Promise.all(rows.map(r => publicRequest(ctx, r))) });
  }
  if (a.operation === 'product_request_create') {
    if (!REQUEST_ID.test(a.requestId || '')) return fail('invalid_request');
    const replay = await byRequest(ctx, 'hasibProductRequests', accountId, a.requestId);
    if (replay) return ok(await publicRequest(ctx, replay));
    const person = await owned(ctx, w.contactId, accountId, 'blueContacts');
    if (!person || person.state !== 'active') return fail('contact_not_found');
    if (!await sellableVariant(ctx, accountId, w.variantId)) return fail('variant_not_found');
    if (!Number.isSafeInteger(w.qty) || w.qty < 1 || w.qty > 10000) return fail('invalid_quantity');
    const id = await ctx.db.insert('hasibProductRequests', { accountId, requestId: a.requestId, contactId: w.contactId, variantId: w.variantId, qty: w.qty, status: 'waiting', version: 1, createdAt: now, updatedAt: now });
    return ok(await publicRequest(ctx, await ctx.db.get(id)));
  }
  if (a.operation !== 'product_request_status') return null;
  const row = await owned(ctx, a.productRequestId, accountId, 'hasibProductRequests');
  if (!row) return fail('request_not_found');
  if (row.version !== a.version) return fail('request_conflict');
  if (row.status === 'fulfilled' && w.status === 'waiting') {
    const original = await owned(ctx, row.orderId, accountId, 'hasibOrders');
    if (!original || !['cancelled', 'returned'].includes(original.status)) return fail('order_not_reversed');
    await ctx.db.patch(row._id, { status: 'waiting', orderId: undefined, version: row.version + 1, updatedAt: now });
    return ok(await publicRequest(ctx, await ctx.db.get(row._id)));
  }
  if (row.status !== 'waiting' || !['fulfilled', 'cancelled'].includes(w.status)) return fail('invalid_transition');
  if (w.status === 'fulfilled') {
    const order = await owned(ctx, w.orderId, accountId, 'hasibOrders');
    if (!order || order.contactId !== row.contactId || !FILLING_STATUSES.includes(order.status)) return fail('order_not_found');
    const qty = order.lines.filter(l => l.variantId === row.variantId).reduce((n, l) => n + l.qty, 0);
    const prior = await ctx.db.query('hasibProductRequests').withIndex('by_order_variant', q => q.eq('orderId', order._id).eq('variantId', row.variantId)).take(200);
    const used = prior.filter(r => r.orderId === order._id && r.variantId === row.variantId && r.status === 'fulfilled').reduce((n, r) => n + r.qty, 0);
    if (qty - used < row.qty) return fail('exact_variant_required');
  }
  await ctx.db.patch(row._id, { status: w.status, ...(w.status === 'fulfilled' ? { orderId: w.orderId } : {}), version: row.version + 1, updatedAt: now });
  return ok(await publicRequest(ctx, await ctx.db.get(row._id)));
}
