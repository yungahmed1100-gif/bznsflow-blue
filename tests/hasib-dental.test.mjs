// Dental clinics: Hasib's dental pack. Visits, treatments from Layla's catalog,
// internal supplies, a clinic's Today, and no clinical free text kept anywhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { blueHarness, seedTenant } from './helpers/blue-tenant.mjs';
import { SECRET } from './helpers/convex-memory.mjs';
import { executeHasib } from '../convex/hasib/hasibState.js';
import { grantPlan } from '../convex/hasib/plans.js';
import { syncServicesForOwner, servicePriceMinor } from '../convex/hasib/serviceSync.js';
import { textRetentionFor, TEXT_RETENTION_MS, CLINICAL_TEXT_RETENTION_MS, shortenClinicalText } from '../convex/blueContacts.js';
import { validateFieldValue } from '../config/layla-qualification.js';
import { hasibPack, isLivePack, industryCatalog } from '../config/hasib-packs.js';

const DAY = 86400000;

async function clinic({ name = 'a', sector = 'Dental clinics', pack = 'dental' } = {}, h = blueHarness()) {
  if (!h.enabled) { await h.enable(); await h.m.db.insert('blueMessagingSettings', { key: 'hasib', enabled: true }); h.enabled = true; }
  const t = await seedTenant(h.m, { name, sector, waba: `waba-${name}`, phone: `phone-${name}`, sender: `9689000000${name.charCodeAt(0) % 10}` });
  await h.messaging('activate', { sessionHash: t.sessionHash });
  await grantPlan(h.m.ctx, { email: `${name}@example.com`, plan: 'ascend', packId: pack }, h.m.now());
  const hasib = (operation, args = {}) => executeHasib(h.m.ctx, { operation, sessionHash: t.sessionHash, hashSecret: SECRET, ...args }, h.m.now());
  return { h, t, hasib };
}
const treatment = (h, t, { nameEn, nameAr, amount, type = 'fixed', status = 'approved' }) => h.m.db.insert('blueCatalogEntries', {
  ownerKey: String(t.accountId), entryKey: randomUUID(), kind: 'service', status, nameEn, nameAr, category: 'Treatments', benefitEn: '', benefitAr: '', descriptionEn: '', descriptionAr: '',
  availability: '', prices: type === 'quote' ? [{ type, currency: 'OMR', unit: 'visit', label: 'On request' }] : [{ type, currency: 'OMR', amount, unit: 'visit', label: `${amount} OMR` }],
  source: 'owner', confidence: 1, laylaUseEn: '', laylaUseAr: '', revision: 1, sortOrder: 0, createdAt: h.m.now(), updatedAt: h.m.now() });
const supply = (hasib, { onHand = 2, reorderPoint = 5 } = {}) => hasib('item_save', { requestId: randomUUID(),
  item: { kind: 'product', nameAr: 'قفازات', nameEn: 'Gloves', category: 'Supplies', unit: 'box', trackStock: true },
  variants: [{ sku: 'GL-M', options: [], priceMinor: 0, costMinor: 3000, reorderPoint, openingStock: onHand }] });
const visit = (hasib, args) => hasib('order_create', { requestId: randomUUID(), channel: 'whatsapp', fulfilment: { type: 'in_store' }, confirm: true, ...args });

test('dental is live, labelled as a clinic and keeps retail and electronics as they were', async () => {
  assert.equal(isLivePack('dental'), true);
  assert.ok(industryCatalog().find(i => i.id === 'dental').live);
  const pack = hasibPack('dental');
  assert.deepEqual(pack.labels, { orders: 'visits', stock: 'services', customers: 'patients' });
  assert.equal(pack.noOrderNotes, true);
  assert.deepEqual(pack.fulfilment, ['in_store']);
  assert.deepEqual(pack.orderFields.map(f => [f.key, f.type]), [['visit_date', 'date'], ['branch', 'text']]);
  assert.ok(pack.expenseCategories.some(c => c.key === 'lab_fees') && !pack.expenseCategories.some(c => c.key === 'stock_purchase' || c.key === 'delivery'));
  for (const id of ['retail', 'retail-tech']) assert.equal(hasibPack(id).labels, undefined, `${id} keeps its own labels`);
  const { hasib } = await clinic();
  const o = (await hasib('overview')).value;
  assert.equal(o.pack.id, 'dental');
  assert.deepEqual(o.pack.labels, pack.labels);
  assert.deepEqual([o.pack.noOrderNotes, o.pack.internalStock, o.pack.serviceItems, o.pack.fulfilment], [true, true, true, ['in_store']], 'the dashboard gets every clinic rule');
  assert.deepEqual([...o.modules].sort(), ['expenses', 'insights', 'orders', 'stock']);
});

