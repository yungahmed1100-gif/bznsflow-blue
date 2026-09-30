// Retail-tech is the phone and electronics store pack on Ascend: IMEI stock,
// repairs, trade-ins and warranty. These journeys run the real Convex state code
// for a manager and an invited employee, and pin down what each may do.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { blueHarness, seedTenant } from './helpers/blue-tenant.mjs';
import { SECRET } from './helpers/convex-memory.mjs';
import { executeHasib } from '../convex/hasib/hasibState.js';
import { grantPlan } from '../convex/hasib/plans.js';
import { dashboardMap } from '../src/lib/dashboard/navigation.js';

const DAY = 86400000;
const value = r => { assert.equal(r.ok, true, r.reason); return r.value; };

async function shop() {
  const h = blueHarness();
  await h.enable();
  await h.m.db.insert('blueMessagingSettings', { key: 'hasib', enabled: true });
  const a = await seedTenant(h.m, { name: 'a', sector: 'Retail' });
  await h.messaging('activate', { sessionHash: a.sessionHash });
  value(await grantPlan(h.m.ctx, { email: 'a@example.com', plan: 'ascend', packId: 'retail-tech' }, h.m.now()));
  const as = actorAccountId => (operation, args = {}) => executeHasib(h.m.ctx, { operation, sessionHash: a.sessionHash, hashSecret: SECRET, ...(actorAccountId ? { actorAccountId } : {}), ...args }, h.m.now());
  const manager = as(null);
  const member = value(await manager('team_invite', { email: 'tech@example.com' }));
  const employeeId = await h.m.db.insert('accounts', { email: 'tech@example.com', role: 'customer', createdAt: h.m.now() });
  await h.m.db.patch(member.id, { accountId: employeeId, status: 'active', activatedAt: h.m.now() });
  return { h, a, manager, employee: as(employeeId), employeeId };
}

async function phone(run, { warrantyMonths = 12, warrantyBy = 'store', price = 320000, cost = 280000, sku = `IP-${randomUUID().slice(0, 6)}` } = {}) {
  const r = value(await run('item_save', { requestId: randomUUID(), item: { kind: 'product', nameAr: 'آيفون 15', nameEn: 'iPhone 15', category: 'Phones', unit: 'piece', trackStock: true, serialized: true, warrantyMonths, warrantyBy },
    variants: [{ sku, options: [{ key: 'storage', value: '128GB' }], priceMinor: price, costMinor: cost, reorderPoint: 1 }] }));
  return { itemId: r.item.id, variantId: r.variants[0].id, item: r.item };
}
async function part(run) {
  return value(await run('item_save', { requestId: randomUUID(), item: { kind: 'product', nameAr: 'شاشة', nameEn: 'Screen', category: 'Parts', unit: 'piece', trackStock: true },
    variants: [{ sku: `PRT-${randomUUID().slice(0, 6)}`, options: [], priceMinor: 30000, costMinor: 18000, reorderPoint: 1, openingStock: 5 }] })).variants[0].id;
}
const receive = (run, variantId, serials) => run('stock_move', { requestId: randomUUID(), variantId, delta: serials.length, reason: 'stock_in', serials, unitCostMinor: 280000 });
const sell = (run, variantId, serials, extra = {}) => run('order_create', { requestId: randomUUID(), channel: 'walk_in', fulfilment: { type: 'in_store' }, lines: [{ variantId, qty: serials.length, serials }], ...extra });
const serialRow = (h, serial) => h.m.table('hasibSerials').find(s => s.serial === serial);
const onHand = (h, id) => h.m.table('hasibVariants').find(v => v._id === id).onHand;
const inStock = (h, id) => h.m.table('hasibSerials').filter(s => s.variantId === id && s.status === 'in_stock').length;
const status = async (run, order, to, extra = {}) => value(await run('order_status', { orderId: order.id, to, version: order.version, ...extra }));
const move = async (run, repair, to) => value(await run('repair_status', { repairId: repair.id, to, version: repair.version }));

test('retail-tech on Ascend: the manager sees Service and Team; an employee sees no Money, Team or Settings', async () => {
  const { manager, employee } = await shop();
  const o = value(await manager('overview'));
  assert.deepEqual(dashboardMap(o, o.capabilities).sections, ['today', 'chats', 'orders', 'stock', 'service', 'money', 'customers', 'team', 'settings']);
  const e = value(await employee('overview'));
  assert.deepEqual(dashboardMap(e, e.capabilities).sections, ['today', 'chats', 'orders', 'stock', 'service', 'customers']);
});

