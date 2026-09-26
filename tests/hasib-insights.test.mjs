// Hasib P2–P3: expenses, Insights arithmetic, business-day boundaries and the
// lost-demand report fed by Layla's own message ingest.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { blueHarness, seedTenant } from './helpers/blue-tenant.mjs';
import { SECRET } from './helpers/convex-memory.mjs';
import { executeHasib } from '../convex/hasib/hasibState.js';
import { periodRange, businessDate } from '../convex/hasib/period.js';

const DAY = 86400000;
// 2027-01-15 10:00 in Muscat (UTC+4) = 06:00 UTC.
const T0 = Date.UTC(2027, 0, 15, 6, 0);

async function setup() {
  const h = blueHarness();
  h.m.advance(T0 - h.m.now());
  await h.enable();
  await h.m.db.insert('blueMessagingSettings', { key: 'hasib', enabled: true });
  const a = await seedTenant(h.m, { name: 'a', sector: 'Retail' });
  const b = await seedTenant(h.m, { name: 'b', sector: 'Retail', phone: '9999', waba: '8888', sender: '96890000001' });
  await h.messaging('activate', { sessionHash: a.sessionHash });
  await h.m.db.insert('blueBusinessSettings', { accountId: a.accountId, timezone: 'Asia/Muscat', updatedAt: h.m.now() });
  const hasib = (tenant, operation, args = {}) => executeHasib(h.m.ctx, { operation, sessionHash: tenant.sessionHash, hashSecret: SECRET, ...args }, h.m.now());
  return { h, a, b, hasib };
}
async function product(hasib, tenant, { nameEn = 'Black abaya', nameAr = 'عباية سوداء', price = 25000, cost = 10000, onHand = 5 } = {}) {
  const r = await hasib(tenant, 'item_save', { requestId: randomUUID(), item: { kind: 'product', nameAr, nameEn, category: 'Abayas', unit: 'piece', trackStock: true },
    variants: [{ sku: '', options: [{ key: 'size', value: '52' }], priceMinor: price, costMinor: cost, reorderPoint: 1, openingStock: onHand }] });
  return r.value.variants[0].id;
}
const sell = (hasib, tenant, lines, extra = {}) => hasib(tenant, 'order_create', { requestId: randomUUID(), channel: 'walk_in', confirm: true, fulfilment: { type: 'in_store' }, lines, ...extra });
const expense = (hasib, tenant, extra) => hasib(tenant, 'expense_create', { requestId: randomUUID(), category: 'rent', amountMinor: 30000, method: 'bank_transfer', paidOn: '2027-01-15', ...extra });

test('business periods cut days at Muscat midnight, not UTC midnight', () => {
  assert.equal(businessDate(Date.UTC(2027, 0, 14, 20, 30), 'Asia/Muscat'), '2027-01-15', '20:30 UTC is already the 15th in Muscat');
  const today = periodRange('today', T0, 'Asia/Muscat');
  assert.equal(today.from, Date.UTC(2027, 0, 14, 20, 0));
  assert.equal(today.to - today.from, DAY);
  const month = periodRange('month', T0, 'Asia/Muscat');
  assert.equal(month.from, Date.UTC(2026, 11, 31, 20, 0));
  assert.equal(month.to, Date.UTC(2027, 0, 31, 20, 0));
  assert.equal(periodRange('7d', T0, 'Asia/Muscat').to - periodRange('7d', T0, 'Asia/Muscat').from, 7 * DAY);
  assert.equal(periodRange('prev_month', T0, 'Asia/Muscat').from, Date.UTC(2026, 10, 30, 20, 0));
  assert.throws(() => periodRange('forever', T0, 'Asia/Muscat'), /invalid_period/);
});

