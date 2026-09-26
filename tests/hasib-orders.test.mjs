// Hasib P1 on the in-memory Convex harness: tenant isolation, idempotency,
// stock invariants, optimistic concurrency, payments and contact deletion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { blueHarness, seedTenant } from './helpers/blue-tenant.mjs';
import { executeHasib } from '../convex/hasib/hasibState.js';
import { SECRET } from './helpers/convex-memory.mjs';

async function setup({ gate = true } = {}) {
  const h = blueHarness();
  await h.enable();
  if (gate) await h.m.db.insert('blueMessagingSettings', { key: 'hasib', enabled: true });
  const a = await seedTenant(h.m, { name: 'a', sector: 'Retail' });
  const b = await seedTenant(h.m, { name: 'b', sector: 'Retail', phone: '9999', waba: '8888', sender: '96890000001' });
  await h.messaging('activate', { sessionHash: a.sessionHash });
  const hasib = (tenant, operation, args = {}) => executeHasib(h.m.ctx, { operation, sessionHash: tenant.sessionHash, hashSecret: SECRET, ...args }, h.m.now());
  return { h, a, b, hasib };
}

async function abaya(hasib, tenant, { onHand = 5, price = 25000, cost = 12000 } = {}) {
  const r = await hasib(tenant, 'item_save', { requestId: randomUUID(), item: { kind: 'product', nameAr: 'عباية سوداء', nameEn: 'Black abaya', category: 'Abayas', unit: 'piece', trackStock: true },
    variants: [{ sku: 'AB-52', options: [{ key: 'size', value: '52' }], priceMinor: price, costMinor: cost, reorderPoint: 2, openingStock: onHand }] });
  assert.equal(r.ok, true, r.reason);
  return { itemId: r.value.item.id, variantId: r.value.variants[0].id };
}
const order = (hasib, tenant, variantId, extra = {}) => hasib(tenant, 'order_create', { requestId: randomUUID(), channel: 'whatsapp', lines: [{ variantId, qty: 1 }], fulfilment: { type: 'pickup' }, ...extra });
const ledger = h => variantId => h.m.table('hasibStockMoves').filter(r => r.variantId === variantId).reduce((n, r) => n + r.delta, 0);
const variant = (h, id) => h.m.table('hasibVariants').find(r => r._id === id);

test('Hasib refuses every operation while its durable gate is off', async () => {
  const { a, hasib } = await setup({ gate: false });
  assert.equal((await hasib(a, 'overview')).reason, 'hasib_unavailable');
  assert.equal((await hasib(a, 'items')).reason, 'hasib_unavailable');
});

test('overview reports the retail pack, VAT off by default and only available modules', async () => {
  const { a, hasib } = await setup();
  const o = (await hasib(a, 'overview')).value;
  assert.equal(o.pack.id, 'retail');
  assert.deepEqual(o.pack.variantOptions.map(v => v.key), ['size', 'length', 'colour']);
  assert.deepEqual(o.modules.sort(), ['demand', 'expenses', 'insights', 'orders', 'stock']);
  assert.equal(o.settings.vatRegistered, false);
  assert.equal(o.settings.stockPolicy, 'warn');
});

test('a second tenant can neither read nor change the first tenant’s items, orders or payments', async () => {
  const { a, b, hasib } = await setup();
  const { itemId, variantId } = await abaya(hasib, a);
  const created = (await order(hasib, a, variantId)).value;
  assert.deepEqual((await hasib(b, 'items')).value.items, []);
  assert.deepEqual((await hasib(b, 'orders')).value.items, []);
  const attempts = [
    ['order', { orderId: created.id }, 'order_not_found'],
    ['order_status', { orderId: created.id, to: 'confirmed', version: created.version }, 'order_not_found'],
    ['payment_record', { requestId: randomUUID(), orderId: created.id, amountMinor: 1000, method: 'cash' }, 'order_not_found'],
    ['item_archive', { itemId }, 'item_not_found'],
    ['stock_move', { requestId: randomUUID(), variantId, delta: 5, reason: 'stock_in' }, 'variant_not_found'],
    ['stock_moves', { variantId }, 'variant_not_found'],
    ['order_create', { requestId: randomUUID(), channel: 'whatsapp', lines: [{ variantId, qty: 1 }], fulfilment: { type: 'pickup' } }, 'variant_not_found'],
  ];
  for (const [op, args, reason] of attempts) assert.equal((await hasib(b, op, args)).reason, reason, op);
  // An id from another table is not an order id, even inside the same tenant.
  assert.equal((await hasib(a, 'order', { orderId: variantId })).reason, 'order_not_found');
});