test('treatments come from Layla’s catalog and become chargeable visit lines', async () => {
  const { h, t, hasib } = await clinic();
  await treatment(h, t, { nameEn: 'Scaling and polishing', nameAr: 'تنظيف وتلميع', amount: 15 });
  await treatment(h, t, { nameEn: 'Whitening', nameAr: 'تبييض', amount: 60, type: 'from' });
  await treatment(h, t, { nameEn: 'Implant', nameAr: 'زراعة', type: 'quote' });
  await treatment(h, t, { nameEn: 'Draft only', nameAr: 'مسودة', amount: 9, status: 'draft' });
  assert.deepEqual((await hasib('services_sync')).value, { created: 3, updated: 0, archived: 0 });
  assert.deepEqual((await hasib('services_sync')).value, { created: 0, updated: 0, archived: 0 }, 'an unchanged catalog writes nothing');
  const items = (await hasib('items', { limit: 50 })).value.items;
  const byName = Object.fromEntries(items.map(i => [i.nameEn, i]));
  assert.deepEqual([byName['Scaling and polishing'].kind, byName['Scaling and polishing'].variants[0].priceMinor], ['service', 15000]);
  assert.equal(byName.Whitening.variants[0].priceMinor, 60000);
  assert.equal(byName.Implant.variants[0].priceMinor, 0, 'a quoted price is set on the visit');
  assert.equal(byName['Draft only'], undefined);

  // A price change and an archived treatment follow the catalog.
  const scaling = h.m.table('blueCatalogEntries').find(e => e.nameEn === 'Scaling and polishing');
  await h.m.db.patch(scaling._id, { prices: [{ type: 'fixed', currency: 'OMR', amount: 18, unit: 'visit', label: '18 OMR' }] });
  const implant = h.m.table('blueCatalogEntries').find(e => e.nameEn === 'Implant');
  await h.m.db.patch(implant._id, { status: 'archived' });
  assert.deepEqual(await syncServicesForOwner(h.m.ctx, String(t.accountId), h.m.now()), { created: 0, updated: 1, archived: 1 });
  const after = Object.fromEntries((await hasib('items', { limit: 50 })).value.items.map(i => [i.nameEn, i]));
  assert.equal(after['Scaling and polishing'].variants[0].priceMinor, 18000);
  assert.equal(after.Implant, undefined);
  assert.equal(servicePriceMinor([{ type: 'range', minimum: 20.5, maximum: 40 }]), 20500);
});

test('a retail shop’s catalog services are never turned into Hasib items', async () => {
  const { h, t } = await clinic({ name: 'r', sector: 'Retail & e-commerce', pack: 'retail' });
  await treatment(h, t, { nameEn: 'Hemming', nameAr: 'تقصير', amount: 2 });
  assert.equal(await syncServicesForOwner(h.m.ctx, String(t.accountId), h.m.now()), null);
  assert.equal(h.m.table('hasibItems').length, 0);
});

test('supplies stay internal: not in Layla’s catalog, never offered or ordered from chat', async () => {
  const { h, t, hasib } = await clinic();
  await supply(hasib);
  assert.equal(h.m.table('blueCatalogEntries').filter(e => e.source === 'hasib_stock').length, 0);
  await h.inbound(t, { from: '96891111111', text: 'Do you have gloves? I want 2 gloves', intent: 'services', reply: 'Thanks' });
  assert.equal(h.m.table('hasibOrders').length, 0);
  const out = h.m.table('blueMessages').filter(m => m.direction === 'out').map(m => m.text).join(' ');
  assert.doesNotMatch(out, /gloves|in stock/i);
});

test('switching a shop to dental takes its published stock out of Layla’s catalog', async () => {
  const { h, hasib } = await clinic({ name: 's', sector: 'Retail & e-commerce', pack: 'retail' });
  await supply(hasib);
  assert.equal(h.m.table('blueCatalogEntries').filter(e => e.source === 'hasib_stock' && e.status === 'approved').length, 1);
  assert.equal((await hasib('settings_update', { packId: 'dental' })).ok, true);
  assert.equal(h.m.table('blueCatalogEntries').filter(e => e.source === 'hasib_stock' && e.status === 'approved').length, 0);
});

