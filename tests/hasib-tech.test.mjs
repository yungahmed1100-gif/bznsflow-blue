// Tech-store pack: per-unit serial/IMEI stock, warranty lookup, trade-ins and
// repair tickets whose money lives on a linked order.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { blueHarness, seedTenant } from './helpers/blue-tenant.mjs';
import { SECRET } from './helpers/convex-memory.mjs';
import { executeHasib } from '../convex/hasib/hasibState.js';
import { grantPlan } from '../convex/hasib/plans.js';
import { hasibPack, HASIB_LIVE_PACKS } from '../config/hasib-packs.js';
import { canRepairTransition, REPAIR_STATUSES } from '../convex/hasib/repairMachine.js';

const DAY = 86400000;
async function setup() {
  const h = blueHarness();
  await h.enable();
  await h.m.db.insert('blueMessagingSettings', { key: 'hasib', enabled: true });
  const a = await seedTenant(h.m, { name: 'a', sector: 'Technology & software' });
  const b = await seedTenant(h.m, { name: 'b', sector: 'Retail', phone: '9999', waba: '8888', sender: '96890000001' });
  await h.messaging('activate', { sessionHash: a.sessionHash });
  await grantPlan(h.m.ctx, { email: 'a@example.com', plan: 'ascend', packId: 'retail-tech' }, h.m.now());
  await grantPlan(h.m.ctx, { email: 'b@example.com', plan: 'ascend', packId: 'retail-tech' }, h.m.now());
  const as = t => (operation, args = {}) => executeHasib(h.m.ctx, { operation, sessionHash: t.sessionHash, hashSecret: SECRET, ...args }, h.m.now());
  return { h, a, b, hasib: as(a), other: as(b) };
}
async function phone(hasib, { warrantyMonths = 12, warrantyBy = 'store', price = 320000, cost = 280000 } = {}) {
  const r = await hasib('item_save', { requestId: randomUUID(), item: { kind: 'product', nameAr: 'آيفون 15', nameEn: 'iPhone 15', category: 'Phones', unit: 'piece', trackStock: true, serialized: true, warrantyMonths, warrantyBy },
    variants: [{ sku: 'IP15-128-BLK', options: [{ key: 'storage', value: '128GB' }, { key: 'colour', value: 'Black' }, { key: 'condition', value: 'New' }], priceMinor: price, costMinor: cost, reorderPoint: 1 }] });
  assert.equal(r.ok, true, r.reason);
  return { itemId: r.value.item.id, variantId: r.value.variants[0].id };
}
async function accessory(hasib) {
  const r = await hasib('item_save', { requestId: randomUUID(), item: { kind: 'product', nameAr: 'شاشة حماية', nameEn: 'Screen protector', category: 'Accessories', unit: 'piece', trackStock: true },
    variants: [{ sku: 'SP-15', options: [], priceMinor: 5000, costMinor: 1500, reorderPoint: 5, openingStock: 20 }] });
  return r.value.variants[0].id;
}
const receive = (hasib, variantId, serials, unitCostMinor) => hasib('stock_move', { requestId: randomUUID(), variantId, delta: serials.length, reason: 'stock_in', serials, ...(unitCostMinor ? { unitCostMinor } : {}) });
const serialRow = (h, serial) => h.m.table('hasibSerials').find(s => s.serial === serial);
const onHand = (h, id) => h.m.table('hasibVariants').find(v => v._id === id).onHand;
const sell = (hasib, variantId, serials, extra = {}) => hasib('order_create', { requestId: randomUUID(), channel: 'walk_in', fulfilment: { type: 'in_store' }, lines: [{ variantId, qty: serials.length, serials }], ...extra });

