// Phase 1 of the autonomous flow: Stock is Layla's source of truth. Products sync
// into Layla's catalog, Layla answers from live stock, and she confirms in-stock
// orders herself — the owner only sees exceptions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { blueHarness, seedTenant } from './helpers/blue-tenant.mjs';
import { SECRET } from './helpers/convex-memory.mjs';
import { executeHasib } from '../convex/hasib/hasibState.js';
import { grantPlan } from '../convex/hasib/plans.js';

async function setup({ pack = 'retail' } = {}) {
  const h = blueHarness();
  await h.enable();
  await h.m.db.insert('blueMessagingSettings', { key: 'hasib', enabled: true });
  const a = await seedTenant(h.m, { name: 'a', sector: 'Technology & software' });
  await h.messaging('activate', { sessionHash: a.sessionHash });
  await grantPlan(h.m.ctx, { email: 'a@example.com', plan: 'ascend', packId: pack }, h.m.now());
  const hasib = (operation, args = {}) => executeHasib(h.m.ctx, { operation, sessionHash: a.sessionHash, hashSecret: SECRET, ...args }, h.m.now());
  return { h, a, hasib };
}
const abaya = async (hasib, { s52 = 5, s56 = 5 } = {}) => (await hasib('item_save', { requestId: randomUUID(),
  item: { kind: 'product', nameAr: 'عباية سوداء', nameEn: 'Black abaya', category: 'Abayas', unit: 'piece', trackStock: true },
  variants: [{ sku: 'AB-52', options: [{ key: 'size', value: '52' }], priceMinor: 25000, costMinor: 10000, reorderPoint: 1, openingStock: s52 },
    { sku: 'AB-56', options: [{ key: 'size', value: '56' }], priceMinor: 25000, costMinor: 10000, reorderPoint: 1, openingStock: s56 }] })).value;
const layla = (h, a) => { const c = h.m.table('blueConversations').find(x => x.accountId === a.accountId); return h.m.table('blueMessages').filter(m => m.conversationId === c?._id && m.direction === 'out' && !m.manual).map(m => m.text); };
const entries = (h, a) => h.m.table('blueCatalogEntries').filter(e => e.ownerKey === String(a.accountId));

test('a stock product appears in Layla’s catalog automatically, stays in sync, and cannot be edited from Services', async () => {
  const { h, a, hasib } = await setup();
  const saved = await abaya(hasib);
  let [entry] = entries(h, a);
  assert.deepEqual([entry.kind, entry.status, entry.source, entry.nameEn, entry.nameAr], ['product', 'approved', 'hasib_stock', 'Black abaya', 'عباية سوداء']);
  assert.equal(entry.prices[0].label, '25.000 OMR');
  const item = h.m.table('hasibItems').find(i => i._id === saved.item.id);
  assert.equal(item.catalogEntryKey, entry.entryKey);
  await hasib('item_save', { itemId: saved.item.id, item: { kind: 'product', nameAr: 'عباية سوداء فاخرة', nameEn: 'Black abaya deluxe', category: 'Abayas', unit: 'piece', trackStock: true },
    variants: saved.variants.map((v, i) => ({ variantId: v.id, sku: v.sku, options: v.options, priceMinor: i ? 32000 : 28000, costMinor: 10000, reorderPoint: 1 })) });
  [entry] = entries(h, a);
  assert.equal(entries(h, a).length, 1, 'updated in place');
  assert.deepEqual([entry.nameEn, entry.prices[0].label], ['Black abaya deluxe', 'From 28.000 OMR']);
  await hasib('item_archive', { itemId: saved.item.id });
  assert.equal(entries(h, a)[0].status, 'archived');
});

test('Layla answers from live stock: sizes in stock and price, replacing her generic reply', async () => {
  const { h, a, hasib } = await setup();
  await abaya(hasib, { s52: 0, s56: 3 });
  await h.inbound(a, { from: '96891111111', text: 'Do you have the black abaya?', intent: 'prices', reply: 'I can confirm the price from the approved business information.' });
  const [reply] = layla(h, a);
  assert.match(reply, /Black abaya — available in 56 · 25\.000 OMR/);
  assert.doesNotMatch(reply, /approved business information/, 'the generic line is replaced');
  assert.equal(h.m.table('hasibDemandSignals').length, 1, 'a price question about a stock product is recorded as demand');
});

test('in Arabic, with the Arabic name; after a greeting the stock line is appended, not replacing it', async () => {
  const { h, a, hasib } = await setup();
  await abaya(hasib);
  await h.inbound(a, { from: '96891111111', text: 'السلام عليكم، عندكم عباية سوداء؟', intent: 'greeting', reply: 'وعليكم السلام، أهلاً بك!' });
  const [reply] = layla(h, a);
  assert.match(reply, /^وعليكم السلام، أهلاً بك!/);
  // Gender-neutral Arabic: "المتوفر" reads correctly for any product name (عباية، آيفون).
  assert.match(reply, /عباية سوداء — المتوفر: 52، 56 · 25\.000 ر\.ع\./);
});