test('expenses are idempotent, tenant-scoped, voidable and validated', async () => {
  const { a, b, hasib } = await setup();
  const requestId = randomUUID();
  const first = await expense(hasib, a, { requestId, vendor: 'Landlord', note: 'January' });
  assert.equal(first.ok, true, first.reason);
  assert.equal((await expense(hasib, a, { requestId })).value.id, first.value.id);
  assert.equal(first.value.number, 1);
  assert.equal((await hasib(a, 'expenses', { period: 'month' })).value.items.length, 1);
  assert.equal((await hasib(b, 'expenses', { period: 'month' })).value.items.length, 0);
  assert.equal((await hasib(b, 'expense_void', { expenseId: first.value.id })).reason, 'expense_not_found');
  for (const bad of [{ category: 'bribes' }, { amountMinor: 0 }, { amountMinor: -5 }, { paidOn: '2027-13-01' }, { method: 'barter' }, { vatMinor: 40000 }]) {
    assert.equal((await expense(hasib, a, bad)).reason, 'invalid_expense', JSON.stringify(bad));
  }
  assert.equal((await hasib(a, 'expense_void', { expenseId: first.value.id })).ok, true);
  assert.equal((await hasib(a, 'expenses', { period: 'month' })).value.items[0].voided, true);
});

test('Insights: sales, gross profit, expenses and net profit are exact and exclude what they should', async () => {
  const { h, a, hasib } = await setup();
  const abaya = await product(hasib, a, { price: 25000, cost: 10000, onHand: 5 });
  const shayla = await product(hasib, a, { nameEn: 'Silk shayla', nameAr: 'شيلة حرير', price: 8000, cost: 3000, onHand: 10 });
  const o1 = (await sell(hasib, a, [{ variantId: abaya, qty: 2 }, { variantId: shayla, qty: 1 }])).value; // 58.000 sales, cogs 23.000
  await hasib(a, 'payment_record', { requestId: randomUUID(), orderId: o1.id, amountMinor: 58000, method: 'cash' });
  const o2 = (await sell(hasib, a, [{ variantId: shayla, qty: 3 }])).value; // 24.000 sales, cogs 9.000
  await hasib(a, 'payment_record', { requestId: randomUUID(), orderId: o2.id, amountMinor: 10000, method: 'bank_transfer' });
  const o3 = (await sell(hasib, a, [{ variantId: abaya, qty: 1 }])).value; // cancelled → excluded
  await hasib(a, 'order_status', { orderId: o3.id, to: 'cancelled', version: o3.version });
  await hasib(a, 'order_create', { requestId: randomUUID(), channel: 'whatsapp', fulfilment: { type: 'pickup' }, lines: [{ variantId: abaya, qty: 1 }] }); // pending → not a sale
  await expense(hasib, a, { amountMinor: 30000 });                                  // rent
  await expense(hasib, a, { category: 'stock_purchase', amountMinor: 50000 });      // inventory, not an operating cost
  const voided = (await expense(hasib, a, { category: 'marketing', amountMinor: 9000 })).value;
  await hasib(a, 'expense_void', { expenseId: voided.id });

  const i = (await hasib(a, 'insights', { period: 'today' })).value;
  assert.deepEqual([i.sales.orders, i.sales.totalMinor, i.sales.revenueMinor, i.sales.cogsMinor, i.sales.grossProfitMinor], [2, 82000, 82000, 32000, 50000]);
  assert.deepEqual([i.expenses.operatingMinor, i.expenses.stockPurchasesMinor, i.netProfitMinor], [30000, 50000, 20000]);
  assert.deepEqual(i.pending, { orders: 1, totalMinor: 25000 });
  assert.deepEqual(i.cash, [{ method: 'cash', amountMinor: 58000 }, { method: 'bank_transfer', amountMinor: 10000 }]);
  assert.equal(i.receivablesMinor, 14000 + 25000, 'unpaid confirmed balance plus the pending order');
  assert.deepEqual(i.topProducts.map(p => [p.nameEn, p.qty, p.revenueMinor, p.profitMinor]), [['Silk shayla', 4, 32000, 20000], ['Black abaya', 2, 50000, 30000]].sort((x, y) => y[2] - x[2]));
  assert.equal(i.stock.valueMinor, (5 - 2) * 10000 + (10 - 4) * 3000);
  assert.equal(i.truncated, false);
  // Yesterday in Muscat saw none of this.
  h.m.advance(DAY);
  assert.equal((await hasib(a, 'insights', { period: 'today' })).value.sales.orders, 0);
  assert.equal((await hasib(a, 'insights', { period: '7d' })).value.sales.orders, 2);
});

