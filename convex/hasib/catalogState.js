// Items, variants and the stock ledger. Items are archived, never deleted, so
// orders and stock history keep pointing at something real.
import { owned, encodeCursor, decodeCursor, afterCursor } from '../blueTenant.js';
import { isMinor } from './money.js';
import { MOVE_REASONS } from './stock.js';
import { ok, fail, clean, bounded, clampLimit, REQUEST_ID, byRequest, isLow, precheckStock, writeMove, settingsFor } from './shared.js';
import { moveSerializedStock, WARRANTY_BY } from './serialsState.js';
import { syncCatalogEntry } from './stockSync.js';
import { checkPhoto, releaseRegistration, withPhoto, sweepOrphanPhotos } from './photosState.js';

export { withPhoto, sweepOrphanPhotos };

const MAX_VARIANTS = 50, VARIANT_READ = 250, MAX_OPTIONS = 3, MAX_DELTA = 100_000;
const CLIENT_REASONS = { stock_in: 1, return: 1, adjustment: 0, damage: -1 };
const KINDS = ['product', 'service'];

export const publicVariant = v => ({ id: v._id, sku: v.sku, options: v.options, priceMinor: v.priceMinor, costMinor: v.costMinor, costKnown: v.costKnown !== false, onHand: v.onHand, reorderPoint: v.reorderPoint, low: v.low });
export const publicItem = (item, variants) => ({ id: item._id, kind: item.kind, nameAr: item.nameAr, nameEn: item.nameEn, category: item.category, unit: item.unit,
  trackStock: item.trackStock, serialized: !!item.serialized, warrantyMonths: item.warrantyMonths || 0, warrantyBy: item.warrantyBy || 'none',
  catalogEntryKey: item.catalogEntryKey || null, variants: variants.filter(v => !v.archived).map(publicVariant), updatedAt: item.updatedAt });

// Archived variants stay on the item for history, so reads leave room for them beyond the live limit.
export const variantsOf = (ctx, itemId) => ctx.db.query('hasibVariants').withIndex('by_item', q => q.eq('itemId', itemId)).take(VARIANT_READ);

function itemInput(raw, pack) {
  if (!raw || !KINDS.includes(raw.kind)) return null;
  // Serial/IMEI tracking is a tech-store capability; it needs a stocked product.
  const serialized = raw.serialized === true;
  if (serialized && (pack.modules.serials !== 'available' || raw.kind !== 'product' || raw.trackStock !== true)) return null;
  const warrantyMonths = raw.warrantyMonths ?? 0, warrantyBy = raw.warrantyBy ?? 'none';
  if (!Number.isSafeInteger(warrantyMonths) || warrantyMonths < 0 || warrantyMonths > 60 || !WARRANTY_BY.includes(warrantyBy)) return null;
  // "No warranty" cannot carry months; zero months means no warranty whoever was named.
  if (warrantyBy === 'none' && warrantyMonths > 0) return null;
  const nameAr = bounded(raw.nameAr ?? '', 120), nameEn = bounded(raw.nameEn ?? '', 120), category = bounded(raw.category ?? '', 60), unit = bounded(raw.unit ?? 'piece', 20);
  if ([nameAr, nameEn, category, unit].includes(null) || !(nameAr || nameEn) || typeof raw.trackStock !== 'boolean') return null;
  const catalogEntryKey = raw.catalogEntryKey ? (/^[a-f0-9-]{36}$/.test(raw.catalogEntryKey) ? raw.catalogEntryKey : null) : undefined;
  if (catalogEntryKey === null) return null;
  return { kind: raw.kind, nameAr, nameEn, category, unit: unit || 'piece', trackStock: raw.kind === 'product' && raw.trackStock, ...(catalogEntryKey ? { catalogEntryKey } : {}),
    ...(serialized ? { serialized: true } : {}), warrantyMonths, warrantyBy: warrantyMonths ? warrantyBy : 'none' };
}
function variantInput(raw) {
  const sku = bounded(raw?.sku ?? '', 40);
  const options = Array.isArray(raw?.options) && raw.options.length <= MAX_OPTIONS ? raw.options.map(o => ({ key: bounded(o?.key ?? '', 20), value: bounded(o?.value ?? '', 40) })) : null;
  if (sku === null || !options || options.some(o => !o.key || !o.value)) return null;
  if (!isMinor(raw.priceMinor) || !isMinor(raw.costMinor ?? 0) || !Number.isSafeInteger(raw.reorderPoint ?? 0) || (raw.reorderPoint ?? 0) < 0) return null;
  const opening = raw.openingStock ?? 0;
  if (!Number.isSafeInteger(opening) || opening < 0 || opening > MAX_DELTA) return null;
  return { variantId: raw.variantId, sku, options, priceMinor: raw.priceMinor, costMinor: raw.costMinor ?? 0, costKnown: raw.costMinor !== undefined, reorderPoint: raw.reorderPoint ?? 0, openingStock: opening };
}
export const searchText = (item, variants) => [item.nameEn, item.nameAr, item.category, ...variants.map(v => v.sku), ...variants.flatMap(v => v.options.map(o => o.value))]
  .filter(Boolean).join(' ').toLowerCase().slice(0, 1000);