test('a visit holds no notes, no delivery and only typed extra fields', async () => {
  const { h, t, hasib } = await clinic();
  await treatment(h, t, { nameEn: 'Check-up', nameAr: 'فحص', amount: 10 });
  await hasib('services_sync');
  const [item] = (await hasib('items')).value.items;
  const line = [{ variantId: item.variants[0].id, qty: 1 }];
  assert.equal((await visit(hasib, { lines: line, notes: 'Pain in lower left molar' })).reason, 'invalid_order', 'notes are refused, not dropped');
  assert.equal((await visit(hasib, { lines: line, fulfilment: { type: 'delivery', area: 'Qurum' } })).reason, 'invalid_order');
  assert.equal((await visit(hasib, { lines: line, deliveryFeeMinor: 1000 })).reason, 'invalid_order');
  assert.equal((await visit(hasib, { lines: line, customFields: [{ key: 'visit_date', value: 'next week, toothache' }] })).reason, 'invalid_order');
  assert.equal((await visit(hasib, { lines: line, customFields: [{ key: 'branch', value: 'x'.repeat(41) }] })).reason, 'invalid_order');
  const ok = await visit(hasib, { lines: line, customFields: [{ key: 'visit_date', value: '2027-01-15' }, { key: 'branch', value: 'Qurum' }] });
  assert.equal(ok.ok, true, ok.reason);
  assert.deepEqual(ok.value.customFields, [{ key: 'visit_date', value: '2027-01-15' }, { key: 'branch', value: 'Qurum' }]);
});

test('owner edits and imports keep only what Layla could capture, never clinical free text', async () => {
  const catalog = [{ nameEn: 'Root canal', nameAr: 'علاج العصب' }];
  assert.equal(validateFieldValue('dental', 'service', 'cleaning'), 'cleaning');
  assert.equal(validateFieldValue('dental', 'service', 'Whitening'), 'whitening');
  assert.equal(validateFieldValue('dental', 'service', 'root canal', catalog), 'Root canal');
  assert.equal(validateFieldValue('dental', 'service', 'my tooth hurts and my gum is swollen', catalog), null);
  assert.equal(validateFieldValue('dental', 'preferred_time', 'tomorrow 5pm'), 'tomorrow 5pm');
  assert.equal(validateFieldValue('dental', 'preferred_time', '2027-01-15'), '2027-01-15');
  assert.equal(validateFieldValue('dental', 'preferred_time', 'tomorrow, bleeding since yesterday'), null);
  assert.equal(validateFieldValue('dental', 'location', 'branch'), 'branch');
  assert.equal(validateFieldValue('dental', 'location', 'qurum'), 'Qurum');
  assert.equal(validateFieldValue('dental', 'location', 'allergic to penicillin'), null);
  assert.equal(validateFieldValue('real-estate', 'area', 'Near the big mosque'), 'Near the big mosque', 'other sectors keep their rules');

  const { h, t } = await clinic();
  await h.inbound(t, { from: '96891111111', text: 'I want a cleaning tomorrow 5pm', intent: 'services' });
  const contact = h.m.table('blueContacts')[0];
  const bad = await h.dashboard('contact_update', { sessionHash: t.sessionHash, contactId: contact._id, patch: { fields: [{ key: 'service', value: 'broken tooth, pain at night' }] } });
  assert.equal(bad.reason, 'invalid_contact_field');
  await treatment(h, t, { nameEn: 'Root canal', nameAr: 'علاج العصب', amount: 90 });
  const good = await h.dashboard('contact_update', { sessionHash: t.sessionHash, contactId: contact._id, patch: { fields: [{ key: 'service', value: 'Root canal' }] } });
  assert.equal(good.ok, true, good.reason);
});

