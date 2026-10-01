// Real Estate's shared reads: who may see a deal, readable rows, Today, tasks and insights.
import { owned } from '../blueTenant.js';
import { ok, fail, clampLimit, settingsFor } from './shared.js';
import { audit } from './workspaceState.js';
import { businessTimezone } from './expensesState.js';
import { periodRange } from './period.js';
import { displayName } from '../blueContacts.js';

export const DAY = 86400000;
export const OPEN_STAGES = ['new', 'contacted', 'qualified', 'viewing', 'offer'];
const LIVE_VIEWING = new Set(['requested', 'confirmed']);
const LIVE_OFFER = new Set(['approved', 'presented', 'countered']);
const FIRST_RESPONSE_MS = 5 * 60000, SECOND_ATTEMPT_MS = 2 * 3600000, OFFER_ANSWER_MS = 2 * 3600000, SCAN = 500;
// Tasks Today opens from the records themselves; each closes itself once the cause is gone.
const AUTO_TASKS = new Set(['first_response_overdue', 'second_attempt_overdue', 'stale_listing', 'viewing_outcome_missing', 'offer_unanswered']);

export const publicRow = row => { const { _id, _seq, table, accountId, requestId, ...rest } = row; return { id: _id, ...rest }; };

/** Agents work their own deals and unassigned ones; managers see the whole agency. */
export const canSeeDeal = (actor, row) => actor.role !== 'employee' || !row.assignedAccountId || String(row.assignedAccountId) === String(actor.actorAccountId);

export async function visibleOpportunity(ctx, tenant, actor, id) {
  const row = id ? await owned(ctx, id, tenant.accountId, 'realEstateOpportunities') : null;
  return row && canSeeDeal(actor, row) ? row : null;
}

/** Adds the customer's name and the property's label so every card is readable. */
export async function readable(ctx, accountId, rows) {
  const contacts = new Map(), properties = new Map(), opportunities = new Map();
  const get = async (cache, table, id) => {
    if (!id) return null;
    if (!cache.has(String(id))) cache.set(String(id), await owned(ctx, id, accountId, table));
    return cache.get(String(id));
  };
  const out = [];
  for (const row of rows) {
    const opportunity = row.contactId ? row : await get(opportunities, 'realEstateOpportunities', row.opportunityId);
    const contact = await get(contacts, 'blueContacts', opportunity?.contactId);
    const property = await get(properties, 'hasibProperties', row.propertyId);
    out.push({ ...publicRow(row), contactName: contact?.state === 'active' ? displayName(contact).name : null,
      ...(opportunity?.conversationId ? { conversationId: opportunity.conversationId } : {}),
      ...(property ? { propertyLabel: property.label, location: property.location, askingPriceMinor: property.askingPriceMinor, availability: property.availability } : {}) });
  }
  return out;
}

/** A page of an agency list, limited to deals the actor may see, with readable rows. */
export async function dealList(ctx, tenant, actor, table, a, index = 'by_account_created') {
  const page = await ctx.db.query(table).withIndex(index, q => q.eq('accountId', tenant.accountId)).order('desc').paginate({ numItems: clampLimit(a.limit, 200), cursor: a.cursor || null });
  const rows = [];
  for (const row of page.page) {
    const deal = table === 'realEstateOpportunities' ? row : await owned(ctx, row.opportunityId, tenant.accountId, 'realEstateOpportunities');
    if (deal && canSeeDeal(actor, deal)) rows.push(row);
  }
  return ok({ items: await readable(ctx, tenant.accountId, rows), cursor: page.isDone ? null : page.continueCursor });
}

const take = (ctx, table, accountId, index = 'by_account_created') => ctx.db.query(table).withIndex(index, q => q.eq('accountId', accountId)).order('desc').take(SCAN);

/** The tasks the records call for right now, as [kind, entityType, entityId, reason, dueAt?]. */
function currentTasks({ opportunities, properties, viewings, offers }, now, freshnessMs) {
  const wanted = [];
  for (const o of opportunities) {
    if (o.stage === 'new' && o.source !== 'manual' && !o.providerSubmittedAt && now - o.firstInboundAt > FIRST_RESPONSE_MS)
      wanted.push(['first_response_overdue', 'opportunity', o._id, 'First reply has not been sent within five minutes', o.firstInboundAt + FIRST_RESPONSE_MS]);
    if (OPEN_STAGES.includes(o.stage) && o.lastAttemptAt && !o.providerSubmittedAt && now - o.lastAttemptAt > SECOND_ATTEMPT_MS)
      wanted.push(['second_attempt_overdue', 'opportunity', o._id, 'A second reply attempt is overdue', o.lastAttemptAt + SECOND_ATTEMPT_MS]);
  }
  for (const p of properties) if (p.availability === 'available' && (!p.verificationAt || p.verificationAt < now - freshnessMs))
    wanted.push(['stale_listing', 'property', p._id, 'This available listing needs fresh verification']);
  for (const v of viewings) if (v.scheduledAt < now && LIVE_VIEWING.has(v.status))
    wanted.push(['viewing_outcome_missing', 'viewing', v._id, 'The viewing time passed without an outcome']);
  for (const o of offers) if (LIVE_OFFER.has(o.status) && now - o.updatedAt > OFFER_ANSWER_MS)
    wanted.push(['offer_unanswered', 'offer', o._id, 'This offer needs an answer or a next step']);
  return wanted;
}

