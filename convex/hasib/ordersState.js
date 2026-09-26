// Orders and payments. Lines snapshot the price and cost they were sold at;
// stock moves only on the transitions the order machine defines.
import { owned, encodeCursor, decodeCursor, afterCursor } from '../blueTenant.js';
import { displayName, linkConversation, sectorFor } from '../blueContacts.js';
import { hasibPack } from '../../config/hasib-packs.js';
import { isMinor, normalizeDigits } from './money.js';
import { matchItem } from './matching.js';
import { orderTotals, paymentStatus, MAX_QTY } from './totals.js';
import { canTransition, isStatus, stockEffect, deductsStock } from './orderMachine.js';
import { ok, fail, clean, bounded, clampLimit, REQUEST_ID, byRequest, settingsFor, vatOf, nextNumber, sellableVariant, precheckStock, writeMove } from './shared.js';

export const CHANNELS = ['whatsapp', 'instagram', 'walk_in', 'phone', 'website', 'other'];
export const FULFILMENT = ['pickup', 'delivery', 'in_store'];
export const PAYMENT_METHODS = ['cash', 'cod', 'card', 'bank_transfer', 'payment_link', 'other'];
const CLOSED = new Set(['cancelled', 'returned']);
const HISTORY = 30;

async function publicContactRef(ctx, contactId) {
  if (!contactId) return null;
  const contact = await ctx.db.get(contactId);
  return contact?.state === 'active' ? { id: contact._id, name: displayName(contact).name } : null;
}
export async function publicOrder(ctx, o, { payments } = {}) {
  return { id: o._id, number: o.number, status: o.status, channel: o.channel, contact: await publicContactRef(ctx, o.contactId), customerName: o.customerName || '',
    conversationId: o.conversationId || null, lines: o.lines, subtotalMinor: o.subtotalMinor, discountMinor: o.discountMinor, deliveryMinor: o.deliveryMinor,
    vatMinor: o.vatMinor, totalMinor: o.totalMinor, pricesIncludeVat: o.pricesIncludeVat, paidMinor: o.paidMinor, balanceMinor: o.totalMinor - o.paidMinor,
    paymentStatus: o.paymentStatus, fulfilment: o.fulfilment, customFields: o.customFields, notes: o.notes || '', stockShort: o.stockShort,
    history: o.history, version: o.version, createdAt: o.createdAt, updatedAt: o.updatedAt, ...(payments ? { payments } : {}) };
}

/** Resolve requested lines to snapshot lines. Throws `{ reason }` on anything invalid. */
async function resolveLines(ctx, accountId, raw) {
  if (!Array.isArray(raw) || !raw.length || raw.length > 50) throw { reason: 'invalid_order_lines' };
  const lines = [];
  for (const l of raw) {
    if (!Number.isSafeInteger(l?.qty) || l.qty < 1 || l.qty > MAX_QTY) throw { reason: 'invalid_order_lines' };
    if (l.unitPriceMinor !== undefined && !isMinor(l.unitPriceMinor)) throw { reason: 'invalid_order_lines' };
    if (l.discountMinor !== undefined && !isMinor(l.discountMinor)) throw { reason: 'invalid_order_lines' };
    if (l.variantId) {
      const found = await sellableVariant(ctx, accountId, l.variantId);
      if (!found) throw { reason: 'variant_not_found' };
      const { variant, item } = found;
      const label = variant.options.map(o => o.value).join(' / ');
      lines.push({ variantId: variant._id, itemId: item._id, name: [item.nameAr || item.nameEn, label].filter(Boolean).join(' — ').slice(0, 160), sku: variant.sku || undefined,
        qty: l.qty, unitPriceMinor: l.unitPriceMinor ?? variant.priceMinor, discountMinor: l.discountMinor || 0, unitCostMinor: variant.costMinor, tracked: item.trackStock, variant });
    } else {
      const name = bounded(l.name ?? '', 120);
      if (!name || l.unitPriceMinor === undefined) throw { reason: 'invalid_order_lines' };
      lines.push({ name, qty: l.qty, unitPriceMinor: l.unitPriceMinor, discountMinor: l.discountMinor || 0, unitCostMinor: 0, tracked: false });
    }
  }
  return lines;
}
const stripVariant = ({ variant, ...line }) => line;
const stockChanges = (lines, sign) => lines.filter(l => l.tracked && l.variant).map(l => ({ variant: l.variant, delta: sign * l.qty }));