test('the tech-store pack is live, with its own variants and modules', () => {
  assert.deepEqual(HASIB_LIVE_PACKS, ['retail', 'retail-tech', 'dental', 'real-estate', 'construction', 'automotive']);
  const p = hasibPack('retail-tech');
  assert.equal(p.id, 'retail-tech');
  assert.deepEqual(p.variantOptions.map(o => o.key), ['model', 'storage', 'colour', 'condition']);
  for (const m of ['orders', 'stock', 'expenses', 'insights', 'serials', 'repairs', 'tradeIns']) assert.equal(p.modules[m], 'available', m);
  assert.equal(hasibPack('retail').modules.repairs, 'off');
});

test('serialized stock: IMEIs must match the quantity, be unique, and on-hand always equals serials in stock', async () => {
  const { h, hasib } = await setup();
  assert.equal((await hasib('item_save', { requestId: randomUUID(), item: { kind: 'product', nameAr: 'x', nameEn: 'x', category: 'Phones', unit: 'piece', trackStock: true, serialized: true, warrantyMonths: 12, warrantyBy: 'store' },
    variants: [{ sku: '', options: [], priceMinor: 1000, openingStock: 2 }] })).reason, 'invalid_item', 'opening stock needs IMEIs, so it comes through a receipt');
  const { variantId } = await phone(hasib);
  assert.equal((await hasib('stock_move', { requestId: randomUUID(), variantId, delta: 2, reason: 'stock_in', serials: ['356938035643809'] })).reason, 'serials_mismatch');
  assert.equal((await receive(hasib, variantId, ['356938035643809', '356938035643809'])).reason, 'duplicate_serial');
  assert.equal((await receive(hasib, variantId, ['356938035643809', '35 6938 0356 43817'], 275000)).ok, true);
  assert.equal(serialRow(h, '356938035643817').status, 'in_stock', 'spaces are removed from IMEIs');
  assert.equal(onHand(h, variantId), 2);
  assert.equal((await receive(hasib, variantId, ['356938035643809'])).reason, 'duplicate_serial', 'an IMEI already in stock cannot arrive twice');
  assert.equal((await hasib('stock_move', { requestId: randomUUID(), variantId, delta: 1, reason: 'adjustment' })).reason, 'use_serial_flow');
  assert.equal((await hasib('stock_move', { requestId: randomUUID(), variantId, delta: -1, reason: 'damage', serials: ['356938035643817'] })).ok, true);
  assert.equal(serialRow(h, '356938035643817').status, 'written_off');
  assert.equal(onHand(h, variantId), 1);
  assert.deepEqual((await hasib('serials', { variantId })).value.items.map(s => s.serial), ['356938035643809']);
});

test('selling a phone reserves, then sells its IMEI with warranty and its own cost; cancelling puts it back', async () => {
  const { h, hasib } = await setup();
  const { variantId } = await phone(hasib, { warrantyMonths: 12 });
  await receive(hasib, variantId, ['111111111111111', '222222222222222'], 280000);
  // A confirmed sale needs its IMEIs; a pending draft may wait for them (Layla cannot pick units).
  assert.equal((await hasib('order_create', { requestId: randomUUID(), channel: 'walk_in', confirm: true, fulfilment: { type: 'in_store' }, lines: [{ variantId, qty: 1 }] })).reason, 'serials_required');
  const draft = (await hasib('order_create', { requestId: randomUUID(), channel: 'walk_in', fulfilment: { type: 'in_store' }, lines: [{ variantId, qty: 1 }] })).value;
  assert.equal(draft.status, 'pending');
  await hasib('order_status', { orderId: draft.id, to: 'cancelled', version: draft.version });
  assert.equal((await sell(hasib, variantId, ['999999999999999'])).reason, 'serial_unavailable');
  const pending = (await sell(hasib, variantId, ['111111111111111'])).value;
  assert.equal(serialRow(h, '111111111111111').status, 'reserved');
  assert.equal((await sell(hasib, variantId, ['111111111111111'])).reason, 'serial_unavailable', 'a reserved IMEI cannot be sold twice');
  const confirmed = (await hasib('order_status', { orderId: pending.id, to: 'confirmed', version: pending.version })).value;
  const row = serialRow(h, '111111111111111');
  assert.equal(row.status, 'sold');
  assert.equal(row.warrantyUntil, h.m.now() + 365 * DAY);
  assert.deepEqual(confirmed.lines[0].serials, ['111111111111111']);
  assert.equal(confirmed.lines[0].unitCostMinor, 280000);
  assert.equal(onHand(h, variantId), 1);
  await hasib('order_status', { orderId: confirmed.id, to: 'cancelled', version: confirmed.version });
  assert.equal(serialRow(h, '111111111111111').status, 'in_stock');
  assert.equal(serialRow(h, '111111111111111').warrantyUntil, undefined);
  assert.equal(onHand(h, variantId), 2);
  // A pending order cancelled simply releases its reservation.
  const p2 = (await sell(hasib, variantId, ['222222222222222'])).value;
  await hasib('order_status', { orderId: p2.id, to: 'cancelled', version: p2.version });
  assert.equal(serialRow(h, '222222222222222').status, 'in_stock');
  assert.equal(onHand(h, variantId), 2);
});

