// Pure Hasib domain rules: money, totals/VAT, the order state machine, stock
// policy and industry packs. No database, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, formatMinor, MAX_MINOR } from '../convex/hasib/money.js';
import { orderTotals, paymentStatus } from '../convex/hasib/totals.js';
import { canTransition, nextStatuses, STATUSES, deductsStock, stockEffect } from '../convex/hasib/orderMachine.js';
import { applyStockPolicy } from '../convex/hasib/stock.js';
import { hasibPack, HASIB_PACKS } from '../config/hasib-packs.js';
import { PRIMARY_SECTOR_IDS } from '../config/layla-sector-packs.js';

const VAT_OFF = { registered: false, rateBps: 500, pricesIncludeVat: false };
const VAT_EXCL = { registered: true, rateBps: 500, pricesIncludeVat: false };
const VAT_INCL = { registered: true, rateBps: 500, pricesIncludeVat: true };

test('amounts parse to integer baisa, including Arabic-Indic digits and the Arabic decimal mark', () => {
  assert.equal(parseAmount('12.5'), 12500);
  assert.equal(parseAmount('12.500'), 12500);
  assert.equal(parseAmount('0.005'), 5);
  assert.equal(parseAmount('١٢٫٥'), 12500);
  assert.equal(parseAmount('۱۲.۲۵۰'), 12250);
  assert.equal(parseAmount(' 7 '), 7000);
  assert.equal(parseAmount(3.25), 3250);
  for (const bad of ['', 'abc', '1.2345', '-1', '1e3', '1,000', null, undefined, NaN, Infinity, '10000001']) {
    assert.equal(parseAmount(bad), null, String(bad));
  }
  assert.equal(parseAmount('10000000'), MAX_MINOR);
});

test('minor units format with three decimals', () => {
  assert.equal(formatMinor(12500), '12.500');
  assert.equal(formatMinor(5), '0.005');
  assert.equal(formatMinor(-1250), '-1.250');
  assert.equal(formatMinor(0), '0.000');
});

test('totals without VAT sum lines, discounts and delivery exactly', () => {
  const t = orderTotals({ lines: [{ qty: 2, unitPriceMinor: 12500 }, { qty: 1, unitPriceMinor: 3000, discountMinor: 500 }], deliveryFeeMinor: 1500, vat: VAT_OFF });
  assert.deepEqual([t.subtotalMinor, t.discountMinor, t.vatMinor, t.deliveryMinor, t.totalMinor], [28000, 500, 0, 1500, 29000]);
  assert.deepEqual(t.lines.map(l => l.netMinor), [25000, 2500]);
});

test('VAT on top of prices rounds half up per line and taxes delivery', () => {
  const t = orderTotals({ lines: [{ qty: 1, unitPriceMinor: 10010 }], deliveryFeeMinor: 1000, vat: VAT_EXCL });
  // 10.010 × 5% = 0.5005 → 0.501 ; delivery 1.000 × 5% = 0.050
  assert.equal(t.lines[0].vatMinor, 501);
  assert.equal(t.vatMinor, 551);
  assert.equal(t.totalMinor, 10010 + 1000 + 551);
});

test('VAT-inclusive prices extract VAT without changing what the customer pays', () => {
  const t = orderTotals({ lines: [{ qty: 3, unitPriceMinor: 10500 }], deliveryFeeMinor: 0, vat: VAT_INCL });
  assert.equal(t.totalMinor, 31500);
  assert.equal(t.vatMinor, 1500);
  assert.equal(t.lines[0].netMinor, 31500);
});

test('an exempt line (rate 0) carries no VAT even for a registered business', () => {
  const t = orderTotals({ lines: [{ qty: 1, unitPriceMinor: 5000, vatBps: 0 }], vat: VAT_EXCL });
  assert.equal(t.vatMinor, 0);
  assert.equal(t.totalMinor, 5000);
});

test('invalid lines are rejected, never clamped', () => {
  for (const lines of [[], [{ qty: 0, unitPriceMinor: 1 }], [{ qty: 1.5, unitPriceMinor: 1 }], [{ qty: 1, unitPriceMinor: -1 }],
    [{ qty: 1, unitPriceMinor: 100, discountMinor: 101 }], [{ qty: 10001, unitPriceMinor: 1 }], Array.from({ length: 51 }, () => ({ qty: 1, unitPriceMinor: 1 }))]) {
    assert.throws(() => orderTotals({ lines, vat: VAT_OFF }), /invalid_order_lines/, JSON.stringify(lines).slice(0, 60));
  }
  assert.throws(() => orderTotals({ lines: [{ qty: 1, unitPriceMinor: 1 }], deliveryFeeMinor: -5, vat: VAT_OFF }), /invalid_delivery_fee/);
});