/** Opens tasks the records call for and closes automatic ones whose cause is gone. */
async function syncTasks(ctx, accountId, records, now, freshnessMs) {
  const wanted = currentTasks(records, now, freshnessMs);
  const key = (kind, entityId) => `${kind}:${entityId}`;
  const wantedKeys = new Set(wanted.map(([kind, , entityId]) => key(kind, entityId)));
  const open = await ctx.db.query('realEstateTasks').withIndex('by_account_status', q => q.eq('accountId', accountId).eq('status', 'open')).take(SCAN);
  const openKeys = new Set(open.map(t => key(t.kind, t.entityId)));
  for (const t of open) if (AUTO_TASKS.has(t.kind) && !wantedKeys.has(key(t.kind, t.entityId))) await ctx.db.patch(t._id, { status: 'resolved', resolvedAt: now, resolution: 'cleared', updatedAt: now });
  for (const [kind, entityType, entityId, reason, dueAt] of wanted) if (!openKeys.has(key(kind, entityId)))
    await ctx.db.insert('realEstateTasks', { accountId, kind, entityType, entityId: String(entityId), status: 'open', reason, ...(dueAt ? { dueAt } : {}), createdAt: now, updatedAt: now });
}

/** A task belongs to the agent when its deal (directly or through a viewing or offer) does. */
async function taskVisible(ctx, tenant, actor, task) {
  if (actor.role !== 'employee') return true;
  const table = { opportunity: 'realEstateOpportunities', viewing: 'realEstateViewings', offer: 'realEstateOffers', draft: 'realEstateDrafts' }[task.entityType];
  if (!table) return true; // listings are the whole agency's
  const row = await owned(ctx, task.entityId, tenant.accountId, table);
  const deal = row && (table === 'realEstateOpportunities' ? row : await owned(ctx, row.opportunityId, tenant.accountId, 'realEstateOpportunities'));
  return !!deal && canSeeDeal(actor, deal);
}

export async function overview(ctx, tenant, actor, now) {
  const accountId = tenant.accountId;
  const all = { opportunities: await take(ctx, 'realEstateOpportunities', accountId), properties: await take(ctx, 'hasibProperties', accountId),
    viewings: await take(ctx, 'realEstateViewings', accountId, 'by_account_date'), offers: await take(ctx, 'realEstateOffers', accountId), drafts: await take(ctx, 'realEstateDrafts', accountId) };
  const freshnessMs = ((await settingsFor(ctx, accountId)).listingFreshnessDays ?? 30) * DAY;
  await syncTasks(ctx, accountId, all, now, freshnessMs);
  const deals = all.opportunities.filter(o => canSeeDeal(actor, o)), dealIds = new Set(deals.map(o => String(o._id)));
  const viewings = all.viewings.filter(v => dealIds.has(String(v.opportunityId))), offers = all.offers.filter(o => dealIds.has(String(o.opportunityId)));
  const drafts = all.drafts.filter(d => dealIds.has(String(d.opportunityId)));
  const openTasks = await ctx.db.query('realEstateTasks').withIndex('by_account_status', q => q.eq('accountId', accountId).eq('status', 'open')).take(SCAN);
  const tasks = [];
  for (const t of openTasks) if (await taskVisible(ctx, tenant, actor, t)) tasks.push(publicRow(t));
  const today = periodRange('today', now, await businessTimezone(ctx, accountId));
  const fresh = p => p.availability === 'available' && p.verificationAt && p.verificationAt >= now - freshnessMs;
  const listings = Object.fromEntries(['available', 'reserved', 'unavailable'].map(s => [s, all.properties.filter(p => p.availability === s).length]));
  const freshCount = all.properties.filter(fresh).length;
  const offerSummary = { draft: offers.filter(o => o.status === 'draft').length, approvalPending: offers.filter(o => o.status === 'draft').length,
    active: offers.filter(o => LIVE_OFFER.has(o.status)).length, accepted: offers.filter(o => o.status === 'accepted').length };
  const draftsWaiting = drafts.filter(d => d.status === 'draft').length;
  return ok({ workspaceRole: actor.role,
    counts: { opportunities: deals.filter(o => OPEN_STAGES.includes(o.stage)).length, unassigned: deals.filter(o => !o.assignedAccountId && OPEN_STAGES.includes(o.stage)).length,
      slaBreaches: tasks.filter(t => t.kind === 'first_response_overdue').length, staleListings: listings.available - freshCount,
      todayViewings: viewings.filter(v => v.scheduledAt >= today.from && v.scheduledAt < today.to && v.status !== 'cancelled').length, tasks: tasks.length },
    pipeline: Object.fromEntries([...OPEN_STAGES, 'won', 'lost'].map(stage => [stage, deals.filter(o => o.stage === stage).length])),
    listings: { ...listings, verifiedFresh: freshCount, stale: listings.available - freshCount },
    viewings: { today: viewings.filter(v => v.scheduledAt >= today.from && v.scheduledAt < today.to && v.status !== 'cancelled').length,
      upcoming: viewings.filter(v => v.scheduledAt >= now && LIVE_VIEWING.has(v.status)).length, outcomeMissing: viewings.filter(v => v.scheduledAt < now && LIVE_VIEWING.has(v.status)).length },
    offers: offerSummary, approvals: { offers: offerSummary.approvalPending, drafts: draftsWaiting, total: offerSummary.approvalPending + draftsWaiting }, tasks });
}

