// Repair tickets for a tech store. The ticket holds the workshop story (device,
// fault, status); the money — quote, parts from stock, deposit, balance — lives
// on a linked order, so receipts, payments and Insights need no second path.
import { owned, encodeCursor, decodeCursor, afterCursor } from '../blueTenant.js';
import { displayName } from '../blueContacts.js';
import { isMinor } from './money.js';
import { ok, fail, bounded, clampLimit, REQUEST_ID, byRequest, nextNumber } from './shared.js';
import { canRepairTransition, isRepairStatus, repairNext, REPAIR_EDITABLE, ORDER_FOR_REPAIR } from './repairMachine.js';
import { normSerial } from './serialsState.js';
import { createOrder, changeStatus, updatePendingOrder, publicOrder, paymentsOf } from './ordersState.js';

const HISTORY = 30;
// The line name is the device; screens and receipts render "Repair labour — <device>" in the owner's language.
const labourLine = (device, labourMinor) => ({ name: device.slice(0, 120), role: 'labour', qty: 1, unitPriceMinor: labourMinor });

async function publicRepair(ctx, r, { detail = false } = {}) {
  const order = await ctx.db.get(r.orderId);
  const contact = r.contactId ? await ctx.db.get(r.contactId) : null;
  return { id: r._id, number: r.number, status: r.status, next: repairNext(r.status), device: r.device, serial: r.serial || '', fault: r.fault, accessories: r.accessories || '',
    customer: contact?.state === 'active' ? { id: contact._id, name: displayName(contact).name } : null, customerName: r.customerName || '',
    underWarranty: r.underWarranty, warrantyBy: r.warrantyBy || null, labourMinor: r.labourMinor, parts: r.parts, dueAt: r.dueAt || null,
    order: order ? { ...(await publicOrder(ctx, order)), ...(detail ? { payments: await paymentsOf(ctx, order._id) } : {}) } : null,
    approvalStatus: r.approvalStatus || 'awaiting', approvedBy: r.approvedBy || '', approvedAt: r.approvedAt || null, history: r.history, version: r.version, createdAt: r.createdAt, updatedAt: r.updatedAt };
}

/** Is this device one we sold, still under warranty? Store warranty makes the labour free. */
async function warrantyFor(ctx, accountId, serial, now) {
  if (!serial) return { underWarranty: false };
  const row = await ctx.db.query('hasibSerials').withIndex('by_account_serial', q => q.eq('accountId', accountId).eq('serial', serial)).unique();
  const active = row?.status === 'sold' && row.warrantyUntil > now && row.warrantyBy !== 'none';
  return { underWarranty: !!active, ...(active ? { warrantyBy: row.warrantyBy } : {}) };
}

async function createRepair(ctx, tenant, a, now) {
  const { accountId } = tenant;
  if (!REQUEST_ID.test(a.requestId || '')) return fail('invalid_request');
  const replay = await byRequest(ctx, 'hasibRepairs', accountId, a.requestId);
  if (replay) return ok(await publicRepair(ctx, replay));
  const device = bounded(a.device ?? '', 80), fault = bounded(a.fault ?? '', 500), accessories = bounded(a.accessories ?? '', 200);
  const serial = a.serial ? normSerial(a.serial) : undefined;
  if (!device || !fault || accessories === null || serial === null || (a.quoteMinor !== undefined && !isMinor(a.quoteMinor)) || (a.dueAt !== undefined && !Number.isSafeInteger(a.dueAt))) return fail('invalid_repair');
  const warranty = await warrantyFor(ctx, accountId, serial, now);
  const labourMinor = warranty.underWarranty && warranty.warrantyBy === 'store' ? 0 : a.quoteMinor || 0;
  const created = await createOrder(ctx, tenant, { requestId: `repair:${a.requestId}`, channel: 'walk_in', kind: 'repair', fulfilment: { type: 'in_store', ...(a.dueAt ? { dueAt: a.dueAt } : {}) },
    lines: [labourLine(device, labourMinor)], ...(a.contactId ? { contactId: a.contactId } : {}), ...(a.conversationId ? { conversationId: a.conversationId } : {}),
    ...(a.customerName ? { customerName: a.customerName } : {}) }, now, { internal: true });
  if (!created.ok) return created;
  const order = await ctx.db.get(created.value.id);
  const number = await nextNumber(ctx, accountId, 'repair');
  const id = await ctx.db.insert('hasibRepairs', { accountId, requestId: a.requestId, number, orderId: order._id, ...(order.contactId ? { contactId: order.contactId } : {}),
    ...(order.conversationId ? { conversationId: order.conversationId } : {}), ...(order.customerName ? { customerName: order.customerName } : {}),
    device, ...(serial ? { serial } : {}), fault, ...(accessories ? { accessories } : {}), status: 'received', approvalStatus: 'awaiting', underWarranty: warranty.underWarranty, ...(warranty.warrantyBy ? { warrantyBy: warranty.warrantyBy } : {}),
    labourMinor, parts: [], ...(a.dueAt ? { dueAt: a.dueAt } : {}), history: [{ status: 'received', at: now }], version: 1, createdAt: now, updatedAt: now });
  return ok(await publicRepair(ctx, await ctx.db.get(id)));
}

