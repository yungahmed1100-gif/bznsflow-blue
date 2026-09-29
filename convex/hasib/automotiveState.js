import { owned } from '../blueTenant.js';
import { ok, fail, bounded, REQUEST_ID, byRequest, clampLimit, nextNumber, precheckStock, settingsFor, writeMove } from './shared.js';
import { isMinor } from './money.js';
import { createOrder } from './ordersState.js';
import { audit, workspaceContainsAccount } from './workspaceState.js';
import { displayName } from '../blueContacts.js';
import { checkPhoto, releaseRegistration } from './photosState.js';
import {
  DAY, REQUEST_STATES, APPOINTMENT_STATES, WORK_STATES, TERMINAL_WORK, POWERTRAINS,
  INSPECTION_CONDITIONS, SERVICE_CATEGORIES, EVIDENCE,
  publicAutomotiveRow as publicRow, publicAutomotiveWork as publicWork, publicTechnicianWork,
  automotiveInteger as integer, isAutomotiveManager as manager,
  isAutomotiveTechnician as technician, isAutomotiveAdvisor as advisor,
  automotiveVersionError as versioned,
} from './automotiveDomain.js';
import { automotiveInsights, automotiveOverview } from './automotiveMetrics.js';
import { workflowBegin, workflowFinish } from './followupsState.js';

const request = a => REQUEST_ID.test(a.requestId || '');
const list = async (ctx, table, accountId, a, index = 'by_account_created') => {
  const page = await ctx.db.query(table).withIndex(index, q => q.eq('accountId', accountId)).order('desc').paginate({ numItems: clampLimit(a.limit, 200), cursor: a.cursor || null });
  return ok({ items: page.page.map(publicRow), cursor: page.isDone ? null : page.continueCursor });
};
const technicianWorkList = async (ctx, tenant, actor, a) => {
  const page = await ctx.db.query('automotiveWorkOrders').withIndex('by_account_technician_created', q => q.eq('accountId', tenant.accountId).eq('technicianAccountId', actor.actorAccountId)).order('desc').paginate({ numItems: clampLimit(a.limit, 200), cursor: a.cursor || null });
  return ok({ items: page.page.map(publicTechnicianWork), cursor: page.isDone ? null : page.continueCursor });
};
const technicianRelatedList = async (ctx, table, tenant, actor, a, index) => {
  const page = await ctx.db.query(table).withIndex(index, q => q.eq('accountId', tenant.accountId).eq('technicianAccountId', actor.actorAccountId)).order('desc').paginate({ numItems: clampLimit(a.limit, 200), cursor: a.cursor || null });
  return ok({ items: page.page.map(publicRow), cursor: page.isDone ? null : page.continueCursor });
};
const technicianVehicles = async (ctx, tenant, actor, a) => {
  const page = await ctx.db.query('automotiveWorkOrders').withIndex('by_account_technician_created', q => q.eq('accountId', tenant.accountId).eq('technicianAccountId', actor.actorAccountId)).order('desc').paginate({ numItems: clampLimit(a.limit, 200), cursor: a.cursor || null });
  const seen = new Set(), items = [];
  for (const job of page.page) {
    if (seen.has(String(job.vehicleId))) continue;
    const vehicle = await owned(ctx, job.vehicleId, tenant.accountId, 'automotiveVehicles');
    if (!vehicle) continue;
    seen.add(String(job.vehicleId));
    const { contactId, ...value } = publicRow(vehicle);
    items.push(value);
  }
  return ok({ items, cursor: page.isDone ? null : page.continueCursor });
};
const assigned = async (ctx, actor, accountId) => !accountId || workspaceContainsAccount(ctx, actor.workspace, accountId);
const assignedWork = (actor, row) => !technician(actor) || String(row.technicianAccountId) === String(actor.actorAccountId);

async function vehicleSave(ctx, tenant, actor, a, now) {
  const w = a.workflow || {}, accountId = tenant.accountId;
  let row = a.vehicleId ? await owned(ctx, a.vehicleId, accountId, 'automotiveVehicles') : null;
  let begun;
  if (a.vehicleId) { begun = await workflowBegin(ctx, accountId, a); if (begun.error) return fail(begun.error); if (begun.replay) return ok(publicRow(begun.replay)); const error = versioned(row, a, 'vehicle'); if (error) return error; }
  else { if (!request(a)) return fail('invalid_request'); const replay = await byRequest(ctx, 'automotiveVehicles', accountId, a.requestId); if (replay) return ok(publicRow(replay)); }
  const contactId = w.contactId ?? row?.contactId;
  const contact = contactId && await owned(ctx, contactId, accountId, 'blueContacts');
  const plate = bounded(w.plate ?? row?.plate, 24)?.toUpperCase(), vin = bounded(w.vin ?? row?.vin ?? '', 32)?.toUpperCase() || undefined;
  const make = bounded(w.make ?? row?.make, 60), model = bounded(w.model ?? row?.model, 60), year = w.year ?? row?.year, powertrain = w.powertrain ?? row?.powertrain ?? 'other', odometerKm = w.odometerKm ?? row?.odometerKm;
  if (!contact || contact.state !== 'active' || !plate || !make || !model || !integer(year, 1950, 2100) || !POWERTRAINS.includes(powertrain) || !integer(odometerKm, 0, 5000000)) return fail('invalid_vehicle');
  if (row && odometerKm < row.odometerKm && !manager(actor)) return fail('odometer_correction_manager_required');
  const samePlate = await ctx.db.query('automotiveVehicles').withIndex('by_account_plate', q => q.eq('accountId', accountId).eq('plate', plate)).first();
  if (samePlate && samePlate._id !== row?._id) return fail('vehicle_exists');
  if (vin) { const sameVin = await ctx.db.query('automotiveVehicles').withIndex('by_account_vin', q => q.eq('accountId', accountId).eq('vin', vin)).first(); if (sameVin && sameVin._id !== row?._id) return fail('vehicle_exists'); }
  const data = { contactId, plate, ...(vin ? { vin } : {}), make, model, year, powertrain, odometerKm, ...(integer(w.nextServiceAt ?? row?.nextServiceAt) ? { nextServiceAt: w.nextServiceAt ?? row.nextServiceAt } : {}), version: (row?.version || 0) + 1, updatedAt: now };
  let id;
  if (row) { await ctx.db.patch(row._id, data); id = row._id; } else id = await ctx.db.insert('automotiveVehicles', { ...data, accountId, requestId: a.requestId, createdAt: now });
  if (begun) await workflowFinish(ctx, accountId, a, begun.fingerprint, 'automotiveVehicles', id, now);
  await audit(ctx, tenant, actor, row ? 'automotive_vehicle_updated' : 'automotive_vehicle_created', 'automotive_vehicle', id, now);
  return ok(publicRow(await ctx.db.get(id)));
}

