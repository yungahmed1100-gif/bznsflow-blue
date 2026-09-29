import test from 'node:test';
import assert from 'node:assert/strict';
import { hasibPack, industryCatalog, HASIB_LIVE_PACKS, HASIB_PREVIEW_PACKS } from '../config/hasib-packs.js';
import { BUSINESS_INDUSTRIES } from '../src/lib/industries.js';
import { createHasibStrings } from '../src/lib/hasib/strings.js';
import { ordersCsv } from '../src/lib/hasib/exports.js';

test('one catalog covers Setup plus electronics and labels live, preview and pending packs', () => {
  const catalog = industryCatalog();
  assert.deepEqual(new Set(catalog.map(row => row.id)), new Set(BUSINESS_INDUSTRIES.map(row => row.id)));
  assert.equal(catalog.length, 24);
  assert.deepEqual(new Set(catalog.filter(row => row.status === 'live').map(row => row.id)), new Set(HASIB_LIVE_PACKS));
  assert.deepEqual(new Set(catalog.filter(row => row.status === 'preview').map(row => row.id)), new Set(HASIB_PREVIEW_PACKS));
  assert.equal(catalog.filter(row => row.status === 'pending').length, 9);
  for (const row of catalog) assert.ok(row.id && row.en && row.ar && ['live', 'preview', 'pending'].includes(row.status));
});

test('all 15 built owner packs specify exactly three distinct bilingual measures and relevant labels', () => {
  for (const id of [...HASIB_LIVE_PACKS, ...HASIB_PREVIEW_PACKS]) {
    const pack = hasibPack(id);
    assert.equal(pack.id, id);
    assert.equal(pack.todayMetrics.length, 3, id);
    assert.equal(new Set(pack.todayMetrics.map(m => m.id)).size, 3, id);
    for (const measure of pack.todayMetrics) assert.ok(measure.en && measure.ar && measure.go?.length, `${id}:${measure.id}`);
    assert.ok(pack.ownerUi.work.en && pack.ownerUi.work.ar && pack.ownerUi.stock.en && pack.ownerUi.stock.ar, id);
    assert.equal(pack.thresholds.unsoldDays, 60);
    assert.equal(pack.thresholds.absenceDays, 14);
    assert.ok(!pack.orderFields.some(f => f.key === 'pickup_at'), 'fulfilment.dueAt owns pickup time');
  }
  assert.equal(HASIB_LIVE_PACKS.length + HASIB_PREVIEW_PACKS.length, 15);
  assert.deepEqual(HASIB_LIVE_PACKS, ['retail', 'retail-tech', 'dental', 'real-estate', 'construction', 'automotive']);
});

test('every live dashboard exposes bilingual icon actions with valid destinations', () => {
  for (const id of HASIB_LIVE_PACKS) {
    const dashboard = hasibPack(id).dashboard;
    assert.ok(dashboard.icon, id);
    assert.ok(dashboard.actions.length >= 4, id);
    assert.equal(new Set(dashboard.actions.map(action => action[0])).size, dashboard.actions.length, id);
    for (const [actionId, en, ar, icon, go] of dashboard.actions) {
      assert.ok(actionId && en && ar && icon, `${id}:${actionId}`);
      assert.ok(['today', 'orders', 'stock', 'service', 'money', 'customers'].includes(go[0]), `${id}:${actionId}:${go[0]}`);
      if (go[1]?.action) assert.ok(['product', 'import', 'repair', 'trade-in', 'warranty', 'setup', 'property', 'opportunity', 'viewing', 'offer', 'follow-up', 'project', 'progress', 'variation', 'commitment', 'appointment', 'vehicle', 'work-order'].includes(go[1].action));
    }
  }
});

test('Money exports share recorded recipe costs and keep unknown costs blank', () => {
  const order = { number: 1, createdAt: 1, status: 'completed', paymentStatus: 'paid', channel: 'walk_in', lines: [{ name: 'Coffee', qty: 2, unitPriceMinor: 2000, netMinor: 4000, vatMinor: 0, unitCostMinor: 800, costKnown: true }], pricesIncludeVat: false, vatMinor: 0, deliveryMinor: 0, totalMinor: 4000, paidMinor: 4000, balanceMinor: 0 };
  assert.match(ordersCsv([order]), /1\.600,,2\.400/);
  assert.ok(!ordersCsv([{ ...order, lines: [{ ...order.lines[0], costKnown: false }] }]).includes('2.400'));
});

test('plain-language money and missing-record messages exist in Arabic and English', () => {
  for (const lang of ['en', 'ar']) {
    const h = createHasibStrings(lang);
    for (const key of ['notEnoughRecords', 'details', 'missingCounts', 'expectedProfit', 'waste_remake']) assert.notEqual(h.t(key), key);
  }
  assert.equal(createHasibStrings('en').t('owed'), 'Customers owe you');
  assert.equal(createHasibStrings('en').t('contribution'), 'Left after item costs');
});
