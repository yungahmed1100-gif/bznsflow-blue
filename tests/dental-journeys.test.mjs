// Dental is the clinic pack on Ascend: visits, treatments, supplies, money,
// patients and a front-desk team. These journeys run the real Convex state code
// for a clinic manager and an invited receptionist, and pin down what each may do.
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
const refused = (r, reason) => { assert.equal(r.ok, false, `expected ${reason}`); assert.equal(r.reason, reason); };

async function dentalClinic() {
  const h = blueHarness();
  await h.enable();
  await h.m.db.insert('blueMessagingSettings', { key: 'hasib', enabled: true });
  const a = await seedTenant(h.m, { name: 'a', sector: 'Dental clinics' });
  await h.messaging('activate', { sessionHash: a.sessionHash });
  value(await grantPlan(h.m.ctx, { email: 'a@example.com', plan: 'ascend', packId: 'dental' }, h.m.now()));
  const as = actorAccountId => (operation, args = {}) => executeHasib(h.m.ctx, { operation, sessionHash: a.sessionHash, hashSecret: SECRET, ...(actorAccountId ? { actorAccountId } : {}), ...args }, h.m.now());
  const manager = as(null);
  // An invited receptionist, active in the clinic's workspace.
  const team = value(await manager('team_invite', { email: 'desk@example.com' }));
  const employeeId = await h.m.db.insert('accounts', { email: 'desk@example.com', role: 'customer', createdAt: h.m.now() });
  await h.m.db.patch(team.id, { accountId: employeeId, status: 'active', activatedAt: h.m.now() });
  return { h, a, manager, employee: as(employeeId), employeeId };
}

/** A treatment approved in Layla's catalog, synced into a chargeable service item. */
async function cleaning(h, a, manager, amount = 20) {
  await h.m.db.insert('blueCatalogEntries', { ownerKey: String(a.accountId), entryKey: randomUUID(), kind: 'service', status: 'approved', nameEn: 'Cleaning', nameAr: 'تنظيف', category: 'Treatments',
    benefitEn: '', benefitAr: '', descriptionEn: '', descriptionAr: '', availability: '', prices: [{ type: 'fixed', currency: 'OMR', amount, unit: 'visit', label: `${amount} OMR` }],
    source: 'owner', confidence: 1, laylaUseEn: '', laylaUseAr: '', revision: 1, sortOrder: 0, createdAt: h.m.now(), updatedAt: h.m.now() });
  value(await manager('services_sync'));
  const [item] = value(await manager('items', { search: 'cleaning' })).items;
  return item.variants[0].id;
}
const gloves = async manager => {
  const r = value(await manager('item_save', { requestId: randomUUID(), item: { kind: 'product', nameAr: 'قفازات', nameEn: 'Gloves', category: 'Supplies', unit: 'box', trackStock: true },
    variants: [{ sku: 'GL-M', options: [], priceMinor: 0, costMinor: 3000, reorderPoint: 3, openingStock: 2 }] }));
  return { itemId: r.item.id, variantId: r.variants[0].id };
};
const visit = (run, lines, extra = {}) => run('order_create', { requestId: randomUUID(), channel: 'whatsapp', fulfilment: { type: 'in_store' }, confirm: true, lines, ...extra });
const activity = h => h.m.table('ascendActivity').map(r => [r.action, r.actorRole]);

test('dental on Ascend: the manager sees Today, Chats, Visits, Services, Money, Patients, Team and Settings', async () => {
  const { manager } = await dentalClinic();
  const o = value(await manager('overview'));
  assert.equal(o.pack.id, 'dental');
  const map = dashboardMap(o, o.capabilities);
  assert.deepEqual(map.sections, ['today', 'chats', 'orders', 'stock', 'money', 'customers', 'team', 'settings']);
  assert.deepEqual(map.views.stock, ['services', 'products'], 'treatments first, then supplies');
  assert.deepEqual(map.views.customers, ['contacts'], 'no mass messaging to patients');
});

test('a receptionist sees no Money, Team, Settings or treatment editing, even before Hasib has loaded', async () => {
  const { employee } = await dentalClinic();
  const o = value(await employee('overview'));
  assert.equal(o.workspaceRole, 'employee');
  const map = dashboardMap(o, o.capabilities);
  assert.deepEqual(map.sections, ['today', 'chats', 'orders', 'stock', 'customers']);
  assert.deepEqual(map.views.stock, ['products'], 'treatments and their prices are the manager’s');
  const early = dashboardMap(null, capabilitiesFor('ascend', 'employee'), 'employee');
  assert.ok(!early.sections.includes('settings'), 'Settings never flashes for a receptionist');
});

