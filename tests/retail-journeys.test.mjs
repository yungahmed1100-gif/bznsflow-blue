// Retail is the abaya boutique pack on Ascend: orders, stock, money, product
// requests, follow-ups and a team. These journeys run the real Convex state code
// for a retail manager and an invited employee, and pin down what each may do.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { blueHarness, seedTenant } from './helpers/blue-tenant.mjs';
import { SECRET } from './helpers/convex-memory.mjs';
import { executeHasib } from '../convex/hasib/hasibState.js';
import { grantPlan } from '../convex/hasib/plans.js';
import { capabilitiesFor } from '../convex/hasib/capabilities.js';
import { dashboardMap } from '../src/lib/dashboard/navigation.js';

const value = r => { assert.equal(r.ok, true, r.reason); return r.value; };

async function boutique() {
  const h = blueHarness();
  await h.enable();
  await h.m.db.insert('blueMessagingSettings', { key: 'hasib', enabled: true });
  const a = await seedTenant(h.m, { name: 'a', sector: 'Retail' });
  await h.messaging('activate', { sessionHash: a.sessionHash });
  value(await grantPlan(h.m.ctx, { email: 'a@example.com', plan: 'ascend', packId: 'retail' }, h.m.now()));
  const as = actorAccountId => (operation, args = {}) => executeHasib(h.m.ctx, { operation, sessionHash: a.sessionHash, hashSecret: SECRET, ...(actorAccountId ? { actorAccountId } : {}), ...args }, h.m.now());
  const manager = as(null);
  // An invited employee, active in the manager's workspace.
  const team = value(await manager('team_invite', { email: 'staff@example.com' }));
  const employeeId = await h.m.db.insert('accounts', { email: 'staff@example.com', role: 'customer', createdAt: h.m.now() });
  await h.m.db.patch(team.id, { accountId: employeeId, status: 'active', activatedAt: h.m.now() });
  return { h, a, manager, employee: as(employeeId), employeeId };
}

async function abaya(run, { onHand = 5, price = 25000, cost = 12000 } = {}) {
  const r = value(await run('item_save', { requestId: randomUUID(), item: { kind: 'product', nameAr: 'عباية سوداء', nameEn: 'Black abaya', category: 'Abayas', unit: 'piece', trackStock: true },
    variants: [{ sku: `AB-${randomUUID().slice(0, 6)}`, options: [{ key: 'size', value: '52' }, { key: 'colour', value: 'Black' }], priceMinor: price, costMinor: cost, reorderPoint: 1, openingStock: onHand }] }));
  return { itemId: r.item.id, variantId: r.variants[0].id, item: r.item };
}
const newOrder = (run, variantId, extra = {}) => run('order_create', { requestId: randomUUID(), channel: 'whatsapp', lines: [{ variantId, qty: 1 }], fulfilment: { type: 'delivery', area: 'Seeb' }, ...extra });
const onHand = (h, id) => h.m.table('hasibVariants').find(v => v._id === id).onHand;
const step = async (run, order, to, extra = {}) => value(await run('order_status', { orderId: order.id, to, version: order.version, ...extra }));
async function contact(h, a, name = 'Aisha') {
  await h.inbound(a, { from: `9689${Math.floor(Math.random() * 1e7)}`, text: 'Do you have size 52?', profileName: name });
  return (await h.dashboard('contacts', { sessionHash: a.sessionHash })).value.items[0];
}

test('retail on Ascend: the manager sees Today, Orders, Stock, Money, Customers, Team and Settings', async () => {
  const { manager } = await boutique();
  const o = value(await manager('overview'));
  assert.equal(o.pack.id, 'retail');
  assert.equal(o.workspaceRole, 'manager');
  const map = dashboardMap(o, o.capabilities);
  assert.deepEqual(map.sections, ['today', 'chats', 'orders', 'stock', 'money', 'customers', 'team', 'settings']);
});

test('an employee sees no Money, Team or Settings, even before the Hasib overview has loaded', async () => {
  const { employee } = await boutique();
  const o = value(await employee('overview'));
  assert.equal(o.workspaceRole, 'employee');
  const map = dashboardMap(o, o.capabilities);
  assert.deepEqual(map.sections, ['today', 'chats', 'orders', 'stock', 'customers']);
  const early = dashboardMap(null, capabilitiesFor('ascend', 'employee'), 'employee');
  assert.ok(!early.sections.includes('settings'), 'Settings never flashes for an employee');
});