async function applyOrderStock(ctx, accountId, order, lines, sign, now) {
  for (const l of lines.filter(x => x.tracked && x.variantId)) {
    await writeMove(ctx, { accountId, variantId: l.variantId, delta: sign * l.qty, reason: sign < 0 ? 'sale' : 'sale_reversal', refType: 'order', refId: order, now });
  }
}

function orderInput(a, pack) {
  if (!CHANNELS.includes(a.channel)) return null;
  const f = a.fulfilment || {};
  const area = bounded(f.area ?? '', 80);
  if (!FULFILMENT.includes(f.type) || area === null || (f.dueAt !== undefined && !Number.isSafeInteger(f.dueAt))) return null;
  const allowed = new Map(pack.orderFields.map(x => [x.key, x]));
  const customFields = Array.isArray(a.customFields) ? a.customFields.map(c => ({ key: c?.key, value: bounded(c?.value ?? '', allowed.get(c?.key)?.max || 300) })) : [];
  if (customFields.length > 10 || customFields.some(c => !allowed.has(c.key) || c.value === null)) return null;
  const notes = bounded(a.notes ?? '', 500), customerName = bounded(a.customerName ?? '', 80);
  if (notes === null || customerName === null) return null;
  if (a.deliveryFeeMinor !== undefined && !isMinor(a.deliveryFeeMinor)) return null;
  return { channel: a.channel, fulfilment: { type: f.type, ...(area ? { area } : {}), ...(f.dueAt ? { dueAt: f.dueAt } : {}) }, customFields: customFields.filter(c => c.value), notes, customerName };
}

/** Read-only: resolves who the order is for. Linking a chat to its contact is a write, so `linkContact` runs only after every check passes. */
async function contactFor(ctx, tenant, a) {
  if (a.conversationId) {
    const person = await owned(ctx, a.conversationId, tenant.accountId, 'blueConversations');
    return person ? { person, conversationId: person._id } : { error: 'conversation_not_found' };
  }
  if (a.contactId) {
    const contact = await owned(ctx, a.contactId, tenant.accountId, 'blueContacts');
    if (!contact || contact.state !== 'active') return { error: 'contact_not_found' };
    return { contact };
  }
  return {};
}

async function createOrder(ctx, tenant, a, now) {
  const { accountId } = tenant;
  if (!REQUEST_ID.test(a.requestId || '')) return fail('invalid_request');
  const replay = await byRequest(ctx, 'hasibOrders', accountId, a.requestId);
  if (replay) return ok(await publicOrder(ctx, replay));
  const input = orderInput(a, hasibPack(sectorFor(tenant.row)));
  if (!input) return fail('invalid_order');
  const who = await contactFor(ctx, tenant, a);
  if (who.error) return fail(who.error);
  const settings = await settingsFor(ctx, accountId);
  let lines, totals;
  try {
    lines = await resolveLines(ctx, accountId, a.lines);
    totals = orderTotals({ lines, deliveryFeeMinor: a.deliveryFeeMinor || 0, vat: vatOf(settings) });
  } catch (e) { return fail(e.reason || 'invalid_order_lines'); }
  const status = a.confirm === true ? 'confirmed' : 'pending';
  let short = false;
  if (deductsStock(status)) {
    const check = precheckStock(stockChanges(lines, -1), settings.stockPolicy);
    if (!check.ok) return fail(check.reason);
    short = check.short;
  }
  // Every check has passed; from here on the mutation writes.
  if (who.person) who.contact = await linkConversation(ctx, who.person, { sectorId: sectorFor(tenant.row), now, secret: tenant.secret });
  const snapshot = totals.lines.map((l, i) => stripVariant({ ...lines[i], vatBps: l.vatBps, netMinor: l.netMinor, vatMinor: l.vatMinor, discountMinor: l.discountMinor }));
  const number = await nextNumber(ctx, accountId, 'order');
  const id = await ctx.db.insert('hasibOrders', { accountId, number, requestId: a.requestId, ...(who.contact ? { contactId: who.contact._id } : {}), ...(who.conversationId ? { conversationId: who.conversationId } : {}),
    ...(input.customerName ? { customerName: input.customerName } : {}), channel: input.channel, status, lines: snapshot,
    subtotalMinor: totals.subtotalMinor, discountMinor: totals.discountMinor, deliveryMinor: totals.deliveryMinor, vatMinor: totals.vatMinor, totalMinor: totals.totalMinor,
    pricesIncludeVat: settings.vatRegistered && settings.pricesIncludeVat, paidMinor: 0, paymentStatus: paymentStatus(totals.totalMinor, 0),
    fulfilment: input.fulfilment, customFields: input.customFields, ...(input.notes ? { notes: input.notes } : {}), stockShort: short,
    history: [{ status, at: now }], version: 1, createdAt: now, updatedAt: now });
  if (deductsStock(status)) await applyOrderStock(ctx, accountId, id, lines, -1, now);
  return ok(await publicOrder(ctx, await ctx.db.get(id)));
}

