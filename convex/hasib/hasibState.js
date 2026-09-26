// Hasib entry point: gate, tenant, then one of the feature executors.
// The tenant is always resolved from the verified session hash; ids in the
// request are re-checked against it by `owned()` inside each executor.
import { resolveTenant } from '../blueTenant.js';
import { visibleModules, isLivePack, livePackSummaries, industryCatalog } from '../../config/hasib-packs.js';
import { STOCK_POLICIES } from './stock.js';
import { hasibEnabled } from './gate.js';
import { ok, fail, settingsFor, packFor } from './shared.js';
import { executeCatalog } from './catalogState.js';
import { executeOrders } from './ordersState.js';
import { executeExpenses } from './expensesState.js';
import { executeInsights } from './insightsState.js';
import { planFor, HASIB_PLANS } from './plans.js';
import { executeSerials } from './serialsState.js';
import { executeRepairs } from './repairsState.js';

export const HASIB_OPERATIONS = ['overview', 'settings_update', 'items', 'item_save', 'item_archive', 'stock_move', 'stock_moves', 'low_stock',
  'order_create', 'order_status', 'orders', 'order', 'payment_record', 'contact_summary', 'conversation_orders', 'expense_create', 'expenses', 'expense_void', 'insights',
  'serials', 'serial_lookup', 'trade_in', 'repairs', 'repair', 'repair_create', 'repair_update', 'repair_status'];

// Operations that belong to an optional module; a pack without that module refuses them.
const MODULE_OPS = { serials: ['serials', 'serial_lookup'], tradeIns: ['trade_in'], repairs: ['repairs', 'repair', 'repair_create', 'repair_update', 'repair_status'] };
const moduleOf = op => Object.keys(MODULE_OPS).find(m => MODULE_OPS[m].includes(op));

export { hasibEnabled };

const publicSettings = s => ({ currency: s.currency, vatRegistered: s.vatRegistered, vatRateBps: s.vatRateBps, pricesIncludeVat: s.pricesIncludeVat, vatin: s.vatin || '', stockPolicy: s.stockPolicy });

async function updateSettings(ctx, accountId, a, now) {
  const current = await ctx.db.query('hasibSettings').withIndex('by_account', q => q.eq('accountId', accountId)).unique();
  const next = { ...(await settingsFor(ctx, accountId)) };
  if (a.vat !== undefined) {
    const { registered, rateBps, pricesIncludeVat, vatin } = a.vat || {};
    if (typeof registered !== 'boolean' || !Number.isSafeInteger(rateBps) || rateBps < 0 || rateBps > 10000 || typeof pricesIncludeVat !== 'boolean') return fail('invalid_settings');
    if (vatin !== undefined && vatin !== '' && !/^[A-Z0-9]{6,20}$/.test(vatin)) return fail('invalid_settings');
    Object.assign(next, { vatRegistered: registered, vatRateBps: rateBps, pricesIncludeVat, vatin: vatin || undefined });
  }
  if (a.stockPolicy !== undefined) {
    if (!STOCK_POLICIES.includes(a.stockPolicy)) return fail('invalid_settings');
    next.stockPolicy = a.stockPolicy;
  }
  // The Hasib industry is the owner's explicit choice; Layla's own sector is never written here.
  if (a.packId !== undefined) {
    if (!isLivePack(a.packId)) return fail('pack_not_live');
    next.packId = a.packId;
  }
  const row = { accountId, ...(next.packId ? { packId: next.packId } : {}), currency: next.currency, vatRegistered: next.vatRegistered, vatRateBps: next.vatRateBps, pricesIncludeVat: next.pricesIncludeVat,
    ...(next.vatin ? { vatin: next.vatin } : {}), stockPolicy: next.stockPolicy, updatedAt: now };
  if (current) await ctx.db.replace(current._id, row); else await ctx.db.insert('hasibSettings', row);
  return ok({ settings: publicSettings(row) });
}

export async function executeHasib(ctx, a, now = Date.now()) {
  if (!(await hasibEnabled(ctx))) return fail('hasib_unavailable');
  const tenant = await resolveTenant(ctx, a.sessionHash, now);
  if (tenant.error) return fail(tenant.error);
  tenant.secret = a.hashSecret;
  // Hasib is part of Ascend and Apex; Layla-only accounts have no grant.
  const plan = await planFor(ctx, tenant.accountId);
  if (!HASIB_PLANS.includes(plan)) return fail('plan_required');
  const pack = tenant.pack = await packFor(ctx, tenant);
  if (a.operation === 'settings_update') return updateSettings(ctx, tenant.accountId, a, now);
  if (!isLivePack(pack.id)) {
    // Only live packs open Hasib; the owner can choose one without changing Layla's sector.
    return a.operation === 'overview' ? ok({ plan, setupRequired: true, livePacks: livePackSummaries(), industries: industryCatalog(), modules: [], settings: publicSettings(await settingsFor(ctx, tenant.accountId)) }) : fail('pack_not_live');
  }

  if (a.operation === 'overview') {
    const settings = await settingsFor(ctx, tenant.accountId);
    const pending = await ctx.db.query('hasibOrders').withIndex('by_account_status_created', q => q.eq('accountId', tenant.accountId).eq('status', 'pending')).take(200);
    const confirmedAsks = [];
    for (const status of ['confirmed', 'ready']) confirmedAsks.push(...(await ctx.db.query('hasibOrders').withIndex('by_account_status_created', q => q.eq('accountId', tenant.accountId).eq('status', status)).take(200)));
    // Waiting for the owner: Layla's orders she could not confirm, and confirmed ones the customer asked to change.
    const layla = [...pending, ...confirmedAsks.filter(o => o.flags?.includes('change_requested'))].filter(o => o.source === 'layla');
    const low = (await ctx.db.query('hasibVariants').withIndex('by_account_low', q => q.eq('accountId', tenant.accountId).eq('low', true)).take(100)).filter(v => !v.archived);
    return ok({ pack: { id: pack.id, archetype: pack.archetype, version: pack.version, variantOptions: pack.variantOptions, orderFields: pack.orderFields, expenseCategories: pack.expenseCategories },
      plan, setupRequired: false, livePacks: livePackSummaries(), industries: industryCatalog(), modules: visibleModules(pack), settings: publicSettings(settings), counts: { pendingOrders: pending.length, lowStock: low.length, laylaWaiting: layla.length, laylaOverdue: layla.filter(o => now - o.createdAt > 86400000).length } });
  }
  const module = moduleOf(a.operation);
  if (module && pack.modules[module] !== 'available') return fail('module_unavailable');
  const result = (await executeCatalog(ctx, tenant, a, now)) || (await executeOrders(ctx, tenant, a, now))
    || (await executeExpenses(ctx, tenant, a, now)) || (await executeInsights(ctx, tenant, a, now))
    || (await executeSerials(ctx, tenant, a, now)) || (await executeRepairs(ctx, tenant, a, now));
  return result || fail('invalid_action');
}