async function baySave(ctx, tenant, actor, a, now) {
  if (!manager(actor)) return fail('manager_required');
  const w = a.workflow || {}; let row = a.bayId ? await owned(ctx, a.bayId, tenant.accountId, 'automotiveBays') : null;
  let begun;
  if (a.bayId) { begun = await workflowBegin(ctx, tenant.accountId, a); if (begun.error) return fail(begun.error); if (begun.replay) return ok(publicRow(begun.replay)); const error = versioned(row, a, 'bay'); if (error) return error; }
  else { if (!request(a)) return fail('invalid_request'); const replay = await byRequest(ctx, 'automotiveBays', tenant.accountId, a.requestId); if (replay) return ok(publicRow(replay)); }
  const name = bounded(w.name ?? row?.name, 80), availability = w.availability ?? row?.availability ?? [];
  if (!name || !Array.isArray(availability) || availability.length > 100 || availability.some(x => !integer(x?.startsAt) || !integer(x?.endsAt) || x.startsAt >= x.endsAt)) return fail('invalid_bay');
  const data = { name, availability, active: w.active ?? row?.active ?? true, version: (row?.version || 0) + 1, updatedAt: now };
  let id; if (row) { await ctx.db.patch(row._id, data); id = row._id; } else id = await ctx.db.insert('automotiveBays', { ...data, accountId: tenant.accountId, requestId: a.requestId, createdAt: now });
  if (begun) await workflowFinish(ctx, tenant.accountId, a, begun.fingerprint, 'automotiveBays', id, now);
  await audit(ctx, tenant, actor, row ? 'automotive_bay_updated' : 'automotive_bay_created', 'automotive_bay', id, now); return ok(publicRow(await ctx.db.get(id)));
}

async function serviceSave(ctx, tenant, actor, a, now) {
  if (!manager(actor)) return fail('manager_required');
  const w = a.workflow || {}; let row = a.serviceId ? await owned(ctx, a.serviceId, tenant.accountId, 'automotiveServices') : null;
  let begun;
  if (a.serviceId) { begun = await workflowBegin(ctx, tenant.accountId, a); if (begun.error) return fail(begun.error); if (begun.replay) return ok(publicRow(begun.replay)); const error = versioned(row, a, 'service'); if (error) return error; }
  else { if (!request(a)) return fail('invalid_request'); const replay = await byRequest(ctx, 'automotiveServices', tenant.accountId, a.requestId); if (replay) return ok(publicRow(replay)); }
  const name = bounded(w.name ?? row?.name, 100), category = w.category ?? row?.category ?? 'other', durationMinutes = w.durationMinutes ?? row?.durationMinutes, standardLaborMinutes = w.standardLaborMinutes ?? row?.standardLaborMinutes ?? durationMinutes, priceMinor = w.priceMinor ?? row?.priceMinor;
  const checklist = w.checklist ?? row?.checklist ?? [];
  if (!name || !SERVICE_CATEGORIES.includes(category) || !integer(durationMinutes, 5, 1440) || !integer(standardLaborMinutes, 0, 10000) || !isMinor(priceMinor) || !Array.isArray(checklist) || checklist.length > 50 || checklist.some(x => !bounded(x, 160))) return fail('invalid_service');
  const data = { name, category, durationMinutes, standardLaborMinutes, priceMinor, checklist: checklist.map(x => bounded(x, 160)), active: w.active ?? row?.active ?? true, version: (row?.version || 0) + 1, updatedAt: now };
  let id; if (row) { await ctx.db.patch(row._id, data); id = row._id; } else id = await ctx.db.insert('automotiveServices', { ...data, accountId: tenant.accountId, requestId: a.requestId, createdAt: now });
  if (begun) await workflowFinish(ctx, tenant.accountId, a, begun.fingerprint, 'automotiveServices', id, now);
  await audit(ctx, tenant, actor, row ? 'automotive_service_updated' : 'automotive_service_created', 'automotive_service', id, now); return ok(publicRow(await ctx.db.get(id)));
}

async function requestSave(ctx, tenant, actor, a, now) {
  const w = a.workflow || {}; if (!request(a)) return fail('invalid_request');
  const replay = await byRequest(ctx, 'automotiveRequests', tenant.accountId, a.requestId); if (replay) return ok(publicRow(replay));
  const contact = await owned(ctx, w.contactId, tenant.accountId, 'blueContacts');
  if (!contact || contact.state !== 'active' || !integer(w.preferredFrom) || !integer(w.preferredTo) || w.preferredFrom >= w.preferredTo) return fail('invalid_request_details');
  let vehicle, service, conversation;
  if (w.vehicleId) { vehicle = await owned(ctx, w.vehicleId, tenant.accountId, 'automotiveVehicles'); if (!vehicle || vehicle.contactId !== contact._id) return fail('vehicle_not_found'); }
  if (w.serviceId) { service = await owned(ctx, w.serviceId, tenant.accountId, 'automotiveServices'); if (!service) return fail('service_not_found'); }
  if (w.conversationId) { conversation = await owned(ctx, w.conversationId, tenant.accountId, 'blueConversations'); if (!conversation) return fail('conversation_not_found'); }
  const source = bounded(w.source ?? 'staff', 30), channel = bounded(w.channel ?? 'other', 20);
  if (!source || !channel) return fail('invalid_request_details');
  const id = await ctx.db.insert('automotiveRequests', { accountId: tenant.accountId, requestId: a.requestId, contactId: contact._id, ...(vehicle ? { vehicleId: vehicle._id } : {}), ...(service ? { serviceId: service._id } : {}), ...(conversation ? { conversationId: conversation._id } : {}), source, channel, preferredFrom: w.preferredFrom, preferredTo: w.preferredTo, status: 'new', firstInboundAt: w.firstInboundAt ?? now, version: 1, createdAt: now, updatedAt: now });
  await audit(ctx, tenant, actor, 'automotive_request_created', 'automotive_request', id, now); return ok(publicRow(await ctx.db.get(id)));
}