async function skuTaken(ctx, accountId, sku, exceptId) {
  if (!sku) return false;
  const rows = await ctx.db.query('hasibVariants').withIndex('by_account_sku', q => q.eq('accountId', accountId).eq('sku', sku)).take(5);
  return rows.some(r => r._id !== exceptId && !r.archived);
}

export async function saveItem(ctx, accountId, pack, a, now) {
  let item = itemInput(a.item, pack);
  const variants = Array.isArray(a.variants) && a.variants.length && a.variants.length <= MAX_VARIANTS ? a.variants.map(variantInput) : null;
  if (!item || !variants || variants.includes(null)) return fail('invalid_item');
  // Serialized units arrive with their IMEIs through a stock receipt, never as a bare opening quantity.
  if (item.serialized && variants.some(v => v.openingStock > 0)) return fail('invalid_item');
  const skus = variants.map(v => v.sku).filter(Boolean);
  if (new Set(skus).size !== skus.length) return fail('duplicate_sku');

  let existing = null;
  if (a.itemId) {
    existing = await owned(ctx, a.itemId, accountId, 'hasibItems');
    if (!existing || existing.archived) return fail('item_not_found');
    // Serial tracking is fixed at creation so on-hand and serial rows can never disagree.
    item = { ...item, serialized: existing.serialized || undefined };
    if (!item.serialized) delete item.serialized;
  } else {
    if (!REQUEST_ID.test(a.requestId || '')) return fail('invalid_request');
    const replay = await byRequest(ctx, 'hasibItems', accountId, a.requestId);
    if (replay) return ok({ item: await withPhoto(ctx, publicItem(replay, await variantsOf(ctx, replay._id)), replay), variants: (await variantsOf(ctx, replay._id)).map(publicVariant) });
  }
  // Photo: undefined leaves it, '' removes it, an id must pass the checks.
  const photoIn = a.item?.photoId;
  let photoId;
  if (typeof photoIn === 'string' && photoIn) { photoId = await checkPhoto(ctx, accountId, photoIn, existing); if (!photoId) return fail('invalid_photo'); }
  // Validate every variant before the first write.
  const current = existing ? await variantsOf(ctx, existing._id) : [];
  const live = current.filter(c => !c.archived);
  if (live.length + variants.filter(v => !v.variantId).length > MAX_VARIANTS) return fail('too_many_variants');
  // Switching tracking or kind would strand the pieces already counted on the shelf.
  if (existing && (existing.trackStock !== item.trackStock || existing.kind !== item.kind) && live.some(c => c.onHand !== 0)) return fail('item_has_stock');
  for (const v of variants) {
    if (v.variantId && !current.some(c => c._id === v.variantId)) return fail('variant_not_found');
    if (await skuTaken(ctx, accountId, v.sku, v.variantId)) return fail('duplicate_sku');
  }
  const itemId = existing ? existing._id : await ctx.db.insert('hasibItems', { accountId, requestId: a.requestId, ...item, ...(photoId ? { photoId } : {}), archived: false, searchText: '', createdAt: now, updatedAt: now });
  if (existing) {
    const photoChange = photoIn === undefined ? {} : { photoId: photoId || undefined };
    await ctx.db.patch(itemId, { ...item, ...photoChange, updatedAt: now });
    if (photoIn !== undefined && existing.photoId && existing.photoId !== photoId) await ctx.storage.delete(existing.photoId);
  }
  if (photoId) await releaseRegistration(ctx, photoId);
  for (const v of variants) {
    const fields = { sku: v.sku, options: v.options, priceMinor: v.priceMinor, costMinor: v.costMinor, costKnown: v.costKnown, reorderPoint: v.reorderPoint, updatedAt: now };
    if (v.variantId) {
      const before = current.find(c => c._id === v.variantId);
      await ctx.db.patch(v.variantId, { ...fields, low: isLow(before.onHand, v.reorderPoint) });
    } else {
      const id = await ctx.db.insert('hasibVariants', { accountId, itemId, ...fields, onHand: 0, low: isLow(0, v.reorderPoint), archived: false });
      if (v.openingStock && item.trackStock) await writeMove(ctx, { accountId, variantId: id, delta: v.openingStock, reason: 'opening', now });
    }
  }
  const saved = await variantsOf(ctx, itemId);
  await ctx.db.patch(itemId, { searchText: searchText(item, saved) });
  // Layla learns the product at once: one catalog entry, kept in step with stock. A clinic's supplies stay internal.
  if (!pack.internalStock) await syncCatalogEntry(ctx, await ctx.db.get(itemId), saved, now);
  const stored = await ctx.db.get(itemId);
  return ok({ item: await withPhoto(ctx, publicItem(stored, saved), stored), variants: saved.filter(v => !v.archived).map(publicVariant) });
}

