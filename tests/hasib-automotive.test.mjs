import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { convexMemory } from './helpers/convex-memory.mjs';
import { executeAutomotive } from '../convex/hasib/automotiveState.js';
import { hasibPack } from '../config/hasib-packs.js';

async function setup() {
  const m = convexMemory(), accountId = 'automotive-account', manager = 'automotive-manager';
  const workspaceId = await m.db.insert('ascendWorkspaces', { managerAccountId: manager, employeeLimit: 5, createdAt: m.now(), updatedAt: m.now() });
  const workspace = { _id: workspaceId, managerAccountId: manager, employeeLimit: 5 };
  const actor = { workspace, role: 'manager', operationalRole: 'manager', actorAccountId: manager };
  const tenant = { accountId, pack: hasibPack('automotive'), actor };
  const contactId = await m.db.insert('blueContacts', { accountId, state: 'active', createdAt: m.now(), updatedAt: m.now() });
  const technicianId = await m.db.insert('accounts', { email: 'technician@example.com', role: 'customer', createdAt: m.now() });
  await m.db.insert('ascendWorkspaceMembers', { workspaceId, accountId: technicianId, email: 'technician@example.com', status: 'active', operationalRole: 'technician', invitedAt: m.now(), activatedAt: m.now(), updatedAt: m.now() });
  const technician = { workspace, role: 'employee', operationalRole: 'technician', actorAccountId: technicianId };
  const run = (operation, args = {}, who = actor) => executeAutomotive(m.ctx, tenant, who, { operation, ...args }, m.now());
  return { m, accountId, manager, workspace, actor, technician, technicianId, contactId, tenant, run };
}

async function workshop(run, m, contactId, technicianId) {
  const bay = (await run('automotive_bay_save', { requestId: randomUUID(), workflow: { name: 'Bay 1', availability: [{ startsAt: m.now(), endsAt: m.now() + 10 * 3600000 }] } })).value;
  const service = (await run('automotive_service_save', { requestId: randomUUID(), workflow: { name: 'Major service', category: 'maintenance', durationMinutes: 120, standardLaborMinutes: 120, priceMinor: 45000, checklist: ['Fluids', 'Brakes'] } })).value;
  const vehicle = (await run('automotive_vehicle_save', { requestId: randomUUID(), workflow: { contactId, plate: '1234 A', vin: 'JH4TB2H26CC000001', make: 'Toyota', model: 'Camry', year: 2022, powertrain: 'petrol', odometerKm: 64000 } })).value;
  return { bay, service, vehicle, technicianId };
}

test('automotive appointment capacity rejects competing bay and technician bookings', async () => {
  const { m, run, contactId, technicianId } = await setup();
  const { bay, service, vehicle } = await workshop(run, m, contactId, technicianId);
  const startsAt = m.now() + 3600000;
  const first = await run('automotive_appointment_save', { requestId: randomUUID(), workflow: { vehicleId: vehicle.id, serviceId: service.id, bayId: bay.id, technicianAccountId: technicianId, startsAt } });
  assert.equal(first.ok, true, first.reason);
  const conflict = await run('automotive_appointment_save', { requestId: randomUUID(), workflow: { vehicleId: vehicle.id, serviceId: service.id, bayId: bay.id, technicianAccountId: technicianId, startsAt: startsAt + 60000 } });
  assert.equal(conflict.reason, 'appointment_conflict');
  assert.equal(m.table('automotiveAppointments').length, 1);
});

