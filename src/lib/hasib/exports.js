// Accountant exports and customer receipts, built in the browser from
// tenant-scoped API responses. CSV cells go through the spreadsheet-safe writer.
import { orderProfit } from '../../../convex/hasib/profit.js';
import { toCsv } from '../dashboard/csv.js';
import { formatMinor } from '../../../convex/hasib/money.js';

const iso = ms => (ms ? new Date(ms).toISOString() : '');

/** One row per order line: the shape Qoyod, Daftra and Wafeq imports can map. */
export function ordersCsv(orders) {
  const rows = [['order', 'created_at', 'status', 'payment_status', 'channel', 'customer', 'line', 'sku', 'qty', 'unit_price', 'line_net', 'line_vat', 'delivery', 'order_total', 'paid', 'balance', 'item_cost_ex_vat', 'expected_profit_ex_vat', 'recorded_profit_ex_vat']];
  for (const o of orders) {
    const customer = o.contact?.name || o.customerName || '';
    const profit = orderProfit(o);
    o.lines.forEach((l, i) => rows.push([o.number, iso(o.createdAt), o.status, o.paymentStatus, o.channel, customer, l.name, l.sku || '', l.qty, formatMinor(l.unitPriceMinor),
      formatMinor(l.netMinor), formatMinor(l.vatMinor), i === 0 ? formatMinor(o.deliveryMinor) : '', i === 0 ? formatMinor(o.totalMinor) : '', i === 0 ? formatMinor(o.paidMinor) : '', i === 0 ? formatMinor(o.balanceMinor) : '', profit.lines[i].costKnown ? formatMinor(profit.lines[i].cost) : '', i === 0 && profit.profitMinor !== null && !['completed', 'delivered', 'cancelled', 'returned'].includes(o.status) ? formatMinor(profit.profitMinor) : '', i === 0 && profit.profitMinor !== null && ['completed', 'delivered'].includes(o.status) ? formatMinor(profit.profitMinor) : '']));
  }
  return toCsv(rows);
}

export function expensesCsv(expenses) {
  return toCsv([['number', 'paid_on', 'category', 'amount', 'vat', 'method', 'paid_to', 'note', 'void'],
    ...expenses.map(e => [e.number, e.paidOn, e.category, formatMinor(e.amountMinor), formatMinor(e.vatMinor), e.method, e.vendor, e.note, e.voided ? 'yes' : 'no'])]);
}

/** Plain-text receipt the owner can paste into WhatsApp. Figures come from the saved order. */
export function receiptText(order, h, business) {
  const money = minor => h.money(minor);
  const lines = order.lines.map(l => `${l.qty} × ${h.lineName ? h.lineName(l) : l.name} — ${money(l.netMinor)}`);
  const totals = [
    order.deliveryMinor > 0 && `${h.t('delivery')}: ${money(order.deliveryMinor)}`,
    order.vatMinor > 0 && `${h.t('vat')}: ${money(order.vatMinor)}${order.pricesIncludeVat ? ` (${h.t('pricesIncludeVat')})` : ''}`,
    `${h.t('total')}: ${money(order.totalMinor)}`,
    order.paidMinor > 0 && `${h.t('paid')}: ${money(order.paidMinor)}`,
    order.balanceMinor > 0 && `${h.t('balance')}: ${money(order.balanceMinor)}`,
  ].filter(Boolean);
  return [business, h.t('orderNumber', { number: order.number }), '', ...lines, '', ...totals].filter(x => x !== undefined).join('\n').trim();
}
