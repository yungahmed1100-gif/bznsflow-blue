import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { convexMemory } from './helpers/convex-memory.mjs';
import { executeFollowups } from '../convex/hasib/followupsState.js';

async function setup() {
  const m = convexMemory();
  const contactId = await m.db.insert('blueContacts', { accountId: 'a', state: 'active' });
  const call = (operation, args = {}, accountId = 'a') => executeFollowups(m.ctx, { accountId }, { operation, ...args }, m.now());
  const save = (args = {}) => call('followup_save', { requestId: randomUUID(), contactId, dueAt: m.now(), reason: 'Owner asked to follow up', ...args });
  return { m, contactId, call, save };
}

test('owner follow-up opens the existing chat and completes with no automated messaging', async () => {
  const { m, contactId, call, save } = await setup();
  const conversationId = await m.db.insert('blueConversations', { accountId: 'a', contactId });
  const followup = (await save()).value;
  assert.ok(followup.chatHref.includes(encodeURIComponent(conversationId)));
  const completion = { requestId: randomUUID(), followupId: followup.id, version: followup.version };
  assert.equal((await call('followup_complete', completion)).value.status, 'completed');
  assert.equal((await call('followup_complete', completion)).value.status, 'completed');
  assert.equal((await call('followups', { status: 'open' })).value.items.length, 0);
  assert.equal(m.scheduled.length, 0);
  assert.equal(m.table('blueMessages').length, 0);
});

test('linked conversation/record ownership and matching customer are checked; no chat is invented', async () => {
  const { m, call, save, contactId } = await setup();
  assert.equal((await save()).value.chatHref, null);
  const other = await m.db.insert('blueContacts', { accountId: 'a', state: 'active' });
  const wrongCustomer = await m.db.insert('blueConversations', { accountId: 'a', contactId: other });
  const wrongTenant = await m.db.insert('blueConversations', { accountId: 'b', contactId });
  assert.equal((await save({ conversationId: wrongCustomer })).reason, 'conversation_not_found');
  assert.equal((await save({ conversationId: wrongTenant })).reason, 'conversation_not_found');
  const order = await m.db.insert('hasibOrders', { accountId: 'b' });
  assert.equal((await save({ linkedType: 'order', linkedId: order })).reason, 'linked_record_not_found');
  assert.equal((await save({ linkedType: 'order' })).reason, 'invalid_followup');
  const followup = (await save()).value;
  assert.equal((await call('followup_complete', { requestId: randomUUID(), followupId: followup.id, version: 1 }, 'b')).reason, 'followup_not_found');
  assert.equal((await call('followups', {}, 'b')).value.items.length, 0);
});

test('follow-up retries, stale edits, owner due dates and explicit link clearing', async () => {
  const { save, call, m, contactId } = await setup();
  const requestId = randomUUID();
  const conversationId = await m.db.insert('blueConversations', { accountId: 'a', contactId });
  const bookingId = await m.db.insert('hasibBookings', { accountId: 'a', contactId });
  const args = { requestId, conversationId, linkedType: 'booking', linkedId: bookingId };
  let first = (await save(args)).value;
  assert.equal((await save(args)).value.id, first.id);
  assert.equal((await save({ ...args, dueAt: m.now() + 1 })).reason, 'request_conflict');
  assert.equal((await save({ followupId: first.id, version: 0 })).reason, 'followup_conflict');
  first = (await save({ followupId: first.id, version: first.version, dueAt: m.now() + 86400000 })).value;
  assert.equal(first.linkedId, undefined);
  assert.equal(first.conversationId, undefined);
  assert.equal(first.dueAt, m.now() + 86400000);
  assert.equal(m.table('hasibFollowups').length, 1);
  assert.equal((await call('followup_save', { requestId: randomUUID(), contactId, reason: 'Due date missing' })).reason, 'invalid_followup');
});
