// Shared operational appointments, classes and lessons. No clinical intake or treatment notes.
import { owned } from '../blueTenant.js';
import { ok, fail, bounded, clampLimit } from './shared.js';
import { workflowBegin, workflowFinish, workflowPublic, workflowTime, workflowLinks } from './followupsState.js';
import { membershipForBooking, completeMembershipBooking, reverseMembershipBooking } from './membershipsState.js';

const ACTIVE = ['scheduled', 'confirmed', 'arrived', 'in_service'];
const TRANSITIONS = { scheduled: ['confirmed', 'cancelled'], confirmed: ['arrived', 'missed', 'cancelled'], arrived: ['in_service', 'completed', 'cancelled'], in_service: ['completed', 'cancelled'], completed: ['cancelled'], missed: [], cancelled: [] };
const CLINIC_TRANSITIONS = { ...TRANSITIONS, arrived: ['in_service', 'cancelled'], completed: [] };
const CANCELLATION_REASONS = new Set(['patient_request','clinic_request','provider_unavailable','duplicate','other_operational']);
const idsValid = ids => Array.isArray(ids) && ids.length > 0 && ids.length <= 8 && new Set(ids).size === ids.length && ids.every(id => typeof id === 'string');
const rangeValid = window => workflowTime(window?.startsAt) && workflowTime(window?.endsAt) && window.endsAt > window.startsAt;

async function resourcesFor(ctx, accountId, ids) {
  if (!idsValid(ids)) return { error: 'invalid_resources' };
  const rows = [];
  for (const id of ids) {
    const row = await owned(ctx, id, accountId, 'hasibResources');
    if (!row) return { error: 'resource_not_found' };
    rows.push(row);
  }
  return { rows };
}

/** The index range is read inside the mutation: overlapping concurrent inserts cause Convex OCC retries. */
async function slotAvailable(ctx, accountId, booking, resources, excludeId) {
  const rows = await ctx.db.query('hasibBookings').withIndex('by_account_start', q => q.eq('accountId', accountId).gte('startsAt',booking.startsAt-86400000).lt('startsAt', booking.endsAt)).take(3001);
  if (rows.length > 3000) return fail('booking_window_full');
  const overlaps = rows.filter(row => row._id !== excludeId && ACTIVE.includes(row.status) && row.endsAt > booking.startsAt);
  if (overlaps.some(row => row.contactId === booking.contactId)) return fail('customer_booking_conflict');
  for (const resource of resources) {
    if (resource.availability.length && !resource.availability.some(w => w.startsAt <= booking.startsAt && w.endsAt >= booking.endsAt)) return fail('resource_unavailable');
    const matches = overlaps.filter(row => row.resourceIds.includes(resource._id));
    // Shared capacity means attendees of the same session, never overlapping independent appointments.
    if (matches.some(row => row.serviceId !== booking.serviceId || row.startsAt !== booking.startsAt || row.endsAt !== booking.endsAt)) return fail('booking_conflict');
    if (matches.length >= resource.capacity) return fail('booking_capacity');
  }
  return ok(null);
}