async function listItems(ctx, accountId, a) {
  const limit = clampLimit(a.limit);
  const search = clean(a.search, 80).toLowerCase();
  let rows;
  let next = null;
  if (search) {
    rows = await ctx.db.query('hasibItems').withSearchIndex('search_items', q => q.search('searchText', search).eq('accountId', accountId).eq('archived', false)).take(limit);
  } else {
    const cursor = decodeCursor(a.cursor);
    // A kind filter (a clinic's supplies) reads past the other kind so a page still fills.
    const kind = KINDS.includes(a.kind) ? a.kind : null;
    const query = ctx.db.query('hasibItems').withIndex('by_account_archived_updated', q => cursor ? q.eq('accountId', accountId).eq('archived', false).lte('updatedAt', cursor.at) : q.eq('accountId', accountId).eq('archived', false));
    rows = afterCursor(await query.order('desc').take(limit + (kind ? 225 : 25)), cursor, 'updatedAt').filter(i => !kind || i.kind === kind).slice(0, limit);
    if (rows.length === limit) next = encodeCursor(rows.at(-1).updatedAt, rows.at(-1)._id);
  }
  const items = [];
  for (const item of rows) items.push(await withPhoto(ctx, publicItem(item, await variantsOf(ctx, item._id)), item));
  return ok({ items, cursor: next });
}

async function moveStock(ctx, accountId, a, now) {
  if (!REQUEST_ID.test(a.requestId || '')) return fail('invalid_request');
  const replay = await byRequest(ctx, 'hasibStockMoves', accountId, a.requestId);
  if (replay) return ok({ variant: publicVariant(await ctx.db.get(replay.variantId)) });
  const variant = await owned(ctx, a.variantId, accountId, 'hasibVariants');
  if (!variant || variant.archived) return fail('variant_not_found');
  const sign = CLIENT_REASONS[a.reason];
  const delta = a.delta;
  if (sign === undefined || !Number.isSafeInteger(delta) || !delta || Math.abs(delta) > MAX_DELTA || (sign && Math.sign(delta) !== sign)) return fail('invalid_stock_move');
  if (a.unitCostMinor !== undefined && (!isMinor(a.unitCostMinor) || a.reason !== 'stock_in')) return fail('invalid_stock_move');
  const note = bounded(a.note ?? '', 200);
  if (note === null) return fail('invalid_stock_move');
  const item = await ctx.db.get(variant.itemId);
  if (item?.serialized) return (await moveSerializedStock(ctx, { accountId, variant, a, note, now })) || ok({ variant: publicVariant(await ctx.db.get(variant._id)) });
  const settings = await settingsFor(ctx, accountId);
  const check = precheckStock([{ variant, delta }], settings.stockPolicy);
  if (!check.ok) return fail(check.reason);
  await writeMove(ctx, { accountId, variantId: variant._id, delta, reason: a.reason, unitCostMinor: a.unitCostMinor, note, requestId: a.requestId, now });
  return ok({ variant: publicVariant(await ctx.db.get(variant._id)) });
}