test('warranty lookup by IMEI shows the sale, the customer and whether cover is still active — only for the owning shop', async () => {
  const { h, a, hasib, other } = await setup();
  const { variantId } = await phone(hasib, { warrantyMonths: 12, warrantyBy: 'agent' });
  await receive(hasib, variantId, ['333333333333333']);
  await h.inbound(a, { from: '96891111111', text: 'Hi', profileName: 'Khalid' });
  const khalid = h.m.table('blueContacts').find(c => c.waId === '96891111111');
  const order = (await sell(hasib, variantId, ['333333333333333'], { confirm: true, contactId: khalid._id })).value;
  let w = (await hasib('serial_lookup', { serial: '333 333 333 333 333' })).value;
  assert.deepEqual([w.status, w.warranty.active, w.warranty.by, w.order.number, w.customer], ['sold', true, 'agent', order.number, 'Khalid']);
  assert.ok(w.warranty.daysLeft >= 364);
  h.m.advance(400 * DAY);
  w = (await hasib('serial_lookup', { serial: '333333333333333' })).value;
  assert.equal(w.warranty.active, false);
  assert.equal((await other('serial_lookup', { serial: '333333333333333' })).reason, 'serial_not_found');
  assert.equal((await other('serials', { variantId })).reason, 'variant_not_found');
});

test('a trade-in buys a used phone into stock at its own cost, and selling it books that cost', async () => {
  const { h, hasib, other } = await setup();
  const used = (await hasib('item_save', { requestId: randomUUID(), item: { kind: 'product', nameAr: 'آيفون 13 مستعمل', nameEn: 'iPhone 13 (used)', category: 'Used phones', unit: 'piece', trackStock: true, serialized: true, warrantyMonths: 3, warrantyBy: 'store' },
    variants: [{ sku: 'IP13-U', options: [{ key: 'condition', value: 'Used' }], priceMinor: 150000, costMinor: 0, reorderPoint: 0 }] })).value.variants[0].id;
  const requestId = randomUUID();
  const t = await hasib('trade_in', { requestId, variantId: used, serial: '444444444444444', costMinor: 110000, method: 'cash', customerName: 'Walk-in seller', note: 'Battery 86%, small scratch' });
  assert.equal(t.ok, true, t.reason);
  assert.equal((await hasib('trade_in', { requestId, variantId: used, serial: '444444444444444', costMinor: 110000, method: 'cash' })).value.id, t.value.id, 'idempotent');
  assert.equal((await hasib('trade_in', { requestId: randomUUID(), variantId: used, serial: '444444444444444', costMinor: 1, method: 'cash' })).reason, 'duplicate_serial');
  assert.equal(serialRow(h, '444444444444444').source, 'trade_in');
  assert.equal(onHand(h, used), 1);
  assert.equal((await other('trade_in', { requestId: randomUUID(), variantId: used, serial: '555555555555555', costMinor: 1, method: 'cash' })).reason, 'variant_not_found');
  const sale = (await sell(hasib, used, ['444444444444444'], { confirm: true })).value;
  assert.equal(sale.lines[0].unitCostMinor, 110000);
  const i = (await hasib('insights', { period: 'today' })).value;
  assert.deepEqual(i.tradeIns, { count: 1, totalMinor: 110000 });
  assert.equal(i.sales.grossProfitMinor, 150000 - 110000);
});