async function requestStatus(ctx, tenant, actor, a, now) {
  const begun = await workflowBegin(ctx, tenant.accountId, a); if (begun.error) return fail(begun.error); if (begun.replay) return ok(publicRow(begun.replay));
  const row = await owned(ctx, a.appointmentRequestId, tenant.accountId, 'automotiveRequests'), error = versioned(row, a, 'request'); if (error) return error;
  const to = a.status, allowed = { new: ['assigned', 'declined', 'withdrawn'], assigned: ['booked', 'declined', 'withdrawn'], booked: [], declined: [], withdrawn: [] };
  if (!REQUEST_STATES.includes(to) || !(allowed[row.status] || []).includes(to)) return fail('invalid_request_transition');
  const assignee = a.assignedAccountId ?? row.assignedAccountId;
  if (to === 'assigned' && !await assigned(ctx, actor, assignee)) return fail('invalid_assignment');
  await ctx.db.patch(row._id, { status: to, ...(assignee ? { assignedAccountId: assignee } : {}), ...(a.firstResponseSubmittedAt ? { firstResponseSubmittedAt: a.firstResponseSubmittedAt } : {}), version: row.version + 1, updatedAt: now });
  await workflowFinish(ctx, tenant.accountId, a, begun.fingerprint, 'automotiveRequests', row._id, now);
  await audit(ctx, tenant, actor, 'automotive_request_status', 'automotive_request', row._id, now, `${row.status}:${to}`); return ok(publicRow(await ctx.db.get(row._id)));
}

async function appointmentSave(ctx, tenant, actor, a, now) {
  const w = a.workflow || {}; let row = a.appointmentId ? await owned(ctx, a.appointmentId, tenant.accountId, 'automotiveAppointments') : null;
  let begun;
  if (a.appointmentId) { begun = await workflowBegin(ctx, tenant.accountId, a); if (begun.error) return fail(begun.error); if (begun.replay) return ok(publicRow(begun.replay)); const error = versioned(row, a, 'appointment'); if (error) return error; if (!['scheduled', 'confirmed'].includes(row.status)) return fail('appointment_locked'); }
  else { if (!request(a)) return fail('invalid_request'); const replay = await byRequest(ctx, 'automotiveAppointments', tenant.accountId, a.requestId); if (replay) return ok(publicRow(replay)); }
  const vehicle = await owned(ctx, w.vehicleId ?? row?.vehicleId, tenant.accountId, 'automotiveVehicles'), service = await owned(ctx, w.serviceId ?? row?.serviceId, tenant.accountId, 'automotiveServices'), bay = await owned(ctx, w.bayId ?? row?.bayId, tenant.accountId, 'automotiveBays');
  const technicianAccountId = w.technicianAccountId ?? row?.technicianAccountId, startsAt = w.startsAt ?? row?.startsAt;
  if (!vehicle || !service?.active || !bay?.active || !technicianAccountId || !await assigned(ctx, actor, technicianAccountId) || !integer(startsAt)) return fail('invalid_appointment');
  const endsAt = startsAt + service.durationMinutes * 60000;
  if (bay.availability.length && !bay.availability.some(x => x.startsAt <= startsAt && x.endsAt >= endsAt)) return fail('outside_availability');
  const [bayCandidates, technicianCandidates] = await Promise.all([
    ctx.db.query('automotiveAppointments').withIndex('by_account_bay_start', q => q.eq('accountId', tenant.accountId).eq('bayId', bay._id).gte('startsAt', startsAt - DAY).lt('startsAt', endsAt)).take(2000),
    ctx.db.query('automotiveAppointments').withIndex('by_account_technician_start', q => q.eq('accountId', tenant.accountId).eq('technicianAccountId', technicianAccountId).gte('startsAt', startsAt - DAY).lt('startsAt', endsAt)).take(2000),
  ]);
  const overlaps = [...bayCandidates, ...technicianCandidates].filter(x => String(x.accountId) === String(tenant.accountId) && x._id !== row?._id && !['cancelled', 'missed'].includes(x.status) && x.endsAt > startsAt);
  if (overlaps.length) return fail('appointment_conflict');
  const data = { contactId: vehicle.contactId, vehicleId: vehicle._id, serviceId: service._id, bayId: bay._id, technicianAccountId, startsAt, endsAt, status: row?.status || 'scheduled', version: (row?.version || 0) + 1, updatedAt: now };
  let id; if (row) { await ctx.db.patch(row._id, data); id = row._id; } else id = await ctx.db.insert('automotiveAppointments', { ...data, accountId: tenant.accountId, requestId: a.requestId, createdAt: now });
  if (begun) await workflowFinish(ctx, tenant.accountId, a, begun.fingerprint, 'automotiveAppointments', id, now);
  await audit(ctx, tenant, actor, row ? 'automotive_appointment_updated' : 'automotive_appointment_created', 'automotive_appointment', id, now); return ok(publicRow(await ctx.db.get(id)));
}

async function appointmentStatus(ctx, tenant, actor, a, now) {
  const begun = await workflowBegin(ctx, tenant.accountId, a); if (begun.error) return fail(begun.error); if (begun.replay) return ok(publicRow(begun.replay));
  const row = await owned(ctx, a.appointmentId, tenant.accountId, 'automotiveAppointments'), error = versioned(row, a, 'appointment'); if (error) return error;
  const allowed = { scheduled: ['confirmed', 'cancelled'], confirmed: ['checked_in', 'missed', 'cancelled'], checked_in: [], cancelled: [], missed: [] }, to = a.status;
  if (!APPOINTMENT_STATES.includes(to) || !(allowed[row.status] || []).includes(to)) return fail('invalid_appointment_transition');
  const patch = { status: to, version: row.version + 1, updatedAt: now };
  if (to === 'confirmed') patch.confirmedAt = now; if (to === 'checked_in') patch.checkedInAt = now; if (to === 'missed') patch.missedAt = now; if (to === 'cancelled') { patch.cancelledAt = now; patch.cancellationReason = bounded(a.reason ?? 'other', 50) || 'other'; }
  await ctx.db.patch(row._id, patch); await workflowFinish(ctx, tenant.accountId, a, begun.fingerprint, 'automotiveAppointments', row._id, now); await audit(ctx, tenant, actor, 'automotive_appointment_status', 'automotive_appointment', row._id, now, `${row.status}:${to}`); return ok(publicRow(await ctx.db.get(row._id)));
}