test('a repeated requestId creates one order, and numbers run per account', async () => {
  const { a, b, hasib } = await setup();
  const { variantId } = await abaya(hasib, a);
  const bv = (await abaya(hasib, b)).variantId;
  const requestId = randomUUID();
  const first = await order(hasib, a, variantId, { requestId });
  const again = await order(hasib, a, variantId, { requestId });
  assert.equal(first.value.id, again.value.id);
  assert.equal(first.value.number, 1);
  assert.equal((await order(hasib, a, variantId)).value.number, 2);
  assert.equal((await order(hasib, b, bv)).value.number, 1);
});

test('confirming takes stock once; cancelling returns it; the ledger always equals on-hand', async () => {
  const { h, a, hasib } = await setup();
  const { variantId } = await abaya(hasib, a, { onHand: 5 });
  let o = (await order(hasib, a, variantId, { lines: [{ variantId, qty: 2 }] })).value;
  assert.equal(variant(h, variantId).onHand, 5, 'pending does not move stock');
  o = (await hasib(a, 'order_status', { orderId: o.id, to: 'confirmed', version: o.version })).value;
  assert.equal(variant(h, variantId).onHand, 3);
  o = (await hasib(a, 'order_status', { orderId: o.id, to: 'ready', version: o.version })).value;
  assert.equal(variant(h, variantId).onHand, 3);
  o = (await hasib(a, 'order_status', { orderId: o.id, to: 'cancelled', version: o.version })).value;
  assert.equal(variant(h, variantId).onHand, 5);
  assert.equal(ledger(h)(variantId), 5);
  assert.equal((await hasib(a, 'order_status', { orderId: o.id, to: 'confirmed', version: o.version })).reason, 'invalid_transition');
});

test('the line keeps the price and cost it was sold at, and confirmed orders snapshot COGS', async () => {
  const { h, a, hasib } = await setup();
  const { variantId } = await abaya(hasib, a, { onHand: 0, cost: 10000 });
  await hasib(a, 'stock_move', { requestId: randomUUID(), variantId, delta: 10, reason: 'stock_in', unitCostMinor: 13000 });
  assert.equal(variant(h, variantId).costMinor, 13000, 'moving average from zero stock');
  await hasib(a, 'stock_move', { requestId: randomUUID(), variantId, delta: 10, reason: 'stock_in', unitCostMinor: 15000 });
  assert.equal(variant(h, variantId).costMinor, 14000);
  const o = (await order(hasib, a, variantId, { confirm: true })).value;
  assert.equal(o.status, 'confirmed');
  assert.equal(o.lines[0].unitCostMinor, 14000);
  await hasib(a, 'item_save', { itemId: o.lines[0].itemId, item: { kind: 'product', nameAr: 'عباية', nameEn: 'Abaya', category: 'Abayas', unit: 'piece', trackStock: true },
    variants: [{ variantId, sku: 'AB-52', options: [{ key: 'size', value: '52' }], priceMinor: 30000, costMinor: 14000, reorderPoint: 2 }] });
  assert.equal((await hasib(a, 'order', { orderId: o.id })).value.lines[0].unitPriceMinor, 25000);
});

test('block policy refuses an oversell and writes nothing; warn allows it and flags the order', async () => {
  const { h, a, hasib } = await setup();
  const { variantId } = await abaya(hasib, a, { onHand: 1 });
  await hasib(a, 'settings_update', { stockPolicy: 'block' });
  const before = h.m.table('hasibOrders').length;
  assert.equal((await order(hasib, a, variantId, { lines: [{ variantId, qty: 2 }], confirm: true })).reason, 'insufficient_stock');
  assert.equal(h.m.table('hasibOrders').length, before);
  assert.equal(variant(h, variantId).onHand, 1);
  await hasib(a, 'settings_update', { stockPolicy: 'warn' });
  const o = (await order(hasib, a, variantId, { lines: [{ variantId, qty: 2 }], confirm: true })).value;
  assert.equal(o.stockShort, true);
  assert.equal(variant(h, variantId).onHand, -1);
  assert.equal(ledger(h)(variantId), -1);
  assert.equal((await hasib(a, 'low_stock')).value.items.length, 1);
});

test('a stale version is refused instead of overwriting a newer change', async () => {
  const { a, hasib } = await setup();
  const { variantId } = await abaya(hasib, a);
  const o = (await order(hasib, a, variantId)).value;
  await hasib(a, 'order_status', { orderId: o.id, to: 'confirmed', version: o.version });
  assert.equal((await hasib(a, 'order_status', { orderId: o.id, to: 'cancelled', version: o.version })).reason, 'order_conflict');
});

