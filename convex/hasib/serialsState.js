// Per-unit stock for serialized products (phones, laptops): one row per IMEI or
// serial. Invariant: for a serialized variant, onHand equals its rows in_stock —
// every movement goes through here, never through a bare quantity.
import { owned } from '../blueTenant.js';
import { displayName } from '../blueContacts.js';
import { isMinor } from './money.js';
import { ok, fail, bounded, REQUEST_ID, byRequest, nextNumber, writeMove } from './shared.js';

const DAY = 86400000;
export const TRADE_IN_METHODS = ['cash', 'card', 'bank_transfer', 'other'];
export const WARRANTY_BY = ['store', 'agent', 'none'];

import { normSerial } from './serialFormat.js';
export { normSerial };
/** 12 months = 365 days from the sale; shorter or longer terms scale the same way. */
export const warrantyEnd = (soldAt, months) => soldAt + Math.round((months * 365 * DAY) / 12);

export const serialRow = (ctx, accountId, serial) => ctx.db.query('hasibSerials').withIndex('by_account_serial', q => q.eq('accountId', accountId).eq('serial', serial)).unique();

/** Normalise a list and refuse duplicates inside it. Throws `{ reason }`. */
function serialList(raw, expected) {
  if (Array.isArray(raw) && !raw.length && expected > 0) throw { reason: 'serials_required' };
  if (!Array.isArray(raw) || raw.length !== expected) throw { reason: 'serials_mismatch' };
  const list = raw.map(normSerial);
  if (list.includes(null)) throw { reason: 'invalid_serial' };
  if (new Set(list).size !== list.length) throw { reason: 'duplicate_serial' };
  return list;
}

/**
 * Receive new units (purchase or trade-in). A unit written off earlier may come back; a unit
 * sold or reserved may not, because its sale (and warranty) must stay on record. A customer's
 * return goes through the order's Return, which puts the unit back in stock.
 */
export async function receiveSerials(ctx, { accountId, variant, serials, costMinor, source, note, now }) {
  for (const serial of serials) {
    const existing = await serialRow(ctx, accountId, serial);
    if (existing?.status === 'in_stock') throw { reason: 'duplicate_serial' };
    if (existing && ['sold', 'reserved'].includes(existing.status)) throw { reason: 'serial_sold' };
  }
  for (const serial of serials) {
    const existing = await serialRow(ctx, accountId, serial);
    const row = { accountId, variantId: variant._id, itemId: variant.itemId, serial, status: 'in_stock', source, costMinor, receivedAt: now, updatedAt: now, ...(note ? { note } : {}) };
    if (existing) await ctx.db.replace(existing._id, row); else await ctx.db.insert('hasibSerials', row);
  }
}

/** Stock movements on a serialized product: receipts with IMEIs, and write-offs of named units. */
export async function moveSerializedStock(ctx, { accountId, variant, a, note, now }) {
  try {
    if (a.reason === 'stock_in') {
      if (!(a.delta > 0)) throw { reason: 'invalid_stock_move' };
      const serials = serialList(a.serials, a.delta);
      await receiveSerials(ctx, { accountId, variant, serials, costMinor: a.unitCostMinor ?? variant.costMinor, source: 'purchase', note, now });
    } else if (a.reason === 'damage') {
      if (!(a.delta < 0)) throw { reason: 'invalid_stock_move' };
      const serials = serialList(a.serials, -a.delta);
      const rows = [];
      for (const serial of serials) {
        const row = await serialRow(ctx, accountId, serial);
        if (!row || row.variantId !== variant._id || row.status !== 'in_stock') throw { reason: 'serial_unavailable' };
        rows.push(row);
      }
      for (const row of rows) await ctx.db.patch(row._id, { status: 'written_off', updatedAt: now, ...(note ? { note } : {}) });
    } else throw { reason: 'use_serial_flow' };
  } catch (e) { return fail(e.reason || 'invalid_stock_move'); }
  await writeMove(ctx, { accountId, variantId: variant._id, delta: a.delta, reason: a.reason, unitCostMinor: a.reason === 'stock_in' ? a.unitCostMinor : undefined, note, requestId: a.requestId, now });
  return null;
}

/**
 * Validate the IMEIs requested on order lines before anything is written.
 * Returns, per line index, the serial rows to reserve or sell. Throws `{ reason }`.
 */