async function bookingCandidate(ctx, accountId, a) {
  const service = await owned(ctx, a.serviceId, accountId, 'hasibServices');
  if (!service) return { error: 'service_not_found' };
  if (!workflowTime(a.startsAt)) return { error: 'invalid_booking' };
  const resources = await resourcesFor(ctx, accountId, a.resourceIds || service.resourceIds);
  if (resources.error) return resources;
  const defaults = await resourcesFor(ctx, accountId, service.resourceIds);
  if (defaults.error) return defaults;
  if (resources.rows.map(r => r.kind).sort().join(',') !== defaults.rows.map(r => r.kind).sort().join(',')) return { error: 'invalid_resources' };
  const links = await workflowLinks(ctx, accountId, a);
  if (links.error) return links;
  const endsAt = a.startsAt + service.durationMinutes * 60000;
  if (!workflowTime(endsAt)) return { error: 'invalid_booking' };
  if (a.membershipId) {
    const membership = await membershipForBooking(ctx, accountId, a.membershipId, a.contactId, a.startsAt);
    if (membership.error) return membership;
  }
  if (a.replacementForId) {
    const original = await owned(ctx, a.replacementForId, accountId, 'hasibBookings');
    if (!original || original.contactId !== a.contactId || !['cancelled', 'missed'].includes(original.status)) return { error: 'invalid_replacement' };
    const replacements = await ctx.db.query('hasibBookings').withIndex('by_replacement', q => q.eq('replacementForId', original._id)).take(1001);
    if (replacements.length > 1000) return {error:'booking_window_full'};
    if (replacements.some(row => row.status !== 'cancelled')) return { error: 'replacement_already_booked' };
  }
  return { resources: resources.rows, value: { serviceId: service._id, serviceName: service.name, resourceIds: resources.rows.map(r => r._id), resourceSnapshots: resources.rows.map(r => ({ id:r._id,name:r.name,kind:r.kind })), durationMinutes: service.durationMinutes,
    contactId: a.contactId, startsAt: a.startsAt, endsAt, ...(a.orderId ? { orderId: a.orderId } : {}), ...(a.membershipId ? { membershipId: a.membershipId } : {}), ...(a.replacementForId ? { replacementForId: a.replacementForId } : {}) } };
}

async function listBookings(ctx, accountId, a, now) {
  if ((a.fromAt !== undefined && !workflowTime(a.fromAt)) || (a.toAt !== undefined && !workflowTime(a.toAt)) || (a.fromAt !== undefined && a.toAt !== undefined && a.toAt <= a.fromAt)) return fail('invalid_booking_range');
  const query = ctx.db.query('hasibBookings').withIndex('by_account_start', q => {
    let range=q.eq('accountId',accountId);
    if(a.fromAt!==undefined) range=range.gte('startsAt',a.fromAt);
    if(a.toAt!==undefined) range=range.lt('startsAt',a.toAt);
    return range;
  }).order('asc');
  const page=await query.paginate({numItems:clampLimit(a.limit,200),cursor:a.cursor||null});
  const rows=page.page;
  const relevant=rows.filter(r=>(!a.status||r.status===a.status)&&(!a.contactId||r.contactId===a.contactId));
  const pastConfirmed=rows.filter(r=>r.endsAt<=now&&r.confirmedAt!==undefined&&r.status!=='cancelled');
  return ok({items:relevant.map(workflowPublic),cursor:page.isDone?null:page.continueCursor,measuresScope:'page',
    measures:{missedVisits:pastConfirmed.filter(r=>r.status==='missed').length,noShowRate:pastConfirmed.length?pastConfirmed.filter(r=>r.status==='missed').length/pastConfirmed.length:null,
      bookedHours:rows.filter(r=>!['cancelled','missed'].includes(r.status)).reduce((n,r)=>n+r.durationMinutes/60,0),
      unconfirmedVisits:rows.filter(r=>r.status==='scheduled'&&r.startsAt>=now).length}});
}