export async function resolveTask(ctx, tenant, actor, a, now) {
  const task = await owned(ctx, a.taskId, tenant.accountId, 'realEstateTasks');
  if (!task || !(await taskVisible(ctx, tenant, actor, task))) return fail('task_not_found');
  if (task.status !== 'open') return ok(publicRow(task));
  await ctx.db.patch(task._id, { status: 'resolved', resolvedAt: now, resolvedBy: String(actor.actorAccountId), resolution: String(a.reason || 'done').slice(0, 200), updatedAt: now });
  await audit(ctx, tenant, actor, 'task_resolved', 'task', task._id, now, task.kind);
  return ok(publicRow(await ctx.db.get(task._id)));
}

const rate = (numerator, denominator) => denominator ? Math.round(numerator * 1000 / denominator) / 10 : 0;
const tally = values => Object.entries(values.reduce((out, v) => ({ ...out, [v || 'unknown']: (out[v || 'unknown'] || 0) + 1 }), {}))
  .map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

export async function insights(ctx, tenant) {
  const accountId = tenant.accountId, scan = table => ctx.db.query(table).withIndex(table === 'realEstateViewings' ? 'by_account_date' : 'by_account_created', q => q.eq('accountId', accountId)).take(2000);
  const [opportunities, viewings, offers, commissions, properties] = [await scan('realEstateOpportunities'), await scan('realEstateViewings'), await scan('realEstateOffers'), await scan('realEstateCommissions'), await scan('hasibProperties')];
  const qualifiedStages = new Set(['qualified', 'viewing', 'offer', 'won']);
  const viewed = new Set(viewings.filter(v => v.status === 'completed').map(v => String(v.opportunityId))), offered = new Set(offers.map(o => String(o.opportunityId)));
  const won = opportunities.filter(o => o.stage === 'won');
  const responses = opportunities.filter(o => Number.isSafeInteger(o.providerSubmittedAt) && Number.isSafeInteger(o.firstInboundAt) && o.providerSubmittedAt >= o.firstInboundAt).map(o => o.providerSubmittedAt - o.firstInboundAt);
  const sources = new Map();
  for (const o of opportunities) { const g = sources.get(o.source) || { source: o.source, opportunities: 0, won: 0 }; g.opportunities++; if (o.stage === 'won') g.won++; sources.set(o.source, g); }
  const sold = properties.filter(p => p.availability === 'unavailable' && p.updatedAt >= p.createdAt);
  const total = status => commissions.filter(c => c.status === status).reduce((sum, c) => sum + c.amountMinor, 0);
  return ok({
    commissions: { dueMinor: total('due'), paidMinor: total('paid'), records: commissions.length },
    averageFirstResponseMinutes: responses.length ? Math.round(responses.reduce((s, v) => s + v, 0) / responses.length / 6000) / 10 : null,
    qualificationRate: rate(opportunities.filter(o => qualifiedStages.has(o.stage)).length, opportunities.length),
    viewingToOfferRate: rate([...viewed].filter(id => offered.has(id)).length, viewed.size),
    offerToCloseRate: rate(won.filter(o => offered.has(String(o._id))).length, offered.size),
    sourceConversion: [...sources.values()].map(g => ({ ...g, rate: rate(g.won, g.opportunities) })).sort((a, b) => b.opportunities - a.opportunities || a.source.localeCompare(b.source)),
    lostReasons: tally(opportunities.filter(o => o.stage === 'lost').map(o => o.lostReason)),
    averageDaysOnMarket: sold.length ? Math.round(sold.reduce((s, p) => s + (p.updatedAt - p.createdAt), 0) / sold.length / DAY * 10) / 10 : null,
  });
}
