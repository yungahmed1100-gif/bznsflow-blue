// Layla creates and keeps orders up to date from the chat itself: one open order
// per conversation, acknowledged once, never duplicated, never lost.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { blueHarness, seedTenant } from './helpers/blue-tenant.mjs';
import { SECRET } from './helpers/convex-memory.mjs';
import { executeHasib } from '../convex/hasib/hasibState.js';
import { grantPlan } from '../convex/hasib/plans.js';

async function setup({ sector = 'Technology & software', pack = 'retail', plan = true, gate = true } = {}) {
  const h = blueHarness();
  await h.enable();
  if (gate) await h.m.db.insert('blueMessagingSettings', { key: 'hasib', enabled: true });
  const a = await seedTenant(h.m, { name: 'a', sector });
  await h.messaging('activate', { sessionHash: a.sessionHash });
  if (plan) await grantPlan(h.m.ctx, { email: 'a@example.com', plan: 'ascend', packId: pack }, h.m.now());
  const hasib = (operation, args = {}) => executeHasib(h.m.ctx, { operation, sessionHash: a.sessionHash, hashSecret: SECRET, ...args }, h.m.now());
  return { h, a, hasib };
}
async function abaya(hasib) {
  const r = await hasib('item_save', { requestId: randomUUID(), item: { kind: 'product', nameAr: 'عباية سوداء', nameEn: 'Black abaya', category: 'Abayas', unit: 'piece', trackStock: true },
    variants: [{ sku: 'AB-52', options: [{ key: 'size', value: '52' }], priceMinor: 25000, costMinor: 10000, reorderPoint: 1, openingStock: 5 },
      { sku: 'AB-56', options: [{ key: 'size', value: '56' }], priceMinor: 25000, costMinor: 10000, reorderPoint: 1, openingStock: 5 }] });
  return r.value.variants;
}
const orders = h => h.m.table('hasibOrders');
const replies = (h, conversationId) => h.m.table('blueMessages').filter(m => m.conversationId === conversationId && m.direction === 'out' && !m.manual).map(m => m.text);

test('“I want the black abaya size 56” — in stock, so Layla files and confirms the order herself', async () => {
  const { h, a, hasib } = await setup();
  await abaya(hasib);
  await h.inbound(a, { from: '96891111111', text: 'Hi, I want the black abaya size 56 please', intent: 'catalog_item', reply: 'Lovely choice!', profileName: 'Mariam' });
  const [o] = orders(h);
  assert.equal(orders(h).length, 1);
  assert.deepEqual([o.status, o.source, o.channel, o.lines.length, o.lines[0].qty], ['confirmed', 'layla', 'whatsapp', 1, 1]);
  assert.match(o.lines[0].name, /56/, 'the size named in the chat picks the variant');
  assert.equal(o.flags, undefined, 'the size was named, so nothing to confirm');
  const conversation = h.m.table('blueConversations').find(c => c.accountId === a.accountId);
  assert.equal(o.conversationId, conversation._id);
  assert.ok(o.contactId);
  const [reply] = replies(h, conversation._id);
  assert.match(reply, /Lovely choice!/);
  assert.match(reply, new RegExp(`Order #${o.number} confirmed`));
  const overview = (await hasib('overview')).value;
  assert.equal(overview.counts.laylaWaiting, 0, 'confirmed by Layla: nothing waits for the owner');
  const inChat = (await hasib('conversation_orders', { conversationId: conversation._id })).value.items;
  assert.deepEqual(inChat.map(x => [x.number, x.source, x.status]), [[o.number, 'layla', 'confirmed']]);
});