test('repair machine allows exactly its documented moves', () => {
  const allowed = { received: ['diagnosing', 'cancelled'], diagnosing: ['waiting_parts', 'repairing', 'ready', 'cancelled'], waiting_parts: ['repairing', 'cancelled'],
    repairing: ['ready', 'cancelled'], ready: ['collected', 'cancelled'], collected: [], cancelled: [] };
  assert.deepEqual([...REPAIR_STATUSES].sort(), Object.keys(allowed).sort());
  for (const from of REPAIR_STATUSES) for (const to of REPAIR_STATUSES) assert.equal(canRepairTransition(from, to), allowed[from].includes(to), `${from}→${to}`);
});

test('a repair ticket: warranty detected from our IMEI, parts from stock on ready, deposit and collection through its order', async () => {
  const { h, hasib, other } = await setup();
  const { variantId } = await phone(hasib, { warrantyMonths: 12 });
  const protector = await accessory(hasib);
  await receive(hasib, variantId, ['666666666666666']);
  await sell(hasib, variantId, ['666666666666666'], { confirm: true, customerName: 'Salim' });
  let r = await hasib('repair_create', { requestId: randomUUID(), device: 'iPhone 15 128GB', serial: '666666666666666', fault: 'Screen cracked, touch works', accessories: 'Case', customerName: 'Salim', quoteMinor: 45000 });
  assert.equal(r.ok, true, r.reason);
  let repair = r.value;
  assert.equal(repair.underWarranty, true);
  assert.equal(repair.order.totalMinor, 0, 'labour under store warranty is not charged');
  // Out-of-warranty ticket for a device bought elsewhere.
  repair = (await hasib('repair_create', { requestId: randomUUID(), device: 'Galaxy S23', serial: '777777777777777', fault: 'Charging port', customerName: 'Aisha', quoteMinor: 15000 })).value;
  assert.equal(repair.underWarranty, false);
  assert.equal(repair.order.totalMinor, 15000);
  assert.equal(repair.number, 2);
  await hasib('payment_record', { requestId: randomUUID(), orderId: repair.order.id, amountMinor: 5000, method: 'cash' });
  repair = (await hasib('repair_status', { repairId: repair.id, to: 'diagnosing', version: repair.version })).value;
  repair = (await hasib('repair_update', { repairId: repair.id, version: repair.version, labourMinor: 12000, parts: [{ variantId: protector, qty: 1 }] })).value;
  assert.equal(repair.order.totalMinor, 12000 + 5000);
  assert.equal(repair.order.paidMinor, 5000, 'the deposit stays when the quote changes');
  assert.equal(onHand(h, protector), 20, 'parts leave stock only when the repair is ready');
  assert.equal((await hasib('repair_update', { repairId: repair.id, version: repair.version, parts: [{ variantId, qty: 1 }] })).reason, 'serialized_part');
  assert.equal((await hasib('repair_status', { repairId: repair.id, to: 'collected', version: repair.version })).reason, 'invalid_transition');
  assert.equal((await hasib('repair_status', { repairId: repair.id, to: 'ready', version: repair.version })).reason, 'approval_required', 'work waits for the customer to approve the quote');
  repair = (await hasib('repair_approval', { repairId: repair.id, version: repair.version, approvedBy: 'Aisha in store' })).value;
  repair = (await hasib('repair_status', { repairId: repair.id, to: 'ready', version: repair.version })).value;
  assert.equal(onHand(h, protector), 19);
  assert.equal(repair.order.status, 'confirmed');
  assert.equal((await hasib('repair_update', { repairId: repair.id, version: repair.version, labourMinor: 1 })).reason, 'repair_locked');
  repair = (await hasib('repair_status', { repairId: repair.id, to: 'collected', version: repair.version })).value;
  assert.equal(repair.order.status, 'completed');
  assert.equal((await hasib('serial_lookup', { serial: '777777777777777' })).value.repairs.length, 1, 'repairs are found by the customer device IMEI too');
  assert.equal((await other('repair', { repairId: repair.id })).reason, 'repair_not_found');
  assert.equal((await hasib('repairs', {})).value.items.length, 2);
});