test('request and appointment lifecycles are versioned, attributed and idempotent', async () => {
  const { m, run, contactId, technicianId } = await setup();
  const { bay, service, vehicle } = await workshop(run, m, contactId, technicianId);
  let request = (await run('automotive_request_save', { requestId: randomUUID(), workflow: { contactId, vehicleId: vehicle.id, serviceId: service.id, source: 'phone', channel: 'phone', preferredFrom: m.now() + 3600000, preferredTo: m.now() + 7200000 } })).value;
  const assignRequestId = randomUUID();
  const assigned = await run('automotive_request_status', { requestId: assignRequestId, appointmentRequestId: request.id, version: request.version, status: 'assigned', assignedAccountId: technicianId, firstResponseSubmittedAt: m.now() });
  const replay = await run('automotive_request_status', { requestId: assignRequestId, appointmentRequestId: request.id, version: request.version, status: 'assigned', assignedAccountId: technicianId, firstResponseSubmittedAt: m.now() });
  assert.equal(assigned.ok, true, assigned.reason);
  assert.equal(replay.value.id, assigned.value.id);
  assert.equal((await run('automotive_request_status', { requestId: assignRequestId, appointmentRequestId: request.id, version: assigned.value.version, status: 'declined' })).reason, 'request_conflict');

  let appointment = (await run('automotive_appointment_save', { requestId: randomUUID(), workflow: { vehicleId: vehicle.id, serviceId: service.id, bayId: bay.id, technicianAccountId: technicianId, startsAt: m.now() + 3 * 3600000 } })).value;
  appointment = (await run('automotive_appointment_status', { requestId: randomUUID(), appointmentId: appointment.id, version: appointment.version, status: 'confirmed' })).value;
  appointment = (await run('automotive_appointment_status', { requestId: randomUUID(), appointmentId: appointment.id, version: appointment.version, status: 'checked_in' })).value;
  assert.equal(appointment.status, 'checked_in');
  assert.ok(appointment.confirmedAt);
  assert.ok(appointment.checkedInAt);
  assert.ok(m.table('hasibWorkflowRequests').length >= 3);
});

test('appointment cancellation and missed outcomes remain distinct', async () => {
  const { m, run, contactId, technicianId } = await setup();
  const { bay, service, vehicle } = await workshop(run, m, contactId, technicianId);
  const create = startsAt => run('automotive_appointment_save', { requestId: randomUUID(), workflow: { vehicleId: vehicle.id, serviceId: service.id, bayId: bay.id, technicianAccountId: technicianId, startsAt } });
  let cancelled = (await create(m.now() + 3600000)).value;
  cancelled = (await run('automotive_appointment_status', { requestId: randomUUID(), appointmentId: cancelled.id, version: cancelled.version, status: 'cancelled', reason: 'customer_request' })).value;
  let missed = (await create(m.now() + 6 * 3600000)).value;
  missed = (await run('automotive_appointment_status', { requestId: randomUUID(), appointmentId: missed.id, version: missed.version, status: 'confirmed' })).value;
  missed = (await run('automotive_appointment_status', { requestId: randomUUID(), appointmentId: missed.id, version: missed.version, status: 'missed' })).value;
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.cancellationReason, 'customer_request');
  assert.equal(missed.status, 'missed');
  assert.equal(missed.cancellationReason, undefined);
});

test('edit retries replay once and reject changed payloads', async () => {
  const { m, run, contactId, technicianId } = await setup();
  const { vehicle } = await workshop(run, m, contactId, technicianId);
  const requestId = randomUUID();
  const body = { requestId, vehicleId: vehicle.id, version: vehicle.version, workflow: { odometerKm: 64500 } };
  const first = await run('automotive_vehicle_save', body);
  const replay = await run('automotive_vehicle_save', body);
  const changed = await run('automotive_vehicle_save', { ...body, workflow: { odometerKm: 64600 } });
  assert.equal(first.ok, true, first.reason);
  assert.equal(replay.value.version, first.value.version);
  assert.equal(changed.reason, 'request_conflict');
  assert.equal((await m.db.get(vehicle.id)).version, vehicle.version + 1);
});