test('a delivery order moves stock once, and a delivered order can fill the size a customer asked for', async () => {
  const { h, a, manager } = await boutique();
  const { variantId } = await abaya(manager, { onHand: 0 });
  const who = await contact(h, a);
  const request = value(await manager('product_request_create', { requestId: randomUUID(), workflow: { contactId: who.id, variantId, qty: 1 } }));
  value(await manager('stock_move', { requestId: randomUUID(), variantId, reason: 'stock_in', delta: 3 }));
  let order = value(await newOrder(manager, variantId, { contactId: who.id }));
  order = await step(manager, order, 'confirmed');
  assert.equal(onHand(h, variantId), 2);
  order = await step(manager, order, 'out_for_delivery');
  order = await step(manager, order, 'delivered');
  assert.equal(onHand(h, variantId), 2, 'delivery does not move stock again');
  const filled = value(await manager('product_request_status', { productRequestId: request.id, version: request.version, workflow: { status: 'fulfilled', orderId: order.id } }));
  assert.equal(filled.status, 'fulfilled');
  order = await step(manager, order, 'returned');
  assert.equal(onHand(h, variantId), 3, 'a return puts the piece back');
});

test('cancelling a confirmed order returns its stock and records who did it', async () => {
  const { h, manager, employee, employeeId } = await boutique();
  const { variantId } = await abaya(manager);
  let order = value(await newOrder(employee, variantId, { confirm: true }));
  assert.equal(onHand(h, variantId), 4);
  order = await step(employee, order, 'cancelled');
  assert.equal(onHand(h, variantId), 5);
  const log = h.m.table('ascendActivity').filter(r => r.entityId === String(order.id));
  assert.equal(log.length, 1);
  assert.equal(log[0].action, 'order_cancelled');
  assert.equal(String(log[0].actorAccountId), String(employeeId));
  assert.equal(log[0].actorRole, 'employee');
});

test('stock adjustments, archives and refunds are logged once each, even when the request is retried', async () => {
  const { h, manager } = await boutique();
  const { itemId, variantId } = await abaya(manager);
  const move = { requestId: randomUUID(), variantId, reason: 'damage', delta: -1, note: 'Torn hem' };
  value(await manager('stock_move', move));
  value(await manager('stock_move', move));
  let order = value(await newOrder(manager, variantId, { confirm: true }));
  const pay = { requestId: randomUUID(), orderId: order.id, amountMinor: 25000, method: 'cash' };
  value(await manager('payment_record', pay));
  const refund = { requestId: randomUUID(), orderId: order.id, amountMinor: -5000, method: 'cash' };
  value(await manager('payment_record', refund));
  value(await manager('payment_record', refund));
  value(await manager('item_archive', { itemId }));
  const actions = h.m.table('ascendActivity').map(r => r.action).filter(x => x !== 'team_invited').sort();
  assert.deepEqual(actions, ['item_archived', 'payment_refunded', 'stock_adjusted']);
});

test('a pending order cannot be confirmed once its product has been archived', async () => {
  const { h, manager } = await boutique();
  const { itemId, variantId } = await abaya(manager);
  const order = value(await newOrder(manager, variantId));
  value(await manager('item_archive', { itemId }));
  assert.equal((await manager('order_status', { orderId: order.id, to: 'confirmed', version: order.version })).reason, 'item_archived');
  assert.equal(onHand(h, variantId), 5);
});

test('a payment cannot exceed what is still owed on the order', async () => {
  const { manager } = await boutique();
  const { variantId } = await abaya(manager);
  const order = value(await newOrder(manager, variantId, { confirm: true }));
  assert.equal((await manager('payment_record', { requestId: randomUUID(), orderId: order.id, amountMinor: 30000, method: 'cash' })).reason, 'payment_exceeds_balance');
  const paid = value(await manager('payment_record', { requestId: randomUUID(), orderId: order.id, amountMinor: 25000, method: 'cash' }));
  assert.equal(paid.order.paymentStatus, 'paid');
});

test('stock tracking cannot be switched off while pieces are on the shelf', async () => {
  const { manager } = await boutique();
  const { itemId, item } = await abaya(manager);
  const v = item.variants[0];
  const edit = { itemId, item: { kind: 'product', nameAr: item.nameAr, nameEn: item.nameEn, category: item.category, unit: 'piece', trackStock: false },
    variants: [{ variantId: v.id, sku: v.sku, options: v.options, priceMinor: v.priceMinor, costMinor: v.costMinor, reorderPoint: v.reorderPoint }] };
  assert.equal((await manager('item_save', edit)).reason, 'item_has_stock');
  assert.equal((await manager('item_save', { ...edit, item: { ...edit.item, kind: 'service' } })).reason, 'item_has_stock');
});

