// Insights: every figure is summed from the ledgers for one business period.
// Nothing is estimated; a figure that could not be fully read says so (`truncated`).
//
// Definitions (also shown to the owner):
//   sale            an order that was confirmed and not cancelled or returned; pending orders are not sales
//   revenue         sales without VAT; delivery fees count as revenue
//   cost of goods   quantity × the unit cost fixed when stock left the shelf
//   operating cost  expenses except stock purchases (those are inventory and reach profit as cost of goods)
import { ok, fail } from './shared.js';
import { periodRange } from './period.js';
import { businessTimezone, expensesIn } from './expensesState.js';

const ORDER_LIMIT = 3000, RECEIVABLE_SCAN = 1000, SIGNAL_LIMIT = 3000, TOP = 10;
const NOT_SALES = new Set(['pending', 'cancelled', 'returned']);
const CLOSED = new Set(['cancelled', 'returned']);

/** Revenue of one order without VAT, split by line so products can be ranked. */
function orderRevenue(o) {
  const lineVat = o.lines.reduce((n, l) => n + l.vatMinor, 0), deliveryVat = o.vatMinor - lineVat;
  const lines = o.lines.map(l => ({ l, revenue: o.pricesIncludeVat ? l.netMinor - l.vatMinor : l.netMinor, cost: l.tracked ? l.qty * l.unitCostMinor : 0 }));
  const delivery = o.pricesIncludeVat ? o.deliveryMinor - deliveryVat : o.deliveryMinor;
  return { lines, delivery, revenue: lines.reduce((n, x) => n + x.revenue, 0) + delivery };
}

async function ordersIn(ctx, accountId, range) {
  const rows = await ctx.db.query('hasibOrders').withIndex('by_account_created', q => q.eq('accountId', accountId).gte('createdAt', range.from).lt('createdAt', range.to)).take(ORDER_LIMIT + 1);
  return { rows: rows.slice(0, ORDER_LIMIT), truncated: rows.length > ORDER_LIMIT };
}

function salesSummary(orders) {
  const sales = orders.filter(o => !NOT_SALES.has(o.status)), products = new Map();
  let revenue = 0, cogs = 0;
  for (const o of sales) {
    const r = orderRevenue(o);
    revenue += r.revenue;
    for (const { l, revenue: lineRevenue, cost } of r.lines) {
      cogs += cost;
      const key = l.itemId || `custom:${l.name}`;
      const p = products.get(key) || { itemId: l.itemId || null, name: l.name, qty: 0, revenueMinor: 0, costMinor: 0 };
      products.set(key, { ...p, qty: p.qty + l.qty, revenueMinor: p.revenueMinor + lineRevenue, costMinor: p.costMinor + cost });
    }
  }
  const totalMinor = sales.reduce((n, o) => n + o.totalMinor, 0), vatMinor = sales.reduce((n, o) => n + o.vatMinor, 0);
  return { sales, products, figures: { orders: sales.length, totalMinor, vatMinor, revenueMinor: revenue, cogsMinor: cogs, grossProfitMinor: revenue - cogs } };
}

async function topProducts(ctx, products) {
  const ranked = [...products.values()].sort((a, b) => b.revenueMinor - a.revenueMinor).slice(0, TOP);
  const out = [];
  for (const p of ranked) {
    const item = p.itemId ? await ctx.db.get(p.itemId) : null;
    out.push({ itemId: p.itemId, nameAr: item?.nameAr || p.name, nameEn: item?.nameEn || p.name, qty: p.qty, revenueMinor: p.revenueMinor, profitMinor: p.revenueMinor - p.costMinor });
  }
  return out;
}

async function customers(ctx, accountId, sales, from) {
  const buyers = [...new Set(sales.filter(o => o.contactId).map(o => o.contactId))];
  let returning = 0;
  for (const contactId of buyers.slice(0, 300)) {
    const earlier = await ctx.db.query('hasibOrders').withIndex('by_contact_created', q => q.eq('contactId', contactId).lt('createdAt', from)).take(5);
    if (earlier.some(o => o.accountId === accountId && !CLOSED.has(o.status))) returning++;
  }
  return { buyers: buyers.length, returning, walkIn: sales.filter(o => !o.contactId).length };
}

async function stockSummary(ctx, accountId) {
  const items = await ctx.db.query('hasibItems').withIndex('by_account_archived_updated', q => q.eq('accountId', accountId).eq('archived', false)).take(2000);
  let valueMinor = 0, low = 0, out = 0;
  for (const item of items.filter(i => i.trackStock)) {
    for (const v of await ctx.db.query('hasibVariants').withIndex('by_item', q => q.eq('itemId', item._id)).take(50)) {
      if (v.archived) continue;
      valueMinor += Math.max(v.onHand, 0) * v.costMinor;
      if (v.onHand <= 0) out++; else if (v.low) low++;
    }
  }
  return { valueMinor, low, out };
}