test('out of stock: Layla says so and promises to tell them when it is back', async () => {
  const { h, a, hasib } = await setup();
  await abaya(hasib, { s52: 0, s56: 0 });
  await h.inbound(a, { from: '96891111111', text: 'Is the black abaya available?', intent: 'unknown', reply: 'I don’t have a confirmed answer for that yet.' });
  assert.match(layla(h, a)[0], /Black abaya is out of stock right now — we’ll let you know when it’s back\./);
});

test('an in-stock order is confirmed by Layla herself: stock drops and the customer gets the confirmation', async () => {
  const { h, a, hasib } = await setup();
  const saved = await abaya(hasib);
  await h.inbound(a, { from: '96891111111', text: 'I want the black abaya size 56', intent: 'services', reply: 'Great choice!' });
  const [o] = h.m.table('hasibOrders');
  assert.deepEqual([o.status, o.source], ['confirmed', 'layla']);
  assert.equal(h.m.table('hasibVariants').find(v => v._id === saved.variants[1].id).onHand, 4);
  const reply = layla(h, a).find(t => /Order #/.test(t));
  assert.match(reply, new RegExp(`Order #${o.number} confirmed — 1 × Black abaya \\(56\\), 25\\.000 OMR\\. We’ll message you about delivery or pickup\\.`));
  assert.equal((await hasib('overview')).value.counts.laylaWaiting, 0, 'nothing waits for the owner');
});

test('exceptions wait for the owner with a reason: not enough stock, or size not given', async () => {
  let s = await setup();
  await abaya(s.hasib, { s52: 1, s56: 0 });
  await s.h.inbound(s.a, { from: '96891111111', text: 'I want 3 black abaya size 52', intent: 'services', reply: 'Sure' });
  let [o] = s.h.m.table('hasibOrders');
  assert.equal(o.status, 'pending');
  assert.deepEqual(o.flags, ['out_of_stock']);
  assert.match(layla(s.h, s.a).find(t => /Order #/.test(t)), /received — the team will confirm availability/);

  s = await setup();
  await abaya(s.hasib);
  await s.h.inbound(s.a, { from: '96891111111', text: 'I want the black abaya', intent: 'services', reply: 'Sure' });
  [o] = s.h.m.table('hasibOrders');
  assert.equal(o.status, 'pending');
  assert.deepEqual(o.flags, ['options_unconfirmed']);
});

test('phones: Layla confirms with the oldest unit in stock', async () => {
  const { h, a, hasib } = await setup({ pack: 'retail-tech' });
  const phone = (await hasib('item_save', { requestId: randomUUID(), item: { kind: 'product', nameAr: 'آيفون 15', nameEn: 'iPhone 15', category: 'Phones', unit: 'piece', trackStock: true, serialized: true, warrantyMonths: 12, warrantyBy: 'agent' },
    variants: [{ sku: 'IP15', options: [{ key: 'storage', value: '128GB' }], priceMinor: 320000, costMinor: 280000, reorderPoint: 1 }] })).value.variants[0].id;
  await hasib('stock_move', { requestId: randomUUID(), variantId: phone, delta: 1, reason: 'stock_in', serials: ['111111111111111'] });
  h.m.advance(60000);
  await hasib('stock_move', { requestId: randomUUID(), variantId: phone, delta: 1, reason: 'stock_in', serials: ['222222222222222'] });
  await h.inbound(a, { from: '96891111111', text: 'أبغى آيفون 15', intent: 'services', reply: 'أكيد' });
  const [o] = h.m.table('hasibOrders');
  assert.equal(o.status, 'confirmed');
  assert.deepEqual(o.lines[0].serials, ['111111111111111'], 'first in, first out');
  assert.match(layla(h, a).find(t => /طلبك رقم/.test(t)), /تم تأكيد طلبك رقم/);
});

test('a change after Layla confirmed is flagged for the owner, not turned into a second order', async () => {
  const { h, a, hasib } = await setup();
  await abaya(hasib);
  await h.inbound(a, { from: '96891111111', text: 'I want the black abaya size 56', intent: 'services', reply: 'Great' });
  await h.inbound(a, { from: '96891111111', text: 'actually make it 2 black abaya size 56', intent: 'services', reply: 'Noted' });
  const orders = h.m.table('hasibOrders');
  assert.equal(orders.length, 1);
  assert.deepEqual(orders[0].flags, ['change_requested']);
  assert.equal((await hasib('overview')).value.counts.laylaWaiting, 1, 'the owner sees it');
});
