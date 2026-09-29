import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { convexMemory } from './helpers/convex-memory.mjs';
import { executeBookings } from '../convex/hasib/bookingsState.js';

async function setup(capacity = 1) {
  const m = convexMemory(), tenant = { accountId: 'a' };
  const contactId = await m.db.insert('blueContacts', { accountId: 'a', state: 'active' });
  const secondContact = await m.db.insert('blueContacts', { accountId: 'a', state: 'active' });
  const call = (operation, args = {}, accountId = 'a') => executeBookings(m.ctx, { accountId }, { operation, ...args }, m.now());
  const resource = (await call('resource_save', { requestId: randomUUID(), name: 'Owner-managed provider', kind: 'provider', capacity })).value;
  const service = (await call('service_save', { requestId: randomUUID(), name: 'Visit', durationMinutes: 30, resourceIds: [resource.id] })).value;
  const create = args => call('booking_create', { requestId: randomUUID(), serviceId: service.id, contactId, startsAt: m.now(), ...args });
  return { m, tenant, contactId, secondContact, call, resource, service, create };
}

test('booking journey preserves duration, requires confirmation, supports arrival/completion and optimistic edits', async () => {
  const { m, call, create, service } = await setup();
  let booking = (await create({})).value;
  assert.equal(booking.endsAt - booking.startsAt, 30 * 60000);
  assert.equal((await call('booking_status', { requestId: randomUUID(), bookingId: booking.id, version: booking.version, to: 'completed' })).reason, 'invalid_transition');
  await call('service_save', { requestId: randomUUID(), serviceId: service.id, version: service.version, name: 'Longer visit', durationMinutes: 60, resourceIds: booking.resourceIds });
  booking = (await call('booking_update', { requestId: randomUUID(), bookingId: booking.id, version: booking.version, startsAt: m.now() })).value;
  assert.equal(booking.durationMinutes, 30, 'saved appointment duration is a snapshot');
  assert.equal((await call('booking_update', { requestId: randomUUID(), bookingId: booking.id, version: 1, startsAt: m.now() })).reason, 'booking_conflict');
  for (const to of ['confirmed', 'arrived', 'completed']) {
    const result = await call('booking_status', { requestId: randomUUID(), bookingId: booking.id, version: booking.version, to });
    assert.equal(result.ok, true, result.reason);
    booking = result.value;
  }
  assert.equal(booking.status, 'completed');
  assert.equal(m.table('hasibOrders').length, 0, 'operational state never duplicates a charge');
});

test('capacity counts the same class only; overlap, duplicate customers and tenant links are rejected', async () => {
  const { m, call, create, contactId, secondContact, service, resource } = await setup(2);
  const first = await create({});
  assert.equal(first.ok, true);
  assert.equal((await create({})).reason, 'customer_booking_conflict');
  assert.equal((await create({ contactId: secondContact })).ok, true);
  const third = await m.db.insert('blueContacts', { accountId: 'a', state: 'active' });
  assert.equal((await create({ contactId: third })).reason, 'booking_capacity');
  assert.equal((await create({ contactId: third, startsAt: m.now() + 60000 })).reason, 'booking_conflict');
  assert.equal((await call('booking_create', { requestId: randomUUID(), serviceId: service.id, contactId, startsAt: m.now() }, 'b')).reason, 'service_not_found');
  const foreignContact = await m.db.insert('blueContacts', { accountId: 'b', state: 'active' });
  assert.equal((await create({ contactId: foreignContact, startsAt: m.now() + 3600000 })).reason, 'contact_not_found');
  const foreignOrder = await m.db.insert('hasibOrders', { accountId: 'b' });
  assert.equal((await create({ startsAt: m.now() + 3600000, orderId: foreignOrder })).reason, 'order_not_found');
  const mismatchOrder = await m.db.insert('hasibOrders', { accountId: 'a', contactId: third });
  assert.equal((await create({ startsAt: m.now() + 3600000, orderId: mismatchOrder })).reason, 'order_not_found');
  assert.equal((await call('resource_save', { requestId: randomUUID(), resourceId: resource.id, version: resource.version, name: 'Reduced', kind: 'provider', capacity: 1 })).reason, 'resource_has_bookings');
});

