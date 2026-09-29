// Operational jobs share Hasib orders for charges, payments and parts movements.
import { owned } from '../blueTenant.js';
import { ok, fail, bounded, REQUEST_ID, byRequest, clampLimit } from './shared.js';
import { isMinor } from './money.js';
import { orderProfit } from './profit.js';
import { createOrder, updatePendingOrder, changeStatus } from './ordersState.js';
const stamp = n => Number.isSafeInteger(n) && n >= 0;
const whole = n => Number.isSafeInteger(n) && n >= 0 && n <= 1000000;
const kinds = ['garage', 'cleaning', 'maintenance', 'construction'];
const publicRow = r => { const { _id, _seq, table, accountId, requestId, ...rest } = r; return { id: _id, ...rest }; };
const list = (ctx, table, accountId, a) => ctx.db.query(table).withIndex('by_account_created', q => q.eq('accountId', accountId)).order('desc').paginate({ numItems: clampLimit(a.limit, 200), cursor: a.cursor || null });

async function details(ctx, accountId, w, base = {}) {
  const result = {};
  for (const field of ['title', 'kind', 'dueAt', 'recurringDays', 'actualMinutes', 'budgetMinor', 'costsComplete']) {
    if (w[field] !== undefined) result[field] = w[field];
  }
  if (result.title !== undefined && !(result.title = bounded(result.title, 120))) return null;
  if (result.kind !== undefined && !kinds.includes(result.kind)) return null;
  if (result.dueAt !== undefined && !stamp(result.dueAt)) return null;
  if (result.recurringDays !== undefined && (!whole(result.recurringDays) || result.recurringDays < 1 || result.recurringDays > 365)) return null;
  if (result.actualMinutes !== undefined && !whole(result.actualMinutes)) return null;
  if (result.budgetMinor !== undefined && !isMinor(result.budgetMinor)) return null;
  if (result.costsComplete !== undefined && typeof result.costsComplete !== 'boolean') return null;
  for (const [field, table] of [['contactId', 'blueContacts'], ['equipmentId', 'hasibEquipment'], ['repeatOfId', 'hasibJobs']]) {
    if (w[field] !== undefined) {
      const row = await owned(ctx, w[field], accountId, table);
      if (!row) return null;
      if (field !== 'contactId' && row.contactId && row.contactId !== (w.contactId || base.contactId)) return null;
      result[field] = row._id;
    }
  }
  if (w.checklist !== undefined) {
    if (!Array.isArray(w.checklist) || w.checklist.length > 50 || w.checklist.some(x => !bounded(x?.text, 160) || typeof x.done !== 'boolean')) return null;
    result.checklist = w.checklist.map(x => ({ text: bounded(x.text, 160), done: x.done }));
  }
  if (w.costs !== undefined) {
    if (!Array.isArray(w.costs) || w.costs.length > 100) return null;
    result.costs = [];
    const seen = new Set();
    for (const c of w.costs) {
      if (!bounded(c?.label, 120) || !isMinor(c.amountMinor)) return null;
      if (c.expenseId) {
        const expense = await owned(ctx, c.expenseId, accountId, 'hasibExpenses');
        if (!expense || seen.has(c.expenseId) || expense.amountMinor - (expense.vatMinor || 0) !== c.amountMinor) return null;
        seen.add(c.expenseId);
      }
      result.costs.push({ label: bounded(c.label, 120), amountMinor: c.amountMinor, ...(c.expenseId ? { expenseId: c.expenseId } : {}) });
    }
  }
  if (w.milestones !== undefined) {
    if (!Array.isArray(w.milestones) || w.milestones.length > 50) return null;
    result.milestones = [];
    const seen = new Set();
    for (const m of w.milestones) {
      if (!bounded(m?.label, 120) || !isMinor(m.amountMinor) || !stamp(m.dueAt) || typeof m.withheld !== 'boolean') return null;
      if (m.orderId && (!await owned(ctx, m.orderId, accountId, 'hasibOrders') || seen.has(m.orderId))) return null;
      if (m.orderId) seen.add(m.orderId);
      result.milestones.push({ label: bounded(m.label, 120), amountMinor: m.amountMinor, dueAt: m.dueAt, withheld: m.withheld, ...(m.orderId ? { orderId: m.orderId } : {}) });
    }
  }
  if (w.extras !== undefined) {
    if (!Array.isArray(w.extras) || w.extras.length > 50) return null;
    result.extras = [];
    for (const x of w.extras) {
      if (!bounded(x?.label, 120) || !isMinor(x.amountMinor) || typeof x.approved !== 'boolean') return null;
      if (x.approved && (!bounded(x.approvedBy, 100) || !stamp(x.approvedAt))) return null;
      result.extras.push({ label: bounded(x.label, 120), amountMinor: x.amountMinor, approved: x.approved, ...(x.approved ? { approvedBy: bounded(x.approvedBy, 100), approvedAt: x.approvedAt } : {}) });
    }
  }
  return result;
}

