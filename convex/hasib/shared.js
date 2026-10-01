// Shared Hasib state helpers: results, validation, counters, ownership and the
// stock ledger write. Every helper takes the resolved accountId explicitly.
import { owned } from '../blueTenant.js';
import { applyStockPolicy } from './stock.js';
import { sectorFor } from '../blueContacts.js';
import { hasibPack } from '../../config/hasib-packs.js';
import { businessIndustryId } from '../../src/lib/industries.js';

export const ok = value => ({ ok: true, value }), fail = reason => ({ ok: false, reason });
export const PAGE = 25;
export const clampLimit = (value, max = 50) => Math.min(max, Math.max(1, Number.isSafeInteger(value) ? value : PAGE));
export const REQUEST_ID = /^[a-f0-9-]{36}$/;
export const clean = (value, n) => typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '';
/** Like `clean` but refuses over-long input instead of truncating it silently. */
export const bounded = (value, n) => typeof value === 'string' && value.length <= n ? clean(value, n) : null;

export const DEFAULT_SETTINGS = Object.freeze({ currency: 'OMR', vatRegistered: false, vatRateBps: 500, pricesIncludeVat: false, stockPolicy: 'warn', constructionIncidentHoursDenominator: 200000 });

export async function settingsFor(ctx, accountId) {
  const row = await ctx.db.query('hasibSettings').withIndex('by_account', q => q.eq('accountId', accountId)).unique();
  return row ? { ...DEFAULT_SETTINGS, ...row } : { ...DEFAULT_SETTINGS };
}
/** A legacy Hasib choice wins until the owner next saves the unified Business Setup. */
export async function packFor(ctx, tenant) {
  const settings = await settingsFor(ctx, tenant.accountId);
  return hasibPack(settings.packId || businessIndustryId(tenant.row?.profile?.sector) || sectorFor(tenant.row));
}
export const vatOf = s => ({ registered: s.vatRegistered, rateBps: s.vatRateBps, pricesIncludeVat: s.pricesIncludeVat });

/** Next number in an account sequence. Runs inside the caller's mutation, so it is gap-free and never duplicated. */
export async function nextNumber(ctx, accountId, kind) {
  const row = await ctx.db.query('hasibCounters').withIndex('by_account_kind', q => q.eq('accountId', accountId).eq('kind', kind)).unique();
  if (!row) { await ctx.db.insert('hasibCounters', { accountId, kind, next: 2 }); return 1; }
  await ctx.db.patch(row._id, { next: row.next + 1 });
  return row.next;
}

export async function byRequest(ctx, table, accountId, requestId) {
  return ctx.db.query(table).withIndex('by_account_request', q => q.eq('accountId', accountId).eq('requestId', requestId)).first();
}

/** An active variant of an active item owned by this account, with its item. */
export async function sellableVariant(ctx, accountId, id) {
  const variant = await owned(ctx, id, accountId, 'hasibVariants');
  if (!variant || variant.archived) return null;
  const item = await ctx.db.get(variant.itemId);
  return item && !item.archived && item.accountId === accountId ? { variant, item } : null;
}

export const isLow = (onHand, reorderPoint) => onHand <= reorderPoint;

/** Low or out-of-stock variants of stock-tracked items only; a service is never "low". Lowest first, with their item. */
export async function trackedLow(ctx, accountId) {
  const rows = (await ctx.db.query('hasibVariants').withIndex('by_account_low', q => q.eq('accountId', accountId).eq('low', true)).take(100)).filter(v => !v.archived);
  const out = [];
  for (const variant of rows) {
    const item = await ctx.db.get(variant.itemId);
    if (item && !item.archived && item.trackStock) out.push({ variant, item });
  }
  return out.sort((a, b) => a.variant.onHand - b.variant.onHand);
}

/**
 * Check a batch of stock deltas against policy before anything is written.
 * `changes` is [{ variant, delta }]; deltas for the same variant are combined.
 */
export function precheckStock(changes, policy) {
  const totals = new Map();
  for (const { variant, delta } of changes) {
    const current = totals.get(variant._id) || { variant, delta: 0 };
    totals.set(variant._id, { variant, delta: current.delta + delta });
  }
  let short = false;
  for (const { variant, delta } of totals.values()) {
    const r = applyStockPolicy({ onHand: variant.onHand, delta, policy });
    if (!r.ok) return { ok: false, reason: r.reason };
    short ||= r.short;
  }
  return { ok: true, short };
}

/** Allocate dated stock in expiry order and retain the exact lots on the ledger. */
async function allocateLots(ctx, accountId, variantId, quantity) {
  const rows = (await ctx.db.query('hasibStockLots').withIndex('by_variant_created', q => q.eq('variantId', variantId)).take(2000))
    .filter(row => row.accountId === accountId && row.remainingQty > 0)
    .sort((a, b) => (a.useBy || '9999-12-31').localeCompare(b.useBy || '9999-12-31') || a.createdAt - b.createdAt);
  const allocations = [];
  let remaining = quantity;
  for (const row of rows) {
    if (remaining <= 0) break;
    const used = Math.min(row.remainingQty, remaining);
    await ctx.db.patch(row._id, { remainingQty: row.remainingQty - used });
    allocations.push({ lotId: row._id, qty: used });
    remaining -= used;
  }
  return allocations;
}