async function workOrderSave(ctx, tenant, actor, a, now) {
  const w = a.workflow || {}; let row = a.workOrderId ? await owned(ctx, a.workOrderId, tenant.accountId, 'automotiveWorkOrders') : null;
  let begun;
  if (a.workOrderId) { begun = await workflowBegin(ctx, tenant.accountId, a); if (begun.error) return fail(begun.error); if (begun.replay) return ok(publicWork(begun.replay)); const error = versioned(row, a, 'work_order'); if (error) return error; if (TERMINAL_WORK.has(row.status)) return fail('work_order_locked'); }
  else { if (!request(a)) return fail('invalid_request'); const replay = await byRequest(ctx, 'automotiveWorkOrders', tenant.accountId, a.requestId); if (replay) return ok(publicRow(replay)); }
  const vehicle = await owned(ctx, w.vehicleId ?? row?.vehicleId, tenant.accountId, 'automotiveVehicles'); if (!vehicle) return fail('vehicle_not_found');
  let service = null, bay = null, appointment = null, repeat = null;
  if (w.serviceId ?? row?.serviceId) { service = await owned(ctx, w.serviceId ?? row.serviceId, tenant.accountId, 'automotiveServices'); if (!service) return fail('service_not_found'); }
  if (w.bayId ?? row?.bayId) { bay = await owned(ctx, w.bayId ?? row.bayId, tenant.accountId, 'automotiveBays'); if (!bay) return fail('bay_not_found'); }
  if (w.appointmentId ?? row?.appointmentId) { appointment = await owned(ctx, w.appointmentId ?? row.appointmentId, tenant.accountId, 'automotiveAppointments'); if (!appointment || appointment.vehicleId !== vehicle._id) return fail('appointment_not_found'); }
  if (w.repeatOfId ?? row?.repeatOfId) { repeat = await owned(ctx, w.repeatOfId ?? row.repeatOfId, tenant.accountId, 'automotiveWorkOrders'); if (!repeat || repeat.vehicleId !== vehicle._id) return fail('repeat_work_order_not_found'); }
  const technicianAccountId = w.technicianAccountId ?? row?.technicianAccountId, assignedAdvisorAccountId = w.assignedAdvisorAccountId ?? row?.assignedAdvisorAccountId;
  if (!await assigned(ctx, actor, technicianAccountId) || !await assigned(ctx, actor, assignedAdvisorAccountId)) return fail('invalid_assignment');
  const concern = bounded(w.concern ?? row?.concern, 500), promisedAt = w.promisedAt ?? row?.promisedAt, odometerKm = w.odometerKm ?? row?.odometerKm;
  if (!concern || !integer(promisedAt) || !integer(odometerKm, 0, 5000000)) return fail('invalid_work_order');
  if (odometerKm < vehicle.odometerKm && !manager(actor)) return fail('odometer_correction_manager_required');
  const data = { contactId: vehicle.contactId, vehicleId: vehicle._id, ...(appointment ? { appointmentId: appointment._id } : {}), ...(service ? { serviceId: service._id } : {}), ...(bay ? { bayId: bay._id } : {}), ...(technicianAccountId ? { technicianAccountId } : {}), ...(assignedAdvisorAccountId ? { assignedAdvisorAccountId } : {}), ...(repeat ? { repeatOfId: repeat._id } : {}), concern, promisedAt, odometerKm, status: row?.status || 'intake', ...(w.warrantyDisposition ? { warrantyDisposition: bounded(w.warrantyDisposition, 30) } : {}), version: (row?.version || 0) + 1, updatedAt: now };
  let id;
  if (row) { await ctx.db.patch(row._id, data); id = row._id; } else { const number = await nextNumber(ctx, tenant.accountId, 'automotive_work_order'); id = await ctx.db.insert('automotiveWorkOrders', { ...data, number, accountId: tenant.accountId, requestId: a.requestId, createdAt: now }); }
  if (begun) await workflowFinish(ctx, tenant.accountId, a, begun.fingerprint, 'automotiveWorkOrders', id, now);
  if (odometerKm >= vehicle.odometerKm) await ctx.db.patch(vehicle._id, { odometerKm, version: vehicle.version + 1, updatedAt: now });
  if (appointment && !appointment.workOrderId) await ctx.db.patch(appointment._id, { workOrderId: id, status: 'checked_in', checkedInAt: now, version: appointment.version + 1, updatedAt: now });
  await audit(ctx, tenant, actor, row ? 'automotive_work_order_updated' : 'automotive_work_order_created', 'automotive_work_order', id, now); return ok(publicRow(await ctx.db.get(id)));
}

async function inspectionSave(ctx, tenant, actor, a, now) {
  if (!request(a)) return fail('invalid_request'); const replay = await byRequest(ctx, 'automotiveInspections', tenant.accountId, a.requestId); if (replay) return ok(publicRow(replay));
  const work = await owned(ctx, a.workOrderId, tenant.accountId, 'automotiveWorkOrders'); if (!work || !assignedWork(actor, work)) return fail(work ? 'work_order_not_assigned' : 'work_order_not_found');
  const items = a.workflow?.items;
  if (!Array.isArray(items) || !items.length || items.length > 80 || items.some(x => !bounded(x?.category, 40) || !INSPECTION_CONDITIONS.includes(x?.condition) || (x.note !== undefined && bounded(x.note, 300) === null) || (x.photoIds !== undefined && (!Array.isArray(x.photoIds) || x.photoIds.length > 12)))) return fail('invalid_inspection');
  const photos = [];
  for (const item of items) for (const photoId of item.photoIds || []) {
    const checked = await checkPhoto(ctx, tenant.accountId, photoId);
    if (!checked || photos.includes(checked)) return fail('invalid_photo');
    photos.push(checked);
  }
  const cleanItems = items.map(x => ({ category: bounded(x.category, 40), condition: x.condition, ...(x.note ? { note: bounded(x.note, 300) } : {}), ...(x.photoIds?.length ? { photoIds: x.photoIds } : {}) }));
  const id = await ctx.db.insert('automotiveInspections', { accountId: tenant.accountId, requestId: a.requestId, workOrderId: work._id, items: cleanItems, submittedBy: actor.actorAccountId, submittedAt: now });
  for (const storageId of photos) {
    await ctx.db.insert('automotiveInspectionPhotos', { accountId: tenant.accountId, inspectionId: id, storageId, createdAt: now });
    await releaseRegistration(ctx, storageId);
  }
  if (work.status === 'intake') await ctx.db.patch(work._id, { status: 'inspection', version: work.version + 1, updatedAt: now });
  await audit(ctx, tenant, actor, 'automotive_inspection_recorded', 'automotive_work_order', work._id, now); return ok(publicRow(await ctx.db.get(id)));
}

