import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { convexMemory } from './helpers/convex-memory.mjs';
import { executeBookings } from '../convex/hasib/bookingsState.js';
import { executeMemberships } from '../convex/hasib/membershipsState.js';

const DAY = 86400000;
async function setup() {
  const m = convexMemory(), tenant = { accountId: 'a' };
  const contactId = await m.db.insert('blueContacts', { accountId: 'a', state: 'active' });
  const call = (operation, args = {}, accountId = 'a') => executeMemberships(m.ctx, { accountId }, { operation, ...args }, m.now());
  const book = (operation, args = {}) => executeBookings(m.ctx, tenant, { operation, ...args }, m.now());
  const create = (args = {}) => call('membership_create', { requestId: randomUUID(), contactId, kind: 'lessons', name: 'Prepaid lessons', startsAt: m.now() - DAY, endsAt: m.now() + 30 * DAY, credits: 3, ...args });
  const resource = (await book('resource_save', { requestId: randomUUID(), name: 'Tutor', kind: 'provider', capacity: 1 })).value;
  const service = (await book('service_save', { requestId: randomUUID(), name: 'Lesson', durationMinutes: 60, resourceIds: [resource.id] })).value;
  const lesson = async membershipId => (await book('booking_create', { requestId: randomUUID(), serviceId: service.id, contactId, startsAt: m.now(), membershipId })).value;
  const progress = async (booking, statuses = ['confirmed', 'arrived', 'completed']) => {
    for (const to of statuses) {
      const result = await book('booking_status', { requestId: randomUUID(), bookingId: booking.id, version: booking.version, to });
      assert.equal(result.ok, true, result.reason);
      booking = result.value;
    }
    return booking;
  };
  return { m, call, book, contactId, create, lesson, progress };
}

test('completed prepaid lesson consumes one credit once; cancellation restores exactly once', async () => {
  const { create, lesson, progress, m, book, call } = await setup();
  const membership = (await create()).value;
  let booking = await progress(await lesson(membership.id), ['confirmed', 'arrived']);
  const completion = { requestId: randomUUID(), bookingId: booking.id, version: booking.version, to: 'completed' };
  booking = (await book('booking_status', completion)).value;
  assert.equal((await book('booking_status', completion)).ok, true);
  assert.equal(m.table('hasibMemberships')[0].remainingCredits, 2);
  assert.equal(m.table('hasibCredits').length, 1);
  const cancel = { requestId: randomUUID(), bookingId: booking.id, version: booking.version, to: 'cancelled' };
  assert.equal((await book('booking_status', cancel)).ok, true);
  assert.equal((await book('booking_status', cancel)).ok, true);
  const credits = (await call('membership_credits', { membershipId: membership.id })).value.items;
  assert.deepEqual(credits.map(c => c.delta), [-1, 1]);
  assert.equal(m.table('hasibMemberships')[0].remainingCredits, 3);
  assert.equal(m.table('hasibMemberships')[0].lastAttendanceAt, undefined);
  assert.equal(m.table('hasibOrders').length, 0);
});

test('cancellation never charges a prepaid lesson, exhausted credits cannot complete, and ledger sums reconcile', async () => {
  const { create, lesson, progress, m, book } = await setup();
  const membership = (await create({ credits: 1 })).value;
  let cancelled = await lesson(membership.id);
  await progress(cancelled, ['cancelled']);
  assert.equal(m.table('hasibCredits').length, 0);
  await progress(await lesson(membership.id));
  m.advance(3600000);
  let next = await progress(await lesson(membership.id), ['confirmed', 'arrived']);
  const before = m.table('hasibCredits').length;
  const denied = await book('booking_status', { requestId: randomUUID(), bookingId: next.id, version: next.version, to: 'completed' });
  assert.equal(denied.reason, 'no_credits_remaining');
  assert.equal(m.table('hasibCredits').length, before);
  const saved = m.table('hasibMemberships')[0];
  assert.equal(saved.remainingCredits, saved.initialCredits + m.table('hasibCredits').reduce((total, row) => total + row.delta, 0));
});

test('reversing an attendance corrects its completed booking and is tenant/version protected', async () => {
  const { create, lesson, progress, m, call } = await setup();
  const membership = (await create()).value;
  const booking = await progress(await lesson(membership.id));
  const credit = m.table('hasibCredits')[0];
  assert.equal((await call('membership_credit_reverse', { requestId: randomUUID(), creditId: credit._id, version: 1 }, 'b')).reason, 'credit_not_found');
  assert.equal((await call('membership_credit_reverse', { requestId: randomUUID(), creditId: credit._id, version: 0 })).reason, 'credit_conflict');
  assert.equal((await call('membership_credit_reverse', { requestId: randomUUID(), creditId: credit._id, version: 1 })).ok, true);
  assert.equal((await m.db.get(booking.id)).status, 'cancelled');
  assert.equal((await m.db.get(membership.id)).remainingCredits, 3);
  assert.equal((await call('membership_credit_reverse', { requestId: randomUUID(), creditId: credit._id, version: 2 })).reason, 'credit_already_reversed');
});

test('gym membership records attendance, configurable absence and expiry without consuming lesson credits', async () => {
  const { create, m, call } = await setup();
  const membership = (await create({ kind: 'membership', startsAt: m.now() - 20 * DAY, endsAt: m.now() + 5 * DAY })).value;
  let listed = (await call('memberships')).value.items[0];
  assert.deepEqual([listed.active, listed.absent, listed.renewalDue], [true, true, true]);
  assert.equal((await call('memberships', { absenceDays: 25 })).value.items[0].absent, false);
  const args = { requestId: randomUUID(), membershipId: membership.id, attendedAt: m.now() };
  assert.equal((await call('membership_attendance', args)).ok, true);
  assert.equal((await call('membership_attendance', args)).ok, true);
  assert.equal(m.table('hasibCredits').length, 1);
  listed = (await call('memberships')).value.items[0];
  assert.equal(listed.absent, false);
  assert.equal(listed.remainingCredits, 0);
  m.advance(6 * DAY);
  assert.equal((await call('membership_attendance', { ...args, requestId: randomUUID(), attendedAt: m.now() })).reason, 'membership_inactive');
});

test('guardian, customer and financial links stay in tenant; stale updates and altered replays fail', async () => {
  const { create, call, m } = await setup();
  const foreign = await m.db.insert('blueContacts', { accountId: 'b', state: 'active' });
  assert.equal((await create({ guardianId: foreign })).reason, 'guardian_not_found');
  assert.equal((await create({ contactId: foreign })).reason, 'contact_not_found');
  const guardian = await m.db.insert('blueContacts', { accountId: 'a', state: 'active' });
  const guardianOrder = await m.db.insert('hasibOrders', { accountId: 'a', contactId: guardian });
  const paidByGuardian = await create({ guardianId: guardian, orderId: guardianOrder });
  assert.equal(paidByGuardian.ok, true, 'the paying guardian may own the linked charge');
  const requestId = randomUUID();
  const first = (await create({ requestId, guardianId: guardian })).value;
  assert.equal((await create({ requestId, guardianId: guardian })).value.id, first.id);
  assert.equal((await create({ requestId, guardianId: guardian, credits: 4 })).reason, 'request_conflict');
  assert.equal((await call('membership_update', { requestId: randomUUID(), membershipId: first.id, version: 0, status: 'cancelled' })).reason, 'membership_conflict');
  assert.equal((await call('membership_credits', { membershipId: first.id }, 'b')).reason, 'membership_not_found');
});