test('a sold phone that is returned goes back in stock, and on-hand always equals the IMEIs in stock', async () => {
  const { h, manager } = await shop();
  const { variantId } = await phone(manager);
  value(await receive(manager, variantId, ['111111111111111', '222222222222222']));
  let order = value(await sell(manager, variantId, ['111111111111111'], { confirm: true }));
  assert.equal(serialRow(h, '111111111111111').status, 'sold');
  order = await status(manager, order, 'completed');
  await status(manager, order, 'returned');
  assert.equal(serialRow(h, '111111111111111').status, 'in_stock');
  assert.equal(onHand(h, variantId), 2);
  assert.equal(inStock(h, variantId), 2);
});

test('one order cannot list the same IMEI product on two lines', async () => {
  const { manager } = await shop();
  const { variantId } = await phone(manager);
  value(await receive(manager, variantId, ['333333333333331', '333333333333332']));
  const r = await manager('order_create', { requestId: randomUUID(), channel: 'walk_in', fulfilment: { type: 'in_store' },
    lines: [{ variantId, qty: 1, serials: ['333333333333331'] }, { variantId, qty: 1, serials: ['333333333333332'] }] });
  assert.equal(r.reason, 'duplicate_line');
});

test('a confirmation that fails leaves the picked IMEIs in stock', async () => {
  const { h, manager } = await shop();
  const { itemId, variantId } = await phone(manager);
  value(await receive(manager, variantId, ['444444444444441']));
  const draft = value(await manager('order_create', { requestId: randomUUID(), channel: 'walk_in', fulfilment: { type: 'in_store' }, lines: [{ variantId, qty: 1 }] }));
  value(await manager('item_archive', { itemId }));
  const r = await manager('order_status', { orderId: draft.id, to: 'confirmed', version: draft.version, lineSerials: [{ variantId, serials: ['444444444444441'] }] });
  assert.equal(r.reason, 'item_archived');
  assert.equal(serialRow(h, '444444444444441').status, 'in_stock', 'the IMEI was not left reserved');
});

test('a sold IMEI cannot be received again, by purchase or trade-in; a written-off one can', async () => {
  const { h, manager } = await shop();
  const { variantId } = await phone(manager);
  value(await receive(manager, variantId, ['555555555555551', '555555555555552']));
  value(await sell(manager, variantId, ['555555555555551'], { confirm: true }));
  assert.equal((await receive(manager, variantId, ['555555555555551'])).reason, 'serial_sold');
  assert.equal((await manager('trade_in', { requestId: randomUUID(), variantId, serial: '555555555555551', costMinor: 100000, method: 'cash' })).reason, 'serial_sold');
  assert.ok(serialRow(h, '555555555555551').orderId, 'the sale record is intact');
  value(await manager('stock_move', { requestId: randomUUID(), variantId, delta: -1, reason: 'damage', serials: ['555555555555552'] }));
  value(await receive(manager, variantId, ['555555555555552']));
});

test('a repair order moves only through its repair ticket', async () => {
  const { manager } = await shop();
  const repair = value(await manager('repair_create', { requestId: randomUUID(), device: 'Galaxy S23', fault: 'Charging port', customerName: 'Aisha', quoteMinor: 15000 }));
  for (const to of ['confirmed', 'cancelled']) assert.equal((await manager('order_status', { orderId: repair.order.id, to, version: repair.order.version })).reason, 'use_repair_status', to);
});

test('a repair needs the customer’s approval before repairing or ready; a free warranty repair does not', async () => {
  const { h, manager } = await shop();
  const screen = await part(manager);
  let repair = value(await manager('repair_create', { requestId: randomUUID(), device: 'iPhone 12', fault: 'Screen', customerName: 'Mona', quoteMinor: 20000 }));
  repair = await move(manager, repair, 'diagnosing');
  repair = value(await manager('repair_update', { repairId: repair.id, version: repair.version, parts: [{ variantId: screen, qty: 1 }] }));
  for (const to of ['repairing', 'ready']) assert.equal((await manager('repair_status', { repairId: repair.id, to, version: repair.version })).reason, 'approval_required', to);
  repair = value(await manager('repair_approval', { repairId: repair.id, version: repair.version, approvedBy: 'Mona by phone' }));
  repair = await move(manager, repair, 'ready');
  assert.equal(onHand(h, screen), 4, 'the part leaves stock at ready');
  repair = await move(manager, repair, 'cancelled');
  assert.equal(onHand(h, screen), 5, 'cancelling returns the part');

  const { variantId } = await phone(manager, { warrantyBy: 'store' });
  value(await receive(manager, variantId, ['666666666666666']));
  value(await sell(manager, variantId, ['666666666666666'], { confirm: true }));
  let warranty = value(await manager('repair_create', { requestId: randomUUID(), device: 'iPhone 15', serial: '666666666666666', fault: 'Speaker', quoteMinor: 10000 }));
  assert.equal(warranty.order.totalMinor, 0);
  warranty = await move(manager, warranty, 'diagnosing');
  warranty = await move(manager, warranty, 'repairing');
  assert.equal(warranty.status, 'repairing');
});

