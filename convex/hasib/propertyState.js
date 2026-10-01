// Listings for the Real Estate pack. Asking prices describe properties; only agreed agency
// commissions enter orders (realEstateState.js). A listing is verified on purpose, never by editing it.
import { owned } from '../blueTenant.js';
import { ok, fail, bounded, REQUEST_ID, byRequest, clampLimit } from './shared.js';
import { isMinor } from './money.js';
import { checkPhoto, releaseRegistration } from './photosState.js';
import { audit, workspaceContainsAccount } from './workspaceState.js';
const stamp = n => Number.isSafeInteger(n) && n >= 0;
const publicRow = r => { const { _id, _seq, table, accountId, requestId, ...rest } = r; return { id: _id, ...rest }; };
const list = (ctx, table, accountId, a) => ctx.db.query(table).withIndex('by_account_created', q => q.eq('accountId', accountId)).order('desc').paginate({ numItems: clampLimit(a.limit, 200), cursor: a.cursor || null });
async function publicProperty(ctx, row) {
  const value = publicRow(row);
  value.photoUrls = await Promise.all((row.photoIds || []).map(id => ctx.storage.getUrl(id)));
  return value;
}
export async function executeProperty(ctx, tenant, a, now) {
  const w = a.workflow || {}, accountId = tenant.accountId, actor = tenant.actor;
  if (a.operation === 'properties') {
    const page = await list(ctx, 'hasibProperties', accountId, a);
    const rows = page.page.filter(r => !a.status || r.availability === a.status);
    return ok({ cursor: page.isDone ? null : page.continueCursor, items: await Promise.all(rows.map(r => publicProperty(ctx, r))) });
  }
  if (a.operation === 'property_verify') {
    const row = await owned(ctx, a.propertyId, accountId, 'hasibProperties');
    if (!row) return fail('property_not_found');
    if (row.version !== a.version) return fail('property_conflict');
    if (a.status !== undefined && !['pending', 'confirmed', 'expired'].includes(a.status)) return fail('invalid_property');
    await ctx.db.patch(row._id, { verificationAt: now, ...(a.status ? { authorityStatus: a.status } : {}), version: row.version + 1, updatedAt: now });
    if (actor) await audit(ctx, tenant, actor, 'property_verified', 'property', row._id, now, a.status || row.authorityStatus || '');
    return ok(await publicProperty(ctx, await ctx.db.get(row._id)));
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
    for (const key of ['bedrooms', 'bathrooms', 'sizeSqm']) {
      const value = w[key] ?? row?.[key];
      if (value !== undefined) { if (!stamp(value)) return fail('invalid_property'); data[key] = value; }
    }
    const assignedAccountId = w.assignedAccountId ?? row?.assignedAccountId;
    if (assignedAccountId) {
      // An agent may take a listing on, but not hand it to someone else.
      const allowed = actor?.role === 'employee' ? String(assignedAccountId) === String(actor.actorAccountId) : actor && await workspaceContainsAccount(ctx, actor.workspace, assignedAccountId);
      if (!allowed) return fail('invalid_assignment');
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
  return null;
}
