import { orderProfit } from './profit.js';
import { industryMetrics } from './industryMetrics.js';
// The Today home: what needs the owner, what Layla did, and the money, in the
// business's own day. Every list is capped; counts say when there is more.
// Every figure is read from what BznsFlow recorded: Layla's chats and captured
// fields, and Hasib's orders (a clinic's visits), payments and stock.
import { ok, trackedLow } from './shared.js';
import { periodRange, businessDate } from './period.js';
import { businessTimezone, expensesIn } from './expensesState.js';
import { receivables, ordersIn, salesSummary } from './insightsState.js';
import { restaurantSummary, expirySummary } from './restaurantState.js';
import { displayName, sectorFor } from '../blueContacts.js';
import { qualificationPack } from '../../config/layla-qualification.js';

const DAY = 86400000, SHOW = 5, SCAN = 500, REQUEST_WINDOW = 14 * DAY, VISIT_SCAN = 20;
const NOT_SENT = new Set(['blocked', 'failed']);
const CLOSED = new Set(['cancelled', 'returned']);
const CAPTURED = new Set(['customer', 'contextual']);

async function waitingOrders(ctx, accountId) {
  const byStatus = s => ctx.db.query('hasibOrders').withIndex('by_account_status_created', q => q.eq('accountId', accountId).eq('status', s)).take(200);
  const pending = await byStatus('pending');
  const asked = [...(await byStatus('confirmed')), ...(await byStatus('ready'))].filter(o => o.flags?.includes('change_requested'));
  const rows = [...pending, ...asked].filter(o => o.source === 'layla').sort((a, b) => a.createdAt - b.createdAt);
  return { count: rows.length, items: rows.slice(0, SHOW).map(o => ({ id: o._id, number: o.number, flags: o.flags || [], createdAt: o.createdAt, totalMinor: o.totalMinor, customerName: o.customerName || null })) };
}

