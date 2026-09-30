// `items_import`: a reviewed file saved into Stock, 25 products per call. A product
// already in Stock (same SKU, else same name) is updated, never duplicated; the
// owner's details on it (photo, warranty, names) stay. A quantity in the file
// becomes on-hand through a counted stock move; IMEIs are received as units.
import { ok, fail, REQUEST_ID, writeMove } from './shared.js';
import { saveItem, variantsOf } from './catalogState.js';
import { moveSerializedStock, normSerial, serialRow } from './serialsState.js';

export const IMPORT_BATCH = 25;
const MAX_QTY = 100_000, MAX_SERIALS = 200, MAX_BATCH_SERIALS = 3000, SCAN_ITEMS = 2000;
const nameKey = n => String(n || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const sameOptions = (a, b) => a.length === b.length && a.every(o => b.some(x => x.key === o.key && x.value.toLowerCase() === o.value.toLowerCase()));
const matchVariant = (rows, v) => rows.find(c => !c.archived && ((v.sku && c.sku.toLowerCase() === v.sku.toLowerCase()) || (!v.sku && sameOptions(c.options, v.options || []))));

async function findExisting(ctx, accountId, p, byName) {
  for (const v of p.variants || []) {
    if (!v.sku) continue;
    for (const sku of new Set([v.sku, v.sku.toUpperCase(), v.sku.toLowerCase()])) {
      const hit = (await ctx.db.query('hasibVariants').withIndex('by_account_sku', q => q.eq('accountId', accountId).eq('sku', sku)).take(5)).find(x => !x.archived);
      const item = hit && await ctx.db.get(hit.itemId);
      if (item && !item.archived) return item;
    }
  }
  return byName.get(nameKey(p.item?.nameEn)) || byName.get(nameKey(p.item?.nameAr)) || null;
}

function badInput(p) {
  if (!REQUEST_ID.test(p?.requestId || '')) return 'invalid_request';
  if (!p.item || !Array.isArray(p.variants) || !p.variants.length) return 'invalid_item';
  for (const v of p.variants) {
    if (v.quantity !== undefined && (!Number.isSafeInteger(v.quantity) || v.quantity < 0 || v.quantity > MAX_QTY)) return 'invalid_item';
    if (v.serials !== undefined && (!Array.isArray(v.serials) || v.serials.length > MAX_SERIALS || v.serials.map(normSerial).includes(null))) return 'invalid_serial';
    if (v.serials?.length && !p.item.serialized) return 'invalid_item';
  }
  return null;
}

/** The variants to save for a product already in Stock: its own, updated from the file, plus new ones. */
function mergeVariants(current, incoming, serialized) {
  const live = current.filter(c => !c.archived);
  const merged = live.map(c => ({ variantId: c._id, sku: c.sku, options: c.options, priceMinor: c.priceMinor, ...(c.costKnown !== false ? { costMinor: c.costMinor } : {}), reorderPoint: c.reorderPoint }));
  const counts = [];
  for (const v of incoming) {
    const hit = matchVariant(live, v);
    if (hit) {
      const row = merged.find(m => m.variantId === hit._id);
      Object.assign(row, { priceMinor: v.priceMinor, costMinor: v.costMinor ?? row.costMinor, ...(v.reorderPoint !== undefined ? { reorderPoint: v.reorderPoint } : {}),
        ...(v.sku ? { sku: v.sku } : {}), ...(v.options?.length ? { options: v.options } : {}) });
      if (v.quantity !== undefined && !serialized) counts.push({ variantId: hit._id, quantity: v.quantity });
    } else merged.push({ sku: v.sku || '', options: v.options || [], priceMinor: v.priceMinor, ...(v.costMinor !== undefined ? { costMinor: v.costMinor } : {}), reorderPoint: v.reorderPoint ?? 0,
      ...(v.quantity !== undefined && !serialized ? { openingStock: v.quantity } : {}) });
  }
  return { merged, counts };
}

/** Receive the file's IMEIs. IMEIs already on record, or for an option not in Stock, are skipped and counted. */
async function receiveFileSerials(ctx, accountId, itemId, incoming, now) {
  const saved = await variantsOf(ctx, itemId);
  let skipped = 0;
  for (const v of incoming) {
    if (!v.serials?.length) continue;
    const variant = matchVariant(saved, v);
    const unique = [...new Set(v.serials.map(normSerial))];
    if (!variant) { skipped += unique.length; continue; }
    const fresh = [];
    for (const s of unique) if (!(await serialRow(ctx, accountId, s))) fresh.push(s); else skipped++;
    if (!fresh.length) continue;
    const moved = await moveSerializedStock(ctx, { accountId, variant, a: { reason: 'stock_in', delta: fresh.length, serials: fresh }, note: 'import', now });
    if (moved) return { problem: moved.reason, skipped };
  }
  return { problem: null, skipped };
}

async function importOne(ctx, tenant, p, byName, now) {
  const { accountId, pack } = tenant;
  const problem = badInput(p);
  if (problem) return { status: 'failed', reason: problem };
  const existing = await findExisting(ctx, accountId, p, byName);
  let saved;
  if (existing) {
    if (p.item.serialized && !existing.serialized) return { status: 'failed', reason: 'serial_mismatch' };
    const { merged, counts } = mergeVariants(await variantsOf(ctx, existing._id), p.variants, existing.serialized);
    const item = { kind: existing.kind, nameAr: existing.nameAr || p.item.nameAr || '', nameEn: existing.nameEn || p.item.nameEn || '', category: existing.category || p.item.category || '',
      unit: existing.unit, trackStock: existing.trackStock, ...(existing.serialized ? { serialized: true } : {}), ...(existing.warrantyMonths ? { warrantyMonths: existing.warrantyMonths, warrantyBy: existing.warrantyBy } : {}) };
    saved = await saveItem(ctx, accountId, pack, { itemId: existing._id, item, variants: merged }, now);
    if (!saved.ok) return { status: 'failed', reason: saved.reason };
    if (existing.trackStock) {
      for (const c of counts) {
        const variant = await ctx.db.get(c.variantId);
        const delta = c.quantity - variant.onHand;
        if (delta) await writeMove(ctx, { accountId, variantId: variant._id, delta, reason: 'count', note: 'import', now });
      }
    }
  } else {
    const variants = p.variants.map(({ quantity, serials, ...v }) => ({ ...v, ...(quantity !== undefined && !p.item.serialized ? { openingStock: quantity } : {}) }));
    saved = await saveItem(ctx, accountId, pack, { requestId: p.requestId, item: p.item, variants }, now);
    if (!saved.ok) return { status: 'failed', reason: saved.reason };
  }
  const itemId = saved.value.item.id;
  const serials = await receiveFileSerials(ctx, accountId, itemId, p.variants, now);
  const stored = await ctx.db.get(itemId);
  for (const n of [stored.nameEn, stored.nameAr]) if (n) byName.set(nameKey(n), stored);
  // The product is saved either way; a problem with its IMEIs is a warning on that line, not a failure.
  return { status: existing ? 'updated' : 'created', itemId, ...(serials.problem ? { warning: serials.problem } : {}), ...(serials.skipped ? { skippedSerials: serials.skipped } : {}) };
}

export async function importItems(ctx, tenant, a, now) {
  const products = a.products;
  if (!Array.isArray(products) || !products.length || products.length > IMPORT_BATCH) return fail('invalid_import');
  // Each IMEI is a read and a write; keep a batch well inside one mutation's limits.
  const serialCount = products.reduce((n, p) => n + (Array.isArray(p?.variants) ? p.variants.reduce((m, v) => m + (Array.isArray(v?.serials) ? v.serials.length : 0), 0) : 0), 0);
  if (serialCount > MAX_BATCH_SERIALS) return fail('invalid_import');
  const active = await ctx.db.query('hasibItems').withIndex('by_account_archived_updated', q => q.eq('accountId', tenant.accountId).eq('archived', false)).take(SCAN_ITEMS);
  const byName = new Map();
  for (const item of active) for (const n of [item.nameEn, item.nameAr]) if (n && !byName.has(nameKey(n))) byName.set(nameKey(n), item);
  const results = [];
  for (const [index, p] of products.entries()) results.push({ index, ...(await importOne(ctx, tenant, p, byName, now)) });
  const count = status => results.filter(r => r.status === status).length;
  return ok({ results, created: count('created'), updated: count('updated'), failed: count('failed') });
}