test('VAT settings apply at creation and are frozen on the order', async () => {
  const { a, hasib } = await setup();
  const { variantId } = await abaya(hasib, a, { price: 10000 });
  await hasib(a, 'settings_update', { vat: { registered: true, rateBps: 500, pricesIncludeVat: false, vatin: 'OM1100012345' } });
  const o = (await order(hasib, a, variantId, { deliveryFeeMinor: 1000 })).value;
  assert.deepEqual([o.vatMinor, o.totalMinor, o.pricesIncludeVat], [550, 11550, false]);
  await hasib(a, 'settings_update', { vat: { registered: false, rateBps: 500, pricesIncludeVat: false } });
  assert.equal((await hasib(a, 'order', { orderId: o.id })).value.totalMinor, 11550);
});

test('payments are idempotent, move the balance, and refunds cannot exceed what was paid', async () => {
  const { a, hasib } = await setup();
  const { variantId } = await abaya(hasib, a, { price: 25000 });
  const o = (await order(hasib, a, variantId)).value;
  const requestId = randomUUID();
  let r = await hasib(a, 'payment_record', { requestId, orderId: o.id, amountMinor: 10000, method: 'bank_transfer', reference: 'TRX-1' });
  assert.deepEqual([r.value.order.paidMinor, r.value.order.paymentStatus], [10000, 'partial']);
  r = await hasib(a, 'payment_record', { requestId, orderId: o.id, amountMinor: 10000, method: 'bank_transfer' });
  assert.equal(r.value.order.paidMinor, 10000, 'same requestId is recorded once');
  r = await hasib(a, 'payment_record', { requestId: randomUUID(), orderId: o.id, amountMinor: 15000, method: 'cod' });
  assert.equal(r.value.order.paymentStatus, 'paid');
  assert.equal((await hasib(a, 'payment_record', { requestId: randomUUID(), orderId: o.id, amountMinor: -30000, method: 'cash' })).reason, 'refund_exceeds_paid');
  assert.equal((await hasib(a, 'payment_record', { requestId: randomUUID(), orderId: o.id, amountMinor: 0, method: 'cash' })).reason, 'invalid_amount');
  assert.equal((await hasib(a, 'payment_record', { requestId: randomUUID(), orderId: o.id, amountMinor: 5, method: 'bitcoin' })).reason, 'invalid_payment_method');
  const detail = (await hasib(a, 'order', { orderId: o.id })).value;
  assert.equal(detail.payments.length, 2);
});

test('a cancelled order accepts refunds but no new money', async () => {
  const { a, hasib } = await setup();
  const { variantId } = await abaya(hasib, a);
  let o = (await order(hasib, a, variantId)).value;
  await hasib(a, 'payment_record', { requestId: randomUUID(), orderId: o.id, amountMinor: 5000, method: 'cash' });
  o = (await hasib(a, 'order', { orderId: o.id })).value;
  await hasib(a, 'order_status', { orderId: o.id, to: 'cancelled', version: o.version });
  assert.equal((await hasib(a, 'payment_record', { requestId: randomUUID(), orderId: o.id, amountMinor: 1000, method: 'cash' })).reason, 'order_closed');
  assert.equal((await hasib(a, 'payment_record', { requestId: randomUUID(), orderId: o.id, amountMinor: -5000, method: 'cash' })).value.order.paidMinor, 0);
});

test('an order from a chat is prefilled from Layla’s captured fields and linked to the contact', async () => {
  const { h, a, hasib } = await setup();
  await abaya(hasib, a);
  await h.inbound(a, { from: '96891111111', text: 'I want the black abaya', profileName: 'Mariam' });
  const [conversation] = h.m.table('blueConversations').filter(r => r.accountId === a.accountId);
  const [contact] = h.m.table('blueContacts').filter(r => r.accountId === a.accountId);
  await h.m.db.patch(contact._id, { fields: [
    { key: 'item', value: 'Black abaya', source: 'customer', confidence: 1, at: h.m.now() },
    { key: 'quantity', value: '2', source: 'customer', confidence: 1, at: h.m.now() },
    { key: 'fulfilment', value: 'delivery', source: 'customer', confidence: 1, at: h.m.now() },
    { key: 'area', value: 'Al Khuwair', source: 'customer', confidence: 1, at: h.m.now() }] });
  const p = (await hasib(a, 'chat_prefill', { conversationId: conversation._id })).value;
  assert.equal(p.contact.name, 'Mariam');
  assert.equal(p.lines[0].qty, 2);
  assert.equal(p.lines[0].nameEn, 'Black abaya');
  assert.deepEqual(p.fulfilment, { type: 'delivery', area: 'Al Khuwair' });
  const o = (await hasib(a, 'order_create', { requestId: randomUUID(), channel: 'whatsapp', conversationId: conversation._id,
    lines: [{ variantId: p.lines[0].variantId, qty: 2 }], fulfilment: p.fulfilment })).value;
  assert.equal(o.contact.id, contact._id);
  const summary = (await hasib(a, 'contact_summary', { contactId: contact._id })).value;
  assert.deepEqual([summary.orderCount, summary.lifetimeMinor, summary.balanceMinor], [1, 50000, 50000]);
});

