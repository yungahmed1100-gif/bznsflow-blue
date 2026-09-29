import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { blueHarness, seedTenant } from './helpers/blue-tenant.mjs';
import { SECRET } from './helpers/convex-memory.mjs';
import { hasibPack } from '../config/hasib-packs.js';
import { executeCatalog } from '../convex/hasib/catalogState.js';
import { executeOrders } from '../convex/hasib/ordersState.js';
import { executeRestaurant, expirySummary, restaurantSummary } from '../convex/hasib/restaurantState.js';

async function setup() {
  const h = blueHarness();
  await h.enable();
  const t = await seedTenant(h.m, { name: 'bakery', sector: 'Bakery' });
  const tenant = { accountId: t.accountId, row: {}, pack: hasibPack('cakes'), secret: SECRET };
  const catalog = (operation, args = {}) => executeCatalog(h.m.ctx, tenant, { operation, ...args }, h.m.now());
  const bakery = (operation, args = {}) => executeRestaurant(h.m.ctx, tenant, { operation, ...args }, h.m.now());
  const orders = (operation, args = {}) => executeOrders(h.m.ctx, tenant, { operation, ...args }, h.m.now());
  return { h, tenant, catalog, bakery, orders };
}

const saveItem = (catalog, { nameEn, trackStock, price, cost, stock, options = [] }) => catalog('item_save', {
  requestId: randomUUID(), item: { kind: 'product', nameAr: nameEn, nameEn, category: trackStock ? 'Ingredients' : 'Cakes', unit: 'piece', trackStock },
  variants: [{ sku: `${nameEn}-1`, options, priceMinor: price, costMinor: cost, reorderPoint: 2, openingStock: stock }],
});

test('cakes pack keeps the simple tabs but adds custom cake and shelf-life data', () => {
  const pack = hasibPack('cakes');
  assert.deepEqual(pack.variantOptions.map(v => v.key), ['size', 'flavour']);
  assert.deepEqual(pack.orderFields.map(f => f.key), ['inscription', 'filling', 'design_notes', 'allergen_request']);
  assert.equal(pack.modules.recipes, 'available');
  assert.equal(pack.modules.batches, 'available');
  assert.equal(pack.modules.shelfLife, 'available');
  assert.equal(pack.expenseCategories.some(c => c.key === 'custom_materials'), true);
});

test('bakery batches cost finished goods and orders consume the finished lot', async () => {
  const { h, tenant, catalog, bakery, orders } = await setup();
  const flour = (await saveItem(catalog, { nameEn: 'Flour', trackStock: true, price: 0, cost: 1000, stock: 20 })).value.variants[0].id;
  const cake = (await saveItem(catalog, { nameEn: 'Birthday cake', trackStock: true, price: 12000, cost: 0, stock: 0, options: [{ key: 'size', value: 'Medium' }, { key: 'flavour', value: 'Vanilla' }] })).value.variants[0].id;
  const batch = await bakery('batch_create', { requestId: randomUUID(), outputVariantId: cake, outputQty: 2, inputs: [{ variantId: flour, qty: 4 }], producedOn: '2026-09-28', useBy: '2026-10-02', note: 'Morning bake' });
  assert.equal(batch.ok, true, batch.reason);
  const order = await orders('order_create', { requestId: randomUUID(), channel: 'whatsapp', confirm: true, fulfilment: { type: 'pickup', dueAt: Date.now() },
    customFields: [{ key: 'inscription', value: 'Happy birthday' }, { key: 'filling', value: 'Vanilla' }, { key: 'allergen_request', value: 'No nuts' }], lines: [{ variantId: cake, qty: 1 }] });
  assert.equal(order.ok, true, order.reason);
  assert.equal(order.value.customFields[0].value, 'Happy birthday');
  assert.equal(order.value.lines[0].unitCostMinor, 2000);
  const cakeItem = (await catalog('items')).value.items.find(item => item.variants.some(v => v.id === cake));
  const flourItem = (await catalog('items')).value.items.find(item => item.variants.some(v => v.id === flour));
  assert.equal(cakeItem.variants[0].onHand, 1);
  assert.equal(flourItem.variants[0].onHand, 16);
  const summary = await restaurantSummary(h.m.ctx, tenant.accountId, { from: 0, to: h.m.now() + 1 }, { sales: [await h.m.db.get((await h.m.db.query('hasibOrders').withIndex('by_account_created', q => q.eq('accountId', tenant.accountId)).first())._id)], figures: {}, expenses: [] });
  assert.equal(summary.foodRevenueMinor, 12000);
  assert.equal(summary.foodCogsMinor, 2000);
});

test('bakery receipts and production use the earliest dated lot first', async () => {
  const { h, tenant, catalog, bakery, orders } = await setup();
  const cream = (await saveItem(catalog, { nameEn: 'Cream', trackStock: true, price: 0, cost: 1000, stock: 0 })).value.variants[0].id;
  const first = await bakery('stock_receive', { requestId: randomUUID(), vendor: 'Supplier', invoiceNumber: 'A', receivedOn: '2026-09-28', lines: [{ variantId: cream, qty: 3, unitCostMinor: 1100, useBy: '2026-09-30' }] });
  const second = await bakery('stock_receive', { requestId: randomUUID(), vendor: 'Supplier', invoiceNumber: 'B', receivedOn: '2026-09-28', lines: [{ variantId: cream, qty: 4, unitCostMinor: 1200, useBy: '2026-10-10' }] });
  assert.equal(first.ok, true, first.reason);
  assert.equal(second.ok, true, second.reason);
  const cake = (await saveItem(catalog, { nameEn: 'Cream cake', trackStock: false, price: 8000, cost: 0, stock: 0 })).value.variants[0].id;
  await bakery('recipe_save', { menuVariantId: cake, yieldQty: 1, ingredients: [{ variantId: cream, qty: 1, unit: 'piece' }] });
  const order = await orders('order_create', { requestId: randomUUID(), channel: 'walk_in', confirm: true, fulfilment: { type: 'in_store' }, lines: [{ variantId: cake, qty: 2 }] });
  assert.equal(order.ok, true, order.reason);
  const lots = await h.m.db.query('hasibStockLots').withIndex('by_variant_created', q => q.eq('variantId', cream)).take(10);
  assert.deepEqual(lots.map(lot => [lot.useBy, lot.remainingQty]), [['2026-09-30', 1], ['2026-10-10', 4]]);
  const expiry = await expirySummary(h.m.ctx, tenant.accountId, new Date('2026-09-29T12:00:00Z').getTime(), 7);
  assert.equal(expiry.expiring, 1);
  assert.equal(expiry.items[0].useBy, '2026-09-30');
});