async function lowStock(ctx, accountId) {
  const rows = await trackedLow(ctx, accountId);
  return { count: rows.length, items: rows.slice(0, SHOW).map(({ variant: v, item }) => ({ variantId: v._id, itemId: item._id, nameAr: item.nameAr, nameEn: item.nameEn, options: v.options, onHand: v.onHand })) };
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

// ---- Clinics (dental): the same day, in a clinic's terms ----

/**
 * Patients who asked Layla for a service in the last two weeks and have no visit
 * recorded since they asked. Only what Layla captured is shown: the service,
 * preferred time and branch, never message text.
 */
async function serviceRequests(ctx, accountId, now) {
  const contacts = await ctx.db.query('blueContacts').withIndex('by_account_state_activity', q => q.eq('accountId', accountId).eq('state', 'active').gte('lastActivityAt', now - REQUEST_WINDOW)).take(SCAN);
  const open = [];
  for (const c of contacts) {
    const service = (c.fields || []).find(f => f.key === 'service' && f.value && CAPTURED.has(f.source) && f.at >= now - REQUEST_WINDOW);
    if (!service || c.optout) continue;
    // A cancelled visit (a no-show) leaves the patient still needing one.
    const visits = await ctx.db.query('hasibOrders').withIndex('by_contact_created', q => q.eq('contactId', c._id).gte('createdAt', service.at)).take(VISIT_SCAN);
    if (visits.some(v => v.accountId === accountId && !CLOSED.has(v.status))) continue;
    open.push({ contact: c, service });
  }
  open.sort((a, b) => a.service.at - b.service.at);
  // Approved catalog services give a captured treatment name in both languages.
  const catalog = open.length ? await ctx.db.query('blueCatalogEntries').withIndex('by_owner_status_order', q => q.eq('ownerKey', String(accountId)).eq('status', 'approved')).take(200) : [];
  const items = [];
  for (const { contact, service } of open.slice(0, SHOW)) {
    const field = key => (contact.fields || []).find(f => f.key === key)?.value || null;
    // A listed option ("cleaning", "branch") is shown in the owner's language; a catalog name or place as captured.
    const labelled = (key, value) => {
      const option = value && qualificationPack(contact.sectorId).fields.find(f => f.key === key)?.options?.find(o => o.id === value);
      const entry = value && !option && catalog.find(e => e.nameEn === value || e.nameAr === value);
      return value ? (option ? { en: option.en, ar: option.ar } : entry ? { en: entry.nameEn || entry.nameAr, ar: entry.nameAr || entry.nameEn } : { en: value, ar: value }) : null;
    };
    const person = await ctx.db.query('blueConversations').withIndex('by_contact', q => q.eq('contactId', contact._id)).first();
    items.push({ contactId: contact._id, conversationId: person?._id || null, name: displayName(contact).name, service: labelled('service', service.value),
      preferredTime: field('preferred_time'), location: labelled('location', field('location')), at: service.at });
  }
  return { count: open.length, items };
}

/** Visits not closed that still have money owed on them, oldest first. Same rule as "Owed to you". */
async function unpaidVisits(ctx, accountId) {
  const rows = (await ctx.db.query('hasibOrders').withIndex('by_account_created', q => q.eq('accountId', accountId)).order('desc').take(1000))
    .filter(o => !CLOSED.has(o.status) && o.totalMinor > o.paidMinor).sort((a, b) => a.createdAt - b.createdAt);
  const items = [];
  for (const o of rows.slice(0, SHOW)) {
    const contact = o.contactId && await ctx.db.get(o.contactId);
    items.push({ id: o._id, number: o.number, customerName: contact?.state === 'active' ? displayName(contact).name : o.customerName || null, balanceMinor: o.totalMinor - o.paidMinor, createdAt: o.createdAt });
  }
  return { count: rows.length, items };
}

/** What Layla handled today, from the topic recorded on each message. Counts only; no text. */
async function receptionToday(ctx, accountId, from) {
  const messages = await ctx.db.query('blueMessages').withIndex('by_account_at', q => q.eq('accountId', accountId).gte('at', from)).take(SCAN * 4);
  const asked = topic => messages.filter(m => m.direction === 'in' && m.topic === topic).length;
  return {
    replies: messages.filter(m => m.direction === 'out' && !m.manual && !m.media && !NOT_SENT.has(m.status)).length,
    serviceQuestions: asked('services'), priceQuestions: asked('prices'), appointmentRequests: asked('disabled'),
    handoffs: messages.filter(m => m.direction === 'out' && m.handoff && !NOT_SENT.has(m.status)).length,
  };
}

async function clinicSetup(ctx, accountId, row) {
  const items = await ctx.db.query('hasibItems').withIndex('by_account_archived_updated', q => q.eq('accountId', accountId).eq('archived', false)).take(200);
  const services = await ctx.db.query('blueCatalogEntries').withIndex('by_owner_status_order', q => q.eq('ownerKey', String(accountId)).eq('status', 'approved')).take(200);
  return { laylaSector: sectorFor(row) === 'dental', treatments: services.some(e => e.kind === 'service'), supplies: items.some(i => i.kind === 'product') };
}

async function clinicToday(ctx, tenant, now, tz, today, month) {
  const { accountId } = tenant;
  const recorded = salesSummary((await ordersIn(ctx, accountId, today)).rows).figures;
  const requests = await serviceRequests(ctx, accountId, now), unpaid = await unpaidVisits(ctx, accountId), stock = await lowStock(ctx, accountId);
  const cash = await money(ctx, accountId, today, month);
  return ok({
    date: businessDate(now, tz), timezone: tz, clinic: true,
    needsYou: { requests: requests.items, requestsCount: requests.count, chats: await handedChats(ctx, accountId, now), unpaid: unpaid.items, unpaidCount: unpaid.count, lowStock: stock.items, lowStockCount: stock.count },
    layla: await receptionToday(ctx, accountId, today.from),
    money: { revenueTodayMinor: recorded.revenueMinor, visitsToday: recorded.orders, todayMinor: cash.todayMinor, owedMinor: cash.owedMinor },
    setup: await clinicSetup(ctx, accountId, tenant.row),
  });
}

export async function executeToday(ctx, tenant, a, now) {
  if (a.operation !== 'today') return null;
  const { accountId, pack } = tenant;
  const tz = await businessTimezone(ctx, accountId);
  const today = periodRange('today', now, tz), month = periodRange('month', now, tz);
  if (pack.serviceItems) return clinicToday(ctx, tenant, now, tz, today, month);
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