export async function planOrderSerials(ctx, accountId, lines, requested, { require = true } = {}) {
  const plan = new Map(), seen = new Set();
  for (const [i, line] of lines.entries()) {
    const raw = requested[i];
    if (!line.serialized) { if (raw?.length) throw { reason: 'invalid_order_lines' }; continue; }
    // A pending draft (Layla's) may carry an IMEI product without units; they are picked on confirmation.
    if (!raw?.length) { if (require) throw { reason: 'serials_required' }; continue; }
    const list = serialList(raw, line.qty);
    const rows = [];
    for (const serial of list) {
      if (seen.has(serial)) throw { reason: 'duplicate_serial' };
      seen.add(serial);
      const row = await serialRow(ctx, accountId, serial);
      if (!row || row.variantId !== line.variantId || row.status !== 'in_stock') throw { reason: 'serial_unavailable' };
      rows.push(row);
    }
    plan.set(i, rows);
  }
  return plan;
}

export const averageCost = rows => rows.length ? Math.round(rows.reduce((n, r) => n + r.costMinor, 0) / rows.length) : 0;

/** Reserve (pending order) or sell (confirmed order) the planned units. */
export async function commitOrderSerials(ctx, plan, { orderId, sold, contactId, lines, now }) {
  for (const [i, rows] of plan) {
    for (const row of rows) {
      await ctx.db.patch(row._id, sold
        ? { status: 'sold', orderId, soldAt: now, warrantyUntil: lines[i].warrantyUntil, warrantyBy: lines[i].warrantyBy, ...(contactId ? { contactId } : {}), updatedAt: now }
        : { status: 'reserved', orderId, reservedAt: now, ...(contactId ? { contactId } : {}), updatedAt: now });
    }
  }
}

/**
 * Confirming an order whose IMEI lines have too few reserved units: validate the
 * owner's picks (`lineSerials`) and reserve them first. Throws `{ reason }`.
 */
export async function reserveMissingSerials(ctx, order, lineSerials, now) {
  const reserved = (await ctx.db.query('hasibSerials').withIndex('by_order', q => q.eq('orderId', order._id)).take(500)).filter(r => r.accountId === order.accountId && r.status === 'reserved');
  const picks = new Map((Array.isArray(lineSerials) ? lineSerials : []).map(p => [p?.variantId, p?.serials]));
  const plan = [];
  for (const line of order.lines.filter(l => l.serialized)) {
    const missing = line.qty - reserved.filter(r => r.variantId === line.variantId).length;
    if (missing <= 0) continue;
    const list = serialList(picks.get(line.variantId) || [], missing);
    for (const serial of list) {
      const row = await serialRow(ctx, order.accountId, serial);
      if (!row || row.variantId !== line.variantId || row.status !== 'in_stock') throw { reason: 'serial_unavailable' };
      plan.push(row);
    }
  }
  for (const row of plan) await ctx.db.patch(row._id, { status: 'reserved', orderId: order._id, reservedAt: now, ...(order.contactId ? { contactId: order.contactId } : {}), updatedAt: now });
}

export const orderSerialRows = (ctx, orderId) => ctx.db.query('hasibSerials').withIndex('by_order', q => q.eq('orderId', orderId)).take(500);

/** Order status changed: reserved → sold on confirmation; back to stock on cancel or return. */
export async function transitionOrderSerials(ctx, order, { to, effect, now }) {
  const rows = (await orderSerialRows(ctx, order._id)).filter(r => r.accountId === order.accountId);
  if (effect < 0) {
    const byVariant = new Map(order.lines.filter(l => l.serialized).map(l => [l.variantId, l]));
    for (const row of rows.filter(r => r.status === 'reserved')) {
      const line = byVariant.get(row.variantId);
      await ctx.db.patch(row._id, { status: 'sold', soldAt: now, warrantyUntil: line?.warrantyMonths ? warrantyEnd(now, line.warrantyMonths) : undefined, warrantyBy: line?.warrantyBy, updatedAt: now });
    }
  } else if (effect > 0 || to === 'cancelled') {
    for (const row of rows.filter(r => r.status === 'sold' || r.status === 'reserved')) {
      await ctx.db.patch(row._id, { status: 'in_stock', orderId: undefined, soldAt: undefined, reservedAt: undefined, warrantyUntil: undefined, warrantyBy: undefined, contactId: undefined, updatedAt: now });
    }
  }
  return rows;
}

