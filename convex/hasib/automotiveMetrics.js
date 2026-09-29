import { ok } from './shared.js';
import { DAY, publicAutomotiveRow } from './automotiveDomain.js';

const QUERY_CAP = 5000;
const bounded = async query => {
  const rows = await query.take(QUERY_CAP + 1);
  return { rows: rows.slice(0, QUERY_CAP), truncated: rows.length > QUERY_CAP };
};
const accountRows = (ctx, table, accountId, index = 'by_account_created') => bounded(ctx.db.query(table).withIndex(index, q => q.eq('accountId', accountId)));
const ratio = (numerator, denominator) => denominator ? numerator / denominator : null;
const percentile = (values, fraction) => values.length ? values[Math.floor((values.length - 1) * fraction)] : null;

export async function automotiveInsights(ctx, accountId, now, args = {}) {
  const fromAt = Number.isSafeInteger(args.fromAt) ? args.fromAt : now - 30 * DAY;
  const toAt = Number.isSafeInteger(args.toAt) ? args.toAt : now;
  const [workPage, appointmentPage, requestPage, laborPage, estimatePage, experiencePage] = await Promise.all([
    accountRows(ctx, 'automotiveWorkOrders', accountId), accountRows(ctx, 'automotiveAppointments', accountId, 'by_account_start'),
    accountRows(ctx, 'automotiveRequests', accountId), accountRows(ctx, 'automotiveLaborEntries', accountId),
    accountRows(ctx, 'automotiveEstimates', accountId), accountRows(ctx, 'automotiveExperience', accountId, 'by_account_submitted'),
  ]);
  const inPeriod = row => (row.createdAt ?? row.submittedAt ?? row.startedAt ?? 0) >= fromAt && (row.createdAt ?? row.submittedAt ?? row.startedAt ?? 0) < toAt;
  const work = workPage.rows.filter(inPeriod), appointments = appointmentPage.rows.filter(row => row.startsAt >= fromAt && row.startsAt < toAt);
  const requests = requestPage.rows.filter(inPeriod), labor = laborPage.rows.filter(row => row.startedAt >= fromAt && row.startedAt < toAt);
  const estimates = estimatePage.rows.filter(inPeriod), experience = experiencePage.rows.filter(row => row.submittedAt >= fromAt && row.submittedAt < toAt);
  const stopped = labor.filter(row => row.stoppedAt), productiveMinutes = stopped.reduce((sum, row) => sum + (row.minutes || 0), 0);
  const approved = estimates.filter(row => row.status === 'approved'), issued = estimates.filter(row => ['issued', 'approved', 'rejected', 'superseded'].includes(row.status));
  const standardMinutes = approved.reduce((sum, row) => sum + row.standardMinutes, 0), completed = work.filter(row => ['closed', 'collected'].includes(row.status));
  const onTime = completed.filter(row => (row.readyAt || Number.MAX_SAFE_INTEGER) <= row.promisedAt);
  const eligibleFix = completed.filter(row => row.closedAt && row.closedAt <= now - 30 * DAY), comebackParents = new Set(work.filter(row => row.repeatOfId).map(row => String(row.repeatOfId)));
  const responseTimes = requests.filter(row => row.firstResponseSubmittedAt).map(row => row.firstResponseSubmittedAt - row.firstInboundAt).sort((a, b) => a - b);
  const orders = (await Promise.all(work.map(row => row.orderId ? ctx.db.get(row.orderId) : null))).filter(Boolean);
  const revenue = orders.reduce((sum, row) => sum + row.totalMinor, 0), cash = orders.reduce((sum, row) => sum + row.paidMinor, 0);
  const truncated = workPage.truncated || appointmentPage.truncated || requestPage.truncated || laborPage.truncated || estimatePage.truncated || experiencePage.truncated;
  return {
    period: { fromAt, toAt },
    metrics: {
      requestResponseMedianMs: percentile(responseTimes, .5), requestResponseP90Ms: percentile(responseTimes, .9),
      requestToBookedRate: ratio(requests.filter(row => row.status === 'booked').length, requests.length),
      appointmentMissedRate: ratio(appointments.filter(row => row.status === 'missed').length, appointments.filter(row => ['checked_in', 'missed'].includes(row.status)).length),
      estimateApprovalRate: ratio(approved.length, issued.length), technicianProductivity: null,
      technicianEfficiency: productiveMinutes ? standardMinutes / productiveMinutes : null, technicianProficiency: null,
      onTimeDeliveryRate: ratio(onTime.length, completed.length), firstTimeFixRate: ratio(eligibleFix.filter(row => !comebackParents.has(String(row._id))).length, eligibleFix.length),
      averageRepairOrderMinor: orders.length ? Math.round(revenue / orders.length) : null, recordedRevenueMinor: revenue,
      cashCollectedMinor: cash, collectionRate: ratio(cash, revenue), openReceivablesMinor: Math.max(0, revenue - cash),
      experienceAverage: experience.length ? experience.reduce((sum, row) => sum + row.rating, 0) / experience.length : null,
    },
    coverage: {
      truncated, queryCap: QUERY_CAP,
      technicianProductivity: { numerator: stopped.length, denominator: new Set(labor.map(row => row.technicianAccountId)).size },
      firstTimeFix: { numerator: eligibleFix.length, denominator: completed.length },
      responseTime: { numerator: responseTimes.length, denominator: requests.length },
      experience: { numerator: experience.length, denominator: completed.length },
    },
  };
}

export async function automotiveOverview(ctx, accountId, now) {
  const [issued, ready, promised, work, tasks] = await Promise.all([
    bounded(ctx.db.query('automotiveEstimates').withIndex('by_account_status', q => q.eq('accountId', accountId).eq('status', 'issued'))),
    bounded(ctx.db.query('automotiveWorkOrders').withIndex('by_account_status', q => q.eq('accountId', accountId).eq('status', 'ready'))),
    bounded(ctx.db.query('automotiveWorkOrders').withIndex('by_account_promised', q => q.eq('accountId', accountId).lt('promisedAt', now))),
    ctx.db.query('automotiveWorkOrders').withIndex('by_account_created', q => q.eq('accountId', accountId)).order('desc').take(100),
    ctx.db.query('automotiveTasks').withIndex('by_account_status_due', q => q.eq('accountId', accountId).eq('status', 'open')).take(200),
  ]);
  const waiting = issued.rows.filter(row => (row.issuedAt || row.createdAt) < now - 3600000);
  const pastPromised = promised.rows.filter(row => !['ready', 'collected', 'closed', 'cancelled'].includes(row.status));
  return ok({
    metrics: [
      { key: 'approvals_waiting', value: waiting.length, truncated: issued.truncated },
      { key: 'past_promised', value: pastPromised.length, truncated: promised.truncated },
      { key: 'ready_for_collection', value: ready.rows.length, truncated: ready.truncated },
    ],
    workOrders: work.map(publicAutomotiveRow), tasks: tasks.map(publicAutomotiveRow),
  });
}