test('deleting a contact strips the customer from orders but keeps the amounts', async () => {
  const { h, a, hasib } = await setup();
  const { variantId } = await abaya(hasib, a);
  await h.inbound(a, { from: '96891111111', text: 'Hi', profileName: 'Mariam' });
  const [contact] = h.m.table('blueContacts').filter(r => r.accountId === a.accountId);
  const o = (await order(hasib, a, variantId, { contactId: contact._id, customerName: 'Mariam Al Balushi' })).value;
  await hasib(a, 'payment_record', { requestId: randomUUID(), orderId: o.id, amountMinor: 5000, method: 'bank_transfer', reference: 'Mariam transfer 9123' });
  assert.equal(o.contact.name, 'Mariam');
  assert.equal((await h.dashboard('contact_delete', { sessionHash: a.sessionHash, contactId: contact._id, confirm: true })).ok, true);
  const after = (await hasib(a, 'order', { orderId: o.id })).value;
  assert.equal(after.contact, null);
  assert.equal(after.totalMinor, o.totalMinor);
  assert(!JSON.stringify(h.m.table('hasibOrders')).includes('Mariam'));
  assert(!JSON.stringify(h.m.table('hasibPayments')).includes('Mariam'), 'payment references are scrubbed too');
});

test('custom lines without a product are allowed and never touch stock', async () => {
  const { h, a, hasib } = await setup();
  const { variantId } = await abaya(hasib, a, { onHand: 5 });
  const o = (await hasib(a, 'order_create', { requestId: randomUUID(), channel: 'walk_in', confirm: true, fulfilment: { type: 'in_store' },
    lines: [{ variantId, qty: 1 }, { name: 'Hemming', qty: 1, unitPriceMinor: 2000 }] })).value;
  assert.equal(o.totalMinor, 27000);
  assert.equal(variant(h, variantId).onHand, 4);
  for (const bad of [{ name: '', qty: 1, unitPriceMinor: 1 }, { name: 'x', qty: 1 }, { variantId, qty: 0 }]) {
    assert.equal((await hasib(a, 'order_create', { requestId: randomUUID(), channel: 'walk_in', fulfilment: { type: 'in_store' }, lines: [bad] })).reason, 'invalid_order_lines', JSON.stringify(bad));
  }
});

test('items are searchable and archived items leave the list but keep their history', async () => {
  const { a, hasib } = await setup();
  const { itemId, variantId } = await abaya(hasib, a);
  assert.equal((await hasib(a, 'items', { search: 'abaya' })).value.items.length, 1);
  assert.equal((await hasib(a, 'items', { search: 'عباية' })).value.items.length, 1);
  assert.equal((await hasib(a, 'item_archive', { itemId })).ok, true);
  assert.equal((await hasib(a, 'items')).value.items.length, 0);
  assert.equal((await hasib(a, 'stock_moves', { variantId })).value.items[0].reason, 'opening');
  assert.equal((await order(hasib, a, variantId)).reason, 'variant_not_found');
});

test('a rejected order from a chat writes nothing, not even the contact link', async () => {
  const { h, a, hasib } = await setup();
  const { variantId } = await abaya(hasib, a, { onHand: 0 });
  await hasib(a, 'settings_update', { stockPolicy: 'block' });
  const conversationId = await h.m.db.insert('blueConversations', { key: 'k-new', integrationId: a.integration.id, accountId: a.accountId, number: '96893333333',
    lastInbound: h.m.now(), takeover: false, optout: false, updatedAt: h.m.now() });
  const contactsBefore = h.m.table('blueContacts').length;
  for (const lines of [[{ variantId, qty: 1 }], [{ name: '', qty: 1, unitPriceMinor: 1 }]]) {
    const r = await hasib(a, 'order_create', { requestId: randomUUID(), channel: 'whatsapp', conversationId, confirm: true, lines, fulfilment: { type: 'pickup' } });
    assert.equal(r.ok, false);
  }
  assert.equal(h.m.table('blueContacts').length, contactsBefore);
  assert.equal(h.m.table('blueConversations').find(c => c._id === conversationId).contactId, undefined);
  assert.equal(h.m.table('hasibOrders').length, 0);
});

