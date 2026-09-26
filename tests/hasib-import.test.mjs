// Phase 3: `items_import` saves a reviewed file into Stock. It updates products
// already there instead of duplicating them, and the file's quantity becomes
// on-hand through a counted stock move, so the ledger stays whole.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { blueHarness, seedTenant } from './helpers/blue-tenant.mjs';
import { SECRET } from './helpers/convex-memory.mjs';
import { executeHasib } from '../convex/hasib/hasibState.js';
import { grantPlan } from '../convex/hasib/plans.js';

async function setup(pack = 'retail') {
  const h = blueHarness();
  await h.enable();
  await h.m.db.insert('blueMessagingSettings', { key: 'hasib', enabled: true });
  const a = await seedTenant(h.m, { name: 'a', sector: 'Retail' });
  await grantPlan(h.m.ctx, { email: 'a@example.com', plan: 'ascend', packId: pack }, h.m.now());
  const hasib = (operation, args = {}) => executeHasib(h.m.ctx, { operation, sessionHash: a.sessionHash, hashSecret: SECRET, ...args }, h.m.now());
  return { h, a, hasib };
}
const size = value => [{ key: 'size', value }];
const abaya = (variants, extra = {}) => ({ requestId: randomUUID(), item: { kind: 'product', nameAr: '', nameEn: 'Black abaya', category: 'Abayas', unit: 'piece', trackStock: true, ...extra }, variants });
const v = (s, priceMinor, quantity, more = {}) => ({ sku: '', options: size(s), priceMinor, costMinor: 0, ...(quantity !== undefined ? { quantity } : {}), ...more });
const run = (hasib, products) => hasib('items_import', { products });
const variants = h => h.m.table('hasibVariants');
const onHand = (h, s) => variants(h).find(x => x.options[0]?.value === s)?.onHand;

test('new products are created with their variants and opening stock, and Layla learns them', async () => {
  const { h, a, hasib } = await setup();
  const r = await run(hasib, [abaya([v('52', 25000, 3), v('56', 25000, 2)]), { requestId: randomUUID(), item: { kind: 'product', nameAr: 'قفطان', nameEn: '', category: '', unit: 'piece', trackStock: true }, variants: [v('M', 18000)] }]);
  assert.deepEqual([r.value.created, r.value.updated, r.value.failed], [2, 0, 0]);
  assert.deepEqual([onHand(h, '52'), onHand(h, '56'), onHand(h, 'M')], [3, 2, 0]);
  assert.equal(h.m.table('blueCatalogEntries').filter(e => e.ownerKey === String(a.accountId) && e.source === 'hasib_stock').length, 2);
});

test('importing the same file again updates prices and sets on-hand by a counted move — no duplicates', async () => {
  const { h, hasib } = await setup();
  await run(hasib, [abaya([v('52', 25000, 3)])]);
  const r = await run(hasib, [abaya([v('52', 27500, 5), v('58', 27500, 1)])]);
  assert.deepEqual([r.value.created, r.value.updated], [0, 1]);
  assert.equal(h.m.table('hasibItems').length, 1);
  assert.deepEqual([onHand(h, '52'), onHand(h, '58')], [5, 1]);
  assert.equal(variants(h).find(x => x.options[0].value === '52').priceMinor, 27500);
  const counted = h.m.table('hasibStockMoves').filter(m => m.reason === 'count');
  assert.deepEqual(counted.map(m => m.delta), [2]);
  // No quantity in the file: stock is left alone.
  await run(hasib, [abaya([v('52', 27500)])]);
  assert.equal(onHand(h, '52'), 5);
});

