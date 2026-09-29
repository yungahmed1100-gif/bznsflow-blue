// Dated entitlements and an append-only credit ledger. Money stays on linked Hasib orders.
import { owned } from '../blueTenant.js';
import { ok, fail, bounded, clampLimit } from './shared.js';
import { workflowBegin, workflowFinish, workflowPublic, workflowTime, workflowLinks } from './followupsState.js';

export async function membershipForBooking(ctx, accountId, membershipId, contactId, startsAt) {
  const membership = await owned(ctx, membershipId, accountId, 'hasibMemberships');
  if (!membership || membership.contactId !== contactId) return { error: 'membership_not_found' };
  if (membership.status !== 'active' || startsAt < membership.startsAt || startsAt >= membership.endsAt) return { error: 'membership_inactive' };
  return { membership };
}

async function bookingCredit(ctx, membershipId, bookingId) {
  const rows = await ctx.db.query('hasibCredits').withIndex('by_membership_booking', q => q.eq('membershipId', membershipId).eq('bookingId', bookingId)).collect();
  return rows.find(row => row.kind !== 'reversal' && !rows.some(reversal => reversal.originalCreditId === row._id)) || null;
}

/** Called by the booking mutation, so completing a visit and consuming its credit cannot diverge. */
export async function completeMembershipBooking(ctx, accountId, booking, now) {
  if (!booking.membershipId) return ok(null);
  const resolved = await membershipForBooking(ctx, accountId, booking.membershipId, booking.contactId, booking.startsAt);
  if (resolved.error) return fail(resolved.error);
  const { membership } = resolved;
  const prior = await bookingCredit(ctx, membership._id, booking._id);
  if (prior) return ok(workflowPublic(prior));
  if (membership.kind === 'lessons' && membership.remainingCredits < 1) return fail('no_credits_remaining');
  const delta = membership.kind === 'lessons' ? -1 : 0;
  const id = await ctx.db.insert('hasibCredits', { accountId, membershipId: membership._id, bookingId: booking._id, kind: delta ? 'consume' : 'attendance', delta, attendedAt: booking.startsAt, createdAt: now, version: 1 });
  await ctx.db.patch(membership._id, { remainingCredits: membership.remainingCredits + delta, lastAttendanceAt: Math.max(membership.lastAttendanceAt || 0, booking.startsAt), version: membership.version + 1, updatedAt: now });
  return ok(workflowPublic(await ctx.db.get(id)));
}

async function reverseCredit(ctx, membership, credit, now) {
  const reversal = await ctx.db.query('hasibCredits').withIndex('by_original', q => q.eq('originalCreditId', credit._id)).unique();
  if (reversal) return fail('credit_already_reversed');
  const id = await ctx.db.insert('hasibCredits', { accountId: membership.accountId, membershipId: membership._id, ...(credit.bookingId ? { bookingId: credit.bookingId } : {}),
    originalCreditId: credit._id, kind: 'reversal', delta: -credit.delta, attendedAt: credit.attendedAt, createdAt: now, version: 1 });
  const credits = await ctx.db.query('hasibCredits').withIndex('by_membership_created', q => q.eq('membershipId', membership._id)).collect();
  const remainingAttendance = credits.filter(row => row.kind !== 'reversal' && !credits.some(other => other.originalCreditId === row._id));
  await ctx.db.patch(membership._id, { remainingCredits: membership.remainingCredits - credit.delta, lastAttendanceAt: remainingAttendance.length ? Math.max(...remainingAttendance.map(row => row.attendedAt)) : undefined,
    version: membership.version + 1, updatedAt: now });
  await ctx.db.patch(credit._id, { version: credit.version + 1 });
  return ok(workflowPublic(await ctx.db.get(id)));
}

export async function reverseMembershipBooking(ctx, accountId, booking, now) {
  if (!booking.membershipId) return ok(null);
  const membership = await owned(ctx, booking.membershipId, accountId, 'hasibMemberships');
  if (!membership) return fail('membership_not_found');
  const credit = await bookingCredit(ctx, membership._id, booking._id);
  return credit ? reverseCredit(ctx, membership, credit, now) : ok(null);
}