function estimateLines(lines) {
  if (!Array.isArray(lines) || !lines.length || lines.length > 80) return null;
  const out = [];
  for (const line of lines) {
    const kind = line?.kind, name = bounded(line?.name, 120), qty = line?.qty, unitPriceMinor = line?.unitPriceMinor, standardMinutes = line?.standardMinutes;
    if (!['labor', 'part', 'fee'].includes(kind) || !name || !integer(qty, 1, 1000000) || !isMinor(unitPriceMinor) || (kind === 'labor' && !integer(standardMinutes, 0, 100000))) return null;
    out.push({ kind, name, ...(line.variantId ? { variantId: line.variantId } : {}), qty, unitPriceMinor, ...(standardMinutes !== undefined ? { standardMinutes } : {}) });
  }
  return out;
}

async function estimateSave(ctx, tenant, actor, a, now) {
  if (!advisor(actor)) return fail('advisor_required'); if (!request(a)) return fail('invalid_request');
  const replay = await byRequest(ctx, 'automotiveEstimates', tenant.accountId, a.requestId); if (replay) return ok(publicRow(replay));
  const work = await owned(ctx, a.workOrderId, tenant.accountId, 'automotiveWorkOrders'); if (!work || TERMINAL_WORK.has(work.status)) return fail(work ? 'work_order_locked' : 'work_order_not_found');
  const lines = estimateLines(a.workflow?.lines); if (!lines) return fail('invalid_estimate');
  for (const line of lines) if (line.variantId && !await owned(ctx, line.variantId, tenant.accountId, 'hasibVariants')) return fail('variant_not_found');
  const prior = await ctx.db.query('automotiveEstimates').withIndex('by_work_order', q => q.eq('workOrderId', work._id)).take(100), estimateNumber = prior.reduce((n, x) => Math.max(n, x.estimateNumber), 0) + 1;
  for (const estimate of prior.filter(x => ['draft', 'issued', 'approved'].includes(x.status))) await ctx.db.patch(estimate._id, { status: 'superseded', version: estimate.version + 1, updatedAt: now });
  const totalMinor = lines.reduce((sum, line) => sum + line.qty * line.unitPriceMinor, 0), standardMinutes = lines.reduce((sum, line) => sum + (line.standardMinutes || 0) * line.qty, 0);
  const id = await ctx.db.insert('automotiveEstimates', { accountId: tenant.accountId, requestId: a.requestId, workOrderId: work._id, estimateNumber, status: 'draft', lines, totalMinor, standardMinutes, version: 1, createdAt: now, updatedAt: now });
  const patch = { status: 'awaiting_approval', approvedEstimateVersion: undefined, version: work.version + 1, updatedAt: now };
  await ctx.db.patch(work._id, patch);
  await audit(ctx, tenant, actor, 'automotive_estimate_saved', 'automotive_estimate', id, now); return ok(publicRow(await ctx.db.get(id)));
}

async function estimateStatus(ctx, tenant, actor, a, now) {
  if (!advisor(actor)) return fail('advisor_required'); const begun = await workflowBegin(ctx, tenant.accountId, a); if (begun.error) return fail(begun.error); if (begun.replay) return ok(publicRow(begun.replay)); const row = await owned(ctx, a.estimateId, tenant.accountId, 'automotiveEstimates'), error = versioned(row, a, 'estimate'); if (error) return error;
  const allowed = { draft: ['issued'], issued: ['rejected'], rejected: [], approved: [], superseded: [] };
  if (!(allowed[row.status] || []).includes(a.status)) return fail('invalid_estimate_transition');
  await ctx.db.patch(row._id, { status: a.status, ...(a.status === 'issued' ? { issuedAt: now } : {}), version: row.version + 1, updatedAt: now }); await workflowFinish(ctx, tenant.accountId, a, begun.fingerprint, 'automotiveEstimates', row._id, now);
  await audit(ctx, tenant, actor, 'automotive_estimate_status', 'automotive_estimate', row._id, now, `${row.status}:${a.status}`); return ok(publicRow(await ctx.db.get(row._id)));
}

async function approvalRecord(ctx, tenant, actor, a, now) {
  if (!advisor(actor)) return fail('advisor_required'); const begun = await workflowBegin(ctx, tenant.accountId, a); if (begun.error) return fail(begun.error); if (begun.replay) return ok(publicWork(begun.replay));
  const work = await owned(ctx, a.workOrderId, tenant.accountId, 'automotiveWorkOrders'), error = versioned(work, a, 'work_order'); if (error) return error;
  const estimate = await owned(ctx, a.estimateId, tenant.accountId, 'automotiveEstimates');
  const approvedBy = bounded(a.approvedBy, 100), evidenceSource = a.evidenceSource;
  if (!estimate || estimate.workOrderId !== work._id || estimate.status !== 'issued' || !approvedBy || !EVIDENCE.includes(evidenceSource)) return fail('invalid_approval');
  await ctx.db.patch(estimate._id, { status: 'approved', approvedAt: now, approvedBy, evidenceSource, recordedBy: actor.actorAccountId, version: estimate.version + 1, updatedAt: now });
  await ctx.db.patch(work._id, { approvedEstimateVersion: estimate.estimateNumber, status: 'approved', version: work.version + 1, updatedAt: now });
  await workflowFinish(ctx, tenant.accountId, a, begun.fingerprint, 'automotiveWorkOrders', work._id, now);
  await audit(ctx, tenant, actor, 'automotive_estimate_approved', 'automotive_work_order', work._id, now, String(estimate.estimateNumber)); return ok(publicRow(await ctx.db.get(work._id)));
}