test('estimate versions invalidate old approval and parts issue is idempotent and reversible', async () => {
  const { m, run, contactId, technicianId, accountId } = await setup();
  const { bay, service, vehicle } = await workshop(run, m, contactId, technicianId);
  const itemId = await m.db.insert('hasibItems', { accountId, nameAr: 'فلتر', nameEn: 'Filter', category: 'parts', unit: 'piece', trackStock: true, archived: false, createdAt: m.now(), updatedAt: m.now() });
  const variantId = await m.db.insert('hasibVariants', { accountId, itemId, sku: 'FLT-1', options: [], priceMinor: 10000, costMinor: 4000, costKnown: true, reorderPoint: 1, onHand: 10, low: false, archived: false, createdAt: m.now(), updatedAt: m.now() });
  let work = (await run('automotive_work_order_save', { requestId: randomUUID(), workflow: { vehicleId: vehicle.id, serviceId: service.id, bayId: bay.id, technicianAccountId: technicianId, concern: 'Scheduled maintenance', promisedAt: m.now() + 8 * 3600000, odometerKm: 64000 } })).value;
  let estimate = (await run('automotive_estimate_save', { requestId: randomUUID(), workOrderId: work.id, workflow: { lines: [{ kind: 'labor', name: 'Major service', qty: 1, unitPriceMinor: 45000, standardMinutes: 120 }, { kind: 'part', name: 'Filter', variantId, qty: 1, unitPriceMinor: 10000 }] } })).value;
  estimate = (await run('automotive_estimate_status', { requestId: randomUUID(), estimateId: estimate.id, version: estimate.version, status: 'issued' })).value;
  work = (await run('automotive_work_order', { workOrderId: work.id })).value;
  work = (await run('automotive_approval_record', { requestId: randomUUID(), workOrderId: work.id, version: work.version, estimateId: estimate.id, evidenceSource: 'whatsapp', approvedBy: 'Vehicle owner' })).value;
  assert.equal(work.approvedEstimateVersion, 1);
  const changed = await run('automotive_estimate_save', { requestId: randomUUID(), workOrderId: work.id, workflow: { lines: [{ kind: 'labor', name: 'Major service', qty: 1, unitPriceMinor: 50000, standardMinutes: 120 }] } });
  assert.equal(changed.value.estimateNumber, 2);
  assert.equal((await run('automotive_work_order', { workOrderId: work.id })).value.approvedEstimateVersion, null);
  const allocation = (await run('automotive_part_save', { requestId: randomUUID(), workOrderId: work.id, workflow: { variantId, qty: 1, status: 'reserved' } })).value;
  const issueRequest = randomUUID();
  const issued = await run('automotive_part_status', { requestId: issueRequest, partAllocationId: allocation.id, version: allocation.version, status: 'issued' });
  const replay = await run('automotive_part_status', { requestId: issueRequest, partAllocationId: allocation.id, version: allocation.version, status: 'issued' });
  assert.equal(issued.value.id, replay.value.id);
  assert.equal((await m.db.get(variantId)).onHand, 9);
  const returned = await run('automotive_part_status', { requestId: randomUUID(), partAllocationId: issued.value.id, version: issued.value.version, status: 'returned' });
  assert.equal(returned.ok, true, returned.reason);
  assert.equal((await m.db.get(variantId)).onHand, 10);
});

test('technicians can operate assigned work but cannot approve estimates or view insights', async () => {
  const { m, run, contactId, technicianId, technician } = await setup();
  const { bay, service, vehicle } = await workshop(run, m, contactId, technicianId);
  const work = (await run('automotive_work_order_save', { requestId: randomUUID(), workflow: { vehicleId: vehicle.id, serviceId: service.id, bayId: bay.id, technicianAccountId: technicianId, concern: 'Brake vibration', promisedAt: m.now() + 8 * 3600000, odometerKm: 64000 } })).value;
  assert.equal((await run('automotive_inspection_save', { requestId: randomUUID(), workOrderId: work.id, workflow: { items: [{ category: 'brakes', condition: 'attention', note: 'Front pads worn' }] } }, technician)).ok, true);
  assert.equal((await run('automotive_approval_record', { requestId: randomUUID(), workOrderId: work.id, version: work.version, estimateId: 'automotiveEstimates_missing', evidenceSource: 'phone', approvedBy: 'Owner' }, technician)).reason, 'advisor_required');
  assert.equal((await run('automotive_insights', {}, technician)).reason, 'manager_required');
});