export async function executeBookings(ctx, tenant, a, now) {
  const { accountId } = tenant;
  if (a.operation === 'bookings') return listBookings(ctx, accountId, a, now);
  const listTable = { resources: 'hasibResources', services: 'hasibServices', waitlist: 'hasibWaitlist' }[a.operation];
  if (listTable) {
    const page = await ctx.db.query(listTable).withIndex('by_account_created', q => q.eq('accountId', accountId)).order('desc').paginate({ numItems: clampLimit(a.limit, 200), cursor: a.cursor || null });
    return ok({ cursor: page.isDone ? null : page.continueCursor, items: page.page.filter(r => !a.status || r.status === a.status).map(workflowPublic) });
  }
  if (!['resource_save', 'service_save', 'booking_create', 'booking_update', 'booking_status', 'waitlist_add', 'waitlist_book'].includes(a.operation)) return null;
  const begun = await workflowBegin(ctx, accountId, a);
  if (begun.error) return fail(begun.error);
  if (begun.replay) return ok(workflowPublic(begun.replay));
  const finish = (table, id) => workflowFinish(ctx, accountId, a, begun.fingerprint, table, id, now);
  if (a.operation === 'resource_save') {
    const name = bounded(a.name, 100), availability = a.availability || [];
    if (!name || !['provider', 'room'].includes(a.kind) || !Number.isSafeInteger(a.capacity) || a.capacity < 1 || a.capacity > 500 || !Array.isArray(availability) || availability.length > 100 || !availability.every(rangeValid)) return fail('invalid_resource');
    const previous = a.resourceId ? await owned(ctx, a.resourceId, accountId, 'hasibResources') : null;
    if (a.resourceId && !previous) return fail('resource_not_found');
    if (previous && a.version !== previous.version) return fail('resource_conflict');
    if (previous && (a.capacity !== previous.capacity || a.kind !== previous.kind || JSON.stringify(availability) !== JSON.stringify(previous.availability))) {
      const bookings = await ctx.db.query('hasibBookings').withIndex('by_account_start', q => q.eq('accountId', accountId).gte('startsAt',now-86400000)).take(3001);
      if (bookings.length>3000) return fail('booking_window_full');
      if (bookings.some(r => ACTIVE.includes(r.status) && r.endsAt > now && r.resourceIds.includes(previous._id))) return fail('resource_has_bookings');
    }
    const value = { name, kind: a.kind, capacity: a.capacity, availability: availability.map(w => ({ startsAt: w.startsAt, endsAt: w.endsAt })), updatedAt: now, version: (previous?.version || 0) + 1 };
    const id = previous?._id || await ctx.db.insert('hasibResources', { accountId, ...value, createdAt: now });
    if (previous) await ctx.db.patch(id, value);
    return finish('hasibResources', id);
  }
  if (a.operation === 'service_save') {
    const name = bounded(a.name, 100);
    if (!name || !Number.isSafeInteger(a.durationMinutes) || a.durationMinutes < 5 || a.durationMinutes > 1440) return fail('invalid_service');
    const resources = await resourcesFor(ctx, accountId, a.resourceIds);
    if (resources.error) return fail(resources.error);
    const previous = a.serviceId ? await owned(ctx, a.serviceId, accountId, 'hasibServices') : null;
    if (a.serviceId && !previous) return fail('service_not_found');
    if (previous && a.version !== previous.version) return fail('service_conflict');
    const value = { name, durationMinutes: a.durationMinutes, resourceIds: a.resourceIds, version: (previous?.version || 0) + 1, updatedAt: now };
    const id = previous?._id || await ctx.db.insert('hasibServices', { accountId, ...value, createdAt: now });
    if (previous) await ctx.db.patch(id, value);
    return finish('hasibServices', id);
  }
  if (a.operation === 'waitlist_add') {
    if (!rangeValid({ startsAt: a.earliestAt, endsAt: a.latestAt })) return fail('invalid_waitlist');
    if (!await owned(ctx, a.serviceId, accountId, 'hasibServices')) return fail('service_not_found');
    const links = await workflowLinks(ctx, accountId, a);
    if (links.error) return fail(links.error);
    const id = await ctx.db.insert('hasibWaitlist', { accountId, contactId: a.contactId, serviceId: a.serviceId, earliestAt: a.earliestAt, latestAt: a.latestAt, status: 'waiting', version: 1, createdAt: now, updatedAt: now });
    return finish('hasibWaitlist', id);
  }
  if (a.operation === 'booking_create' || a.operation === 'waitlist_book') {
    let args = a, waiting;
    if (a.operation === 'waitlist_book') {
      waiting = await owned(ctx, a.waitlistId, accountId, 'hasibWaitlist');
      if (!waiting) return fail('waitlist_not_found');
      if (a.version !== waiting.version) return fail('waitlist_conflict');
      if (waiting.status !== 'waiting' || a.startsAt < waiting.earliestAt || a.startsAt >= waiting.latestAt) return fail('invalid_waitlist');
      args = { ...a, contactId: waiting.contactId, serviceId: waiting.serviceId };
    }
    const candidate = await bookingCandidate(ctx, accountId, args);
    if (candidate.error) return fail(candidate.error);
    if (waiting && candidate.value.endsAt > waiting.latestAt) return fail('invalid_waitlist');
    const available = await slotAvailable(ctx, accountId, candidate.value, candidate.resources);
    if (!available.ok) return available;
    const id = await ctx.db.insert('hasibBookings', { accountId, ...candidate.value, status: 'scheduled', version: 1, createdAt: now, updatedAt: now });
    if (waiting) await ctx.db.patch(waiting._id, { status: 'booked', bookingId: id, version: waiting.version + 1, updatedAt: now });
    return finish('hasibBookings', id);
  }
  const booking = await owned(ctx, a.bookingId, accountId, 'hasibBookings');
  if (!booking) return fail('booking_not_found');
  if (a.version !== booking.version) return fail('booking_conflict');
  if (a.operation === 'booking_update') {
    if (!['scheduled', 'confirmed'].includes(booking.status)) return fail('booking_locked');
    if (!workflowTime(a.startsAt)) return fail('invalid_booking');
    const resourceIds = a.resourceIds || booking.resourceIds;
    const resources = await resourcesFor(ctx, accountId, resourceIds);
    if (resources.error) return fail(resources.error);
    const existingResources = await resourcesFor(ctx, accountId, booking.resourceIds);
    if (existingResources.error) return fail(existingResources.error);
    if (resources.rows.map(r => r.kind).sort().join(',') !== existingResources.rows.map(r => r.kind).sort().join(',')) return fail('invalid_resources');
    const candidate = { ...booking, startsAt: a.startsAt, endsAt: a.startsAt + booking.durationMinutes * 60000, resourceIds };
    if (!workflowTime(candidate.endsAt)) return fail('invalid_booking');
    if (booking.membershipId) {
      const validity = await membershipForBooking(ctx, accountId, booking.membershipId, booking.contactId, candidate.startsAt);
      if (validity.error) return fail(validity.error);
    }
    const available = await slotAvailable(ctx, accountId, candidate, resources.rows, booking._id);
    if (!available.ok) return available;
    await ctx.db.patch(booking._id, { startsAt: candidate.startsAt, endsAt: candidate.endsAt, resourceIds, status: 'scheduled', confirmedAt: undefined, version: booking.version + 1, updatedAt: now });
  } else {
    const transitions = tenant.pack?.id === 'clinic' ? CLINIC_TRANSITIONS : TRANSITIONS;
    if (!transitions[booking.status]?.includes(a.to)) return fail('invalid_transition');
    if (['arrived', 'in_service', 'completed'].includes(a.to) && booking.startsAt > now) return fail('booking_not_started');
    if (a.to === 'missed' && booking.endsAt > now) return fail('booking_not_finished');
    if (a.to === 'cancelled' && tenant.pack?.id === 'clinic' && !CANCELLATION_REASONS.has(a.reason)) return fail('cancellation_reason_required');
    if (a.to === 'completed') {
      const consumed = await completeMembershipBooking(ctx, accountId, booking, now);
      if (!consumed.ok) return consumed;
    }
    if (a.to === 'cancelled' && booking.status === 'completed') {
      const restored = await reverseMembershipBooking(ctx, accountId, booking, now);
      if (!restored.ok) return restored;
    }
    const timestamp = { confirmed:'confirmedAt', arrived:'arrivedAt', in_service:'serviceStartedAt', completed:'completedAt', cancelled:'cancelledAt', missed:'missedAt' }[a.to];
    await ctx.db.patch(booking._id, { status: a.to, ...(timestamp ? { [timestamp]:now } : {}), ...(a.to === 'cancelled' && a.reason ? { cancellationReason:a.reason } : {}), version: booking.version + 1, updatedAt: now });
  }
  return finish('hasibBookings', booking._id);
}