async function loadRepair(ctx, accountId, a) {
  const repair = await owned(ctx, a.repairId, accountId, 'hasibRepairs');
  if (!repair) return { error: 'repair_not_found' };
  if (a.version !== undefined && a.version !== repair.version) return { error: 'repair_conflict' };
  return { repair, order: await ctx.db.get(repair.orderId) };
}

async function updateRepair(ctx, tenant, a, now) {
  const { repair, order, error } = await loadRepair(ctx, tenant.accountId, a);
  if (error) return fail(error);
  if (a.version === undefined) return fail('repair_conflict');
  if (!REPAIR_EDITABLE.includes(repair.status)) return fail('repair_locked');
  const labourMinor = a.labourMinor ?? repair.labourMinor;
  if (!isMinor(labourMinor)) return fail('invalid_repair');
  const parts = Array.isArray(a.parts) ? a.parts.slice(0, 20).map(p => ({ variantId: p?.variantId, qty: p?.qty, ...(p?.unitPriceMinor !== undefined ? { unitPriceMinor: p.unitPriceMinor } : {}) })) : repair.parts;
  const fault = a.fault !== undefined ? bounded(a.fault, 500) : repair.fault;
  if (!fault) return fail('invalid_repair');
  const updated = await updatePendingOrder(ctx, tenant.accountId, order, [labourLine(repair.device, labourMinor), ...parts], now, { serializedReason: 'serialized_part' });
  if (!updated.ok) return updated;
  await ctx.db.patch(repair._id, { labourMinor, parts, fault, approvalStatus:'awaiting',approvedBy:undefined,approvedAt:undefined,version: repair.version + 1, updatedAt: now });
  return ok(await publicRepair(ctx, await ctx.db.get(repair._id)));
}

async function moveRepair(ctx, tenant, a, now) {
  const { repair, order, error } = await loadRepair(ctx, tenant.accountId, a);
  if (error) return fail(error);
  if (a.version === undefined) return fail('repair_conflict');
  if (!isRepairStatus(a.to) || !canRepairTransition(repair.status, a.to)) return fail('invalid_transition');
  // Work starts only once the customer has approved the quote; a free warranty repair needs no approval.
  const free = repair.underWarranty && order.totalMinor === 0;
  if (['repairing', 'ready'].includes(a.to) && repair.approvalStatus !== 'approved' && !free) return fail('approval_required');
  const target = ORDER_FOR_REPAIR[a.to];
  if (target && order.status !== target) {
    const moved = await changeStatus(ctx, tenant.accountId, { orderId: order._id, to: target, version: order.version }, now);
    if (!moved.ok) return moved;
  }
  await ctx.db.patch(repair._id, { status: a.to, history: [...repair.history, { status: a.to, at: now }].slice(-HISTORY), version: repair.version + 1, updatedAt: now });
  return ok(await publicRepair(ctx, await ctx.db.get(repair._id)));
}

async function listRepairs(ctx, accountId, a) {
  const cursor = decodeCursor(a.cursor), limit = clampLimit(a.limit);
  const status = isRepairStatus(a.status) ? a.status : null;
  const query = status
    ? ctx.db.query('hasibRepairs').withIndex('by_account_status_created', q => cursor ? q.eq('accountId', accountId).eq('status', status).lte('createdAt', cursor.at) : q.eq('accountId', accountId).eq('status', status))
    : ctx.db.query('hasibRepairs').withIndex('by_account_created', q => cursor ? q.eq('accountId', accountId).lte('createdAt', cursor.at) : q.eq('accountId', accountId));
  const rows = afterCursor(await query.order('desc').take(limit + 25), cursor, 'createdAt').slice(0, limit);
  const items = [];
  for (const r of rows) items.push(await publicRepair(ctx, r));
  return ok({ items, cursor: rows.length === limit ? encodeCursor(rows.at(-1).createdAt, rows.at(-1)._id) : null });
}

export async function executeRepairs(ctx, tenant, a, now) {
  if (a.operation === 'repair_approval') {
    const {repair,error}=await loadRepair(ctx,tenant.accountId,a);
    if(error) return fail(error);
    if(a.version===undefined) return fail('repair_conflict');
    const approvedBy=bounded(a.approvedBy,100);
    if(!approvedBy || ['collected','cancelled'].includes(repair.status)) return fail('invalid_repair');
    await ctx.db.patch(repair._id,{approvalStatus:'approved',approvedBy,approvedAt:now,version:repair.version+1,updatedAt:now});
    return ok(await publicRepair(ctx,await ctx.db.get(repair._id)));
  }
  if (a.operation === 'repair_create') return createRepair(ctx, tenant, a, now);
  if (a.operation === 'repair_update') return updateRepair(ctx, tenant, a, now);
  if (a.operation === 'repair_status') return moveRepair(ctx, tenant, a, now);
  if (a.operation === 'repairs') return listRepairs(ctx, tenant.accountId, a);
  if (a.operation === 'repair') {
    const { repair, error } = await loadRepair(ctx, tenant.accountId, { repairId: a.repairId });
    return error ? fail(error) : ok(await publicRepair(ctx, repair, { detail: true }));
  }
  return null;
}