test('payment status follows paid versus total', () => {
  assert.equal(paymentStatus(1000, 0), 'unpaid');
  assert.equal(paymentStatus(1000, 400), 'partial');
  assert.equal(paymentStatus(1000, 1000), 'paid');
  assert.equal(paymentStatus(1000, 1200), 'overpaid');
  assert.equal(paymentStatus(0, 0), 'paid');
});

test('order state machine allows exactly the documented transitions', () => {
  const allowed = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['ready', 'out_for_delivery', 'completed', 'cancelled'],
    ready: ['out_for_delivery', 'completed', 'cancelled'],
    out_for_delivery: ['delivered', 'failed_delivery'],
    failed_delivery: ['out_for_delivery', 'cancelled'],
    delivered: ['returned'], completed: ['returned'], cancelled: [], returned: [],
  };
  assert.deepEqual(Object.keys(allowed).sort(), [...STATUSES].sort());
  for (const from of STATUSES) for (const to of STATUSES) {
    assert.equal(canTransition(from, to), allowed[from].includes(to), `${from} → ${to}`);
  }
  assert.deepEqual(nextStatuses('pending'), ['confirmed', 'cancelled']);
  assert.equal(canTransition('nope', 'confirmed'), false);
});

test('stock is deducted once on confirmation and restored on cancel or return', () => {
  assert.equal(deductsStock('pending'), false);
  assert.equal(stockEffect('pending', 'confirmed'), -1);
  assert.equal(stockEffect('confirmed', 'ready'), 0);
  assert.equal(stockEffect('ready', 'cancelled'), 1);
  assert.equal(stockEffect('pending', 'cancelled'), 0);
  assert.equal(stockEffect('delivered', 'returned'), 1);
  assert.equal(stockEffect('failed_delivery', 'cancelled'), 1);
});

test('stock policy warns or blocks when a sale exceeds what is on hand', () => {
  assert.deepEqual(applyStockPolicy({ onHand: 5, delta: -3, policy: 'block' }), { ok: true, onHand: 2, short: false });
  assert.deepEqual(applyStockPolicy({ onHand: 1, delta: -3, policy: 'warn' }), { ok: true, onHand: -2, short: true });
  assert.deepEqual(applyStockPolicy({ onHand: 1, delta: -3, policy: 'block' }), { ok: false, reason: 'insufficient_stock', onHand: 1, short: true });
  // Restocking is never blocked, even from a negative balance.
  assert.deepEqual(applyStockPolicy({ onHand: -2, delta: 4, policy: 'block' }), { ok: true, onHand: 2, short: false });
});

test('every Layla sector has a valid Hasib pack; retail is the first full pack', () => {
  for (const id of [...PRIMARY_SECTOR_IDS, 'other']) {
    const pack = hasibPack(id);
    assert(pack, id);
    for (const core of ['orders', 'stock', 'expenses', 'insights']) assert.equal(pack.modules[core], 'available', `${id} ${core}`);
    assert.equal(pack.modules.demand, pack.archetype === 'catalog' ? 'available' : 'planned', `${id} demand follows Layla's item capture`);
    for (const f of pack.variantOptions) assert(f.key && f.en && f.ar, `${id} variant option`);
    for (const c of pack.expenseCategories) assert(c.key && c.en && c.ar, `${id} expense category`);
    for (const [k, v] of Object.entries(pack.modules)) assert(['available', 'planned', 'off'].includes(v), `${id} ${k}=${v}`);
  }
  assert.deepEqual(hasibPack('retail').variantOptions.map(o => o.key), ['size', 'length', 'colour']);
  assert.equal(hasibPack('dental').modules.appointments, 'planned');
  assert.equal(hasibPack('real-estate').modules.stock, 'available');
  assert.equal(hasibPack('unknown-sector').id, 'other');
  assert.equal(Object.keys(HASIB_PACKS).length, PRIMARY_SECTOR_IDS.length + 2, 'sector packs + other + retail-tech');
});