test('an employee sells, takes payment and adjusts stock, but never sees costs or cash, and cannot change prices or refund', async () => {
  const { h, manager, employee } = await boutique();
  const { itemId, variantId, item } = await abaya(manager);
  const listed = value(await employee('items')).items[0].variants[0];
  assert.equal(listed.priceMinor, 25000, 'the selling price is visible');
  assert.equal(listed.costMinor, undefined, 'the cost price is not');

  let order = value(await newOrder(employee, variantId, { lines: [{ variantId, qty: 1, unitPriceMinor: 25000 }] }));
  order = await step(employee, order, 'confirmed');
  const detail = value(await employee('order', { orderId: order.id }));
  assert.equal(detail.lines[0].unitCostMinor, undefined);
  assert.equal(detail.operationalCostMinor, undefined);
  value(await employee('payment_record', { requestId: randomUUID(), orderId: order.id, amountMinor: 10000, method: 'card' }));
  value(await employee('stock_move', { requestId: randomUUID(), variantId, reason: 'stock_in', delta: 2, unitCostMinor: 1 }));
  assert.equal(h.m.table('hasibStockMoves').filter(m => m.variantId === variantId && m.reason === 'stock_in').at(-1).unitCostMinor, undefined, 'an employee receipt never sets the cost');

  const today = value(await employee('today'));
  assert.equal(today.money, null, 'cash today, this month and owed are manager-only');

  const refused = [
    ['payment_record', { requestId: randomUUID(), orderId: order.id, amountMinor: -1000, method: 'card' }],
    ['order_create', { requestId: randomUUID(), channel: 'walk_in', lines: [{ variantId, qty: 1, unitPriceMinor: 20000 }], fulfilment: { type: 'pickup' } }],
    ['order_create', { requestId: randomUUID(), channel: 'walk_in', lines: [{ variantId, qty: 1, discountMinor: 1000 }], fulfilment: { type: 'pickup' } }],
    ['order_create', { requestId: randomUUID(), channel: 'walk_in', lines: [{ name: 'Alteration', qty: 1, unitPriceMinor: 3000 }], fulfilment: { type: 'pickup' } }],
    ['item_save', { itemId, item: { kind: 'product', nameAr: item.nameAr, nameEn: item.nameEn, category: item.category, unit: 'piece', trackStock: true },
      variants: [{ variantId, sku: item.variants[0].sku, options: item.variants[0].options, priceMinor: 19000, reorderPoint: 1 }] }],
    ['item_save', { requestId: randomUUID(), item: { kind: 'product', nameEn: 'Staff-priced abaya', category: 'Abayas', unit: 'piece', trackStock: true }, variants: [{ options: [{ key: 'size', value: '52' }], priceMinor: 1000, openingStock: 1 }] }],
    ['item_save', { itemId, item: { kind: 'product', nameAr: item.nameAr, nameEn: item.nameEn, category: item.category, unit: 'piece', trackStock: true },
      variants: [{ variantId, sku: item.variants[0].sku, options: item.variants[0].options, priceMinor: 25000, reorderPoint: 1 }, { options: [{ key: 'size', value: '60' }], priceMinor: 100 }] }],
    ['items_import', { products: [{ requestId: randomUUID(), item: { kind: 'product', nameEn: 'Shayla', trackStock: true }, variants: [{ priceMinor: 5000 }] }] }],
    ['expense_create', { requestId: randomUUID(), category: 'rent', amountMinor: 1000, paidOn: '2026-09-01' }],
    ['insights', { period: 'month' }],
    ['team_list', {}],
  ];
  for (const [operation, args] of refused) assert.equal((await employee(operation, args)).reason, 'manager_required', operation);

  // An employee edit that leaves the price alone keeps the manager's cost untouched.
  value(await employee('item_save', { itemId, item: { kind: 'product', nameAr: item.nameAr, nameEn: 'Black abaya (crepe)', category: item.category, unit: 'piece', trackStock: true },
    variants: [{ variantId, sku: item.variants[0].sku, options: item.variants[0].options, priceMinor: 25000, reorderPoint: 2 }] }));
  const stored = h.m.table('hasibVariants').find(v => v._id === variantId);
  assert.equal(stored.costMinor, 12000);
  assert.equal(stored.costKnown, true);
});

