// Asking prices describe properties; only agreed agency commissions enter orders.
import { owned } from '../blueTenant.js';
import { ok, fail, bounded, REQUEST_ID, byRequest, clampLimit } from './shared.js';
import { isMinor } from './money.js';
import { createOrder } from './ordersState.js';
import { checkPhoto, releaseRegistration } from './photosState.js';
import { audit, workspaceContainsAccount } from './workspaceState.js';
const stamp = n => Number.isSafeInteger(n) && n >= 0;
const publicRow = r => { const { _id, _seq, table, accountId, requestId, ...rest } = r; return { id: _id, ...rest }; };
const list = (ctx, table, accountId, a) => ctx.db.query(table).withIndex('by_account_created', q => q.eq('accountId', accountId)).order('desc').paginate({ numItems: clampLimit(a.limit, 200), cursor: a.cursor || null });
async function publicEnquiry(ctx, row, now) {
  const order = row.orderId ? await owned(ctx, row.orderId, row.accountId, 'hasibOrders') : null;
  return { ...publicRow(row), commissionOwedMinor: order ? Math.max(0, order.totalMinor - order.paidMinor) : null,
    followUpDue: !!row.followUpAt && row.followUpAt <= now && !['won', 'lost'].includes(row.status) };
}
async function publicProperty(ctx, row) {
  const value = publicRow(row);
  value.photoUrls = await Promise.all((row.photoIds || []).map(id => ctx.storage.getUrl(id)));
  return value;
}
export async function executeProperty(ctx, tenant, a, now) {
  const w = a.workflow || {}, accountId = tenant.accountId, actor = tenant.actor;
  if (a.operation === 'properties' || a.operation === 'property_enquiries') {
    const page = await list(ctx, a.operation === 'properties' ? 'hasibProperties' : 'hasibPropertyEnquiries', accountId, a);
    const rows = page.page.filter(r => !a.status || r.status === a.status);
    return ok({ cursor: page.isDone ? null : page.continueCursor, items: a.operation === 'properties' ? await Promise.all(rows.map(r => publicProperty(ctx, r))) : await Promise.all(rows.map(r => publicEnquiry(ctx, r, now))) });
  }
  if (a.operation === 'property_save') {
    const row = a.propertyId ? await owned(ctx, a.propertyId, accountId, 'hasibProperties') : null;
    if (a.propertyId && !row) return fail('property_not_found');
    if (row && row.version !== a.version) return fail('property_conflict');
    if (!row) {
      if (!REQUEST_ID.test(a.requestId || '')) return fail('invalid_request');
      const replay = await byRequest(ctx, 'hasibProperties', accountId, a.requestId);
      if (replay) return ok(publicRow(replay));
    }
    const label = bounded(w.label ?? row?.label, 120), location = bounded(w.location ?? row?.location, 160);
    const askingPriceMinor = w.askingPriceMinor ?? row?.askingPriceMinor, availability = w.availability ?? row?.availability ?? 'available';
    if (!label || !location || !isMinor(askingPriceMinor) || !['available', 'reserved', 'unavailable'].includes(availability)) return fail('invalid_property');
    const data = { label, location, askingPriceMinor, availability, version: (row?.version || 0) + 1, updatedAt: now };
    const stringFields = { reference: 80, transactionType: 10, propertyType: 60, area: 100, pricePeriod: 20, description: 2000, authorityStatus: 20 };
    for (const [key, max] of Object.entries(stringFields)) {
      const value = bounded(w[key] ?? row?.[key], max);
      if (value) data[key] = value;
    }
    if (data.transactionType && !['sale', 'rent'].includes(data.transactionType)) return fail('invalid_property');
    if (data.authorityStatus && !['pending', 'confirmed', 'expired'].includes(data.authorityStatus)) return fail('invalid_property');
    for (const key of ['bedrooms', 'bathrooms', 'sizeSqm', 'verificationAt']) {
      const value = w[key] ?? row?.[key];
      if (value !== undefined) { if (!stamp(value)) return fail('invalid_property'); data[key] = value; }
    }
    const assignedAccountId = w.assignedAccountId ?? row?.assignedAccountId;
    if (assignedAccountId) {
      if (!actor || !await workspaceContainsAccount(ctx, actor.workspace, assignedAccountId)) return fail('invalid_assignment');
      data.assignedAccountId = assignedAccountId;
    }
    const features = w.features ?? row?.features, photoIds = w.photoIds ?? row?.photoIds;
    if (features !== undefined) { if (!Array.isArray(features) || features.length > 30 || features.some(x => !bounded(x, 100))) return fail('invalid_property'); data.features = features; }
    if (photoIds !== undefined) {
      if (!Array.isArray(photoIds) || photoIds.length > 10 || new Set(photoIds).size !== photoIds.length) return fail('invalid_property');
      const checked = [];
      for (const photoId of photoIds) {
        const current = row?.photoIds?.includes(photoId) ? { photoId } : null;
        const id = await checkPhoto(ctx, accountId, photoId, current);
        if (!id) return fail('invalid_photo');
        checked.push(id);
      }
      data.photoIds = checked;
    }
    if (row) await ctx.db.patch(row._id, data);
    const id = row?._id || await ctx.db.insert('hasibProperties', { ...data, accountId, requestId: a.requestId, createdAt: now });
    if (photoIds !== undefined) {
      const links = await ctx.db.query('hasibPropertyPhotos').withIndex('by_property', q => q.eq('propertyId', id)).take(20);
      for (const link of links) if (!data.photoIds.includes(link.storageId)) await ctx.db.delete(link._id);
      for (const photoId of data.photoIds) if (!links.some(link => link.storageId === photoId)) {
        await ctx.db.insert('hasibPropertyPhotos', { accountId, propertyId: id, storageId: photoId, createdAt: now });
        await releaseRegistration(ctx, photoId);
      }
    }
    if (actor) await audit(ctx, tenant, actor, row ? 'property_updated' : 'property_created', 'property', id, now);
    return ok(await publicProperty(ctx, await ctx.db.get(id)));
  }
  if (!['enquiry_create', 'enquiry_update'].includes(a.operation)) return null;
  const row = a.operation === 'enquiry_update' ? await owned(ctx, a.enquiryId, accountId, 'hasibPropertyEnquiries') : null;
  if (a.operation === 'enquiry_update' && !row) return fail('enquiry_not_found');
  if (row && row.version !== a.version) return fail('enquiry_conflict');
  if (row && ['won', 'lost'].includes(row.status)) return fail('enquiry_locked');
  if (!row) {
    if (!REQUEST_ID.test(a.requestId || '')) return fail('invalid_request');
    const replay = await byRequest(ctx, 'hasibPropertyEnquiries', accountId, a.requestId);
    if (replay) return ok(await publicEnquiry(ctx, replay, now));
  }
  const contactId = w.contactId || row?.contactId, propertyId = w.propertyId || row?.propertyId;
  if (!await owned(ctx, contactId, accountId, 'blueContacts')) return fail('contact_not_found');
  if (row && contactId !== row.contactId) return fail('invalid_enquiry');
  const property = propertyId ? await owned(ctx, propertyId, accountId, 'hasibProperties') : null;
  if (propertyId && !property) return fail('property_not_found');
  const location = bounded(w.location ?? row?.location, 160), budgetMinor = w.budgetMinor ?? row?.budgetMinor;
  const status = w.status ?? row?.status ?? 'new';
  if (!location || !isMinor(budgetMinor) || !['new', 'replied', 'viewing', 'won', 'lost'].includes(status)) return fail('invalid_enquiry');
  if (status === 'won' && (!property || property.availability === 'unavailable')) return fail('property_unavailable');
  const data = { contactId, ...(propertyId ? { propertyId } : {}), location, budgetMinor, status, version: (row?.version || 0) + 1, updatedAt: now };
  for (const key of ['viewingAt', 'followUpAt', 'commissionMinor']) {
    const value = w[key] ?? row?.[key];
    if (value !== undefined) { if (!(key === 'commissionMinor' ? isMinor(value) : stamp(value))) return fail('invalid_enquiry'); data[key] = value; }
  }
  if (w.viewingOutcome !== undefined || row?.viewingOutcome !== undefined) {
    const outcome = bounded(w.viewingOutcome ?? row.viewingOutcome, 500);
    if (!outcome) return fail('invalid_enquiry');
    data.viewingOutcome = outcome;
  }
  if (status === 'won') {
    if (data.commissionMinor === undefined) return fail('commission_required');
    const charge = await createOrder(ctx, tenant, { requestId: `commission:${row?.requestId || a.requestId}`, channel: 'walk_in', contactId, fulfilment: { type: 'in_store' }, lines: [{ name: `Agency commission: ${property.label}`.slice(0, 120), qty: 1, unitPriceMinor: data.commissionMinor }] }, now, { internal: true });
    if (!charge.ok) return charge;
    data.orderId = charge.value.id;
    await ctx.db.patch(propertyId, { availability: 'unavailable', version: property.version + 1, updatedAt: now });
  }
  if (row) await ctx.db.patch(row._id, data);
  const id = row?._id || await ctx.db.insert('hasibPropertyEnquiries', { ...data, accountId, requestId: a.requestId, createdAt: now });
  if (actor) await audit(ctx, tenant, actor, row ? 'property_enquiry_updated' : 'property_enquiry_created', 'property_enquiry', id, now);
  return ok(await publicEnquiry(ctx, await ctx.db.get(id), now));
}