async function laborStart(ctx, tenant, actor, a, now) {
  if (!request(a)) return fail('invalid_request'); const replay = await byRequest(ctx, 'automotiveLaborEntries', tenant.accountId, a.requestId); if (replay) return ok(publicRow(replay));
  const work = await owned(ctx, a.workOrderId, tenant.accountId, 'automotiveWorkOrders'); if (!work || !assignedWork(actor, work)) return fail(work ? 'work_order_not_assigned' : 'work_order_not_found');
  if (!['approved', 'in_progress'].includes(work.status)) return fail('work_not_ready');
  const open = (await ctx.db.query('automotiveLaborEntries').withIndex('by_work_order', q => q.eq('workOrderId', work._id)).take(100)).find(x => !x.stoppedAt); if (open) return fail('active_labor_clock');
  const technicianAccountId = technician(actor) ? actor.actorAccountId : work.technicianAccountId; if (!technicianAccountId) return fail('technician_required');
  const id = await ctx.db.insert('automotiveLaborEntries', { accountId: tenant.accountId, requestId: a.requestId, workOrderId: work._id, technicianAccountId, startedAt: now, version: 1, createdAt: now, updatedAt: now });
  if (work.status === 'approved') await ctx.db.patch(work._id, { status: 'in_progress', startedAt: now, version: work.version + 1, updatedAt: now });
  await audit(ctx, tenant, actor, 'automotive_labor_started', 'automotive_work_order', work._id, now); return ok(publicRow(await ctx.db.get(id)));
}

async function laborStop(ctx, tenant, actor, a, now) {
  if (!request(a)) return fail('invalid_request');
  const replay = await ctx.db.query('automotiveLaborEntries').withIndex('by_account_stop_request', q => q.eq('accountId', tenant.accountId).eq('stopRequestId', a.requestId)).first(); if (replay?.stoppedAt) return ok(publicRow(replay));
  const row = await owned(ctx, a.laborEntryId, tenant.accountId, 'automotiveLaborEntries'), error = versioned(row, a, 'labor_entry'); if (error) return error;
  if (row.stoppedAt) return ok(publicRow(row)); if (technician(actor) && row.technicianAccountId !== actor.actorAccountId) return fail('work_order_not_assigned');
  const minutes = Math.max(1, Math.round((now - row.startedAt) / 60000));
  await ctx.db.patch(row._id, { stoppedAt: now, minutes, stopRequestId: a.requestId, version: row.version + 1, updatedAt: now });
  await audit(ctx, tenant, actor, 'automotive_labor_stopped', 'automotive_work_order', row.workOrderId, now); return ok(publicRow(await ctx.db.get(row._id)));
}

async function partSave(ctx, tenant, actor, a, now) {
  if (!request(a)) return fail('invalid_request'); const replay = await byRequest(ctx, 'automotivePartAllocations', tenant.accountId, a.requestId); if (replay) return ok(publicRow(replay));
  const work = await owned(ctx, a.workOrderId, tenant.accountId, 'automotiveWorkOrders'), variant = await owned(ctx, a.workflow?.variantId, tenant.accountId, 'hasibVariants');
  const qty = a.workflow?.qty, status = a.workflow?.status || 'requested';
  if (!work || !work.technicianAccountId || !assignedWork(actor, work) || !variant || !integer(qty, 1, 1000000) || !['requested', 'reserved'].includes(status)) return fail('invalid_part_allocation');
  const id = await ctx.db.insert('automotivePartAllocations', { accountId: tenant.accountId, requestId: a.requestId, workOrderId: work._id, technicianAccountId: work.technicianAccountId, variantId: variant._id, qty, status, version: 1, createdAt: now, updatedAt: now });
  await audit(ctx, tenant, actor, 'automotive_part_saved', 'automotive_work_order', work._id, now); return ok(publicRow(await ctx.db.get(id)));
}

async function partStatus(ctx, tenant, actor, a, now) {
  if (!request(a)) return fail('invalid_request');
  const replayMove = await ctx.db.query('hasibStockMoves').withIndex('by_account_request', q => q.eq('accountId', tenant.accountId).eq('requestId', a.requestId)).first();
  if (replayMove) { const current = await owned(ctx, replayMove.refId, tenant.accountId, 'automotivePartAllocations'); if (current) return ok(publicRow(current)); }
  const row = await owned(ctx, a.partAllocationId, tenant.accountId, 'automotivePartAllocations'), error = versioned(row, a, 'part_allocation'); if (error) return error;
  const work = await owned(ctx, row.workOrderId, tenant.accountId, 'automotiveWorkOrders'); if (!assignedWork(actor, work)) return fail('work_order_not_assigned');
  const allowed = { requested: ['reserved', 'cancelled'], reserved: ['issued', 'cancelled'], issued: ['consumed', 'returned'], consumed: [], returned: [], cancelled: [] };
  if (!(allowed[row.status] || []).includes(a.status)) return fail('invalid_part_transition');
  const patch = { status: a.status, version: row.version + 1, updatedAt: now };
  if (a.status === 'issued') {
    const variant = await owned(ctx, row.variantId, tenant.accountId, 'hasibVariants'), settings = await settingsFor(ctx, tenant.accountId), check = precheckStock([{ variant, delta: -row.qty }], settings.stockPolicy); if (!check.ok) return fail(check.reason);
    await writeMove(ctx, { accountId: tenant.accountId, variantId: row.variantId, delta: -row.qty, reason: 'automotive_issue', refType: 'automotive_part', refId: row._id, unitCostMinor: variant.costMinor, requestId: a.requestId, now });
    patch.issueMoveId = (await ctx.db.query('hasibStockMoves').withIndex('by_account_request', q => q.eq('accountId', tenant.accountId).eq('requestId', a.requestId)).first())._id;
  }
  if (a.status === 'returned') {
    if (!row.issueMoveId) return fail('part_not_issued'); const move = await owned(ctx, row.issueMoveId, tenant.accountId, 'hasibStockMoves');
    await writeMove(ctx, { accountId: tenant.accountId, variantId: row.variantId, delta: row.qty, reason: 'automotive_return', refType: 'automotive_part', refId: row._id, unitCostMinor: move.unitCostMinor, restoreFrom: move._id, requestId: a.requestId, now });
    patch.returnMoveId = (await ctx.db.query('hasibStockMoves').withIndex('by_account_request', q => q.eq('accountId', tenant.accountId).eq('requestId', a.requestId)).first())._id;
  }
  await ctx.db.patch(row._id, patch); await audit(ctx, tenant, actor, 'automotive_part_status', 'automotive_work_order', row.workOrderId, now, `${row.status}:${a.status}`); return ok(publicRow(await ctx.db.get(row._id)));
}

