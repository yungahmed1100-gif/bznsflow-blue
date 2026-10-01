import test from 'node:test';
import assert from 'node:assert/strict';
import { createHasibStrings, HASIB_EN_KEYS, HASIB_AR_KEYS, HASIB_REASON_KEYS } from '../src/lib/hasib/strings.js';
import { STATUSES } from '../convex/hasib/orderMachine.js';
import { PAYMENT_METHODS, CHANNELS, FULFILMENT } from '../convex/hasib/ordersState.js';

test('Arabic and English Hasib copy have exactly the same keys', () => {
  assert.deepEqual([...HASIB_AR_KEYS].sort(), [...HASIB_EN_KEYS].sort());
  assert.deepEqual([...HASIB_REASON_KEYS.ar].sort(), [...HASIB_REASON_KEYS.en].sort());
});

test('every status, payment method, channel and fulfilment type has a label', () => {
  const keys = new Set(HASIB_EN_KEYS);
  for (const s of STATUSES) assert(keys.has(`st_${s}`), s);
  for (const m of PAYMENT_METHODS) assert(keys.has(`pm_${m}`), m);
  for (const c of CHANNELS) assert(keys.has(`ch_${c}`), c);
  for (const f of FULFILMENT) assert(keys.has(`ful_${f}`), f);
});

test('money reads as three-decimal OMR in both languages', () => {
  assert.equal(createHasibStrings('en').money(12500), '12.500 OMR');
  assert.equal(createHasibStrings('en').money(1282000), '1,282.000 OMR');
  assert.equal(createHasibStrings('en').money(-5), '-0.005 OMR');
  assert.equal(createHasibStrings('ar').money(12500), '12.500 ر.ع.');
  assert.equal(createHasibStrings('ar').name({ nameAr: 'عباية', nameEn: 'Abaya' }), 'عباية');
  assert.equal(createHasibStrings('en').name({ nameAr: 'عباية', nameEn: '' }), 'عباية');
});

test('receipts and CSV exports carry the saved figures, in the owner’s language', async () => {
  const { receiptText, ordersCsv, expensesCsv } = await import('../src/lib/hasib/exports.js');
  const order = { number: 7, status: 'confirmed', paymentStatus: 'partial', channel: 'whatsapp', contact: { name: '=HYPERLINK("x")' }, customerName: '', createdAt: 0,
    lines: [{ name: 'عباية سوداء — 52', sku: 'AB-52', qty: 2, unitPriceMinor: 25000, netMinor: 50000, vatMinor: 0 }], deliveryMinor: 1500, vatMinor: 0, pricesIncludeVat: false,
    totalMinor: 51500, paidMinor: 20000, balanceMinor: 31500 };
  const ar = receiptText(order, createHasibStrings('ar'), 'Noor Abayas');
  assert.match(ar, /طلب رقم 7/);
  assert.match(ar, /2 × عباية سوداء — 52 — 50.000 ر.ع./);
  assert.match(ar, /المتبقي: 31.500 ر.ع./);
  assert.match(receiptText(order, createHasibStrings('en'), 'Noor Abayas'), /Balance: 31.500 OMR/);
  const csv = ordersCsv([order]);
  assert.match(csv, /51\.500/);
  assert(!/^=HYPERLINK/m.test(csv.split('\n')[1].split(',')[5] || ''), 'formula injection is neutralised');
  assert.match(expensesCsv([{ number: 1, paidOn: '2027-01-15', category: 'rent', amountMinor: 30000, vatMinor: 0, method: 'cash', vendor: '', note: '', voided: false }]), /30\.000/);
});

test('order counts agree with the number in both languages', () => {
  const ar = createHasibStrings('ar'), en = createHasibStrings('en');
  assert.deepEqual([1, 2, 3, 10, 11, 71].map(ar.orders), ['طلب واحد', 'طلبان', '3 طلبات', '10 طلبات', '11 طلباً', '71 طلباً']);
  assert.deepEqual([0, 1, 2].map(en.orders), ['0 orders', '1 order', '2 orders']);
});


test('an industry’s own words replace the defaults in both languages, and only for that industry', async () => {
  const { HASIB_PACK_WORD_KEYS } = await import('../src/lib/hasib/strings.js');
  for (const [id, keys] of Object.entries(HASIB_PACK_WORD_KEYS)) {
    assert.deepEqual([...keys.ar].sort(), [...keys.en].sort(), `${id} overrides match`);
    for (const k of keys.en) assert(HASIB_EN_KEYS.includes(k), `${id}.${k} overrides a real key`);
  }
  assert.equal(createHasibStrings('en', 'dental').t('orders'), 'Visits');
  assert.equal(createHasibStrings('ar', 'dental').t('orders'), 'الزيارات');
  assert.equal(createHasibStrings('en', 'dental').orders(2), '2 visits');
  assert.equal(createHasibStrings('ar', 'dental').orders(2), 'زيارتان');
  assert.equal(createHasibStrings('en', 'retail').t('orders'), 'Orders');
  assert.equal(createHasibStrings('en').t('stock'), 'Stock');
});
