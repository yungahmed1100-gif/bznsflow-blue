import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { blueHarness, seedTenant } from './helpers/blue-tenant.mjs';
import { SECRET } from './helpers/convex-memory.mjs';
import { hasibPack } from '../config/hasib-packs.js';
import { executeCatalog } from '../convex/hasib/catalogState.js';
import { executeOrders } from '../convex/hasib/ordersState.js';
import { executeRestaurant, restaurantSummary } from '../convex/hasib/restaurantState.js';
import { executeInsights } from '../convex/hasib/insightsState.js';

async function setup() {
  const h = blueHarness();
  await h.enable();
  const t = await seedTenant(h.m, { name: 'cafe', sector: 'Café' });
  const tenant = { accountId: t.accountId, row: {}, pack: hasibPack('cafe'), secret: SECRET };
  const catalog = (operation, args = {}) => executeCatalog(h.m.ctx, tenant, { operation, ...args }, h.m.now());
  const cafe = (operation, args = {}) => executeRestaurant(h.m.ctx, tenant, { operation, ...args }, h.m.now());
  const orders = (operation, args = {}) => executeOrders(h.m.ctx, tenant, { operation, ...args }, h.m.now());
  return { h, tenant, catalog, cafe, orders };
}

const saveItem = (catalog, { nameEn, trackStock, price, cost, stock, options = [] }) => catalog('item_save', {
  requestId: randomUUID(), item: { kind: 'product', nameAr: nameEn, nameEn, category: trackStock ? 'Ingredients' : 'Menu', unit: 'piece', trackStock },
  variants: [{ sku: `${nameEn}-1`, options, priceMinor: price, costMinor: cost, reorderPoint: 2, openingStock: stock }],
});

test('café packs expose simple beverage options and food-service modules', () => {
  const pack = hasibPack('cafe');
  assert.deepEqual(pack.variantOptions.map(v => v.key), ['size', 'temperature']);
  assert.deepEqual(pack.orderFields.map(f => f.key), ['milk_and_extras']);
  assert.equal(pack.modules.recipes, 'available');
  assert.equal(pack.modules.batches, 'available');
  assert.ok(pack.expenseCategories.some(c => c.key === 'aggregator_fees'));
  assert.ok(pack.expenseCategories.some(c => c.key === 'waste'));
});

test('café recipes control ingredient stock and item contribution reporting', async () => {
  const { h, tenant, catalog, cafe, orders } = await setup();
  const beans = (await saveItem(catalog, { nameEn: 'Coffee beans', trackStock: true, price: 0, cost: 1200, stock: 40 })).value.variants[0].id;
  const latte = (await saveItem(catalog, { nameEn: 'Latte', trackStock: false, price: 4500, cost: 0, stock: 0, options: [{ key: 'size', value: 'Regular' }, { key: 'temperature', value: 'Hot' }] })).value.variants[0].id;
  const recipe = await cafe('recipe_save', { menuVariantId: latte, yieldQty: 1, ingredients: [{ variantId: beans, qty: 2, unit: 'piece' }] });
  assert.equal(recipe.ok, true, recipe.reason);
  const order = await orders('order_create', { requestId: randomUUID(), channel: 'walk_in', confirm: true, fulfilment: { type: 'in_store' },
    customFields: [{ key: 'milk_and_extras', value: 'Oat milk' }], lines: [{ variantId: latte, qty: 3 }] });
  assert.equal(order.ok, true, order.reason);
  assert.equal(order.value.lines[0].unitCostMinor, 2400);
  const item = (await catalog('items')).value.items.find(x => x.variants.some(v => v.id === beans));
  assert.equal(item.variants[0].onHand, 34);
  const insights = await executeInsights(h.m.ctx, tenant, { operation: 'insights', period: 'today' }, h.m.now());
  assert.equal(insights.ok, true, insights.reason);
  assert.deepEqual([insights.value.restaurant.foodCogsMinor, insights.value.restaurant.foodRevenueMinor, insights.value.restaurant.foodCostBps], [7200, 13500, 5333]);
  assert.equal(insights.value.restaurant.menu[0].name, 'Latte — Regular / Hot');
  assert.equal(insights.value.restaurant.menu[0].contributionMinor, 6300);
});

test('café waste, receiving and counts remain idempotent and tenant-scoped', async () => {
  const { h, tenant, catalog, cafe } = await setup();
  const milk = (await saveItem(catalog, { nameEn: 'Milk', trackStock: true, price: 0, cost: 1000, stock: 20 })).value.variants[0].id;
  const requestId = randomUUID();
  const waste = await cafe('waste_create', { requestId, variantId: milk, qty: 2, reason: 'expired', note: 'End of day' });
  assert.equal(waste.ok, true, waste.reason);
  assert.deepEqual(await cafe('waste_create', { requestId, variantId: milk, qty: 2, reason: 'expired' }), waste);
  const count = await cafe('stock_count', { requestId: randomUUID(), variantId: milk, countedQty: 17, note: 'Closing count' });
  assert.equal(count.value.varianceQty, -1);
  const receipt = await cafe('stock_receive', { requestId: randomUUID(), vendor: 'Local Dairy', invoiceNumber: 'INV-C-1', receivedOn: '2027-01-15', lines: [{ variantId: milk, qty: 10, unitCostMinor: 1500 }] });
  assert.equal(receipt.ok, true, receipt.reason);
  const summary = await restaurantSummary(h.m.ctx, tenant.accountId, { from: 0, to: h.m.now() + 1 }, { sales: [], figures: {}, expenses: [] });
  assert.equal(summary.wasteMinor, 2000);
  assert.equal(summary.stockVarianceMinor, 1000);
  const other = await seedTenant(h.m, { name: 'other-cafe', sector: 'Café' });
  const foreign = await executeRestaurant(h.m.ctx, { accountId: other.accountId, row: {}, pack: hasibPack('cafe'), secret: SECRET }, { operation: 'waste_create', requestId: randomUUID(), variantId: milk, qty: 1, reason: 'spoilage' }, h.m.now());
  assert.equal(foreign.reason, 'invalid_waste');
});
