// Operational follow-up only. Owners choose dates and reasons; this module never sends messages.
import { owned } from '../blueTenant.js';
import { displayName } from '../blueContacts.js';
import { ok, fail, bounded, REQUEST_ID, clampLimit } from './shared.js';

export const workflowTime = value => Number.isSafeInteger(value) && value >= 0;
export const workflowPublic = row => {
  const { _id, _creationTime, _seq, table, accountId, requestId, ...value } = row;
  return { id: _id, ...value };
};
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => [k, canonical(value[k])])) : value;

/** Mutations call this before writing. Convex retries the indexed read and writes atomically. */
export async function workflowBegin(ctx, accountId, args) {
  if (!REQUEST_ID.test(args.requestId || '')) return { error: 'invalid_request' };
  const { sessionHash, hashSecret, ...input } = args;
  const fingerprint = JSON.stringify(canonical(input));
  const prior = await ctx.db.query('hasibWorkflowRequests').withIndex('by_account_request', q => q.eq('accountId', accountId).eq('requestId', args.requestId)).unique();
  if (!prior) return { fingerprint };
  if (prior.operation !== args.operation || prior.fingerprint !== fingerprint) return { error: 'request_conflict' };
  const replay = await owned(ctx, prior.recordId, accountId, prior.recordTable);
  return replay ? { replay, fingerprint } : { error: 'record_not_found' };
}

export async function workflowFinish(ctx, accountId, args, fingerprint, recordTable, recordId, now) {
  await ctx.db.insert('hasibWorkflowRequests', { accountId, requestId: args.requestId, operation: args.operation, fingerprint, recordTable, recordId, createdAt: now });
  return ok(workflowPublic(await ctx.db.get(recordId)));
}

export async function workflowLinks(ctx, accountId, args) {
  const contact = await owned(ctx, args.contactId, accountId, 'blueContacts');
  if (!contact || contact.state === 'deleted') return { error: 'contact_not_found' };
  if (args.orderId) {
    const order = await owned(ctx, args.orderId, accountId, 'hasibOrders');
    if (!order || (order.contactId && order.contactId !== args.contactId)) return { error: 'order_not_found' };
  }
  return { contact };
}

const FILTER_PAGES = 5;
const LINK_TABLES = Object.freeze({ booking: 'hasibBookings', membership: 'hasibMemberships', order: 'hasibOrders', job: 'hasibJobs', property: 'hasibProperties' });
async function followupPublic(ctx, row) {
  // Resolve the existing conversation on read, so adding a conversation later still gives an action.
  const conversation = row.conversationId ? await owned(ctx, row.conversationId, row.accountId, 'blueConversations')
    : (await ctx.db.query('blueConversations').withIndex('by_contact', q => q.eq('contactId', row.contactId)).collect()).find(c => c.accountId === row.accountId);
  const contact = await ctx.db.get(row.contactId);
  const contactName = contact?.accountId === row.accountId && contact.state === 'active' ? displayName(contact).name : null;
  return { ...workflowPublic(row), contactName, chatHref: conversation ? `?tab=chats&chat=${encodeURIComponent(conversation._id)}` : null };
}

export async function executeFollowups(ctx, tenant, a, now) {
  const { accountId } = tenant;
  if (a.operation === 'followups') {
    // The status filter runs after each page, so keep reading (a few pages at most) until the page is full.
    const limit = clampLimit(a.limit, 200);
    let cursor = a.cursor || null, rows = [], done = false;
    for (let reads = 0; reads < FILTER_PAGES && rows.length < limit && !done; reads++) {
      const page = await ctx.db.query('hasibFollowups').withIndex('by_account_due', q => q.eq('accountId', accountId)).order('asc').paginate({ numItems: limit, cursor });
      rows = [...rows, ...page.page.filter(r => !a.status || r.status === a.status)];
      cursor = page.continueCursor;
      done = page.isDone;
    }
    return ok({ cursor: done ? null : cursor, items: await Promise.all(rows.map(row => followupPublic(ctx, row))) });
  }
  if (!['followup_save', 'followup_complete'].includes(a.operation)) return null;
  const begun = await workflowBegin(ctx, accountId, a);
  if (begun.error) return fail(begun.error);
  if (begun.replay) return ok(await followupPublic(ctx, begun.replay));
  const previous = a.followupId ? await owned(ctx, a.followupId, accountId, 'hasibFollowups') : null;
  if (a.followupId && !previous) return fail('followup_not_found');
  if (previous && a.version !== previous.version) return fail('followup_conflict');
  let id;
  if (a.operation === 'followup_complete') {
    if (!previous) return fail('followup_not_found');
    if (previous.status !== 'open') return fail('invalid_transition');
    id = previous._id;
    await ctx.db.patch(id, { status: 'completed', completedAt: now, updatedAt: now, version: previous.version + 1 });
  } else {
    const reason = bounded(a.reason, 160);
    if (!reason || !workflowTime(a.dueAt)) return fail('invalid_followup');
    const links = await workflowLinks(ctx, accountId, a);
    if (links.error) return fail(links.error);
    if (a.conversationId) {
      const conversation = await owned(ctx, a.conversationId, accountId, 'blueConversations');
      if (!conversation || conversation.contactId !== a.contactId) return fail('conversation_not_found');
    }
    if (!!a.linkedType !== !!a.linkedId || (a.linkedType && !LINK_TABLES[a.linkedType])) return fail('invalid_followup');
    if (a.linkedId) {
      const linked = await owned(ctx, a.linkedId, accountId, LINK_TABLES[a.linkedType]);
      if (!linked || (linked.contactId && linked.contactId !== a.contactId)) return fail('linked_record_not_found');
    }
    const value = { contactId: a.contactId, dueAt: a.dueAt, reason, status: 'open', updatedAt: now, version: (previous?.version || 0) + 1,
      ...(a.conversationId ? { conversationId: a.conversationId } : {}), ...(a.linkedId ? { linkedType: a.linkedType, linkedId: a.linkedId } : {}) };
    if (previous) {
      id = previous._id;
      await ctx.db.patch(id, { ...value, conversationId: a.conversationId, linkedType: a.linkedType, linkedId: a.linkedId, completedAt: undefined });
    } else id = await ctx.db.insert('hasibFollowups', { accountId, ...value, createdAt: now });
  }
  await workflowFinish(ctx, accountId, a, begun.fingerprint, 'hasibFollowups', id, now);
  return ok(await followupPublic(ctx, await ctx.db.get(id)));
}