test('a product is found by SKU even when its name changed, and keeps its photo and warranty', async () => {
  const { h, hasib } = await setup('retail-tech');
  const photo = h.m.putFile();
  await hasib('photo_register', { storageId: photo, photoCheck: 'ok' });
  await hasib('item_save', { requestId: randomUUID(), item: { kind: 'product', nameAr: '', nameEn: 'Galaxy case', category: 'Cases', unit: 'piece', trackStock: true, warrantyMonths: 6, warrantyBy: 'store', photoId: photo },
    variants: [{ sku: 'GC-1', options: [{ key: 'colour', value: 'Black' }], priceMinor: 5000, costMinor: 2000, reorderPoint: 2, openingStock: 4 }] });
  const r = await run(hasib, [{ requestId: randomUUID(), item: { kind: 'product', nameAr: '', nameEn: 'Samsung Galaxy S24 case', category: '', unit: 'piece', trackStock: true }, variants: [{ sku: 'gc-1', options: [], priceMinor: 5500, costMinor: 2000, quantity: 10 }] }]);
  assert.equal(r.value.updated, 1);
  const [item] = h.m.table('hasibItems');
  assert.deepEqual([item.nameEn, item.photoId, item.warrantyMonths, item.category], ['Galaxy case', photo, 6, 'Cases'], 'the owner’s product details stay');
  assert.deepEqual([variants(h)[0].priceMinor, variants(h)[0].onHand, variants(h)[0].options[0].value], [5500, 10, 'Black']);
});

test('running the same batch twice changes nothing the second time', async () => {
  const { h, hasib } = await setup();
  const batch = [abaya([v('52', 25000, 3)])];
  await run(hasib, batch);
  await run(hasib, batch);
  assert.equal(h.m.table('hasibItems').length, 1);
  assert.equal(onHand(h, '52'), 3);
  assert.equal(h.m.table('hasibStockMoves').length, 1);
});

test('phone stores: IMEIs are received as units, and known IMEIs are not received twice', async () => {
  const { h, hasib } = await setup('retail-tech');
  const phone = serials => ({ requestId: randomUUID(), item: { kind: 'product', nameAr: '', nameEn: 'iPhone 15', category: 'Phones', unit: 'piece', trackStock: true, serialized: true },
    variants: [{ sku: 'IP15-128', options: [{ key: 'storage', value: '128GB' }], priceMinor: 320000, costMinor: 280000, serials }] });
  await run(hasib, [phone(['111111111111111', '222222222222222'])]);
  const r = await run(hasib, [phone(['222222222222222', '333333333333333'])]);
  assert.equal(r.value.updated, 1);
  assert.deepEqual(h.m.table('hasibSerials').map(s => s.serial).sort(), ['111111111111111', '222222222222222', '333333333333333']);
  assert.equal(variants(h)[0].onHand, 3);
});

test('one bad product is reported and the rest of the batch is saved', async () => {
  const { h, hasib } = await setup();
  const r = await run(hasib, [abaya([v('52', 25000, 1)]), { requestId: randomUUID(), item: { kind: 'product', nameAr: '', nameEn: 'Phone', category: '', unit: 'piece', trackStock: true, serialized: true }, variants: [v('x', 1000, undefined, { serials: ['123456789012345'] })] }]);
  assert.deepEqual([r.value.created, r.value.failed], [1, 1]);
  assert.deepEqual(r.value.results[1], { index: 1, status: 'failed', reason: 'invalid_item' }, 'IMEI tracking needs the phone-store pack');
  assert.equal(h.m.table('hasibItems').length, 1);
});

test('batches are bounded and need a request id per product', async () => {
  const { hasib } = await setup();
  assert.equal((await run(hasib, [])).reason, 'invalid_import');
  assert.equal((await run(hasib, Array.from({ length: 26 }, () => abaya([v('52', 1000)])))).reason, 'invalid_import');
  assert.equal((await run(hasib, [{ ...abaya([v('52', 1000)]), requestId: 'nope' }])).value.results[0].reason, 'invalid_request');
  const many = Array.from({ length: 16 }, (_, i) => abaya([v('52', 1000, undefined, { serials: Array.from({ length: 200 }, (_, k) => String(100000000000000 + i * 1000 + k)) })], { serialized: true }));
  assert.equal((await run(hasib, many)).reason, 'invalid_import', 'too many IMEIs in one batch');
});

test('the overview tells the product editor and importer whether IMEI tracking is on', async () => {
  const tech = await setup('retail-tech'), retail = await setup('retail');
  assert.equal((await tech.hasib('overview')).value.pack.modules.serials, 'available');
  assert.notEqual((await retail.hasib('overview')).value.pack.modules.serials, 'available');
});
