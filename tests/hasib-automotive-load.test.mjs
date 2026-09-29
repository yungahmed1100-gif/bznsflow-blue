import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { convexMemory } from './helpers/convex-memory.mjs';
import { executeAutomotive } from '../convex/hasib/automotiveState.js';
import { hasibPack } from '../config/hasib-packs.js';

test('automotive synthetic scale stays bounded and constrained-slot races accept one booking', { timeout: 120000 }, async () => {
  const m = convexMemory(), accountId = 'automotive-load-account', managerId = 'automotive-load-manager', now = m.now();
  const workspaceId = await m.db.insert('ascendWorkspaces', { managerAccountId: managerId, employeeLimit: 5, createdAt: now, updatedAt: now });
  const actor = { workspace: { _id: workspaceId, managerAccountId: managerId, employeeLimit: 5 }, role: 'manager', operationalRole: 'manager', actorAccountId: managerId };
  const tenant = { accountId, pack: hasibPack('automotive'), actor };
  const run = (operation, args = {}) => executeAutomotive(m.ctx, tenant, actor, { operation, ...args }, m.now());

  const contacts = [];
  for (let i = 0; i < 10000; i++) contacts.push(await m.db.insert('blueContacts', { accountId, state: 'active', createdAt: now - i, updatedAt: now - i }));
  const vehicles = [];
  for (let i = 0; i < 15000; i++) vehicles.push(await m.db.insert('automotiveVehicles', { accountId, requestId: randomUUID(), contactId: contacts[i % contacts.length], plate: `LOAD-${i}`, make: 'Synthetic', model: 'Vehicle', year: 2024, powertrain: 'petrol', odometerKm: i, version: 1, createdAt: now - i, updatedAt: now - i }));
  for (let i = 0; i < 50000; i++) await m.db.insert('automotiveWorkOrders', { accountId, requestId: randomUUID(), number: i + 1, contactId: contacts[i % contacts.length], vehicleId: vehicles[i % vehicles.length], assignedAdvisorAccountId: managerId, technicianAccountId: managerId, concern: 'Synthetic load record', promisedAt: now + 3600000, odometerKm: i, status: i % 7 === 0 ? 'ready' : 'intake', version: 1, createdAt: now - i, updatedAt: now - i });
  for (let i = 0; i < 100000; i++) await m.db.insert('automotiveLaborEntries', { accountId, requestId: randomUUID(), workOrderId: `automotiveWorkOrders_${(i % 50000) + 1}`, technicianAccountId: managerId, startedAt: now - 7200000, stoppedAt: now - 3600000, minutes: 60, version: 2, createdAt: now - i, updatedAt: now - i });
  for (let i = 0; i < 500; i++) await m.db.insert('automotiveTasks', { accountId, kind: 'synthetic_backlog', entityType: 'work_order', entityId: String(i), status: 'open', reason: 'Synthetic recovery exercise', dueAt: now, createdAt: now - i, updatedAt: now - i });

  const started = performance.now(), overview = await run('automotive_overview'), elapsed = performance.now() - started;
  assert.equal(overview.ok, true);
  assert.equal(overview.value.metrics.length, 3);
  assert.equal(overview.value.workOrders.length, 100);
  assert.equal(overview.value.tasks.length, 200, 'backlog read is deliberately bounded');
  assert.ok(elapsed < 2000, `overview took ${elapsed.toFixed(1)}ms`);

  const service = (await run('automotive_service_save', { requestId: randomUUID(), workflow: { name: 'Load service', category: 'maintenance', durationMinutes: 60, standardLaborMinutes: 60, priceMinor: 10000, checklist: [] } })).value;
  const bay = (await run('automotive_bay_save', { requestId: randomUUID(), workflow: { name: 'Load bay', availability: [{ startsAt: now, endsAt: now + 86400000 }] } })).value;
  const slot = now + 3600000;
  // The in-memory contract harness is not an OCC engine, so replay the 50
  // competing requests in the serial order Convex commits/retries mutations.
  const attempts = [];
  for (let i = 0; i < 50; i++) attempts.push(await run('automotive_appointment_save', { requestId: randomUUID(), workflow: { vehicleId: vehicles[i], serviceId: service.id, bayId: bay.id, technicianAccountId: managerId, startsAt: slot } }));
  assert.equal(attempts.filter(result => result.ok).length, 1);
  assert.equal(attempts.filter(result => result.reason === 'appointment_conflict').length, 49);
});
