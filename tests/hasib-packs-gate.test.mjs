// Sectors ship one by one. Only live packs (retail today) open Hasib; an owner
// whose Layla sector is not live picks a Hasib industry without touching Layla.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { blueHarness, seedTenant } from './helpers/blue-tenant.mjs';
import { SECRET } from './helpers/convex-memory.mjs';
import { executeHasib } from '../convex/hasib/hasibState.js';
import { grantPlan } from '../convex/hasib/plans.js';
import { HASIB_LIVE_PACKS, isLivePack, industryCatalog } from '../config/hasib-packs.js';

async function setup(sector) {
  const h = blueHarness();
  await h.enable();
  await h.m.db.insert('blueMessagingSettings', { key: 'hasib', enabled: true });
  const t = await seedTenant(h.m, { name: 'a', sector });
  await grantPlan(h.m.ctx, { email: 'a@example.com', plan: 'ascend' }, h.m.now());
  const hasib = (operation, args = {}) => executeHasib(h.m.ctx, { operation, sessionHash: t.sessionHash, hashSecret: SECRET, ...args }, h.m.now());
  return { h, t, hasib };
}
const layllaSector = (h, t) => h.m.table('blueReviewSessions').find(r => r._id === t.rowId).profile.sector;

test('only the finished packs are live', () => {
  assert.deepEqual(HASIB_LIVE_PACKS, ['retail', 'retail-tech', 'dental']);
  assert.equal(isLivePack('retail'), true);
  assert.equal(isLivePack('clinic'), false);
  assert.equal(isLivePack('nope'), false);
});

test('a business whose Layla sector is not live sees setup, and nothing else works', async () => {
  const { hasib } = await setup('Real estate');
  const o = (await hasib('overview')).value;
  assert.equal(o.setupRequired, true);
  assert.deepEqual(o.modules, []);
  assert.deepEqual(o.livePacks.map(p => p.id), ['retail', 'retail-tech', 'dental']);
  assert.ok(o.livePacks[0].en && o.livePacks[0].ar);
  for (const [op, args] of [['items', {}], ['orders', {}], ['insights', { period: 'today' }], ['expenses', { period: 'month' }],
    ['order_create', { requestId: randomUUID(), channel: 'walk_in', fulfilment: { type: 'in_store' }, lines: [{ name: 'x', qty: 1, unitPriceMinor: 1 }] }]]) {
    assert.equal((await hasib(op, args)).reason, 'pack_not_live', op);
  }
});

test('choosing Retail in Hasib unlocks the retail setup and leaves Layla’s sector alone', async () => {
  const { h, t, hasib } = await setup('Real estate');
  assert.equal((await hasib('settings_update', { packId: 'clinic' })).reason, 'pack_not_live');
  assert.equal((await hasib('settings_update', { packId: 'made-up' })).reason, 'pack_not_live');
  assert.equal((await hasib('settings_update', { packId: 'retail' })).ok, true);
  const o = (await hasib('overview')).value;
  assert.equal(o.setupRequired, false);
  assert.equal(o.pack.id, 'retail');
  assert.deepEqual(o.pack.variantOptions.map(v => v.key), ['size', 'length', 'colour']);
  assert.ok(o.pack.orderFields.some(f => f.key === 'measurements'));
  assert.deepEqual([...o.modules].sort(), ['demand', 'expenses', 'insights', 'orders', 'stock']);
  assert.equal((await hasib('items')).ok, true);
  // Retail expense categories and order fields apply because the Hasib pack says so.
  assert.equal((await hasib('expense_create', { requestId: randomUUID(), category: 'stock_purchase', amountMinor: 1000, method: 'cash', paidOn: '2027-01-15' })).ok, true);
  const order = await hasib('order_create', { requestId: randomUUID(), channel: 'walk_in', fulfilment: { type: 'in_store' }, lines: [{ name: 'Hemming', qty: 1, unitPriceMinor: 2000 }],
    customFields: [{ key: 'measurements', value: '56/58' }] });
  assert.equal(order.ok, true, order.reason);
  assert.equal(layllaSector(h, t), 'Real estate', 'Layla keeps her own sector');
});

test('a VAT-only settings save keeps the chosen industry', async () => {
  const { hasib } = await setup('Real estate');
  await hasib('settings_update', { packId: 'retail' });
  await hasib('settings_update', { vat: { registered: true, rateBps: 500, pricesIncludeVat: false } });
  const o = (await hasib('overview')).value;
  assert.equal(o.pack.id, 'retail');
  assert.equal(o.settings.vatRegistered, true);
});

test('a retail business needs no setup', async () => {
  const { hasib } = await setup('Retail');
  const o = (await hasib('overview')).value;
  assert.equal(o.setupRequired, false);
  assert.equal(o.pack.id, 'retail');
});

test('the industry list shows finished packs first and the rest as coming soon', async () => {
  const list = industryCatalog();
  assert.deepEqual(list.filter(i => i.live).map(i => i.id), ['retail', 'retail-tech', 'dental']);
  assert.ok(list.length > 8, 'the roadmap is visible');
  for (const i of list) assert.ok(i.id && i.en && i.ar && typeof i.live === 'boolean', i.id);
  assert.equal(list.findIndex(i => !i.live), list.filter(i => i.live).length, 'live industries come first');
  const { hasib } = await setup('Retail');
  const o = (await hasib('overview')).value;
  assert.deepEqual(o.industries, list);
  assert.equal((await hasib('settings_update', { packId: 'clinic' })).reason, 'pack_not_live', 'coming-soon industries cannot be chosen yet');
  const pending = (await setup('Real estate')).hasib;
  assert.deepEqual((await pending('overview')).value.industries, list, 'the setup screen gets the same list');
});