test('an employee quotes repairs (recorded with their name) but cannot pay for a trade-in or change warranty terms', async () => {
  const { h, manager, employee, employeeId } = await shop();
  const screen = await part(manager);
  let repair = value(await employee('repair_create', { requestId: randomUUID(), device: 'iPad Air', fault: 'Glass', customerName: 'Huda', quoteMinor: 25000 }));
  repair = value(await employee('repair_update', { repairId: repair.id, version: repair.version, labourMinor: 22000, parts: [{ variantId: screen, qty: 1, unitPriceMinor: 28000 }] }));
  assert.equal(repair.order.totalMinor, 50000);
  assert.equal(repair.order.lines.find(l => l.variantId === screen).unitCostMinor, undefined, 'the part cost is not shown');
  const quoted = h.m.table('ascendActivity').filter(r => r.entityId === String(repair.id));
  assert.deepEqual(quoted.map(r => r.action), ['repair_created', 'repair_quoted']);
  assert.ok(quoted.every(r => String(r.actorAccountId) === String(employeeId)));

  const { itemId, variantId, item } = await phone(manager, { warrantyMonths: 12, warrantyBy: 'store' });
  assert.equal((await employee('trade_in', { requestId: randomUUID(), variantId, serial: '777777777777777', costMinor: 90000, method: 'cash' })).reason, 'manager_required');
  const v = item.variants[0];
  value(await employee('item_save', { itemId, item: { kind: 'product', nameAr: item.nameAr, nameEn: 'iPhone 15 (new)', category: item.category, unit: 'piece', trackStock: true, serialized: true, warrantyMonths: 0, warrantyBy: 'none' },
    variants: [{ variantId: v.id, sku: v.sku, options: v.options, priceMinor: v.priceMinor, reorderPoint: 1 }] }));
  const stored = h.m.table('hasibItems').find(i => i._id === itemId);
  assert.deepEqual([stored.nameEn, stored.warrantyMonths, stored.warrantyBy], ['iPhone 15 (new)', 12, 'store'], 'the name changed, the warranty did not');
  const serials = value(await employee('serials', { variantId }));
  assert.ok(serials.items.every(s => s.costMinor === undefined));
});

test('trade-ins, repair moves and approvals are recorded with who made them', async () => {
  const { h, manager } = await shop();
  const { variantId } = await phone(manager);
  const t = value(await manager('trade_in', { requestId: randomUUID(), variantId, serial: '888888888888888', costMinor: 90000, method: 'cash' }));
  let repair = value(await manager('repair_create', { requestId: randomUUID(), device: 'Pixel', fault: 'Battery', quoteMinor: 12000 }));
  repair = await move(manager, repair, 'diagnosing');
  repair = value(await manager('repair_approval', { repairId: repair.id, version: repair.version, approvedBy: 'Customer' }));
  repair = await move(manager, repair, 'ready');
  value(await manager('payment_record', { requestId: randomUUID(), orderId: repair.order.id, amountMinor: 12000, method: 'cash' }));
  repair = await move(manager, repair, 'collected');
  const actions = h.m.table('ascendActivity').map(r => r.action);
  for (const action of ['trade_in_recorded', 'repair_created', 'repair_approved', 'repair_ready', 'repair_collected']) assert.ok(actions.includes(action), action);
  assert.ok(h.m.table('ascendActivity').some(r => r.entityId === String(t.id)));
  assert.ok(h.m.table('ascendActivity').some(r => r.action === 'repair_approved' && r.entityId === String(repair.id) && r.actorAccountId), 'the approval records the account that entered it');
});