export async function executeMemberships(ctx, tenant, a, now) {
  const { accountId } = tenant;
  if (a.operation === 'memberships') {
    const page = await ctx.db.query('hasibMemberships').withIndex('by_account_created', q => q.eq('accountId', accountId)).order('desc').paginate({ numItems: clampLimit(a.limit, 200), cursor: a.cursor || null });
    const absenceDays = Number.isSafeInteger(a.absenceDays) && a.absenceDays > 0 && a.absenceDays <= 365 ? a.absenceDays : 14;
    return ok({ cursor: page.isDone ? null : page.continueCursor, items: page.page.filter(r => !a.contactId || r.contactId === a.contactId).map(r => ({ ...workflowPublic(r),
      active: r.status === 'active' && r.startsAt <= now && r.endsAt > now,
      absent: r.status === 'active' && r.startsAt <= now && r.endsAt > now && now - (r.lastAttendanceAt ?? r.startsAt) >= absenceDays * 86400000,
      renewalDue: r.status === 'active' && r.endsAt >= now && r.endsAt <= now + 7 * 86400000 })) });
  }
  if (a.operation === 'membership_credits') {
    if (!await owned(ctx, a.membershipId, accountId, 'hasibMemberships')) return fail('membership_not_found');
    const page = await ctx.db.query('hasibCredits').withIndex('by_membership_created', q => q.eq('membershipId', a.membershipId)).order('asc').paginate({ numItems: clampLimit(a.limit, 200), cursor: a.cursor || null });
    return ok({ cursor: page.isDone ? null : page.continueCursor, items: page.page.map(workflowPublic) });
  }
  if (!['membership_create', 'membership_update', 'membership_attendance', 'membership_credit_reverse'].includes(a.operation)) return null;
  const begun = await workflowBegin(ctx, accountId, a);
  if (begun.error) return fail(begun.error);
  if (begun.replay) return ok(workflowPublic(begun.replay));
  if (a.operation === 'membership_create') {
    const name = bounded(a.name, 100);
    if (!name || !['membership', 'lessons'].includes(a.kind) || !workflowTime(a.startsAt) || !workflowTime(a.endsAt) || a.endsAt <= a.startsAt ||
      (a.kind === 'lessons' && (!Number.isSafeInteger(a.credits) || a.credits < 1 || a.credits > 10000))) return fail('invalid_membership');
    const links = await workflowLinks(ctx, accountId, { contactId: a.contactId });
    if (links.error) return fail(links.error);
    if (a.guardianId) {
      const guardian = await owned(ctx, a.guardianId, accountId, 'blueContacts');
      if (!guardian || guardian.state === 'deleted') return fail('guardian_not_found');
    }
    if (a.orderId) {
      const order = await owned(ctx, a.orderId, accountId, 'hasibOrders');
      if (!order || (order.contactId && ![a.contactId, a.guardianId].includes(order.contactId))) return fail('order_not_found');
    }
    const id = await ctx.db.insert('hasibMemberships', { accountId, contactId: a.contactId, name, kind: a.kind, startsAt: a.startsAt, endsAt: a.endsAt, status: 'active',
      initialCredits: a.kind === 'lessons' ? a.credits : 0, remainingCredits: a.kind === 'lessons' ? a.credits : 0,
      ...(a.guardianId ? { guardianId: a.guardianId } : {}), ...(a.orderId ? { orderId: a.orderId } : {}), version: 1, createdAt: now, updatedAt: now });
    return workflowFinish(ctx, accountId, a, begun.fingerprint, 'hasibMemberships', id, now);
  }
  if (a.operation === 'membership_credit_reverse') {
    const credit = await owned(ctx, a.creditId, accountId, 'hasibCredits');
    if (!credit) return fail('credit_not_found');
    if (a.version !== credit.version) return fail('credit_conflict');
    if (credit.kind === 'reversal') return fail('invalid_credit');
    const membership = await owned(ctx, credit.membershipId, accountId, 'hasibMemberships');
    if (!membership) return fail('membership_not_found');
    const reversed = await reverseCredit(ctx, membership, credit, now);
    if (!reversed.ok) return reversed;
    // A reversed attendance must not leave its linked lesson marked completed.
    if (credit.bookingId) {
      const booking = await owned(ctx, credit.bookingId, accountId, 'hasibBookings');
      if (booking?.status === 'completed') await ctx.db.patch(booking._id, { status: 'cancelled', version: booking.version + 1, updatedAt: now });
    }
    return workflowFinish(ctx, accountId, a, begun.fingerprint, 'hasibCredits', reversed.value.id, now);
  }
  const membership = await owned(ctx, a.membershipId, accountId, 'hasibMemberships');
  if (!membership) return fail('membership_not_found');
  if (a.operation === 'membership_update') {
    if (a.version !== membership.version) return fail('membership_conflict');
    if ((a.endsAt !== undefined && (!workflowTime(a.endsAt) || a.endsAt <= membership.startsAt)) || (a.status !== undefined && !['active', 'cancelled'].includes(a.status))) return fail('invalid_membership');
    await ctx.db.patch(membership._id, { ...(a.endsAt !== undefined ? { endsAt: a.endsAt } : {}), ...(a.status ? { status: a.status } : {}), version: membership.version + 1, updatedAt: now });
    return workflowFinish(ctx, accountId, a, begun.fingerprint, 'hasibMemberships', membership._id, now);
  }
  if (!workflowTime(a.attendedAt) || a.attendedAt > now || membership.kind !== 'membership') return fail('invalid_attendance');
  const validity = await membershipForBooking(ctx, accountId, membership._id, membership.contactId, a.attendedAt);
  if (validity.error) return fail(validity.error);
  // Class attendance is recorded through the booking status, ensuring a single completion path.
  if (a.bookingId) return fail('use_booking_completion');
  const id = await ctx.db.insert('hasibCredits', { accountId, membershipId: membership._id, kind: 'attendance', delta: 0, attendedAt: a.attendedAt, version: 1, createdAt: now });
  await ctx.db.patch(membership._id, { lastAttendanceAt: Math.max(membership.lastAttendanceAt || 0, a.attendedAt), version: membership.version + 1, updatedAt: now });
  return workflowFinish(ctx, accountId, a, begun.fingerprint, 'hasibCredits', id, now);
}
