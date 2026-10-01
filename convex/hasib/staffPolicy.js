// What an invited employee may do in a catalog shop (retail, retail-tech) or a clinic
// that charges visits at catalogue prices (dental): sell,
// take payment, move orders along, adjust stock, edit existing products and quote
// repairs, at the catalogue prices and costs the manager set. Costs, cash totals,
// refunds, discounts, catalogue price changes, trade-ins and warranty terms stay
// with the manager. Every cancel, return, refund, archive, stock move, expense void,
// trade-in and repair step is recorded with who did it, whatever their role.
import { owned } from '../blueTenant.js';
import { audit } from './workspaceState.js';
import { REQUEST_ID } from './shared.js';

const STAFF_HIDDEN = new Set(['costMinor', 'costKnown', 'unitCostMinor', 'operationalCostMinor', 'operationalCostKnown', 'channelCostMinor', 'lifetimeMinor']);
const AUDIT_SCAN = 200;

// Dental charges visits from its treatment and supply items, so its front desk follows the shop rules.
// Real Estate agents never refund or see costs; deal money is the manager's (realEstateState.js).
const staffGuarded = (tenant) => tenant.actor?.role === 'employee' && (tenant.pack?.archetype === 'catalog' || !!tenant.pack?.serviceItems || tenant.pack?.id === 'real-estate');

/** A copy of `value` without the fields an employee must not see. */
export function redactForStaff(value) {
  if (Array.isArray(value)) return value.map(redactForStaff);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !STAFF_HIDDEN.has(key)).map(([key, v]) => [key, redactForStaff(v)]));
}

async function orderLinesRefusal(ctx, accountId, lines) {
  for (const line of Array.isArray(lines) ? lines : []) {
    // Free-typed lines and discounts set a price; only catalogue prices are the employee's to use.
    if (!line?.variantId || (line.discountMinor !== undefined && line.discountMinor !== 0)) return true;
    if (line.unitPriceMinor === undefined) continue;
    const variant = await owned(ctx, line.variantId, accountId, 'hasibVariants');
    if (!variant || variant.priceMinor !== line.unitPriceMinor) return true;
  }
  return false;
}

/**
 * For an employee in a catalog shop: `{ refusal }` when the call is manager-only, or
 * `{ args }` to run instead. An item edit keeps the stored cost, which the employee never saw.
 */
export async function staffArgs(ctx, tenant, a) {
  if (!staffGuarded(tenant)) return { args: a };
  const { accountId } = tenant;
  if (a.operation === 'payment_record' && a.amountMinor < 0) return { refusal: 'manager_required' };
  // What a trade-in pays becomes the stock cost, so it is the manager's call. Repair quotes are the employee's.
  if (a.operation === 'trade_in') return { refusal: 'manager_required' };
  if (a.operation === 'order_create' && await orderLinesRefusal(ctx, accountId, a.lines)) return { refusal: 'manager_required' };
  // A stock receipt keeps the manager's cost; the employee records only the quantity.
  if (a.operation === 'stock_move' && a.unitCostMinor !== undefined) { const { unitCostMinor, ...rest } = a; return { args: rest }; }
  if (a.operation !== 'item_save') return { args: a };
  // A new product or a new size/colour sets a price, which is the manager's; employees edit existing products only.
  if (!a.itemId || !Array.isArray(a.variants) || a.variants.some(v => !v?.variantId)) return { refusal: 'manager_required' };
  const variants = [];
  for (const v of a.variants) {
    const stored = await owned(ctx, v.variantId, accountId, 'hasibVariants');
    if (!stored) { variants.push(v); continue; }
    if (v.priceMinor !== stored.priceMinor) return { refusal: 'manager_required' };
    const { costMinor, ...rest } = v;
    variants.push(stored.costKnown === false ? rest : { ...rest, costMinor: stored.costMinor });
  }
  // Warranty terms decide whether a repair is free, so an employee edit keeps the stored ones.
  const storedItem = await owned(ctx, a.itemId, accountId, 'hasibItems');
  const item = storedItem && a.item ? { ...a.item, warrantyMonths: storedItem.warrantyMonths || 0, warrantyBy: storedItem.warrantyBy || 'none' } : a.item;
  return { args: { ...a, item, variants } };
}

/** The result an employee receives: costs and the cash figures removed. */
export function staffResult(tenant, a, result) {
  if (!staffGuarded(tenant) || !result?.ok) return result;
  // Today: no cash figures, and no money-valued industry measure (profit per device is revenue minus cost).
  const value = a.operation === 'today'
    ? { ...result.value, money: null, industryMetrics: (result.value.industryMetrics || []).map(m => m.format === 'money' ? { ...m, value: null, detail: undefined } : m) }
    : result.value;
  return { ...result, value: redactForStaff(value) };
}

function auditEntry(a, result) {
  const v = result.value || {};
  if (a.operation === 'order_status' && ['cancelled', 'returned'].includes(a.to)) return { action: `order_${a.to}`, entityType: 'order', entityId: a.orderId, details: v.status };
  if (a.operation === 'payment_record' && a.amountMinor < 0) return { action: 'payment_refunded', entityType: 'order', entityId: a.orderId, details: `${a.amountMinor}|${a.requestId}`, retryable: true };
  if (a.operation === 'stock_move') return { action: 'stock_adjusted', entityType: 'variant', entityId: a.variantId, details: `${a.reason} ${a.delta}|${a.requestId}`, retryable: true };
  if (a.operation === 'item_archive') return { action: 'item_archived', entityType: 'item', entityId: a.itemId };
  if (a.operation === 'expense_void') return { action: 'expense_voided', entityType: 'expense', entityId: a.expenseId };
  if (a.operation === 'trade_in') return { action: 'trade_in_recorded', entityType: 'trade_in', entityId: v.id, details: `${a.costMinor}|${a.requestId}`, retryable: true };
  if (a.operation === 'repair_create') return { action: 'repair_created', entityType: 'repair', entityId: v.id, details: `${v.labourMinor}|${a.requestId}`, retryable: true };
  if (a.operation === 'repair_update') return { action: 'repair_quoted', entityType: 'repair', entityId: a.repairId, details: String(v.order?.totalMinor ?? '') };
  if (a.operation === 'repair_approval') return { action: 'repair_approved', entityType: 'repair', entityId: a.repairId, details: String(a.approvedBy || '').replace(/\|/g, '/').slice(0, 100) };
  if (a.operation === 'repair_status' && ['ready', 'collected', 'cancelled'].includes(a.to)) return { action: `repair_${a.to}`, entityType: 'repair', entityId: a.repairId };
  return null;
}

/** Record who changed money or stock. A retried request (same requestId) is recorded once. */
export async function auditChange(ctx, tenant, a, result, now) {
  if (!result?.ok || !tenant.actor) return;
  const entry = auditEntry(a, result);
  if (!entry) return;
  // Only server-built entries for operations that are idempotent by a valid request id are deduplicated;
  // free text (an approver's name) can never match, so it cannot hide a later entry.
  if (entry.retryable && REQUEST_ID.test(a.requestId || '')) {
    const prior = await ctx.db.query('ascendActivity').withIndex('by_entity', q => q.eq('entityType', entry.entityType).eq('entityId', String(entry.entityId))).order('desc').take(AUDIT_SCAN);
    if (prior.some(r => r.accountId === tenant.accountId && r.details?.endsWith(`|${a.requestId}`))) return;
  }
  await audit(ctx, tenant, tenant.actor, entry.action, entry.entityType, entry.entityId, now, entry.details);
}