test('VAT-registered: revenue and profit are measured without VAT', async () => {
  const { a, hasib } = await setup();
  await hasib(a, 'settings_update', { vat: { registered: true, rateBps: 500, pricesIncludeVat: true } });
  const v = await product(hasib, a, { price: 10500, cost: 5000 });
  await sell(hasib, a, [{ variantId: v, qty: 2 }]);
  const i = (await hasib(a, 'insights', { period: 'today' })).value;
  assert.deepEqual([i.sales.totalMinor, i.sales.vatMinor, i.sales.revenueMinor, i.sales.grossProfitMinor], [21000, 1000, 20000, 10000]);
});

test('returning customers are counted against their earlier orders', async () => {
  const { h, a, hasib } = await setup();
  const v = await product(hasib, a, { onHand: 50 });
  await h.inbound(a, { from: '96891111111', text: 'Hi', profileName: 'Mariam' });
  await h.inbound(a, { from: '96892222222', text: 'Hi', profileName: 'Salma' });
  const [mariam, salma] = h.m.table('blueContacts').filter(c => c.accountId === a.accountId);
  await sell(hasib, a, [{ variantId: v, qty: 1 }], { contactId: mariam._id });
  h.m.advance(3 * DAY);
  await sell(hasib, a, [{ variantId: v, qty: 1 }], { contactId: mariam._id });
  await sell(hasib, a, [{ variantId: v, qty: 1 }], { contactId: salma._id });
  const i = (await hasib(a, 'insights', { period: 'today' })).value;
  assert.deepEqual(i.customers, { buyers: 2, returning: 1, walkIn: 0 });
});

test('Layla’s chats become demand signals: most wanted, asked while out of stock, and not in the catalog', async () => {
  const { h, a, hasib } = await setup();
  await h.m.db.insert('blueCatalogEntries', { ownerKey: String(a.accountId), entryKey: randomUUID(), kind: 'product', status: 'approved', nameEn: 'Black abaya', nameAr: 'عباية سوداء', category: 'Abayas',
    benefitEn: '', benefitAr: '', descriptionEn: '', descriptionAr: '', availability: '', prices: [], source: 'owner', confidence: 1, laylaUseEn: '', laylaUseAr: '', revision: 1, sortOrder: 0, createdAt: T0, updatedAt: T0 });
  await h.m.db.insert('blueCatalogEntries', { ownerKey: String(a.accountId), entryKey: randomUUID(), kind: 'product', status: 'approved', nameEn: 'Linen kaftan', nameAr: 'قفطان كتان', category: 'Kaftans',
    benefitEn: '', benefitAr: '', descriptionEn: '', descriptionAr: '', availability: '', prices: [], source: 'owner', confidence: 1, laylaUseEn: '', laylaUseAr: '', revision: 1, sortOrder: 1, createdAt: T0, updatedAt: T0 });
  const abaya = await product(hasib, a, { onHand: 0 });
  await h.inbound(a, { from: '96891111111', text: 'Do you have the black abaya?', intent: 'availability_request', profileName: 'Mariam' });
  await h.inbound(a, { from: '96892222222', text: 'عندكم عباية سوداء؟', intent: 'availability_request', profileName: 'Salma' });
  await h.inbound(a, { from: '96892222222', text: 'how much is the black abaya', intent: 'price' }); // same person, same item, same day → one signal
  await h.inbound(a, { from: '96893333333', text: 'Do you have the linen kaftan?', intent: 'availability_request' });
  await h.inbound(a, { from: '96894444444', text: 'hello', intent: 'greeting' });
  assert.equal(h.m.table('hasibDemandSignals').length, 3);
  // Mariam later buys after a restock.
  await hasib(a, 'stock_move', { requestId: randomUUID(), variantId: abaya, delta: 3, reason: 'stock_in' });
  const mariam = h.m.table('blueContacts').find(c => c.waId === '96891111111');
  await sell(hasib, a, [{ variantId: abaya, qty: 1 }], { contactId: mariam._id });

  const d = (await hasib(a, 'insights', { period: '7d' })).value.demand;
  const top = d.mostWanted[0];
  assert.deepEqual([top.nameEn, top.asks, top.people, top.outOfStockAsks, top.bought], ['Black abaya', 2, 2, 2, 1]);
  assert.deepEqual(d.notInCatalog.map(x => [x.text, x.people]), [['Linen kaftan', 1]]);
  assert.equal(d.lostSales[0].people, 2);
  assert.equal(d.askedNotBought[0].people, 1);
  // Other tenants see nothing; deleting a contact removes their signals.
  await h.dashboard('contact_delete', { sessionHash: a.sessionHash, contactId: mariam._id, confirm: true });
  assert.equal(h.m.table('hasibDemandSignals').filter(s => s.contactId === mariam._id).length, 0);
});

