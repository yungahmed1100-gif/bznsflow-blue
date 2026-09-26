// The owner can always reply inside the 24-hour window, whatever Layla is doing:
// paused, taken over, or never activated. Refusals name their real reason.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { blueHarness, seedTenant } from './helpers/blue-tenant.mjs';

const DAY = 86400000;
async function setup() {
  const h = blueHarness();
  await h.enable();
  const a = await seedTenant(h.m, { name: 'a' });
  await h.messaging('activate', { sessionHash: a.sessionHash });
  await h.inbound(a, { from: '96891111111', text: 'Hello' });
  const person = h.m.table('blueConversations').find(c => c.accountId === a.accountId);
  const reply = (text = 'Owner here') => h.messaging('manual_reply', { sessionHash: a.sessionHash, conversationId: person._id, text, requestId: randomUUID() });
  const job = text => h.m.table('blueMessages').find(m => m.manual && m.text === text);
  return { h, a, person, reply, job };
}
async function sendsThrough(h, job) {
  assert.equal(job?.status, 'queued', 'the reply is queued');
  const claim = await h.messaging('claim', { jobId: job._id, intent: 'intent-1' });
  assert.ok(claim.value, 'the worker can claim it');
  assert.equal((await h.messaging('send_gate', { jobId: job._id, intent: 'intent-1' })).value, true, 'the send gate lets it through');
}

test('the owner can reply while Layla is paused', async () => {
  const { h, a, reply, job } = await setup();
  await h.messaging('pause', { sessionHash: a.sessionHash });
  assert.equal((await reply('While paused')).ok, true);
  await sendsThrough(h, job('While paused'));
});

test('the owner can reply after taking the chat over', async () => {
  const { h, a, person, reply, job } = await setup();
  await h.messaging('takeover', { sessionHash: a.sessionHash, conversationId: person._id });
  assert.equal((await reply('Taken over')).ok, true);
  await sendsThrough(h, job('Taken over'));
});

test('the owner can reply even when Layla has no control record for the channel', async () => {
  const { h, reply, job } = await setup();
  // A disconnect or a lost activation removes the control row while chats remain.
  for (const c of h.m.table('blueMessagingControls')) await h.m.db.delete(c._id);
  assert.equal(h.m.table('blueMessagingControls').length, 0);
  const r = await reply('No control row');
  assert.equal(r.ok, true, r.reason);
  await sendsThrough(h, job('No control row'));
});

test('refusals name the real reason', async () => {
  let s = await setup();
  s.h.m.advance(DAY + 1000);
  assert.equal((await s.reply()).reason, 'window_closed');

  s = await setup();
  await s.h.m.db.patch(s.person._id, { optout: true });
  assert.equal((await s.reply()).reason, 'contact_opted_out');

  s = await setup();
  const global = s.h.m.table('blueMessagingSettings').find(r => r.key === 'global');
  await s.h.m.db.patch(global._id, { enabled: false });
  assert.equal((await s.reply()).reason, 'messaging_paused_by_operator');

  s = await setup();
  await s.h.m.db.patch(s.a.rowId, { status: 'reconciliation_required' });
  assert.equal((await s.reply()).reason, 'connection_not_ready');
});
