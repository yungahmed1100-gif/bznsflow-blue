// Order totals and VAT. Pure and exact: integer minor units, VAT rounded half up
// per line (the figure an invoice line prints), then summed.
import { isMinor } from './money.js';

export const MAX_LINES = 50;
export const MAX_QTY = 10_000;
const BPS = 10_000;

const fail = reason => { throw Object.assign(new Error(reason), { reason }); };
const roundDiv = (numerator, denominator) => Math.floor((numerator * 2 + denominator) / (denominator * 2));

/** VAT inside a gross amount, or on top of a net amount. */
function vatFor(amount, rateBps, inclusive) {
  if (!rateBps) return 0;
  return inclusive ? roundDiv(amount * rateBps, BPS + rateBps) : roundDiv(amount * rateBps, BPS);
}

function validLine(l) {
  return l && Number.isSafeInteger(l.qty) && l.qty > 0 && l.qty <= MAX_QTY && isMinor(l.unitPriceMinor)
    && (l.discountMinor === undefined || isMinor(l.discountMinor)) && (l.vatBps === undefined || (Number.isSafeInteger(l.vatBps) && l.vatBps >= 0 && l.vatBps <= BPS))
    && isMinor(l.qty * l.unitPriceMinor) && (l.discountMinor || 0) <= l.qty * l.unitPriceMinor;
}

/**
 * `vat` is the business setting: { registered, rateBps, pricesIncludeVat }.
 * Line amounts are what the owner entered. With inclusive pricing they already
 * contain VAT; otherwise VAT is added on top. Delivery is taxed at the standard rate.
 */
export function orderTotals({ lines, deliveryFeeMinor = 0, vat }) {
  if (!Array.isArray(lines) || !lines.length || lines.length > MAX_LINES || !lines.every(validLine)) fail('invalid_order_lines');
  if (!isMinor(deliveryFeeMinor)) fail('invalid_delivery_fee');
  const registered = !!vat?.registered, inclusive = registered && !!vat.pricesIncludeVat, standard = registered ? vat.rateBps : 0;
  const out = lines.map(l => {
    const gross = l.qty * l.unitPriceMinor, discountMinor = l.discountMinor || 0, netMinor = gross - discountMinor;
    const rate = registered ? (l.vatBps ?? standard) : 0;
    return { ...l, discountMinor, vatBps: rate, grossMinor: gross, netMinor, vatMinor: vatFor(netMinor, rate, inclusive) };
  });
  const sum = key => out.reduce((n, l) => n + l[key], 0);
  const subtotalMinor = sum('grossMinor'), discountMinor = sum('discountMinor'), lineNet = sum('netMinor');
  const deliveryVat = vatFor(deliveryFeeMinor, standard, inclusive);
  const vatMinor = sum('vatMinor') + deliveryVat;
  const totalMinor = lineNet + deliveryFeeMinor + (inclusive ? 0 : vatMinor);
  if (!isMinor(totalMinor)) fail('invalid_order_lines');
  return { lines: out, subtotalMinor, discountMinor, deliveryMinor: deliveryFeeMinor, vatMinor, totalMinor };
}

export function paymentStatus(totalMinor, paidMinor) {
  if (paidMinor > totalMinor) return 'overpaid';
  if (paidMinor === totalMinor) return 'paid';
  return paidMinor > 0 ? 'partial' : 'unpaid';
}