test('later messages update the same order — quantity, delivery and area — with no second order or acknowledgement', async () => {
  const { h, a, hasib } = await setup();
  await abaya(hasib);
  await h.inbound(a, { from: '96891111111', text: 'أبغى عباية سوداء', intent: 'catalog_item', reply: 'تمام' });
  await h.inbound(a, { from: '96891111111', text: 'make it 2 black abaya please, delivery to Al Khuwair', intent: 'catalog_item', reply: 'Noted' });
  assert.equal(orders(h).length, 1);
  const [o] = orders(h);
  assert.equal(o.lines[0].qty, 2);
  assert.deepEqual(o.flags, ['options_unconfirmed'], 'two sizes and none named: the owner is told to confirm');
  assert.equal(o.fulfilment.type, 'delivery');
  assert.match(o.fulfilment.area || '', /khuwair/i);
  const conversation = h.m.table('blueConversations').find(c => c.accountId === a.accountId);
  const acks = replies(h, conversation._id).filter(t => /Order #|طلبك رقم/.test(t));
  assert.equal(acks.length, 1, 'acknowledged once');
  assert.match(acks[0], /تم استلام طلبك رقم/, 'in the customer’s language');
});

test('a product the shop does not sell creates no order but is still recorded as demand', async () => {
  const { h, a, hasib } = await setup({ sector: 'Retail' });
  await abaya(hasib);
  await h.m.db.insert('blueCatalogEntries', { ownerKey: String(a.accountId), entryKey: randomUUID(), kind: 'product', status: 'approved', nameEn: 'Linen kaftan', nameAr: 'قفطان كتان', category: 'Kaftans',
    benefitEn: '', benefitAr: '', descriptionEn: '', descriptionAr: '', availability: '', prices: [], source: 'owner', confidence: 1, laylaUseEn: '', laylaUseAr: '', revision: 1, sortOrder: 0, createdAt: 0, updatedAt: 0 });
  await h.inbound(a, { from: '96891111111', text: 'I want the linen kaftan', intent: 'catalog_item' });
  assert.equal(orders(h).length, 0);
  assert.equal(h.m.table('hasibDemandSignals').length, 1);
});

test('a question without buying words or a quantity stays a demand signal, not an order', async () => {
  const { h, a, hasib } = await setup({ sector: 'Retail' });
  await abaya(hasib);
  await h.inbound(a, { from: '96891111111', text: 'Do you have the black abaya?', intent: 'availability_request' });
  assert.equal(orders(h).length, 0);
});

test('a taken-over chat still gets its order, but Layla sends nothing', async () => {
  const { h, a, hasib } = await setup();
  await abaya(hasib);
  await h.inbound(a, { from: '96891111111', text: 'Hello' });
  const conversation = h.m.table('blueConversations').find(c => c.accountId === a.accountId);
  await h.messaging('takeover', { sessionHash: a.sessionHash, conversationId: conversation._id });
  const before = replies(h, conversation._id).length;
  await h.inbound(a, { from: '96891111111', text: 'I want 3 black abaya', intent: 'catalog_item', reply: 'Sure' });
  assert.equal(orders(h).length, 1);
  assert.equal(orders(h)[0].lines[0].qty, 3);
  assert.equal(replies(h, conversation._id).length, before, 'no automatic reply in a chat the owner took over');
});

test('nothing is created without Ascend, with the gate off, or when the account has no live pack', async () => {
  for (const options of [{ plan: false }, { gate: false }]) {
    const { h, a } = await setup(options);
    await h.inbound(a, { from: '96891111111', text: 'I want the black abaya', intent: 'catalog_item' });
    assert.equal(orders(h).length, 0, JSON.stringify(options));
  }
  const { h, a } = await setup({ sector: 'Real estate', pack: undefined });
  await h.inbound(a, { from: '96891111111', text: 'I want the black abaya', intent: 'catalog_item' });
  assert.equal(orders(h).length, 0, 'no live pack chosen');
});

test('IMEI products out of stock: Layla files a draft; once units arrive, confirming needs the IMEIs and sells them', async () => {
  const { h, a, hasib } = await setup({ pack: 'retail-tech' });
  const phone = (await hasib('item_save', { requestId: randomUUID(), item: { kind: 'product', nameAr: 'آيفون 15', nameEn: 'iPhone 15', category: 'Phones', unit: 'piece', trackStock: true, serialized: true, warrantyMonths: 12, warrantyBy: 'agent' },
    variants: [{ sku: 'IP15', options: [{ key: 'storage', value: '128GB' }], priceMinor: 320000, costMinor: 280000, reorderPoint: 1 }] })).value.variants[0].id;
  await h.inbound(a, { from: '96891111111', text: 'أبغى آيفون 15', intent: 'catalog_item', reply: 'أكيد' });
  let [o] = orders(h);
  assert.deepEqual([o.status, o.lines[0].serialized, o.lines[0].serials, o.flags], ['pending', true, undefined, ['out_of_stock']]);
  await hasib('stock_move', { requestId: randomUUID(), variantId: phone, delta: 2, reason: 'stock_in', serials: ['111111111111111', '222222222222222'] });
  [o] = orders(h);
  assert.equal((await hasib('order_status', { orderId: o._id, to: 'confirmed', version: o.version })).reason, 'serials_required');
  const confirmed = (await hasib('order_status', { orderId: o._id, to: 'confirmed', version: o.version, lineSerials: [{ variantId: phone, serials: ['222222222222222'] }] })).value;
  assert.equal(confirmed.status, 'confirmed');
  assert.deepEqual(confirmed.lines[0].serials, ['222222222222222']);
  assert.equal(h.m.table('hasibSerials').find(s => s.serial === '222222222222222').status, 'sold');
  assert.equal(h.m.table('hasibVariants').find(v => v._id === phone).onHand, 1);
});

test('a failure while capturing an order never stops Layla replying', async () => {
  const { h, a, hasib } = await setup();
  await abaya(hasib);
  const original = h.m.db.query.bind(h.m.db);
  h.m.db.query = table => { if (table === 'hasibOrders') throw new Error('boom'); return original(table); };
  const logged = [], error = console.error;
  console.error = (...args) => logged.push(args.join(' '));
  try { assert.equal((await h.inbound(a, { from: '96891111111', text: 'I want the black abaya', intent: 'catalog_item', reply: 'Still here' })).ok, true); }
  finally { h.m.db.query = original; console.error = error; }
  assert.ok(logged.some(l => l.includes('hasib_order_failed')));
  assert.ok(h.m.table('blueMessages').some(m => m.direction === 'out' && /Still here/.test(m.text || '')));
});