test('a warranty can be cleared, and "no warranty" cannot carry months', async () => {
  const { h, manager } = await shop();
  assert.equal((await manager('item_save', { requestId: randomUUID(), item: { kind: 'product', nameEn: 'Phone', category: 'Phones', unit: 'piece', trackStock: true, serialized: true, warrantyMonths: 6, warrantyBy: 'none' },
    variants: [{ sku: 'X1', options: [], priceMinor: 1000 }] })).reason, 'invalid_item');
  const { itemId, item } = await phone(manager, { warrantyMonths: 12 });
  const v = item.variants[0];
  value(await manager('item_save', { itemId, item: { kind: 'product', nameAr: item.nameAr, nameEn: item.nameEn, category: item.category, unit: 'piece', trackStock: true, serialized: true, warrantyMonths: 0, warrantyBy: 'none' },
    variants: [{ variantId: v.id, sku: v.sku, options: v.options, priceMinor: v.priceMinor, costMinor: v.costMinor, reorderPoint: 1 }] }));
  const stored = h.m.table('hasibItems').find(i => i._id === itemId);
  assert.equal(stored.warrantyMonths || 0, 0);
  assert.equal(stored.warrantyBy || 'none', 'none');
});

test('Today: profit per device counts confirmed sales; unsold phones are aged by IMEI; ready repairs appear once', async () => {
  const { h, manager } = await shop();
  const { variantId } = await phone(manager, { price: 320000 });
  value(await receive(manager, variantId, ['900000000000001', '900000000000002', '900000000000003']));
  value(await sell(manager, variantId, ['900000000000001'], { confirm: true }));
  value(await manager('settings_update', { unsoldDays: 30 }));
  h.m.advance(31 * DAY);
  value(await sell(manager, variantId, ['900000000000002'], { confirm: true }));
  let repair = value(await manager('repair_create', { requestId: randomUUID(), device: 'Pixel', fault: 'Battery', quoteMinor: 12000 }));
  repair = await move(manager, repair, 'diagnosing');
  repair = value(await manager('repair_approval', { repairId: repair.id, version: repair.version, approvedBy: 'Customer' }));
  await move(manager, repair, 'ready');
  const today = value(await manager('today'));
  const metric = id => today.industryMetrics.find(m => m.id === id);
  assert.equal(metric('device_profit').value, 40000, 'a confirmed counter sale counts: 320.000 − 280.000');
  assert.equal(metric('unsold_stock').value, 1, 'one phone has been in stock for more than 30 days');
  assert.equal(metric('overdue_repairs').value, 0, 'a ready repair is not overdue');
  assert.equal(today.needsYou.repairsReady, 1);
  assert.equal(today.industryActions.filter(a => a.id === 'ready_devices').length, 0, 'ready repairs are shown once, in Needs you');
});

const TECH_CODES = ['repair_not_found', 'use_repair_status', 'approval_required', 'serial_sold', 'duplicate_line', 'serialized_not_editable', 'repair_conflict', 'repair_locked', 'invalid_repair',
  'serialized_part', 'invalid_trade_in', 'not_serialized', 'serial_not_found', 'serials_required', 'serial_unavailable', 'serials_mismatch', 'duplicate_serial', 'invalid_serial', 'use_serial_flow',
  'serial_mismatch', 'manager_required', 'item_archived', 'payment_exceeds_balance', 'order_locked', 'invalid_transition'];

test('every refusal a phone shop can meet has its own message in English and Arabic', async () => {
  const { createStrings } = await import('../src/lib/dashboard/strings.js');
  const { createHasibStrings } = await import('../src/lib/hasib/strings.js');
  for (const lang of ['en', 'ar']) {
    const s = createStrings(lang), h = createHasibStrings(lang), generic = s.reason('__unknown__');
    for (const code of TECH_CODES) {
      const message = h.reason(code) || s.reason(code);
      assert.ok(message && message !== generic, `${lang}: ${code}`);
    }
  }
});

test('an approver name cannot hide a later approval from the audit log', async () => {
  const { h, manager } = await shop();
  let repair = value(await manager('repair_create', { requestId: randomUUID(), device: 'Pixel', fault: 'Battery', quoteMinor: 12000 }));
  repair = value(await manager('repair_approval', { repairId: repair.id, version: repair.version, approvedBy: 'x|marker1' }));
  value(await manager('repair_approval', { repairId: repair.id, version: repair.version, approvedBy: 'Someone else', requestId: 'marker1' }));
  assert.equal(h.m.table('ascendActivity').filter(r => r.action === 'repair_approved' && r.entityId === String(repair.id)).length, 2);
});

test('an order cannot be created as a repair order from outside a repair ticket', async () => {
  const { manager } = await shop();
  const screen = await part(manager);
  const order = value(await manager('order_create', { requestId: randomUUID(), channel: 'walk_in', kind: 'repair', fulfilment: { type: 'in_store' }, lines: [{ variantId: screen, qty: 1 }] }));
  assert.equal(order.kind, 'sale');
  value(await manager('order_status', { orderId: order.id, to: 'cancelled', version: order.version }));
});
