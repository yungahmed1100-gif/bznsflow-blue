// Hasib entry point: gate, tenant, then one of the feature executors.
// The tenant is always resolved from the verified session hash; ids in the
// request are re-checked against it by `owned()` inside each executor.
import { resolveTenant } from '../blueTenant.js';
import { sectorFor } from '../blueContacts.js';
import { hasibPack, visibleModules } from '../../config/hasib-packs.js';
import { STOCK_POLICIES } from './stock.js';
import { ok, fail, settingsFor } from './shared.js';
import { executeCatalog } from './catalogState.js';
import { executeOrders } from './ordersState.js';

export const HASIB_OPERATIONS = ['overview', 'settings_update', 'items', 'item_save', 'item_archive', 'stock_move', 'stock_moves', 'low_stock',
  'order_create', 'order_status', 'orders', 'order', 'payment_record', 'contact_summary', 'chat_prefill'];

export async function hasibEnabled(ctx) {
  const row = await ctx.db.query('blueMessagingSettings').withIndex('by_key', q => q.eq('key', 'hasib')).unique();
  return row?.enabled === true;
}

const publicSettings = s => ({ currency: s.currency, vatRegistered: s.vatRegistered, vatRateBps: s.vatRateBps, pricesIncludeVat: s.pricesIncludeVat, vatin: s.vatin || '', stockPolicy: s.stockPolicy });

async function updateSettings(ctx, accountId, packId, a, now) {
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
  const row = { accountId, packId, currency: next.currency, vatRegistered: next.vatRegistered, vatRateBps: next.vatRateBps, pricesIncludeVat: next.pricesIncludeVat,
    ...(next.vatin ? { vatin: next.vatin } : {}), stockPolicy: next.stockPolicy, updatedAt: now };
  if (current) await ctx.db.replace(current._id, row); else await ctx.db.insert('hasibSettings', row);
  return ok({ settings: publicSettings(row) });
}

export async function executeHasib(ctx, a, now = Date.now()) {
  if (!(await hasibEnabled(ctx))) return fail('hasib_unavailable');
  const tenant = await resolveTenant(ctx, a.sessionHash, now);
  if (tenant.error) return fail(tenant.error);
  tenant.secret = a.hashSecret;
  const pack = hasibPack(sectorFor(tenant.row));

  if (a.operation === 'overview') {
    const settings = await settingsFor(ctx, tenant.accountId);
    const pending = await ctx.db.query('hasibOrders').withIndex('by_account_status_created', q => q.eq('accountId', tenant.accountId).eq('status', 'pending')).take(100);
    const low = (await ctx.db.query('hasibVariants').withIndex('by_account_low', q => q.eq('accountId', tenant.accountId).eq('low', true)).take(100)).filter(v => !v.archived);
    return ok({ pack: { id: pack.id, archetype: pack.archetype, version: pack.version, variantOptions: pack.variantOptions, orderFields: pack.orderFields, expenseCategories: pack.expenseCategories },
      modules: visibleModules(pack), settings: publicSettings(settings), counts: { pendingOrders: pending.length, lowStock: low.length } });
  }
  if (a.operation === 'settings_update') return updateSettings(ctx, tenant.accountId, pack.id, a, now);
  const result = (await executeCatalog(ctx, tenant, a, now)) || (await executeOrders(ctx, tenant, a, now));
  return result || fail('invalid_action');
}
