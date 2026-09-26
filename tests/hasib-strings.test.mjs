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
  assert.equal(createHasibStrings('ar').money(12500), '12.500 ر.ع.');
  assert.equal(createHasibStrings('ar').name({ nameAr: 'عباية', nameEn: 'Abaya' }), 'عباية');
  assert.equal(createHasibStrings('en').name({ nameAr: 'عباية', nameEn: '' }), 'عباية');
});
