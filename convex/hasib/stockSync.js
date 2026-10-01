// Stock → Layla, one way. Every stock product has exactly one approved entry in
// Layla's catalog, so the owner enters a product once and Layla can name it,
// quote it and capture it. Services stay owner-managed in the Business tab.
import { formatMinor } from './money.js';

export const STOCK_SOURCE = 'hasib_stock';

function priceOf(variants) {
  const prices = variants.map(v => v.priceMinor);
  if (!prices.length) return [];
  const min = Math.min(...prices), max = Math.max(...prices);
  return [min === max
    ? { type: 'fixed', currency: 'OMR', amount: min / 1000, unit: 'piece', label: `${formatMinor(min)} OMR` }
    : { type: 'from', currency: 'OMR', minimum: min / 1000, maximum: max / 1000, unit: 'piece', label: `From ${formatMinor(min)} OMR` }];
}

export async function syncCatalogEntry(ctx, item, variants, now) {
  const ownerKey = String(item.accountId);
  const live = variants.filter(v => !v.archived);
  const meta = await ctx.db.query('blueCatalogMeta').withIndex('by_owner', q => q.eq('ownerKey', ownerKey)).unique();
  const existing = item.catalogEntryKey
    ? await ctx.db.query('blueCatalogEntries').withIndex('by_owner_key', q => q.eq('ownerKey', ownerKey).eq('entryKey', item.catalogEntryKey)).unique()
    : null;
  const fields = { kind: 'product', status: item.archived ? 'archived' : 'approved', nameEn: item.nameEn, nameAr: item.nameAr, category: item.category,
    benefitEn: '', benefitAr: '', descriptionEn: '', descriptionAr: '', availability: '', prices: priceOf(live), source: STOCK_SOURCE, confidence: 1,
    laylaUseEn: 'Answer from live stock: sizes in stock, price and photo.', laylaUseAr: 'الإجابة من المخزون الفعلي: المقاسات المتوفرة والسعر والصورة.',
    revision: meta?.revision || 1, updatedAt: now };
  // An entry the owner manages in Layla's catalog (a clinic's treatment) is never overwritten from Hasib.
  if (existing && existing.source !== STOCK_SOURCE) return existing.entryKey;
  if (existing) { await ctx.db.patch(existing._id, fields); return existing.entryKey; }
  const entryKey = crypto.randomUUID();
  await ctx.db.insert('blueCatalogEntries', { ownerKey, entryKey, ...fields, sortOrder: 0, createdAt: now });
  await ctx.db.patch(item._id, { catalogEntryKey: entryKey });
  return entryKey;
}