export async function publicJob(ctx, row, now) {
  const order = row.orderId ? await owned(ctx, row.orderId, row.accountId, 'hasibOrders') : null;
  let costs = 0;
  for (const entry of row.costs) {
    const expense = entry.expenseId ? await owned(ctx,entry.expenseId,row.accountId,'hasibExpenses') : null;
    if (!entry.expenseId || (expense && !expense.voided)) costs += entry.expenseId ? expense.amountMinor - (expense.vatMinor || 0) : entry.amountMinor;
  }
  const money = order ? orderProfit(order) : null;
  const parts = money ? money.cost - (order.operationalCostMinor || 0) : 0;
  const profit = row.costsComplete && money?.profitMinor != null ? money.profitMinor - costs + (order.operationalCostMinor || 0) : null;
  const milestones = [];
  for (const m of row.milestones) {
    const charge = m.orderId ? await owned(ctx, m.orderId, row.accountId, 'hasibOrders') : null;
    const unpaidMinor = charge ? Math.max(0, charge.totalMinor - charge.paidMinor) : m.amountMinor;
    milestones.push({ ...m, unpaidMinor, overdue: !m.withheld && unpaidMinor > 0 && m.dueAt < now });
  }
  return { ...publicRow(row), milestones, overdue: !['completed', 'cancelled', 'returned'].includes(row.status) && row.dueAt < now,
    expectedProfitMinor: ['completed', 'cancelled', 'returned'].includes(row.status) ? null : profit,
    recordedProfitMinor: row.status === 'completed' && order?.status === 'completed' ? profit : null,
    budgetRemainingMinor: row.budgetMinor === undefined ? null : row.budgetMinor - costs - parts,
    unpaidMinor: order ? Math.max(0, order.totalMinor - order.paidMinor) : null,
    repeatLoss: !!(row.recurringDays || row.repeatOfId) && profit !== null && profit < 0,
    unfinishedChecklist: row.checklist.filter(c => !c.done).length };
}

async function equipment(ctx, tenant, a, now) {
  if (a.operation === 'equipment') {
    const page = await list(ctx, 'hasibEquipment', tenant.accountId, a);
    return ok({ cursor: page.isDone ? null : page.continueCursor, items: page.page.map(publicRow) });
  }
  const w = a.workflow || {};
  const row = a.equipmentId ? await owned(ctx, a.equipmentId, tenant.accountId, 'hasibEquipment') : null;
  if (a.equipmentId && !row) return fail('equipment_not_found');
  if (row && row.version !== a.version) return fail('equipment_conflict');
  if (!row && !REQUEST_ID.test(a.requestId || '')) return fail('invalid_request');
  if (!row) { const replay = await byRequest(ctx, 'hasibEquipment', tenant.accountId, a.requestId); if (replay) return ok(publicRow(replay)); }
  const label = bounded(w.label ?? row?.label, 120), identifier = bounded(w.identifier ?? row?.identifier ?? '', 100);
  const contactId = w.contactId || row?.contactId;
  if (row && contactId !== row.contactId) return fail('invalid_equipment');
  const nextServiceAt = w.nextServiceAt ?? row?.nextServiceAt, visitsRemaining = w.visitsRemaining ?? row?.visitsRemaining;
  if (!label || identifier === null || !await owned(ctx, contactId, tenant.accountId, 'blueContacts') || (nextServiceAt !== undefined && !stamp(nextServiceAt)) || (visitsRemaining !== undefined && !whole(visitsRemaining))) return fail('invalid_equipment');
  const data = { label, identifier, contactId, ...(nextServiceAt !== undefined ? { nextServiceAt } : {}), ...(visitsRemaining !== undefined ? { visitsRemaining } : {}), version: (row?.version || 0) + 1, updatedAt: now };
  if (row) await ctx.db.patch(row._id, data);
  const id = row?._id || await ctx.db.insert('hasibEquipment', { ...data, accountId: tenant.accountId, requestId: a.requestId, createdAt: now });
  return ok(publicRow(await ctx.db.get(id)));
}