test('completion requires approval, stopped clocks, parts resolution and quality check', async () => {
  const { m, run, contactId, technicianId, technician } = await setup();
  const { bay, service, vehicle } = await workshop(run, m, contactId, technicianId);
  let work = (await run('automotive_work_order_save', { requestId: randomUUID(), workflow: { vehicleId: vehicle.id, serviceId: service.id, bayId: bay.id, technicianAccountId: technicianId, concern: 'Routine service', promisedAt: m.now() + 8 * 3600000, odometerKm: 64000 } })).value;
  let estimate = (await run('automotive_estimate_save', { requestId: randomUUID(), workOrderId: work.id, workflow: { lines: [{ kind: 'labor', name: 'Service', qty: 1, unitPriceMinor: 45000, standardMinutes: 120 }] } })).value;
  estimate = (await run('automotive_estimate_status', { requestId: randomUUID(), estimateId: estimate.id, version: estimate.version, status: 'issued' })).value;
  work = (await run('automotive_work_order', { workOrderId: work.id })).value;
  work = (await run('automotive_approval_record', { requestId: randomUUID(), workOrderId: work.id, version: work.version, estimateId: estimate.id, evidenceSource: 'in_person', approvedBy: 'Owner' })).value;
  work = (await run('automotive_work_order_status', { requestId: randomUUID(), workOrderId: work.id, version: work.version, status: 'in_progress' })).value;
  const clock = (await run('automotive_labor_start', { requestId: randomUUID(), workOrderId: work.id }, technician)).value;
  assert.equal((await run('automotive_work_order_status', { requestId: randomUUID(), workOrderId: work.id, version: work.version, status: 'quality_check' })).reason, 'active_labor_clock');
  await run('automotive_labor_stop', { requestId: randomUUID(), laborEntryId: clock.id, version: clock.version }, technician);
  work = (await run('automotive_work_order', { workOrderId: work.id })).value;
  work = (await run('automotive_work_order_status', { requestId: randomUUID(), workOrderId: work.id, version: work.version, status: 'quality_check' })).value;
  assert.equal((await run('automotive_work_order_status', { requestId: randomUUID(), workOrderId: work.id, version: work.version, status: 'ready' })).reason, 'quality_check_required');
  work = (await run('automotive_quality_save', { requestId: randomUUID(), workOrderId: work.id, version: work.version, workflow: { checklist: [{ text: 'Road test', done: true }, { text: 'No warning lights', done: true }] } })).value;
  const ready = await run('automotive_work_order_status', { requestId: randomUUID(), workOrderId: work.id, version: work.version, status: 'ready' });
  assert.equal(ready.ok, true, ready.reason);
  assert.ok(ready.value.orderId, 'ready work creates one linked charge');
});

test('today has exactly three exception measures and insights expose coverage', async () => {
  const { m, run, contactId, technicianId } = await setup();
  const { bay, service, vehicle } = await workshop(run, m, contactId, technicianId);
  await run('automotive_work_order_save', { requestId: randomUUID(), workflow: { vehicleId: vehicle.id, serviceId: service.id, bayId: bay.id, technicianAccountId: technicianId, concern: 'Late job', promisedAt: m.now() - 1, odometerKm: 64000 } });
  const overview = await run('automotive_overview');
  assert.deepEqual(overview.value.metrics.map(row => row.key), ['approvals_waiting', 'past_promised', 'ready_for_collection']);
  assert.equal(overview.value.metrics.length, 3);
  const insights = await run('automotive_insights');
  assert.equal(insights.ok, true, insights.reason);
  assert.ok(insights.value.coverage.technicianProductivity);
  assert.equal(insights.value.metrics.technicianProductivity, null);
});

test('technician lists expose only assigned jobs and never customer directories', async () => {
  const { m, run, contactId, technicianId, technician } = await setup();
  const { bay, service, vehicle } = await workshop(run, m, contactId, technicianId);
  await run('automotive_work_order_save', { requestId: randomUUID(), workflow: { vehicleId: vehicle.id, serviceId: service.id, bayId: bay.id, technicianAccountId: technicianId, concern: 'Assigned job', promisedAt: m.now() + 3600000, odometerKm: 64000 } });
  await run('automotive_work_order_save', { requestId: randomUUID(), workflow: { vehicleId: vehicle.id, serviceId: service.id, bayId: bay.id, technicianAccountId: 'automotive-manager', concern: 'Other job', promisedAt: m.now() + 7200000, odometerKm: 64000 } });
  const jobs = await run('automotive_work_orders', {}, technician);
  assert.equal(jobs.value.items.length, 1);
  assert.equal(jobs.value.items[0].technicianAccountId, technicianId);
  assert.equal('contactId' in jobs.value.items[0], false);
  assert.equal((await run('automotive_contacts', {}, technician)).reason, 'advisor_required');
  const vehicles = await run('automotive_vehicles', {}, technician);
  assert.equal(vehicles.value.items.length, 1);
  assert.equal('contactId' in vehicles.value.items[0], false);
});