test('a receptionist books and charges visits at the clinic’s prices, and never sees costs or cash totals', async () => {
  const { h, a, manager, employee } = await dentalClinic();
  const service = await cleaning(h, a, manager);
  await gloves(manager);
  const v = value(await visit(employee, [{ variantId: service, qty: 1 }]));
  assert.equal(v.totalMinor, 20000);
  value(await employee('payment_record', { requestId: randomUUID(), orderId: v.id, amountMinor: 20000, method: 'cash' }));
  const today = value(await employee('today'));
  assert.equal(today.clinic, true);
  assert.equal(today.money, null, 'no cash figures for the front desk');
  const supplies = value(await employee('items', { kind: 'product' })).items;
  assert.ok(supplies.length > 0);
  for (const variant of supplies.flatMap(i => i.variants)) assert.equal(variant.costMinor, undefined, 'supply costs are the manager’s');
});

test('a receptionist cannot set a price, add a free charge, refund, or add a supply', async () => {
  const { h, a, manager, employee } = await dentalClinic();
  const service = await cleaning(h, a, manager);
  refused(await visit(employee, [{ variantId: service, qty: 1, unitPriceMinor: 1000 }]), 'manager_required');
  refused(await visit(employee, [{ name: 'Other charge', qty: 1, unitPriceMinor: 5000 }]), 'manager_required');
  refused(await visit(employee, [{ variantId: service, qty: 1, discountMinor: 5000 }]), 'manager_required');
  const v = value(await visit(manager, [{ variantId: service, qty: 1 }]));
  value(await manager('payment_record', { requestId: randomUUID(), orderId: v.id, amountMinor: 20000, method: 'cash' }));
  refused(await employee('payment_record', { requestId: randomUUID(), orderId: v.id, amountMinor: -20000, method: 'cash' }), 'manager_required');
  refused(await employee('item_save', { requestId: randomUUID(), item: { kind: 'product', nameAr: 'كمامات', nameEn: 'Masks', category: 'Supplies', unit: 'box', trackStock: true },
    variants: [{ sku: 'MK', options: [], priceMinor: 0, costMinor: 1000, reorderPoint: 1, openingStock: 1 }] }), 'manager_required');
});

test('a visit cannot be paid twice over, and its cancel, refund and supply moves are recorded with who did them', async () => {
  const { h, a, manager, employee } = await dentalClinic();
  const service = await cleaning(h, a, manager);
  const { variantId } = await gloves(manager);
  let v = value(await visit(manager, [{ variantId: service, qty: 1 }]));
  refused(await manager('payment_record', { requestId: randomUUID(), orderId: v.id, amountMinor: 25000, method: 'cash' }), 'payment_exceeds_balance');
  value(await manager('payment_record', { requestId: randomUUID(), orderId: v.id, amountMinor: 20000, method: 'card' }));
  value(await manager('payment_record', { requestId: randomUUID(), orderId: v.id, amountMinor: -20000, method: 'card' }));
  v = value(await manager('order_status', { orderId: v.id, to: 'completed', version: v.version }));
  value(await manager('order_status', { orderId: v.id, to: 'returned', version: v.version }));
  value(await employee('stock_move', { requestId: randomUUID(), variantId, reason: 'stock_in', delta: 5 }));
  const noShow = value(await visit(employee, [{ variantId: service, qty: 1 }]));
  value(await employee('order_status', { orderId: noShow.id, to: 'cancelled', version: noShow.version }));
  const log = activity(h);
  assert.deepEqual(log.filter(([action]) => action !== 'team_invited'), [
    ['payment_refunded', 'manager'], ['order_returned', 'manager'], ['stock_adjusted', 'employee'], ['order_cancelled', 'employee'],
  ]);
});

test('a cancelled visit does not answer the patient’s request; a completed one does', async () => {
  const { h, a, manager } = await dentalClinic();
  const service = await cleaning(h, a, manager);
  await h.inbound(a, { from: '96891111111', text: 'I want a cleaning tomorrow', intent: 'disabled' });
  let today = value(await manager('today'));
  assert.equal(today.needsYou.requestsCount, 1);
  const { conversationId } = today.needsYou.requests[0];
  const noShow = value(await visit(manager, [{ variantId: service, qty: 1 }], { conversationId }));
  value(await manager('order_status', { orderId: noShow.id, to: 'cancelled', version: noShow.version }));
  today = value(await manager('today'));
  assert.equal(today.needsYou.requestsCount, 1, 'the patient still needs a visit');
  value(await visit(manager, [{ variantId: service, qty: 1 }], { conversationId }));
  today = value(await manager('today'));
  assert.equal(today.needsYou.requestsCount, 0);
});

test('a visit refuses notes and anything but the clinic, whoever records it', async () => {
  const { h, a, manager, employee } = await dentalClinic();
  const service = await cleaning(h, a, manager);
  for (const run of [manager, employee]) {
    assert.equal((await visit(run, [{ variantId: service, qty: 1 }], { notes: 'Patient reports pain on the lower left molar' })).ok, false);
    assert.equal((await run('order_create', { requestId: randomUUID(), channel: 'whatsapp', fulfilment: { type: 'delivery', area: 'Seeb' }, confirm: true, lines: [{ variantId: service, qty: 1 }] })).ok, false);
  }
  assert.equal(h.m.table('hasibOrders').length, 0);
});
