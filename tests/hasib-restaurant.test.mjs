import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { blueHarness, seedTenant } from './helpers/blue-tenant.mjs';
import { SECRET } from './helpers/convex-memory.mjs';
import { hasibPack } from '../config/hasib-packs.js';
import { executeCatalog } from '../convex/hasib/catalogState.js';
import { executeOrders } from '../convex/hasib/ordersState.js';
import { executeRestaurant } from '../convex/hasib/restaurantState.js';
import { executeInsights } from '../convex/hasib/insightsState.js';

async function setup() {
  const h = blueHarness();
  await h.enable();
  const t = await seedTenant(h.m, { name: 'restaurant', sector: 'Restaurant' });
  const tenant = { accountId: t.accountId, row: {}, pack: hasibPack('restaurant'), secret: SECRET };
  const catalog = (operation, args = {}) => executeCatalog(h.m.ctx, tenant, { operation, ...args }, h.m.now());
  const restaurant = (operation, args = {}) => executeRestaurant(h.m.ctx, tenant, { operation, ...args }, h.m.now());
  const orders = (operation, args = {}) => executeOrders(h.m.ctx, tenant, { operation, ...args }, h.m.now());
  return { h, tenant, catalog, restaurant, orders };
}

const saveItem = (catalog, { nameEn, nameAr = nameEn, trackStock, price, cost, stock }) => catalog('item_save', {
  requestId: randomUUID(), item: { kind: 'product', nameAr, nameEn, category: trackStock ? 'Ingredients' : 'Menu', unit: 'piece', trackStock },
  variants: [{ sku: `${nameEn}-1`, options: [], priceMinor: price, costMinor: cost, reorderPoint: 2, openingStock: stock }],
});

test('restaurant recipes drive ingredient stock and snapshot current food cost', async () => {
  const { h, tenant, catalog, restaurant, orders } = await setup();
  const ingredient = (await saveItem(catalog, { nameEn: 'Chicken', trackStock: true, price: 0, cost: 2500, stock: 100 })).value.variants[0].id;
  const menu = (await saveItem(catalog, { nameEn: 'Chicken bowl', trackStock: false, price: 10000, cost: 0, stock: 0 })).value.variants[0].id;
  const recipe = await restaurant('recipe_save', { menuVariantId: menu, yieldQty: 1, ingredients: [{ variantId: ingredient, qty: 2, unit: 'piece' }] });
  assert.equal(recipe.ok, true, recipe.reason);
  const order = await orders('order_create', { requestId: randomUUID(), channel: 'walk_in', confirm: true, fulfilment: { type: 'in_store' }, lines: [{ variantId: menu, qty: 2 }] });
  assert.equal(order.ok, true, order.reason);
  assert.equal(order.value.lines[0].unitCostMinor, 5000);
  const item = (await catalog('items')).value.items.find(x => x.variants.some(v => v.id === ingredient));
  assert.equal(item.variants[0].onHand, 96);
  const insights = await executeInsights(h.m.ctx, tenant, { operation: 'insights', period: 'today' }, h.m.now());
  assert.equal(insights.ok, true, insights.reason);
  assert.deepEqual([insights.value.restaurant.foodCogsMinor, insights.value.restaurant.foodRevenueMinor, insights.value.restaurant.foodCostBps], [10000, 20000, 5000]);
  assert.deepEqual([insights.value.restaurant.theoreticalUsageMinor, insights.value.restaurant.actualUsageMinor, insights.value.restaurant.usageVarianceMinor], [10000, null, null]);
});

test('restaurant waste, receiving, counts and cost metrics are idempotent and tenant-scoped', async () => {
  const { h, tenant, catalog, restaurant, orders } = await setup();
  const ingredient = (await saveItem(catalog, { nameEn: 'Milk', trackStock: true, price: 0, cost: 1000, stock: 20 })).value.variants[0].id;
  const menu = (await saveItem(catalog, { nameEn: 'Latte', trackStock: false, price: 5000, cost: 0, stock: 0 })).value.variants[0].id;
  await restaurant('recipe_save', { menuVariantId: menu, yieldQty: 1, ingredients: [{ variantId: ingredient, qty: 1, unit: 'piece' }] });
  await orders('order_create', { requestId: randomUUID(), channel: 'walk_in', confirm: true, fulfilment: { type: 'in_store' }, lines: [{ variantId: menu, qty: 2 }] });
  const requestId = randomUUID();
  const waste = await restaurant('waste_create', { requestId, variantId: ingredient, qty: 3, reason: 'spoilage', note: 'Expired milk' });
  assert.equal(waste.ok, true, waste.reason);
  assert.deepEqual(await restaurant('waste_create', { requestId, variantId: ingredient, qty: 3, reason: 'spoilage' }), waste);
  const count = await restaurant('stock_count', { requestId: randomUUID(), variantId: ingredient, countedQty: 14, note: 'Closing count' });
  assert.equal(count.value.varianceQty, -1);
  const receipt = await restaurant('stock_receive', { requestId: randomUUID(), vendor: 'Local Dairy', invoiceNumber: 'INV-1', receivedOn: '2027-01-15', lines: [{ variantId: ingredient, qty: 10, unitCostMinor: 1500 }] });
  assert.equal(receipt.ok, true, receipt.reason);
  const recipe = (await restaurant('recipes')).value.items[0];
  assert.equal(recipe.costMinor, 1208, 'supplier receiving updates recipe cost');
  const summary = await executeRestaurant(h.m.ctx, tenant, { operation: 'restaurant_summary', period: 'today' }, h.m.now());
  assert.equal(summary.ok, true, summary.reason);
  assert.equal(summary.value.wasteMinor, 3000);
  assert.equal(summary.value.wasteCount, 1);
  assert.equal(summary.value.stockVarianceMinor, 1000);
  assert.deepEqual([summary.value.theoreticalUsageMinor, summary.value.actualUsageMinor, summary.value.usageVarianceMinor], [2000, null, null]);
  const other = await seedTenant(h.m, { name: 'other-restaurant', sector: 'Restaurant' });
  const otherTenant = { accountId: other.accountId, row: {}, pack: hasibPack('restaurant'), secret: SECRET };
  const foreign = await executeRestaurant(h.m.ctx, otherTenant, { operation: 'waste_create', requestId: randomUUID(), variantId: ingredient, qty: 1, reason: 'spoilage' }, h.m.now());
  assert.equal(foreign.reason, 'invalid_waste');
});
