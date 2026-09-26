// Shared Hasib state helpers: results, validation, counters, ownership and the
// stock ledger write. Every helper takes the resolved accountId explicitly.
import { owned } from '../blueTenant.js';
import { applyStockPolicy } from './stock.js';
import { sectorFor } from '../blueContacts.js';
import { hasibPack } from '../../config/hasib-packs.js';

export const ok = value => ({ ok: true, value }), fail = reason => ({ ok: false, reason });
export const PAGE = 25;
export const clampLimit = (value, max = 50) => Math.min(max, Math.max(1, Number.isSafeInteger(value) ? value : PAGE));
export const REQUEST_ID = /^[a-f0-9-]{36}$/;
export const clean = (value, n) => typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '';
/** Like `clean` but refuses over-long input instead of truncating it silently. */
export const bounded = (value, n) => typeof value === 'string' && value.length <= n ? clean(value, n) : null;

export const DEFAULT_SETTINGS = Object.freeze({ currency: 'OMR', vatRegistered: false, vatRateBps: 500, pricesIncludeVat: false, stockPolicy: 'warn' });

export async function settingsFor(ctx, accountId) {
  const row = await ctx.db.query('hasibSettings').withIndex('by_account', q => q.eq('accountId', accountId)).unique();
  return row ? { ...DEFAULT_SETTINGS, ...row } : { ...DEFAULT_SETTINGS };
}
/** The Hasib industry pack: the owner's explicit Hasib choice, otherwise the pack for Layla's sector. */
export async function packFor(ctx, tenant) {
  const settings = await settingsFor(ctx, tenant.accountId);
  return hasibPack(settings.packId || sectorFor(tenant.row));
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

/** Append one ledger row and move on-hand in the same mutation. Returns the new on-hand. */
export async function writeMove(ctx, { accountId, variantId, delta, reason, refType, refId, unitCostMinor, note, requestId, now }) {
  const variant = await ctx.db.get(variantId);
  const onHand = variant.onHand + delta;
  const patch = { onHand, low: isLow(onHand, variant.reorderPoint), updatedAt: now };
  // Moving-average cost on receipts; stock below zero contributes nothing to the average.
  if (delta > 0 && Number.isSafeInteger(unitCostMinor)) {
    const base = Math.max(variant.onHand, 0);
    patch.costMinor = Math.round((base * variant.costMinor + delta * unitCostMinor) / (base + delta));
  }
  await ctx.db.patch(variantId, patch);
  await ctx.db.insert('hasibStockMoves', { accountId, variantId, delta, reason, onHandAfter: onHand, at: now,
    ...(refType ? { refType, refId } : {}), ...(Number.isSafeInteger(unitCostMinor) ? { unitCostMinor } : {}), ...(note ? { note } : {}), ...(requestId ? { requestId } : {}) });
  return onHand;
}