export async function executeJobs(ctx, tenant, a, now) {
  if (['equipment', 'equipment_save'].includes(a.operation)) return equipment(ctx, tenant, a, now);
  if (a.operation === 'jobs') {
    const page = await list(ctx, 'hasibJobs', tenant.accountId, a);
    return ok({ cursor: page.isDone ? null : page.continueCursor, items: await Promise.all(page.page.filter(r => !a.status || r.status === a.status).map(r => publicJob(ctx, r, now))) });
  }
  if (!['job', 'job_create', 'job_update', 'job_estimate', 'job_approve', 'job_status', 'job_repeat'].includes(a.operation)) return null;
  const w = a.workflow || {};
  if (a.operation === 'job_create') {
    if (!REQUEST_ID.test(a.requestId || '')) return fail('invalid_request');
    const replay = await byRequest(ctx, 'hasibJobs', tenant.accountId, a.requestId);
    if (replay) return ok(await publicJob(ctx, replay, now));
    const data = await details(ctx, tenant.accountId, w);
    if (!data?.title || !data.kind || data.dueAt === undefined) return fail('invalid_job');
    const id = await ctx.db.insert('hasibJobs', { accountId: tenant.accountId, requestId: a.requestId, checklist: [], costs: [], milestones: [], extras: [], actualMinutes: 0, costsComplete: false, ...data, status: 'draft', estimates: [], version: 1, createdAt: now, updatedAt: now });
    return ok(await publicJob(ctx, await ctx.db.get(id), now));
  }
  const row = await owned(ctx, a.jobId, tenant.accountId, 'hasibJobs');
  if (!row) return fail('job_not_found');
  if (a.operation === 'job') return ok(await publicJob(ctx, row, now));
  if (a.operation === 'job_repeat') {
    if (!REQUEST_ID.test(a.requestId || '')) return fail('invalid_request');
    const replay = await byRequest(ctx, 'hasibJobs', tenant.accountId, a.requestId);
    if (replay) return ok(await publicJob(ctx, replay, now));
    if (a.version !== row.version) return fail('job_conflict');
    if (row.status !== 'completed' || !row.recurringDays) return fail('recurring_job_required');
    return executeJobs(ctx, tenant, { operation: 'job_create', requestId: a.requestId, workflow: {
      title: row.title, kind: row.kind, dueAt: row.dueAt + row.recurringDays * 86400000,
      recurringDays: row.recurringDays, repeatOfId: row._id,
      ...(row.contactId ? { contactId: row.contactId } : {}), ...(row.equipmentId ? { equipmentId: row.equipmentId } : {}),
      checklist: row.checklist.map(c => ({ text: c.text, done: false })),
    } }, now);
  }
  if (a.version !== row.version) return fail('job_conflict');
  if (['cancelled', 'returned'].includes(row.status) || row.status === 'completed' && !(a.operation === 'job_status' && w.status === 'returned')) return fail('job_locked');
  let patch = {};
  if (a.operation === 'job_update') {
    patch = await details(ctx, tenant.accountId, w, row);
    if (!patch || w.kind && w.kind !== row.kind || w.contactId && w.contactId !== row.contactId) return fail('invalid_job');
  }
  if (a.operation === 'job_estimate') {
    if (row.status === 'in_progress' || !Array.isArray(w.lines) || !w.lines.length || w.lines.length > 50 || row.estimates.length >= 50) return fail('invalid_estimate');
    const lines = [];
    for (const line of w.lines) {
      if (!whole(line?.qty) || line.qty < 1 || !isMinor(line.unitPriceMinor)) return fail('invalid_estimate');
      if (line.variantId && !await owned(ctx, line.variantId, tenant.accountId, 'hasibVariants')) return fail('variant_not_found');
      if (!line.variantId && !bounded(line.name, 120)) return fail('invalid_estimate');
      lines.push({ ...(line.variantId ? { variantId: line.variantId } : { name: bounded(line.name, 120) }), qty: line.qty, unitPriceMinor: line.unitPriceMinor });
    }
    // Repricing the same pending order preserves deposits and prevents duplicate charges.
    if (row.orderId) {
      const order = await owned(ctx, row.orderId, tenant.accountId, 'hasibOrders');
      const updated = await updatePendingOrder(ctx, tenant.accountId, order, lines, now);
      if (!updated.ok) return updated;
    }
    patch = { estimates: [...row.estimates, { version: row.estimates.length + 1, lines, at: now }], status: 'awaiting_approval', approvedEstimateVersion: undefined, approvedBy: undefined, approvedAt: undefined };
  }
  if (a.operation === 'job_approve') {
    const estimate = row.estimates.at(-1), approvedBy = bounded(w.approvedBy, 100);
    if (row.status !== 'awaiting_approval' || estimate?.version !== w.estimateVersion || !approvedBy) return fail('estimate_conflict');
    let orderId = row.orderId;
    if (!orderId) {
      const created = await createOrder(ctx, tenant, { requestId: `job:${row.requestId}`, channel: 'walk_in', fulfilment: { type: 'in_store', dueAt: row.dueAt }, lines: estimate.lines, ...(row.contactId ? { contactId: row.contactId } : {}) }, now, { internal: true });
      if (!created.ok) return created;
      orderId = created.value.id;
    }
    patch = { orderId, approvedEstimateVersion: estimate.version, approvedBy, approvedAt: now, status: 'approved' };
  }
  if (a.operation === 'job_status') {
    const allowed = { draft: ['cancelled'], awaiting_approval: ['cancelled'], approved: ['in_progress', 'cancelled'], in_progress: ['completed', 'cancelled'], completed: ['returned'] };
    if (!allowed[row.status]?.includes(w.status)) return fail('invalid_transition');
    if (w.status === 'completed' && row.checklist.some(c => !c.done)) return fail('checklist_incomplete');
    const equipment = row.equipmentId ? await owned(ctx, row.equipmentId, tenant.accountId, 'hasibEquipment') : null;
    if (w.status === 'completed' && equipment?.visitsRemaining === 0) return fail('no_service_visits_remaining');
    if (row.orderId) {
      const order = await owned(ctx, row.orderId, tenant.accountId, 'hasibOrders');
      const to = w.status === 'in_progress' ? 'confirmed' : w.status;
      const moved = order.status === to ? { ok: true } : await changeStatus(ctx, tenant.accountId, { orderId: order._id, version: order.version, to }, now);
      if (!moved.ok) return moved;
    }
    if (equipment?.visitsRemaining !== undefined && (w.status === 'completed' || w.status === 'returned' && row.serviceVisitConsumed)) {
      await ctx.db.patch(equipment._id, { visitsRemaining: equipment.visitsRemaining + (w.status === 'completed' ? -1 : 1), version: equipment.version + 1, updatedAt: now });
    }
    patch = { status: w.status, ...(w.status === 'completed' ? { serviceVisitConsumed: equipment?.visitsRemaining !== undefined } : {}) };
  }
  await ctx.db.patch(row._id, { ...patch, version: row.version + 1, updatedAt: now });
  const updated = await ctx.db.get(row._id);
  if (updated.orderId) await ctx.db.patch(updated.orderId, { operationalCostKnown: updated.costsComplete, operationalCostMinor: updated.costs.filter(c => !c.expenseId).reduce((n,c) => n+c.amountMinor,0) });
  return ok(await publicJob(ctx, updated, now));
}