test('Today counts this period’s sales even when the shop has thousands of older orders', async () => {
  const { h, a, manager } = await boutique();
  const { variantId } = await abaya(manager, { onHand: 20 });
  const accountId = h.m.table('accounts').find(r => r.email === 'a@example.com')._id;
  const old = h.m.now() - 90 * 86400000;
  for (let i = 0; i < 3005; i++) {
    await h.m.db.insert('hasibOrders', { accountId, number: i + 1, status: 'completed', channel: 'walk_in', lines: [{ variantId: 'old', name: 'Old stock', qty: 1, unitPriceMinor: 1000 }],
      subtotalMinor: 1000, discountMinor: 0, deliveryMinor: 0, vatMinor: 0, totalMinor: 1000, paidMinor: 1000, paymentStatus: 'paid', fulfilment: { type: 'pickup' }, customFields: [], history: [], version: 1, createdAt: old + i, updatedAt: old + i });
  }
  const sale = value(await newOrder(manager, variantId, { confirm: true, lines: [{ variantId, qty: 2 }] }));
  const today = value(await manager('today'));
  const best = today.industryMetrics.find(m => m.id === 'best_variant');
  assert.equal(best.value, 2, 'a confirmed sale today counts, older orders do not crowd it out');
  assert.match(best.detail, /عباية/);
  assert.ok(sale.id);
  void a;
});

test('deleting a customer closes their waiting product requests and removes their follow-up notes', async () => {
  const { h, a, manager } = await boutique();
  const { variantId } = await abaya(manager, { onHand: 0 });
  const who = await contact(h, a, 'Maryam');
  value(await manager('product_request_create', { requestId: randomUUID(), workflow: { contactId: who.id, variantId, qty: 1 } }));
  value(await manager('followup_save', { requestId: randomUUID(), contactId: who.id, dueAt: h.m.now() + 86400000, reason: 'Call Maryam about her 54 length' }));
  assert.equal((await h.dashboard('contact_delete', { sessionHash: a.sessionHash, contactId: who.id, confirm: true })).ok, true);
  assert.deepEqual(h.m.table('hasibProductRequests').map(r => r.status), ['cancelled']);
  assert.equal(h.m.table('hasibFollowups').length, 0, 'a note that names the person goes with them');
  assert.equal((await manager('product_request_create', { requestId: randomUUID(), workflow: { contactId: who.id, variantId, qty: 1 } })).reason, 'contact_not_found');
});

test('a retail manager invites, resends and revokes staff', async () => {
  const { manager } = await boutique();
  const invited = value(await manager('team_invite', { email: 'second@example.com' }));
  const resent = value(await manager('team_resend', { memberId: invited.id }));
  assert.ok(resent.resentAt);
  const revoked = value(await manager('team_revoke', { memberId: invited.id }));
  assert.equal(revoked.status, 'revoked');
  const list = value(await manager('team_list'));
  assert.equal(list.members.length, 2);
});

// Codes the retail dashboard can receive from Hasib or its API wrapper.
const RETAIL_CODES = ['module_unavailable', 'invalid_request', 'order_not_found', 'order_locked', 'invalid_order', 'invalid_payment_method', 'invalid_stock_move', 'invalid_quantity',
  'request_conflict', 'request_not_found', 'order_not_reversed', 'followup_conflict', 'followup_not_found', 'invalid_followup', 'linked_record_not_found', 'expense_not_found', 'invalid_settings',
  'team_limit', 'member_not_found', 'member_not_pending', 'employee_already_member', 'employee_owns_workspace', 'invalid_email', 'industry_profile_required', 'invite_send_failed', 'invalid_cursor',
  'item_archived', 'payment_exceeds_balance', 'item_has_stock', 'contact_not_found', 'invalid_transition', 'order_conflict', 'insufficient_stock', 'manager_required', 'plan_required',
  'workspace_access_revoked', 'record_not_found', 'invalid_item', 'variant_not_found', 'photo_limit', 'invalid_photo', 'invalid_import', 'exact_variant_required', 'order_closed', 'refund_exceeds_paid'];

test('every refusal a retail owner or employee can meet has its own message in English and Arabic', async () => {
  const { createStrings } = await import('../src/lib/dashboard/strings.js');
  const { createHasibStrings } = await import('../src/lib/hasib/strings.js');
  for (const lang of ['en', 'ar']) {
    const s = createStrings(lang), h = createHasibStrings(lang), generic = s.reason('__unknown__');
    for (const code of RETAIL_CODES) {
      const message = h.reason(code) || s.reason(code);
      assert.ok(message && message !== generic, `${lang}: ${code}`);
    }
  }
});

test('an employee of an electronics shop never receives the profit-per-device measure on Today', async () => {
  const { h, manager, employee } = await boutique();
  value(await manager('settings_update', { packId: 'retail-tech' }));
  const own = value(await manager('today')).industryMetrics.find(m => m.id === 'device_profit');
  assert.equal(own.format, 'money');
  const staff = value(await employee('today')).industryMetrics.find(m => m.id === 'device_profit');
  assert.equal(staff.value, null);
  void h;
});