async function changeStatus(ctx, accountId, a, now) {
  const order = await owned(ctx, a.orderId, accountId, 'hasibOrders');
  if (!order) return fail('order_not_found');
  if (a.version !== order.version) return fail('order_conflict');
  if (!isStatus(a.to) || !canTransition(order.status, a.to)) return fail('invalid_transition');
  const effect = stockEffect(order.status, a.to);
  const settings = await settingsFor(ctx, accountId);
  let lines = order.lines, short = order.stockShort;
  if (effect) {
    const current = [];
    for (const l of order.lines) current.push(l.tracked && l.variantId ? { ...l, variant: await ctx.db.get(l.variantId) } : l);
    if (effect < 0) {
      const check = precheckStock(stockChanges(current, -1), settings.stockPolicy);
      if (!check.ok) return fail(check.reason);
      short = check.short;
      // Cost of goods is fixed when stock actually leaves.
      lines = current.map(l => stripVariant(l.variant ? { ...l, unitCostMinor: l.variant.costMinor } : l));
    }
    await applyOrderStock(ctx, accountId, order._id, order.lines, effect, now);
  }
  await ctx.db.patch(order._id, { status: a.to, lines, stockShort: short, history: [...order.history, { status: a.to, at: now }].slice(-HISTORY), version: order.version + 1, updatedAt: now });
  return ok(await publicOrder(ctx, await ctx.db.get(order._id)));
}

async function paymentsOf(ctx, orderId) {
  return (await ctx.db.query('hasibPayments').withIndex('by_order_at', q => q.eq('orderId', orderId)).take(100))
    .map(p => ({ id: p._id, amountMinor: p.amountMinor, method: p.method, reference: p.reference || '', at: p.at }));
}

async function recordPayment(ctx, accountId, a, now) {
  if (!REQUEST_ID.test(a.requestId || '')) return fail('invalid_request');
  const replay = await byRequest(ctx, 'hasibPayments', accountId, a.requestId);
  if (replay) return ok({ order: await publicOrder(ctx, await ctx.db.get(replay.orderId)) });
  const order = await owned(ctx, a.orderId, accountId, 'hasibOrders');
  if (!order) return fail('order_not_found');
  if (!isMinor(a.amountMinor, { allowNegative: true }) || a.amountMinor === 0) return fail('invalid_amount');
  if (!PAYMENT_METHODS.includes(a.method)) return fail('invalid_payment_method');
  const reference = bounded(a.reference ?? '', 80);
  if (reference === null) return fail('invalid_amount');
  if (a.amountMinor > 0 && CLOSED.has(order.status)) return fail('order_closed');
  if (a.amountMinor < 0 && -a.amountMinor > order.paidMinor) return fail('refund_exceeds_paid');
  await ctx.db.insert('hasibPayments', { accountId, orderId: order._id, requestId: a.requestId, amountMinor: a.amountMinor, method: a.method, ...(reference ? { reference } : {}), at: now });
  const paidMinor = order.paidMinor + a.amountMinor;
  await ctx.db.patch(order._id, { paidMinor, paymentStatus: paymentStatus(order.totalMinor, paidMinor), updatedAt: now });
  return ok({ order: await publicOrder(ctx, await ctx.db.get(order._id)) });
}