test('cancelling a ready repair returns its parts to stock', async () => {
  const { h, hasib } = await setup();
  const protector = await accessory(hasib);
  let repair = (await hasib('repair_create', { requestId: randomUUID(), device: 'iPad', fault: 'Glass', customerName: 'Mona', quoteMinor: 20000 })).value;
  repair = (await hasib('repair_update', { repairId: repair.id, version: repair.version, parts: [{ variantId: protector, qty: 2 }] })).value;
  repair = (await hasib('repair_status', { repairId: repair.id, to: 'diagnosing', version: repair.version })).value;
  repair = (await hasib('repair_approval', { repairId: repair.id, version: repair.version, approvedBy: 'Mona' })).value;
  repair = (await hasib('repair_status', { repairId: repair.id, to: 'ready', version: repair.version })).value;
  assert.equal(onHand(h, protector), 18);
  repair = (await hasib('repair_status', { repairId: repair.id, to: 'cancelled', version: repair.version })).value;
  assert.equal(onHand(h, protector), 20);
  assert.equal(repair.order.status, 'cancelled');
});

test('the fashion pack does not expose tech operations', async () => {
  const { h } = await setup();
  await grantPlan(h.m.ctx, { email: 'b@example.com', plan: 'ascend', packId: 'retail' }, h.m.now());
  const b = h.m.table('accounts').find(x => x.email === 'b@example.com');
  const hasibB = (operation, args = {}) => executeHasib(h.m.ctx, { operation, sessionHash: b.draftHash, hashSecret: SECRET, ...args }, h.m.now());
  assert.equal((await hasibB('repairs', {})).reason, 'module_unavailable');
  assert.equal((await hasibB('trade_in', { requestId: randomUUID(), variantId: 'x', serial: '1', costMinor: 1, method: 'cash' })).reason, 'module_unavailable');
});

test('device age and repair approval remain tenant-scoped and quote edits invalidate approval', async () => {
  const {h,hasib,other}=await setup();
  const {variantId}=await phone(hasib);
  await receive(hasib,variantId,['AGE-001'],100000);
  h.m.advance(61*DAY);
  assert.equal((await hasib('serials',{variantId})).value.items[0].daysInStock,61);
  let repair=(await hasib('repair_create',{requestId:randomUUID(),device:'Phone',fault:'Screen',quoteMinor:10000})).value;
  assert.equal(repair.approvalStatus,'awaiting');
  assert.equal((await other('repair_approval',{repairId:repair.id,version:repair.version,approvedBy:'Customer'})).reason,'repair_not_found');
  repair=(await hasib('repair_approval',{repairId:repair.id,version:repair.version,approvedBy:'Customer'})).value;
  assert.equal(repair.approvalStatus,'approved');
  const stale=repair.version;
  repair=(await hasib('repair_update',{repairId:repair.id,version:repair.version,labourMinor:12000})).value;
  assert.equal(repair.approvalStatus,'awaiting');
  assert.equal((await hasib('repair_approval',{repairId:repair.id,version:stale,approvedBy:'Customer'})).reason,'repair_conflict');
});
