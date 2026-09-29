// A request names the exact catalogue variant; another size/colour cannot fill it.
import { owned } from '../blueTenant.js';
import { ok, fail, REQUEST_ID, byRequest, sellableVariant, clampLimit } from './shared.js';
async function publicRequest(ctx, row) {
  const found = await sellableVariant(ctx, row.accountId, row.variantId);
  const variant = found?.variant;
  const { _id, _seq, table, accountId, requestId, ...rest } = row;
  return { id: _id, ...rest, availableNow: row.status === 'waiting' && !!variant && !variant.archived && variant.onHand >= row.qty, options: variant?.options || [] };
}
export async function executeRequests(ctx, tenant, a, now) {
  const accountId = tenant.accountId, w = a.workflow || {};
  if (a.operation === 'product_requests') {
    const page = await ctx.db.query('hasibProductRequests').withIndex('by_account_created', q => q.eq('accountId', accountId)).order('desc').paginate({ numItems: clampLimit(a.limit, 200), cursor: a.cursor || null });
    return ok({ cursor: page.isDone ? null : page.continueCursor, items: await Promise.all(page.page.filter(r => (!a.status || r.status === a.status) && (!a.variantId || r.variantId === a.variantId)).map(r => publicRequest(ctx, r))) });
  }
  if (a.operation === 'product_request_create') {
    if (!REQUEST_ID.test(a.requestId || '')) return fail('invalid_request');
    const replay = await byRequest(ctx, 'hasibProductRequests', accountId, a.requestId);
    if (replay) return ok(await publicRequest(ctx, replay));
    if (!await owned(ctx, w.contactId, accountId, 'blueContacts')) return fail('contact_not_found');
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
    if (!order || order.contactId !== row.contactId || !['confirmed', 'preparing', 'ready', 'completed'].includes(order.status)) return fail('order_not_found');
    const qty = order.lines.filter(l => l.variantId === row.variantId).reduce((n, l) => n + l.qty, 0);
    const prior = await ctx.db.query('hasibProductRequests').withIndex('by_order_variant', q => q.eq('orderId', order._id).eq('variantId', row.variantId)).collect();
    const used = prior.filter(r => r.orderId === order._id && r.variantId === row.variantId && r.status === 'fulfilled').reduce((n, r) => n + r.qty, 0);
    if (qty - used < row.qty) return fail('exact_variant_required');
  }
  await ctx.db.patch(row._id, { status: w.status, ...(w.status === 'fulfilled' ? { orderId: w.orderId } : {}), version: row.version + 1, updatedAt: now });
  return ok(await publicRequest(ctx, await ctx.db.get(row._id)));
}