/** Every stock path maintains lots, including opening balances, imports and counts. */
export async function writeMove(ctx, { accountId, variantId, delta, reason, refType, refId, unitCostMinor, note, requestId, now, lot = {}, restoreFrom }) {
  const variant = await owned(ctx, variantId, accountId, 'hasibVariants');
  if (!variant) throw new Error('variant_not_found');
  const existing = await ctx.db.query('hasibStockLots').withIndex('by_variant_created', q => q.eq('variantId', variantId)).take(2000);
  // Additive migration: establish an undated lot only for an existing unallocated balance.
  const represented = existing.filter(l => l.accountId === accountId).reduce((n, l) => n + l.remainingQty, 0);
  if (variant.onHand > represented) await ctx.db.insert('hasibStockLots', { accountId, variantId, sourceType: 'opening_balance', originalQty: variant.onHand - represented,
    remainingQty: variant.onHand - represented, unitCostMinor: variant.costMinor, createdAt: now });
  const onHand = Math.round((variant.onHand + delta) * 1e9) / 1e9;
  const patch = { onHand, low: isLow(onHand, variant.reorderPoint), updatedAt: now };
  if (delta > 0 && Number.isSafeInteger(unitCostMinor) && !restoreFrom) {
    const base = Math.max(variant.onHand, 0);
    patch.costMinor = Math.round((base * variant.costMinor + delta * unitCostMinor) / (base + delta));
    patch.costKnown = true;
  }
  let allocations = [];
  if (delta < 0) allocations = await allocateLots(ctx, accountId, variantId, -delta);
  if (delta > 0 && restoreFrom) {
    const original = await owned(ctx, restoreFrom, accountId, 'hasibStockMoves');
    if (!original || original.variantId !== variantId || original.delta !== -delta) throw new Error('invalid_stock_reversal');
    for (const allocation of original.lotAllocations || []) {
      const row = await owned(ctx, allocation.lotId, accountId, 'hasibStockLots');
      if (!row) throw new Error('lot_not_found');
      await ctx.db.patch(row._id, { remainingQty: row.remainingQty + allocation.qty });
      allocations.push(allocation);
    }
  } else if (delta > 0) {
    // Receipts covering a prior negative balance do not create sellable extra units.
    const quantity = Math.max(0, onHand) - Math.max(0, variant.onHand);
    if (delta > 0) {
      const lotId = await ctx.db.insert('hasibStockLots', { accountId, variantId, sourceType: lot.sourceType || reason, ...(lot.sourceId ? { sourceId: String(lot.sourceId) } : {}),
        ...(lot.receivedOn ? { receivedOn: lot.receivedOn } : {}), ...(lot.useBy ? { useBy: lot.useBy } : {}), originalQty: delta, remainingQty: quantity, shortCoveredQty: delta - quantity, unitCostMinor: unitCostMinor ?? variant.costMinor, createdAt: now });
      allocations.push({ lotId, qty: quantity });
    }
  }
  if (restoreFrom) {
    const rows = await ctx.db.query('hasibStockLots').withIndex('by_variant_created', q => q.eq('variantId', variantId)).take(2000);
    let deficit = Math.max(0, onHand) - rows.filter(l => l.accountId === accountId).reduce((n,l) => n+l.remainingQty,0);
    for (const row of rows.filter(l => l.accountId === accountId && l.shortCoveredQty > 0)) {
      const release = Math.min(Math.max(0,deficit), row.shortCoveredQty);
      if (!release) break;
      await ctx.db.patch(row._id, { remainingQty: row.remainingQty + release, shortCoveredQty: row.shortCoveredQty - release });
      deficit -= release;
    }
    if (deficit > 1e-8) await ctx.db.insert('hasibStockLots',{accountId,variantId,sourceType:'legacy_reversal',sourceId:restoreFrom,originalQty:deficit,remainingQty:deficit,unitCostMinor:unitCostMinor??variant.costMinor,createdAt:now});
  }
  await ctx.db.patch(variantId, patch);
  await ctx.db.insert('hasibStockMoves', { accountId, variantId, delta, reason, onHandAfter: onHand, at: now, lotAllocations: allocations,
    ...(restoreFrom ? { reversesMoveId: restoreFrom } : {}), ...(refType ? { refType, refId } : {}), ...(Number.isSafeInteger(unitCostMinor) ? { unitCostMinor } : {}), ...(note ? { note } : {}), ...(requestId ? { requestId } : {}) });
  return onHand;
}