async function publicLookup(ctx, accountId, serial, now) {
  const row = await serialRow(ctx, accountId, serial);
  const repairs = (await ctx.db.query('hasibRepairs').withIndex('by_account_serial', q => q.eq('accountId', accountId).eq('serial', serial)).take(20))
    .map(r => ({ id: r._id, number: r.number, status: r.status, device: r.device, createdAt: r.createdAt }));
  if (!row && !repairs.length) return null;
  const item = row ? await ctx.db.get(row.itemId) : null, variant = row ? await ctx.db.get(row.variantId) : null;
  const order = row?.orderId ? await ctx.db.get(row.orderId) : null;
  const contact = row?.contactId ? await ctx.db.get(row.contactId) : null;
  const customer = contact?.state === 'active' ? displayName(contact).name : order?.customerName || null;
  const until = row?.status === 'sold' ? row.warrantyUntil : undefined;
  return { serial, status: row?.status || null, source: row?.source || null, item: item ? { id: item._id, nameAr: item.nameAr, nameEn: item.nameEn } : null,
    daysInStock: row ? Math.max(0,Math.floor(((row.soldAt || now)-row.receivedAt)/DAY)) : null, options: variant?.options || [], receivedAt: row?.receivedAt || null, soldAt: row?.soldAt || null,
    warranty: { until: until || null, by: row?.warrantyBy || null, active: !!until && until > now, daysLeft: until ? Math.max(0, Math.ceil((until - now) / DAY)) : 0 },
    order: order ? { id: order._id, number: order.number } : null, customer, repairs };
}

async function tradeIn(ctx, tenant, a, now) {
  const { accountId } = tenant;
  if (!REQUEST_ID.test(a.requestId || '')) return fail('invalid_request');
  const replay = await byRequest(ctx, 'hasibTradeIns', accountId, a.requestId);
  if (replay) return ok({ id: replay._id, number: replay.number, serial: replay.serial, costMinor: replay.costMinor });
  const variant = await owned(ctx, a.variantId, accountId, 'hasibVariants');
  const item = variant && !variant.archived ? await ctx.db.get(variant.itemId) : null;
  if (!item || item.archived) return fail('variant_not_found');
  if (!item.serialized) return fail('not_serialized');
  const serial = normSerial(a.serial), note = bounded(a.note ?? '', 200), customerName = bounded(a.customerName ?? '', 80);
  if (!serial) return fail('invalid_serial');
  if (!isMinor(a.costMinor) || !a.costMinor || !TRADE_IN_METHODS.includes(a.method) || note === null || customerName === null) return fail('invalid_trade_in');
  let contactId;
  if (a.contactId) {
    const contact = await owned(ctx, a.contactId, accountId, 'blueContacts');
    if (!contact || contact.state !== 'active') return fail('contact_not_found');
    contactId = contact._id;
  }
  try { await receiveSerials(ctx, { accountId, variant, serials: [serial], costMinor: a.costMinor, source: 'trade_in', note, now }); }
  catch (e) { return fail(e.reason); }
  const number = await nextNumber(ctx, accountId, 'trade_in');
  const id = await ctx.db.insert('hasibTradeIns', { accountId, requestId: a.requestId, number, variantId: variant._id, serial, costMinor: a.costMinor, method: a.method,
    ...(contactId ? { contactId } : {}), ...(customerName ? { customerName } : {}), ...(note ? { note } : {}), at: now });
  await writeMove(ctx, { accountId, variantId: variant._id, delta: 1, reason: 'trade_in', refType: 'trade_in', refId: id, unitCostMinor: a.costMinor, now });
  return ok({ id, number, serial, costMinor: a.costMinor });
}

export async function executeSerials(ctx, tenant, a, now) {
  const { accountId } = tenant;
  if (a.operation === 'serials') {
    const variant = await owned(ctx, a.variantId, accountId, 'hasibVariants');
    if (!variant) return fail('variant_not_found');
    const status = ['in_stock', 'reserved', 'sold', 'written_off'].includes(a.status) ? a.status : 'in_stock';
    const rows = await ctx.db.query('hasibSerials').withIndex('by_variant_status', q => q.eq('variantId', variant._id).eq('status', status)).take(200);
    return ok({ items: rows.filter(r => r.accountId === accountId).map(r => ({ serial: r.serial, status: r.status, source: r.source, costMinor: r.costMinor, receivedAt: r.receivedAt, daysInStock: Math.max(0,Math.floor(((r.soldAt || now)-r.receivedAt)/DAY)) })) });
  }
  if (a.operation === 'serial_lookup') {
    const serial = normSerial(a.serial);
    const found = serial && await publicLookup(ctx, accountId, serial, now);
    return found ? ok(found) : fail('serial_not_found');
  }
  if (a.operation === 'trade_in') return tradeIn(ctx, tenant, a, now);
  return null;
}