async function listOrders(ctx, accountId, a) {
  const cursor = decodeCursor(a.cursor), limit = clampLimit(a.limit);
  const status = isStatus(a.status) ? a.status : null;
  const query = status
    ? ctx.db.query('hasibOrders').withIndex('by_account_status_created', q => cursor ? q.eq('accountId', accountId).eq('status', status).lte('createdAt', cursor.at) : q.eq('accountId', accountId).eq('status', status))
    : ctx.db.query('hasibOrders').withIndex('by_account_created', q => cursor ? q.eq('accountId', accountId).lte('createdAt', cursor.at) : q.eq('accountId', accountId));
  const rows = afterCursor(await query.order('desc').take(limit + 25), cursor, 'createdAt').slice(0, limit);
  const items = [];
  for (const o of rows) {
    const p = await publicOrder(ctx, o);
    items.push({ id: p.id, number: p.number, status: p.status, channel: p.channel, contact: p.contact, customerName: p.customerName, totalMinor: p.totalMinor,
      balanceMinor: p.balanceMinor, paymentStatus: p.paymentStatus, fulfilment: p.fulfilment, lineCount: p.lines.length, stockShort: p.stockShort, createdAt: p.createdAt });
  }
  return ok({ items, cursor: rows.length === limit ? encodeCursor(rows.at(-1).createdAt, rows.at(-1)._id) : null });
}

async function contactSummary(ctx, accountId, a) {
  const contact = await owned(ctx, a.contactId, accountId, 'blueContacts');
  if (!contact || contact.state !== 'active') return fail('contact_not_found');
  const rows = (await ctx.db.query('hasibOrders').withIndex('by_contact_created', q => q.eq('contactId', contact._id)).order('desc').take(200)).filter(o => o.accountId === accountId);
  const live = rows.filter(o => !CLOSED.has(o.status));
  return ok({ orderCount: live.length, lifetimeMinor: live.reduce((n, o) => n + o.totalMinor, 0), balanceMinor: live.reduce((n, o) => n + o.totalMinor - o.paidMinor, 0),
    lastOrderAt: rows[0]?.createdAt || null, recent: rows.slice(0, 10).map(o => ({ id: o._id, number: o.number, status: o.status, totalMinor: o.totalMinor, paymentStatus: o.paymentStatus, createdAt: o.createdAt })) });
}

/** Order prefill from what Layla already captured in the chat. Suggests; never creates. */
async function chatPrefill(ctx, tenant, a, now) {
  const person = await owned(ctx, a.conversationId, tenant.accountId, 'blueConversations');
  if (!person) return fail('conversation_not_found');
  const contact = await linkConversation(ctx, person, { sectorId: sectorFor(tenant.row), now, secret: tenant.secret });
  const field = key => contact.fields.find(f => f.key === key)?.value || '';
  const itemText = clean(field('item'), 80), qty = Math.min(MAX_QTY, Math.max(1, parseInt(normalizeDigits(field('quantity')), 10) || 1));
  const how = field('fulfilment').toLowerCase(), area = clean(field('area') || field('location'), 80);
  const type = /deliver|توصيل/.test(how) ? 'delivery' : /pick|استلام/.test(how) ? 'pickup' : area ? 'delivery' : 'pickup';
  const lines = [];
  if (itemText) {
    const item = await matchItem(ctx, tenant.accountId, itemText);
    const variant = item && (await ctx.db.query('hasibVariants').withIndex('by_item', q => q.eq('itemId', item._id)).take(50)).find(v => !v.archived);
    if (variant) lines.push({ variantId: variant._id, itemId: item._id, nameAr: item.nameAr, nameEn: item.nameEn, qty, unitPriceMinor: variant.priceMinor, onHand: variant.onHand });
  }
  return ok({ contact: { id: contact._id, name: displayName(contact).name }, conversationId: person._id, channel: person.channel || 'whatsapp', lines, unmatched: lines.length ? '' : itemText,
    fulfilment: { type, ...(type === 'delivery' && area ? { area } : {}) } });
}

export async function executeOrders(ctx, tenant, a, now) {
  const { accountId } = tenant;
  if (a.operation === 'order_create') return createOrder(ctx, tenant, a, now);
  if (a.operation === 'order_status') return changeStatus(ctx, accountId, a, now);
  if (a.operation === 'orders') return listOrders(ctx, accountId, a);
  if (a.operation === 'order') {
    const order = await owned(ctx, a.orderId, accountId, 'hasibOrders');
    return order ? ok(await publicOrder(ctx, order, { payments: await paymentsOf(ctx, order._id) })) : fail('order_not_found');
  }
  if (a.operation === 'payment_record') return recordPayment(ctx, accountId, a, now);
  if (a.operation === 'contact_summary') return contactSummary(ctx, accountId, a);
  if (a.operation === 'chat_prefill') return chatPrefill(ctx, tenant, a, now);
  return null;
}
