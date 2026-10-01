// Layla's catalog → Hasib, one way, for packs whose services are what they sell (dental).
// Each approved service becomes a Hasib service item, so a visit can charge it and
// Money can rank revenue by service. The owner edits treatments and prices in one
// place, Layla's catalog, which is also what Layla quotes. Stock products never come
// back this way (they flow the other way, in stockSync).
import { STOCK_SOURCE } from './stockSync.js';
import { clean } from './shared.js';
import { searchText } from './catalogState.js';
import { sectorFor } from '../blueContacts.js';
import { hasibPack } from '../../config/hasib-packs.js';

const ENTRIES = 200, ITEMS = 500;

/** The list price in baisa: a fixed or recurring amount, or the lowest of a "from"/range price; 0 when it is quoted or free. */
export function servicePriceMinor(prices = []) {
  for (const p of prices) {
    const amount = ['fixed', 'recurring'].includes(p?.type) ? p.amount : ['from', 'range'].includes(p?.type) ? (p.minimum ?? p.amount) : undefined;
    if (Number.isFinite(amount) && amount >= 0 && amount < 1e7) return Math.round(amount * 1000);
  }
  return 0;
}

/** The Hasib pack for a catalog owner, from the owner's Hasib choice or Layla's sector. */
async function packForOwner(ctx, accountId) {
  const settings = await ctx.db.query('hasibSettings').withIndex('by_account', q => q.eq('accountId', accountId)).unique();
  if (settings?.packId) return hasibPack(settings.packId);
  const account = await ctx.db.get(accountId);
  const row = account?.draftHash && await ctx.db.query('blueReviewSessions').withIndex('by_hash', q => q.eq('sessionHash', account.draftHash)).unique();
  return hasibPack(sectorFor(row));
}

const itemFields = e => ({ nameEn: clean(e.nameEn, 120), nameAr: clean(e.nameAr, 120), category: clean(e.category, 60) });

/**
 * Bring the account's service items in line with its approved catalog services.
 * Idempotent: an unchanged catalog writes nothing.
 * @returns {Promise<{ created: number, updated: number, archived: number }>}
 */
export async function syncServiceItems(ctx, accountId, now) {
  const entries = (await ctx.db.query('blueCatalogEntries').withIndex('by_owner_status_order', q => q.eq('ownerKey', String(accountId)).eq('status', 'approved')).take(ENTRIES))
    .filter(e => e.kind === 'service' && e.source !== STOCK_SOURCE && (e.nameEn || e.nameAr));
  const items = (await ctx.db.query('hasibItems').withIndex('by_account_archived_updated', q => q.eq('accountId', accountId).eq('archived', false)).take(ITEMS))
    .filter(i => i.kind === 'service' && i.catalogEntryKey);
  const linked = new Map(items.map(i => [i.catalogEntryKey, i]));
  const counts = { created: 0, updated: 0, archived: 0 };
  for (const entry of entries) {
    const fields = itemFields(entry), priceMinor = servicePriceMinor(entry.prices);
    const item = linked.get(entry.entryKey);
    linked.delete(entry.entryKey);
    if (!item) {
      const itemId = await ctx.db.insert('hasibItems', { accountId, kind: 'service', ...fields, unit: 'visit', catalogEntryKey: entry.entryKey, trackStock: false, archived: false,
        searchText: searchText(fields, []), createdAt: now, updatedAt: now });
      await ctx.db.insert('hasibVariants', { accountId, itemId, sku: '', options: [], priceMinor, costMinor: 0, onHand: 0, reorderPoint: 0, low: false, archived: false, updatedAt: now });
      counts.created++;
      continue;
    }
    const variant = (await ctx.db.query('hasibVariants').withIndex('by_item', q => q.eq('itemId', item._id)).take(10)).find(v => !v.archived);
    const renamed = ['nameEn', 'nameAr', 'category'].some(k => item[k] !== fields[k]);
    if (renamed) await ctx.db.patch(item._id, { ...fields, searchText: searchText(fields, variant ? [variant] : []), updatedAt: now });
    if (variant && variant.priceMinor !== priceMinor) await ctx.db.patch(variant._id, { priceMinor, updatedAt: now });
    if (!variant) await ctx.db.insert('hasibVariants', { accountId, itemId: item._id, sku: '', options: [], priceMinor, costMinor: 0, onHand: 0, reorderPoint: 0, low: false, archived: false, updatedAt: now });
    if (renamed || !variant || variant.priceMinor !== priceMinor) counts.updated++;
  }
  // A service no longer approved stops being chargeable; past visits keep their lines.
  for (const item of linked.values()) {
    await ctx.db.patch(item._id, { archived: true, updatedAt: now });
    for (const v of await ctx.db.query('hasibVariants').withIndex('by_item', q => q.eq('itemId', item._id)).take(10)) await ctx.db.patch(v._id, { archived: true, low: false, updatedAt: now });
    counts.archived++;
  }
  return counts;
}

/** After a catalog change: sync only for owners whose pack charges catalog services. */
export async function syncServicesForOwner(ctx, ownerKey, now) {
  const accountId = typeof ctx.db.normalizeId === 'function' ? ctx.db.normalizeId('accounts', ownerKey) : ownerKey;
  if (!accountId || !(await ctx.db.get(accountId))) return null;
  const pack = await packForOwner(ctx, accountId);
  return pack.serviceItems ? syncServiceItems(ctx, accountId, now) : null;
}