test('dental chat text is kept for 24 hours; other businesses keep 30 days', async () => {
  assert.equal(textRetentionFor('dental'), CLINICAL_TEXT_RETENTION_MS);
  assert.equal(textRetentionFor('retail', 'dental'), CLINICAL_TEXT_RETENTION_MS, 'the Hasib industry alone is enough');
  assert.equal(textRetentionFor('retail', 'retail'), TEXT_RETENTION_MS);
  const { h, t } = await clinic();
  await h.inbound(t, { from: '96891111111', text: 'My tooth hurts, can I book a check-up?', intent: 'disabled' });
  for (const m of h.m.table('blueMessages')) assert.ok(m.textExpiresAt <= h.m.now() + DAY, `${m.direction} text expires within a day`);
  const shop = await clinic({ name: 'r', sector: 'Retail & e-commerce', pack: 'retail' }, h);
  await h.inbound(shop.t, { from: '96892222222', text: 'Hello', intent: 'services' });
  const shopMessage = h.m.table('blueMessages').find(m => m.accountId === shop.t.accountId && m.direction === 'in');
  assert.ok(shopMessage.textExpiresAt > h.m.now() + 29 * DAY);
});

test('text stored before the dental rule is brought down to 24 hours', async () => {
  const { h, t, hasib } = await clinic({ name: 'x', sector: 'Retail & e-commerce', pack: 'retail' });
  await h.inbound(t, { from: '96891111111', text: 'Old message about a filling', intent: 'services' });
  h.m.advance(2 * DAY);
  await h.inbound(t, { from: '96891111111', text: 'New message', intent: 'services' });
  assert.equal((await hasib('settings_update', { packId: 'dental' })).ok, true);
  const rows = h.m.table('blueMessages').filter(m => m.accountId === t.accountId);
  assert.equal(rows.filter(m => m.text === 'Old message about a filling').length, 0, 'text older than a day is erased');
  assert.ok(rows.filter(m => m.text !== undefined).every(m => m.textExpiresAt <= m.at + DAY));
  assert.equal((await shortenClinicalText(h.m.ctx, t.accountId, h.m.now())).shortened, 0, 'running again changes nothing');
});

test('Today for a clinic: service requests, unpaid visits, low supplies and Layla’s reception work', async () => {
  const { h, t, hasib } = await clinic();
  await treatment(h, t, { nameEn: 'Cleaning', nameAr: 'تنظيف', amount: 20 });
  await hasib('services_sync');
  await supply(hasib, { onHand: 1, reorderPoint: 3 });
  await h.inbound(t, { from: '96891111111', text: 'How much is cleaning?', intent: 'prices' });
  await h.inbound(t, { from: '96891111111', text: 'I want a cleaning tomorrow 5pm at the clinic', intent: 'disabled' });
  await h.inbound(t, { from: '96892222222', text: 'I would like whitening next week', intent: 'services' });
  await h.inbound(t, { from: '96893333333', text: 'Can I speak to a person?', intent: 'human', handoff: true });
  let d = (await hasib('today')).value;
  assert.equal(d.clinic, true);
  assert.equal(d.needsYou.requestsCount, 2);
  const first = d.needsYou.requests[0];
  assert.deepEqual([first.service.en, first.preferredTime, first.location], ['Cleaning', 'tomorrow 5pm', { en: 'Branch visit', ar: 'زيارة الفرع' }]);
  assert.deepEqual(d.needsYou.requests[1].service, { en: 'Whitening', ar: 'تبييض' }, 'a listed option carries both languages');
  assert.ok(first.conversationId);
  assert.deepEqual([d.layla.priceQuestions, d.layla.appointmentRequests, d.layla.serviceQuestions], [1, 1, 1]);
  assert.equal(d.needsYou.chats, 1);
  assert.deepEqual([d.needsYou.lowStockCount, d.needsYou.lowStock[0].nameEn], [1, 'Gloves']);
  assert.deepEqual(d.setup, { laylaSector: true, treatments: true, supplies: true });

  // Recording the visit clears the request and moves today's money by exactly its amount.
  const [cleaning] = (await hasib('items', { search: 'cleaning' })).value.items;
  const v = (await visit(hasib, { conversationId: first.conversationId, lines: [{ variantId: cleaning.variants[0].id, qty: 1 }] })).value;
  await hasib('payment_record', { requestId: randomUUID(), orderId: v.id, amountMinor: 5000, method: 'cash' });
  d = (await hasib('today')).value;
  assert.equal(d.needsYou.requestsCount, 1);
  assert.deepEqual(d.money, { revenueTodayMinor: 20000, visitsToday: 1, todayMinor: 5000, owedMinor: 15000 });
  assert.deepEqual([d.needsYou.unpaidCount, d.needsYou.unpaid[0].balanceMinor], [1, 15000]);
  const insights = (await hasib('insights', { period: 'today' })).value;
  assert.deepEqual([insights.sales.revenueMinor, insights.topProducts[0].nameEn, insights.topProducts[0].revenueMinor], [20000, 'Cleaning', 20000]);
});