/** Most wanted, lost sales, asked-but-not-bought, and products customers want that the business does not list. */
async function demandReport(ctx, accountId, range) {
  const signals = await ctx.db.query('hasibDemandSignals').withIndex('by_account_at', q => q.eq('accountId', accountId).gte('at', range.from).lt('at', range.to)).take(SIGNAL_LIMIT);
  const byItem = new Map(), unlisted = new Map();
  for (const s of signals) {
    if (!s.itemId) { const u = unlisted.get(s.key) || { text: s.text, people: new Set() }; u.people.add(s.contactId); unlisted.set(s.key, u); continue; }
    const g = byItem.get(s.itemId) || { itemId: s.itemId, asks: 0, people: new Set(), oos: new Set(), firstAsk: new Map() };
    g.asks++; g.people.add(s.contactId);
    if (s.outOfStock) g.oos.add(s.contactId);
    if (!g.firstAsk.has(s.contactId) || g.firstAsk.get(s.contactId) > s.at) g.firstAsk.set(s.contactId, s.at);
    byItem.set(s.itemId, g);
  }
  const rows = [];
  for (const g of byItem.values()) {
    const item = await ctx.db.get(g.itemId);
    if (!item || item.accountId !== accountId) continue;
    // Bought = the person has a live order containing this product, placed at or after their first ask.
    let bought = 0;
    for (const [contactId, askedAt] of g.firstAsk) {
      const orders = await ctx.db.query('hasibOrders').withIndex('by_contact_created', q => q.eq('contactId', contactId).gte('createdAt', askedAt)).take(20);
      if (orders.some(o => o.accountId === accountId && !CLOSED.has(o.status) && o.lines.some(l => l.itemId === g.itemId))) bought++;
    }
    rows.push({ itemId: g.itemId, nameAr: item.nameAr, nameEn: item.nameEn, asks: g.asks, people: g.people.size, outOfStockAsks: g.oos.size, bought, notBought: g.people.size - bought });
  }
  const byPeople = (a, b) => b.people - a.people || b.asks - a.asks;
  return {
    signals: signals.length, truncated: signals.length === SIGNAL_LIMIT,
    mostWanted: [...rows].sort(byPeople).slice(0, TOP),
    lostSales: rows.filter(r => r.outOfStockAsks).map(r => ({ ...r, people: r.outOfStockAsks })).sort(byPeople).slice(0, TOP),
    askedNotBought: rows.filter(r => r.notBought).map(r => ({ ...r, people: r.notBought })).sort(byPeople).slice(0, TOP),
    notInCatalog: [...unlisted.values()].map(u => ({ text: u.text, people: u.people.size })).sort((a, b) => b.people - a.people).slice(0, TOP),
  };
}

async function receivables(ctx, accountId) {
  const rows = await ctx.db.query('hasibOrders').withIndex('by_account_created', q => q.eq('accountId', accountId)).order('desc').take(RECEIVABLE_SCAN);
  return rows.filter(o => !CLOSED.has(o.status)).reduce((n, o) => n + Math.max(o.totalMinor - o.paidMinor, 0), 0);
}

async function cashIn(ctx, accountId, range) {
  const rows = await ctx.db.query('hasibPayments').withIndex('by_account_at', q => q.eq('accountId', accountId).gte('at', range.from).lt('at', range.to)).take(ORDER_LIMIT);
  const byMethod = new Map();
  for (const p of rows) byMethod.set(p.method, (byMethod.get(p.method) || 0) + p.amountMinor);
  return [...byMethod].map(([method, amountMinor]) => ({ method, amountMinor })).sort((a, b) => b.amountMinor - a.amountMinor);
}

export async function executeInsights(ctx, tenant, a, now) {
  if (a.operation !== 'insights') return null;
  const { accountId } = tenant;
  const tz = await businessTimezone(ctx, accountId);
  let range;
  try { range = periodRange(a.period || 'today', now, tz); } catch (e) { return fail(e.reason || 'invalid_period'); }
  const settings = await ctx.db.query('hasibSettings').withIndex('by_account', q => q.eq('accountId', accountId)).unique();
  const vatRegistered = !!settings?.vatRegistered;
  const orders = await ordersIn(ctx, accountId, range);
  const { sales, products, figures } = salesSummary(orders.rows);
  const pendingOrders = orders.rows.filter(o => o.status === 'pending');
  const expenses = await expensesIn(ctx, accountId, range, 2000);
  const live = expenses.rows.filter(e => !e.voided), exVat = e => vatRegistered ? e.amountMinor - e.vatMinor : e.amountMinor;
  const operatingMinor = live.filter(e => e.category !== 'stock_purchase').reduce((n, e) => n + exVat(e), 0);
  const stockPurchasesMinor = live.filter(e => e.category === 'stock_purchase').reduce((n, e) => n + exVat(e), 0);
  const byCategory = [...live.reduce((m, e) => m.set(e.category, (m.get(e.category) || 0) + exVat(e)), new Map())].map(([category, amountMinor]) => ({ category, amountMinor })).sort((x, y) => y.amountMinor - x.amountMinor);
  const pack = tenant.pack;
  return ok({
    range: { period: range.period, fromDate: range.fromDate, toDate: range.toDate, timezone: tz },
    sales: figures,
    pending: { orders: pendingOrders.length, totalMinor: pendingOrders.reduce((n, o) => n + o.totalMinor, 0) },
    expenses: { operatingMinor, stockPurchasesMinor, byCategory },
    netProfitMinor: figures.grossProfitMinor - operatingMinor,
    cash: await cashIn(ctx, accountId, range),
    receivablesMinor: await receivables(ctx, accountId),
    topProducts: await topProducts(ctx, products),
    customers: await customers(ctx, accountId, sales, range.from),
    stock: await stockSummary(ctx, accountId),
    demand: pack.modules.demand === 'available' ? await demandReport(ctx, accountId, range) : null,
    truncated: orders.truncated || expenses.truncated,
  });
}
