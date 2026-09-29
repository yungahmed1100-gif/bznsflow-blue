import { orderProfit } from './profit.js';
import { industryMetrics } from './industryMetrics.js';
// The Today home: what needs the owner, what Layla did, and the money, in the
// business's own day. Every list is capped; counts say when there is more.
import { ok } from './shared.js';
import { periodRange, businessDate } from './period.js';
import { businessTimezone, expensesIn } from './expensesState.js';
import { receivables } from './insightsState.js';
import { restaurantSummary, expirySummary } from './restaurantState.js';

const DAY = 86400000, SHOW = 5, SCAN = 500;
const NOT_SENT = new Set(['blocked', 'failed']);

async function waitingOrders(ctx, accountId) {
  const byStatus = s => ctx.db.query('hasibOrders').withIndex('by_account_status_created', q => q.eq('accountId', accountId).eq('status', s)).take(200);
  const pending = await byStatus('pending');
  const asked = [...(await byStatus('confirmed')), ...(await byStatus('ready'))].filter(o => o.flags?.includes('change_requested'));
  const rows = [...pending, ...asked].filter(o => o.source === 'layla').sort((a, b) => a.createdAt - b.createdAt);
  return { count: rows.length, items: rows.slice(0, SHOW).map(o => ({ id: o._id, number: o.number, flags: o.flags || [], createdAt: o.createdAt, totalMinor: o.totalMinor, customerName: o.customerName || null })) };
}

async function lowStock(ctx, accountId) {
  const rows = (await ctx.db.query('hasibVariants').withIndex('by_account_low', q => q.eq('accountId', accountId).eq('low', true)).take(100)).filter(v => !v.archived).sort((a, b) => a.onHand - b.onHand);
  const items = [];
  for (const v of rows) {
    const item = await ctx.db.get(v.itemId);
    if (item?.trackStock) items.push({ variantId: v._id, itemId: item._id, nameAr: item.nameAr, nameEn: item.nameEn, options: v.options, onHand: v.onHand });
  }
  return { count: items.length, items: items.slice(0,SHOW) };
}

async function handedChats(ctx, accountId, now) {
  const rows = await ctx.db.query('blueConversations').withIndex('by_account_updated', q => q.eq('accountId', accountId).gte('updatedAt', now - DAY)).take(SCAN);
  return rows.filter(c => c.takeover && !c.optout && now - c.lastInbound < DAY).length;
}

async function laylaToday(ctx, accountId, from) {
  const messages = await ctx.db.query('blueMessages').withIndex('by_account_at', q => q.eq('accountId', accountId).gte('at', from)).take(SCAN * 4);
  const orders = await ctx.db.query('hasibOrders').withIndex('by_account_created', q => q.eq('accountId', accountId).gte('createdAt', from)).take(SCAN);
  const questions = await ctx.db.query('hasibDemandSignals').withIndex('by_account_at', q => q.eq('accountId', accountId).gte('at', from)).take(SCAN);
  return {
    replies: messages.filter(m => m.direction === 'out' && !m.manual && !m.media && !NOT_SENT.has(m.status)).length,
    ordersConfirmed: orders.filter(o => o.source === 'layla' && o.status !== 'pending' && o.status !== 'cancelled').length,
    productQuestions: questions.length,
  };
}

async function money(ctx, accountId, today, month) {
  const sum = async range => (await ctx.db.query('hasibPayments').withIndex('by_account_at', q => q.eq('accountId', accountId).gte('at', range.from).lt('at', range.to)).take(2000)).reduce((n, p) => n + p.amountMinor, 0);
  return { todayMinor: await sum(today), monthMinor: await sum(month), owedMinor: await receivables(ctx, accountId) };
}

async function setupState(ctx, accountId) {
  const items = await ctx.db.query('hasibItems').withIndex('by_account_archived_updated', q => q.eq('accountId', accountId).eq('archived', false)).take(200);
  const services = await ctx.db.query('blueCatalogEntries').withIndex('by_owner_status_order', q => q.eq('ownerKey', String(accountId)).eq('status', 'approved')).take(200);
  return { products: items.some(i => i.kind === 'product'), photos: items.some(i => i.photoId), services: services.some(e => e.kind === 'service') };
}

async function restaurantToday(ctx, accountId, range) {
  const rows = await ctx.db.query('hasibOrders').withIndex('by_account_created', q => q.eq('accountId', accountId).gte('createdAt', range.from).lt('createdAt', range.to)).take(1000);
  const sales = rows.filter(o => !['pending', 'cancelled', 'returned'].includes(o.status));
  const figures = sales.reduce((out, order) => {
    const profit = orderProfit(order);
    out.revenueMinor += profit.revenue;
    out.cogsMinor = out.cogsMinor === null || profit.profitMinor === null ? null : out.cogsMinor + profit.cost;
    return out;
  }, { revenueMinor: 0, cogsMinor: 0 });
  const { rows: expenses } = await expensesIn(ctx, accountId, range, 2000);
  return restaurantSummary(ctx, accountId, range, { sales, figures, expenses });
}

export async function executeToday(ctx, tenant, a, now) {
  if (a.operation !== 'today') return null;
  const { accountId, pack } = tenant;
  const tz = await businessTimezone(ctx, accountId);
  const today = periodRange('today', now, tz), month = periodRange('month', now, tz);
  const [orders, stock] = [await waitingOrders(ctx, accountId), await lowStock(ctx, accountId)];
  let repairsReady = null;
  if (pack.modules.repairs === 'available') {
    repairsReady = (await ctx.db.query('hasibRepairs').withIndex('by_account_created', q => q.eq('accountId', accountId)).order('desc').take(SCAN)).filter(r => r.status === 'ready').length;
  }
  const food = pack.modules.recipes === 'available' ? await restaurantToday(ctx, accountId, today) : null;
  const industry = await industryMetrics(ctx, tenant, now, today, food);
  return ok({
    ...industry,
    date: businessDate(now, tz), timezone: tz,
    needsYou: { orders: orders.items, ordersCount: orders.count, chats: await handedChats(ctx, accountId, now), lowStock: stock.items, lowStockCount: stock.count, repairsReady },
    layla: await laylaToday(ctx, accountId, today.from),
    money: await money(ctx, accountId, today, month),
    restaurant: food,
    expiry: pack.modules.shelfLife === 'available' ? await expirySummary(ctx, accountId, now, 7) : null,
    setup: await setupState(ctx, accountId),
  });
}
