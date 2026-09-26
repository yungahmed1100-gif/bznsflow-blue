// Phase 4: the Today home. One call answers "what needs me, what did Layla do,
// how is the money" in the business's own day, plus the setup checklist.
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
  await h.messaging('activate', { sessionHash: a.sessionHash });
  await grantPlan(h.m.ctx, { email: 'a@example.com', plan: 'ascend', packId: pack }, h.m.now());
  const hasib = (operation, args = {}) => executeHasib(h.m.ctx, { operation, sessionHash: a.sessionHash, hashSecret: SECRET, ...args }, h.m.now());
  return { h, a, hasib, today: async () => (await hasib('today')).value };
}
const abaya = (hasib, { s52 = 5, s56 = 1 } = {}) => hasib('item_save', { requestId: randomUUID(), item: { kind: 'product', nameAr: 'عباية سوداء', nameEn: 'Black abaya', category: 'Abayas', unit: 'piece', trackStock: true },
  variants: [{ sku: 'AB-52', options: [{ key: 'size', value: '52' }], priceMinor: 25000, costMinor: 10000, reorderPoint: 1, openingStock: s52 },
    { sku: 'AB-56', options: [{ key: 'size', value: '56' }], priceMinor: 25000, costMinor: 10000, reorderPoint: 1, openingStock: s56 }] });

test('a new shop sees an empty day and what is left to set up', async () => {
  const { today } = await setup();
  const t = await today();
  assert.deepEqual(t.setup, { products: false, photos: false, services: false });
  assert.deepEqual([t.needsYou.ordersCount, t.needsYou.chats, t.needsYou.lowStockCount, t.needsYou.repairsReady], [0, 0, 0, null]);
  assert.deepEqual(t.money, { todayMinor: 0, monthMinor: 0, owedMinor: 0 });
  assert.match(t.date, /^\d{4}-\d{2}-\d{2}$/);
});

test('what Layla did today and what waits for the owner, each with its reason', async () => {
  const { h, a, today } = await setup();
  const hasib = (operation, args = {}) => executeHasib(h.m.ctx, { operation, sessionHash: a.sessionHash, hashSecret: SECRET, ...args }, h.m.now());
  await abaya(hasib, { s52: 5, s56: 1 });
  await h.inbound(a, { from: '96891111111', text: 'I want the black abaya size 52', intent: 'services', reply: 'Great' });
  await h.inbound(a, { from: '96892222222', text: 'I want 3 black abaya size 56', intent: 'services', reply: 'Sure' });
  const t = await today();
  assert.equal(t.layla.ordersConfirmed, 1);
  assert.ok(t.layla.replies >= 2);
  assert.equal(t.layla.productQuestions, 2);
  assert.equal(t.needsYou.ordersCount, 1);
  assert.deepEqual(t.needsYou.orders[0].flags, ['out_of_stock']);
  assert.equal(t.needsYou.lowStockCount, 1);
  assert.deepEqual([t.needsYou.lowStock[0].nameEn, t.needsYou.lowStock[0].options[0].value, t.needsYou.lowStock[0].onHand], ['Black abaya', '56', 1]);
  assert.deepEqual(t.setup, { products: true, photos: false, services: false });
});

test('money in today and this month, and what customers still owe', async () => {
  const { hasib, today } = await setup();
  const [variant] = (await abaya(hasib)).value.variants;
  const order = (await hasib('order_create', { requestId: randomUUID(), channel: 'walk_in', fulfilment: { type: 'pickup' }, lines: [{ variantId: variant.id, qty: 2 }], confirm: true })).value;
  await hasib('payment_record', { requestId: randomUUID(), orderId: order.id, amountMinor: 20000, method: 'cash' });
  const t = await today();
  assert.deepEqual(t.money, { todayMinor: 20000, monthMinor: 20000, owedMinor: 30000 });
});

test('chats handed to the owner count while the customer is still waiting', async () => {
  const { h, a, today } = await setup();
  await h.inbound(a, { from: '96891111111', text: 'Can I talk to a person?', intent: 'human', handoff: true, reply: 'Connecting you' });
  assert.equal((await today()).needsYou.chats, 1);
  h.m.advance(2 * 86400000);
  assert.equal((await today()).needsYou.chats, 0, 'after the 24-hour window it is no longer “waiting”');
});

test('yesterday’s work is not counted as today’s', async () => {
  const { h, a, hasib, today } = await setup();
  await abaya(hasib);
  await h.inbound(a, { from: '96891111111', text: 'I want the black abaya size 52', intent: 'services', reply: 'Great' });
  h.m.advance(86400000);
  const t = await today();
  assert.deepEqual([t.layla.ordersConfirmed, t.layla.replies, t.layla.productQuestions], [0, 0, 0]);
});

test('phone stores also see repairs ready to collect', async () => {
  const { today } = await setup('retail-tech');
  assert.equal((await today()).needsYou.repairsReady, 0);
});