export async function executeCatalog(ctx, tenant, a, now) {
  const { accountId } = tenant;
  if (a.operation === 'items') return listItems(ctx, accountId, a);
  if (a.operation === 'item_save') return saveItem(ctx, accountId, tenant.pack, a, now);
  if (a.operation === 'item_archive') {
    const item = await owned(ctx, a.itemId, accountId, 'hasibItems');
    if (!item || item.archived) return fail('item_not_found');
    await ctx.db.patch(item._id, { archived: true, updatedAt: now });
    for (const v of await variantsOf(ctx, item._id)) await ctx.db.patch(v._id, { archived: true, low: false, updatedAt: now });
    if (!tenant.pack.internalStock || item.catalogEntryKey) await syncCatalogEntry(ctx, await ctx.db.get(item._id), [], now);
    return ok({ archived: true });
  }
  if (a.operation === 'item_photo') {
    const item = await owned(ctx, a.itemId, accountId, 'hasibItems');
    if (!item || item.archived) return fail('item_not_found');
    const photoId = a.photoId ? await checkPhoto(ctx, accountId, a.photoId, item) : undefined;
    if (a.photoId && !photoId) return fail('invalid_photo');
    await ctx.db.patch(item._id, { photoId, updatedAt: now });
    if (item.photoId && item.photoId !== photoId) await ctx.storage.delete(item.photoId);
    if (photoId) await releaseRegistration(ctx, photoId);
    const stored = await ctx.db.get(item._id), variants = await variantsOf(ctx, item._id);
    return ok({ item: await withPhoto(ctx, publicItem(stored, variants), stored) });
  }
  if (a.operation === 'stock_move') return moveStock(ctx, accountId, a, now);
  if (a.operation === 'stock_moves') {
    const variant = await owned(ctx, a.variantId, accountId, 'hasibVariants');
    if (!variant) return fail('variant_not_found');
    const cursor = decodeCursor(a.cursor), limit = clampLimit(a.limit);
    const query = ctx.db.query('hasibStockMoves').withIndex('by_variant_at', q => cursor ? q.eq('variantId', variant._id).lte('at', cursor.at) : q.eq('variantId', variant._id));
    const rows = afterCursor(await query.order('desc').take(limit + 25), cursor, 'at').slice(0, limit);
    return ok({ items: rows.map(r => ({ id: r._id, delta: r.delta, reason: r.reason, onHandAfter: r.onHandAfter, refType: r.refType || null, refId: r.refId || null, note: r.note || '', at: r.at })),
      cursor: rows.length === limit ? encodeCursor(rows.at(-1).at, rows.at(-1)._id) : null });
  }
  if (a.operation === 'low_stock') {
    const rows = (await ctx.db.query('hasibVariants').withIndex('by_account_low', q => q.eq('accountId', accountId).eq('low', true)).take(100)).filter(v => !v.archived);
    const items = [];
    for (const v of rows) {
      const item = await ctx.db.get(v.itemId);
      if (item && !item.archived && item.trackStock) items.push({ ...publicVariant(v), itemId: item._id, nameAr: item.nameAr, nameEn: item.nameEn, serialized: !!item.serialized });
    }
    return ok({ items });
  }
  return null;
}
export { MOVE_REASONS };