async function qualitySave(ctx, tenant, actor, a, now) {
  if (!advisor(actor)) return fail('advisor_required'); if (!request(a)) return fail('invalid_request');
  const replay = await byRequest(ctx, 'automotiveQualityChecks', tenant.accountId, a.requestId); if (replay) return ok(publicRow(await ctx.db.get(replay.workOrderId)));
  const work = await owned(ctx, a.workOrderId, tenant.accountId, 'automotiveWorkOrders'), error = versioned(work, a, 'work_order'); if (error) return error;
  const checklist = a.workflow?.checklist; if (work.status !== 'quality_check' || !Array.isArray(checklist) || !checklist.length || checklist.length > 50 || checklist.some(x => !bounded(x?.text, 160) || x.done !== true)) return fail('invalid_quality_check');
  await ctx.db.insert('automotiveQualityChecks', { accountId: tenant.accountId, requestId: a.requestId, workOrderId: work._id, checklist: checklist.map(x => ({ text: bounded(x.text, 160), done: true })), checkedBy: actor.actorAccountId, checkedAt: now });
  await ctx.db.patch(work._id, { qualityCheckedAt: now, qualityCheckedBy: actor.actorAccountId, version: work.version + 1, updatedAt: now });
  await audit(ctx, tenant, actor, 'automotive_quality_checked', 'automotive_work_order', work._id, now); return ok(publicRow(await ctx.db.get(work._id)));
}

async function chargeFor(ctx, tenant, work, now) {
  if (work.orderId) return work.orderId;
  const estimate = (await ctx.db.query('automotiveEstimates').withIndex('by_work_order', q => q.eq('workOrderId', work._id)).take(100)).find(x => x.estimateNumber === work.approvedEstimateVersion && x.status === 'approved');
  if (!estimate) return null;
  const result = await createOrder(ctx, tenant, { requestId: `auto-charge-${work._id}`.padEnd(36, '0').slice(0, 36), channel: 'other', fulfilment: { type: 'pickup', dueAt: work.promisedAt }, contactId: work.contactId, kind: 'automotive_work_order', source: 'automotive', confirm: false, lines: estimate.lines.map(line => ({ name: line.name, qty: line.qty, unitPriceMinor: line.unitPriceMinor, ...(line.kind === 'labor' ? { role: 'labour' } : {}) })), customFields: [] }, now, { internal: true });
  return result.ok ? result.value.id : null;
}

async function workOrderStatus(ctx, tenant, actor, a, now) {
  const begun = await workflowBegin(ctx, tenant.accountId, a); if (begun.error) return fail(begun.error); if (begun.replay) return ok(technician(actor) ? publicTechnicianWork(begun.replay) : publicWork(begun.replay));
  const row = await owned(ctx, a.workOrderId, tenant.accountId, 'automotiveWorkOrders'), error = versioned(row, a, 'work_order'); if (error) return error;
  if (technician(actor) && !assignedWork(actor, row)) return fail('work_order_not_assigned');
  const allowed = { intake: ['inspection', 'awaiting_approval', 'cancelled'], inspection: ['awaiting_approval', 'cancelled'], awaiting_approval: ['approved', 'cancelled'], approved: ['in_progress', 'cancelled'], in_progress: ['quality_check', 'cancelled'], quality_check: ['ready', 'in_progress'], ready: ['collected'], collected: ['closed'], closed: [], cancelled: [] }, to = a.status;
  if (!WORK_STATES.includes(to) || !(allowed[row.status] || []).includes(to)) return fail('invalid_work_order_transition');
  if (to === 'approved' && !row.approvedEstimateVersion) return fail('approval_required');
  if (to === 'quality_check') {
    const labor = await ctx.db.query('automotiveLaborEntries').withIndex('by_work_order', q => q.eq('workOrderId', row._id)).take(200); if (labor.some(x => !x.stoppedAt)) return fail('active_labor_clock');
    const parts = await ctx.db.query('automotivePartAllocations').withIndex('by_work_order', q => q.eq('workOrderId', row._id)).take(200); if (parts.some(x => ['requested', 'reserved'].includes(x.status))) return fail('parts_unresolved');
  }
  if (to === 'ready' && !row.qualityCheckedAt) return fail('quality_check_required');
  if (technician(actor) && ['ready', 'collected', 'closed', 'cancelled'].includes(to)) return fail('advisor_required');
  const patch = { status: to, version: row.version + 1, updatedAt: now };
  if (to === 'in_progress' && !row.startedAt) patch.startedAt = now;
  if (to === 'ready') { patch.readyAt = now; const orderId = await chargeFor(ctx, tenant, row, now); if (!orderId) return fail('approved_estimate_not_found'); patch.orderId = orderId; }
  if (to === 'collected') patch.collectedAt = now; if (to === 'closed') patch.closedAt = now;
  await ctx.db.patch(row._id, patch); await workflowFinish(ctx, tenant.accountId, a, begun.fingerprint, 'automotiveWorkOrders', row._id, now); await audit(ctx, tenant, actor, 'automotive_work_order_status', 'automotive_work_order', row._id, now, `${row.status}:${to}`); return ok(publicRow(await ctx.db.get(row._id)));
}