test('demand signals are not recorded while Hasib is off', async () => {
  const { h, a } = await setup();
  const gate = h.m.table('blueMessagingSettings').find(r => r.key === 'hasib');
  await h.m.db.patch(gate._id, { enabled: false });
  await h.m.db.insert('blueCatalogEntries', { ownerKey: String(a.accountId), entryKey: randomUUID(), kind: 'product', status: 'approved', nameEn: 'Black abaya', nameAr: 'عباية سوداء', category: 'Abayas',
    benefitEn: '', benefitAr: '', descriptionEn: '', descriptionAr: '', availability: '', prices: [], source: 'owner', confidence: 1, laylaUseEn: '', laylaUseAr: '', revision: 1, sortOrder: 0, createdAt: T0, updatedAt: T0 });
  await h.inbound(a, { from: '96891111111', text: 'Do you have the black abaya?', intent: 'availability_request' });
  assert.equal(h.m.table('hasibDemandSignals').length, 0);
});

test('a failing demand signal never stops Layla from queueing her reply', async () => {
  const { h, a } = await setup();
  const original = h.m.db.query.bind(h.m.db);
  h.m.db.query = table => { if (table === 'hasibDemandSignals') throw new Error('boom'); return original(table); };
  const logged = [], error = console.error;
  console.error = (...args) => logged.push(args.join(' '));
  try {
    await h.m.db.insert('blueCatalogEntries', { ownerKey: String(a.accountId), entryKey: randomUUID(), kind: 'product', status: 'approved', nameEn: 'Black abaya', nameAr: 'عباية سوداء', category: 'Abayas',
      benefitEn: '', benefitAr: '', descriptionEn: '', descriptionAr: '', availability: '', prices: [], source: 'owner', confidence: 1, laylaUseEn: '', laylaUseAr: '', revision: 1, sortOrder: 0, createdAt: T0, updatedAt: T0 });
    const r = await h.inbound(a, { from: '96891111111', text: 'Do you have the black abaya?', intent: 'availability_request', reply: 'Yes, we do.' });
    assert.equal(r.ok, true);
  } finally { h.m.db.query = original; console.error = error; }
  assert.ok(logged.some(l => l.includes('hasib_demand_failed')), 'the failure is logged, not swallowed');
  assert.ok(h.m.table('blueMessages').some(m => m.direction === 'out' && /Yes, we do/.test(m.text || '')), 'Layla still queued her reply');
});