test('a service is never counted as low stock', async () => {
  const { h, t, hasib } = await clinic();
  await treatment(h, t, { nameEn: 'Check-up', nameAr: 'فحص', amount: 10 });
  await hasib('services_sync');
  await hasib('item_save', { requestId: randomUUID(), item: { kind: 'service', nameAr: 'أشعة', nameEn: 'X-ray', category: 'Treatments', unit: 'visit', trackStock: false },
    variants: [{ sku: 'XR', options: [], priceMinor: 8000, reorderPoint: 2 }] });
  assert.equal((await hasib('overview')).value.counts.lowStock, 0);
  assert.equal((await hasib('today')).value.needsYou.lowStockCount, 0);
});

test('one clinic never sees another clinic’s requests, visits or money', async () => {
  const h = blueHarness();
  const a = await clinic({ name: 'a' }, h), b = await clinic({ name: 'b' }, h);
  await h.inbound(a.t, { from: '96891111111', text: 'I want a cleaning tomorrow', intent: 'services' });
  const aRequest = (await a.hasib('today')).value.needsYou.requests[0];
  assert.equal((await b.hasib('today')).value.needsYou.requestsCount, 0);
  const foreign = await visit(b.hasib, { conversationId: aRequest.conversationId, lines: [{ name: 'Cleaning', qty: 1, unitPriceMinor: 20000 }] });
  assert.equal(foreign.reason, 'conversation_not_found');
  assert.equal((await a.hasib('today')).value.needsYou.requestsCount, 1);
});

test('Record visit reads a clear visit date from what the patient said, and leaves unclear ones blank', async () => {
  const { visitDateFrom } = await import('../src/lib/hasib/visitDate.js');
  const saidAt = Date.parse('2026-09-28T06:00:00Z'), tz = 'Asia/Muscat'; // a Monday in Muscat
  assert.equal(visitDateFrom('tomorrow 5pm', saidAt, tz), '2026-09-29');
  assert.equal(visitDateFrom('بكره الساعه 5', saidAt, tz), '2026-09-29');
  assert.equal(visitDateFrom('day after tomorrow', saidAt, tz), '2026-09-30');
  assert.equal(visitDateFrom('today at 4pm', saidAt, tz), '2026-09-28');
  assert.equal(visitDateFrom('الخميس', saidAt, tz), '2026-10-01');
  assert.equal(visitDateFrom('monday', saidAt, tz), '2026-10-05', 'the same weekday means next week');
  assert.equal(visitDateFrom('5/10', saidAt, tz), '2026-10-05');
  assert.equal(visitDateFrom('2027-01-15', saidAt, tz), '2027-01-15');
  assert.equal(visitDateFrom('next week', saidAt, tz), '');
  assert.equal(visitDateFrom('31/02', saidAt, tz), '');
});

test('switching to dental shortens the newest text first, even on a busy account', async () => {
  const { h, t, hasib } = await clinic({ name: 'y', sector: 'Retail & e-commerce', pack: 'retail' });
  const person = await h.m.db.insert('blueConversations', { key: 'k', integrationId: t.integration.id, accountId: t.accountId, number: '96891111111', lastInbound: 0, takeover: false, optout: false, updatedAt: h.m.now() });
  const now = h.m.now();
  for (let i = 0; i < 600; i++) {
    const at = now - i * 60000; // one a minute, newest first
    await h.m.db.insert('blueMessages', { key: `m${i}`, integrationId: t.integration.id, accountId: t.accountId, conversationId: person, direction: 'in', text: `message ${i}`, at,
      expiresAt: at + 30 * DAY, textExpiresAt: at + 30 * DAY, status: 'received' });
  }
  assert.equal((await hasib('settings_update', { packId: 'dental' })).ok, true);
  const rows = h.m.table('blueMessages').filter(m => m.accountId === t.accountId);
  assert.ok(rows.every(m => m.text === undefined || m.textExpiresAt <= m.at + DAY), 'every message, newest included, now expires within a day');
  assert.equal((await shortenClinicalText(h.m.ctx, t.accountId, h.m.now())).shortened, 0, 'nothing left to shorten');
});