async function experienceSave(ctx, tenant, actor, a, now) {
  if (!request(a)) return fail('invalid_request'); const replay = await byRequest(ctx, 'automotiveExperience', tenant.accountId, a.requestId); if (replay) return ok(publicRow(replay));
  const work = await owned(ctx, a.workOrderId, tenant.accountId, 'automotiveWorkOrders'); if (!work || !integer(a.rating, 1, 5)) return fail(work ? 'invalid_rating' : 'work_order_not_found');
  if (await ctx.db.query('automotiveExperience').withIndex('by_work_order', q => q.eq('workOrderId', work._id)).first()) return fail('rating_exists');
  const reason = ['quality', 'communication', 'timeliness', 'value', 'other'].includes(a.experienceReason) ? a.experienceReason : undefined;
  const id = await ctx.db.insert('automotiveExperience', { accountId: tenant.accountId, requestId: a.requestId, workOrderId: work._id, rating: a.rating, ...(reason ? { reason } : {}), submittedAt: now });
  await audit(ctx, tenant, actor, 'automotive_experience_recorded', 'automotive_work_order', work._id, now); return ok(publicRow(await ctx.db.get(id)));
}

export async function executeAutomotive(ctx, tenant, actor, a, now) {
  if (!String(a.operation || '').startsWith('automotive_')) return null;
  const op = a.operation;
  if (op === 'automotive_overview') {
    const result = await automotiveOverview(ctx, tenant.accountId, now);
    if (!technician(actor)) return result;
    return ok({ ...result.value, workOrders: result.value.workOrders.filter(row => String(row.technicianAccountId) === String(actor.actorAccountId)).map(row => { const { contactId, assignedAdvisorAccountId, ...value } = row; return value; }), tasks: result.value.tasks.filter(row => String(row.assignedAccountId) === String(actor.actorAccountId)), metrics: result.value.metrics.map(metric => ({ ...metric, value: null })) });
  }
  if (op === 'automotive_insights') return manager(actor) ? ok(await automotiveInsights(ctx, tenant.accountId, now, a)) : fail('manager_required');
  if (op === 'automotive_contacts') { if (technician(actor)) return fail('advisor_required'); const page = await ctx.db.query('blueContacts').withIndex('by_account_state_activity', q => q.eq('accountId', tenant.accountId).eq('state', 'active')).order('desc').paginate({ numItems: clampLimit(a.limit, 100), cursor: a.cursor || null }); return ok({ items: page.page.map(row => ({ id: row._id, name: displayName(row).name })), cursor: page.isDone ? null : page.continueCursor }); }
  if (op === 'automotive_vehicles') return technician(actor) ? technicianVehicles(ctx, tenant, actor, a) : list(ctx, 'automotiveVehicles', tenant.accountId, a);
  if (op === 'automotive_vehicle_save') return technician(actor) ? fail('advisor_required') : vehicleSave(ctx, tenant, actor, a, now);
  if (op === 'automotive_bays') return list(ctx, 'automotiveBays', tenant.accountId, a);
  if (op === 'automotive_bay_save') return baySave(ctx, tenant, actor, a, now);
  if (op === 'automotive_services') return list(ctx, 'automotiveServices', tenant.accountId, a);
  if (op === 'automotive_service_save') return serviceSave(ctx, tenant, actor, a, now);
  if (op === 'automotive_requests') return technician(actor) ? fail('advisor_required') : list(ctx, 'automotiveRequests', tenant.accountId, a);
  if (op === 'automotive_request_save') return technician(actor) ? fail('advisor_required') : requestSave(ctx, tenant, actor, a, now);
  if (op === 'automotive_request_status') return technician(actor) ? fail('advisor_required') : requestStatus(ctx, tenant, actor, a, now);
  if (op === 'automotive_appointments') return technician(actor) ? fail('advisor_required') : list(ctx, 'automotiveAppointments', tenant.accountId, a, 'by_account_start');
  if (op === 'automotive_appointment_save') return technician(actor) ? fail('advisor_required') : appointmentSave(ctx, tenant, actor, a, now);
  if (op === 'automotive_appointment_status') return technician(actor) ? fail('advisor_required') : appointmentStatus(ctx, tenant, actor, a, now);
  if (op === 'automotive_work_orders') { const result = technician(actor) ? await technicianWorkList(ctx, tenant, actor, a) : await list(ctx, 'automotiveWorkOrders', tenant.accountId, a); return result.ok ? ok({ ...result.value, items: result.value.items.map(row => ({ ...row, approvedEstimateVersion: row.approvedEstimateVersion ?? null, orderId: row.orderId ?? null })) }) : result; }
  if (op === 'automotive_work_order') { const row = await owned(ctx, a.workOrderId, tenant.accountId, 'automotiveWorkOrders'); return row && assignedWork(actor, row) ? ok(technician(actor) ? publicTechnicianWork(row) : publicWork(row)) : fail(row ? 'work_order_not_assigned' : 'work_order_not_found'); }
  if (op === 'automotive_work_order_save') return technician(actor) ? fail('advisor_required') : workOrderSave(ctx, tenant, actor, a, now);
  if (op === 'automotive_work_order_status') return workOrderStatus(ctx, tenant, actor, a, now);
  if (op === 'automotive_inspection_save') return inspectionSave(ctx, tenant, actor, a, now);
  if (op === 'automotive_estimates') return technician(actor) ? fail('advisor_required') : list(ctx, 'automotiveEstimates', tenant.accountId, a);
  if (op === 'automotive_estimate_save') return estimateSave(ctx, tenant, actor, a, now);
  if (op === 'automotive_estimate_status') return estimateStatus(ctx, tenant, actor, a, now);
  if (op === 'automotive_approval_record') return approvalRecord(ctx, tenant, actor, a, now);
  if (op === 'automotive_labor_entries') return technician(actor) ? technicianRelatedList(ctx, 'automotiveLaborEntries', tenant, actor, a, 'by_account_technician_start') : list(ctx, 'automotiveLaborEntries', tenant.accountId, a);
  if (op === 'automotive_labor_start') return laborStart(ctx, tenant, actor, a, now);
  if (op === 'automotive_labor_stop') return laborStop(ctx, tenant, actor, a, now);
  if (op === 'automotive_parts') return technician(actor) ? technicianRelatedList(ctx, 'automotivePartAllocations', tenant, actor, a, 'by_account_technician_created') : list(ctx, 'automotivePartAllocations', tenant.accountId, a);
  if (op === 'automotive_part_save') return partSave(ctx, tenant, actor, a, now);
  if (op === 'automotive_part_status') return partStatus(ctx, tenant, actor, a, now);
  if (op === 'automotive_quality_save') return qualitySave(ctx, tenant, actor, a, now);
  if (op === 'automotive_experience_save') return experienceSave(ctx, tenant, actor, a, now);
  return fail('invalid_action');
}