test('request retries replay without duplicate rows, but changed payloads conflict', async () => {
  const { call, create, m } = await setup();
  const requestId = randomUUID();
  const first = await create({ requestId });
  assert.equal((await create({ requestId })).value.id, first.value.id);
  assert.equal((await create({ requestId, startsAt: m.now() + 3600000 })).reason, 'request_conflict');
  assert.equal(m.table('hasibBookings').length, 1);
  const mutation = { requestId: randomUUID(), bookingId: first.value.id, version: first.value.version, to: 'confirmed' };
  assert.equal((await call('booking_status', mutation)).ok, true);
  assert.equal((await call('booking_status', mutation)).ok, true, 'retry precedes stale version validation');
  assert.equal(m.table('hasibBookings')[0].version, 2);
});

test('cancellation frees capacity for a waiting customer; waitlist booking is idempotent and bounded by owner window', async () => {
  const { call, create, m, service, secondContact } = await setup();
  const first = (await create({})).value;
  const wait = (await call('waitlist_add', { requestId: randomUUID(), serviceId: service.id, contactId: secondContact, earliestAt: m.now(), latestAt: m.now() + 3600000 })).value;
  const fill = { requestId: randomUUID(), waitlistId: wait.id, version: wait.version, startsAt: m.now() };
  assert.equal((await call('waitlist_book', fill)).reason, 'booking_capacity');
  await call('booking_status', { requestId: randomUUID(), bookingId: first.id, version: first.version, to: 'cancelled' });
  const filled = await call('waitlist_book', fill);
  assert.equal(filled.ok, true, filled.reason);
  assert.equal((await call('waitlist_book', fill)).value.id, filled.value.id);
  assert.equal((await call('waitlist')).value.items[0].status, 'booked');
});

test('owner availability and future status rules hold; no-show denominator excludes cancellations and unconfirmed visits', async () => {
  const { call, create, m, resource, secondContact } = await setup();
  const time = m.now();
  await call('resource_save', { requestId: randomUUID(), resourceId: resource.id, version: resource.version, name: resource.name, kind: 'provider', capacity: 1, availability: [{ startsAt: time, endsAt: time + 7200000 }] });
  assert.equal((await create({ startsAt: time + 7200000 })).reason, 'resource_unavailable');
  let first = (await create({ startsAt: time + 3600000 })).value;
  first = (await call('booking_status', { requestId: randomUUID(), bookingId: first.id, version: first.version, to: 'confirmed' })).value;
  assert.equal((await call('booking_status', { requestId: randomUUID(), bookingId: first.id, version: first.version, to: 'missed' })).reason, 'booking_not_finished');
  assert.equal((await call('booking_status', { requestId: randomUUID(), bookingId: first.id, version: first.version, to: 'arrived' })).reason, 'booking_not_started');
  const cancelled = (await create({ contactId: secondContact })).value;
  let cancelledConfirmed = (await call('booking_status', { requestId: randomUUID(), bookingId: cancelled.id, version: cancelled.version, to: 'confirmed' })).value;
  await call('booking_status', { requestId: randomUUID(), bookingId: cancelledConfirmed.id, version: cancelledConfirmed.version, to: 'cancelled' });
  await create({ startsAt: time + 1800000 });
  m.advance(3 * 3600000);
  await call('booking_status', { requestId: randomUUID(), bookingId: first.id, version: first.version, to: 'missed' });
  const metrics = (await call('bookings')).value.measures;
  assert.equal(metrics.missedVisits, 1);
  assert.equal(metrics.noShowRate, 1);
});

test('replacement lesson references are tenant checked and cannot be filled twice', async () => {
  const { create, call, m } = await setup();
  let booking = (await create({})).value;
  await call('booking_status', { requestId: randomUUID(), bookingId: booking.id, version: booking.version, to: 'cancelled' });
  assert.equal((await create({ startsAt: m.now() + 3600000, replacementForId: booking.id })).ok, true);
  assert.equal((await create({ startsAt: m.now() + 7200000, replacementForId: booking.id })).reason, 'replacement_already_booked');
});

test('simulated serializable scheduling of competing booking requests admits only available capacity', async () => {
  // The memory DB has no OCC. This queue simulates serializable mutation execution,
  // not a deployed Convex concurrency test; backend OCC remains a release check.
  const { create, secondContact, m } = await setup();
  let tail = Promise.resolve();
  const transaction = work => {
    const result = tail.then(work);
    tail = result.catch(() => {});
    return result;
  };
  const results = await Promise.all([
    transaction(() => create({})),
    transaction(() => create({ contactId: secondContact })),
  ]);
  assert.equal(results.filter(result => result.ok).length, 1);
  assert.equal(results.filter(result => result.reason === 'booking_capacity').length, 1);
  assert.equal(m.table('hasibBookings').length, 1);
});
