// Catalyst is what a customer can buy today: Layla on WhatsApp and/or Instagram with
// chats, customers, handoff, business details and channel setup. These journeys run
// the real Convex state code for a Layla-only account (no plan grant) and pin down
// both what it can do and what the server must refuse.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { blueHarness, seedTenant } from './helpers/blue-tenant.mjs';
import { SECRET } from './helpers/convex-memory.mjs';
import { executeHasib } from '../convex/hasib/hasibState.js';
import { dashboardGate } from '../convex/blueDashboardGate.js';
import { capabilitiesFor } from '../convex/hasib/capabilities.js';
import { dashboardMap } from '../src/lib/dashboard/navigation.js';
import { dashboardPermissions } from '../src/lib/dashboard/permissions.js';

async function catalyst() {
  const h = blueHarness();
  await h.enable();
  await h.m.db.insert('blueMessagingSettings', { key: 'hasib', enabled: true });
  const a = await seedTenant(h.m, { name: 'a' });
  await h.messaging('activate', { sessionHash: a.sessionHash });
  return { h, a };
}

test('a Layla-only account is Catalyst: chats, customers and handoff, no operations or bulk tools', async () => {
  const { h, a } = await catalyst();
  const o = (await h.dashboard('overview', { sessionHash: a.sessionHash })).value;
  assert.equal(o.plan, 'catalyst');
  assert.equal(o.workspaceRole, 'manager');
  for (const key of ['chats', 'customers', 'customerDelete', 'humanHandoff', 'businessDetails', 'channelsSetup']) assert.equal(o.capabilities[key], true, key);
  for (const key of ['operations', 'money', 'insights', 'approvals', 'exports', 'imports', 'broadcasts', 'team']) assert.notEqual(o.capabilities[key], true, key);
  const hasib = await executeHasib(h.m.ctx, { operation: 'overview', sessionHash: a.sessionHash, hashSecret: SECRET }, h.m.now());
  assert.equal(hasib.reason, 'plan_required');
});

test('the Catalyst owner journey: a customer writes, the owner reads, takes over, replies, hands back and edits the customer', async () => {
  const { h, a } = await catalyst();
  await h.inbound(a, { from: '96891111111', text: 'Do you deliver to Seeb?', profileName: 'Aisha' });
  const [chat] = (await h.dashboard('conversations', { sessionHash: a.sessionHash })).value.items;
  assert.equal(chat.contact.number, '96891111111');
  const thread = (await h.dashboard('thread', { sessionHash: a.sessionHash, conversationId: chat.id })).value;
  assert.ok(thread.messages.some(m => m.text === 'Do you deliver to Seeb?'));

  assert.equal((await h.messaging('takeover', { sessionHash: a.sessionHash, conversationId: chat.id })).ok, true);
  const requestId = randomUUID();
  const reply = () => h.messaging('manual_reply', { sessionHash: a.sessionHash, conversationId: chat.id, text: 'Yes, tomorrow.', requestId });
  assert.equal((await reply()).ok, true);
  assert.equal((await reply()).ok, true, 'a double-clicked send is accepted once');
  assert.equal(h.m.table('blueMessages').filter(m => m.manual && m.text === 'Yes, tomorrow.').length, 1, 'and queues exactly one reply');
  assert.equal((await h.messaging('resume_conversation', { sessionHash: a.sessionHash, conversationId: chat.id })).ok, true);

  const edited = await h.dashboard('contact_update', { sessionHash: a.sessionHash, contactId: chat.contact.id, patch: { ownerName: 'Aisha (Seeb)' } });
  assert.equal(edited.value.contact.name, 'Aisha (Seeb)');
  assert.equal((await h.dashboard('contact_delete', { sessionHash: a.sessionHash, contactId: chat.contact.id })).reason, 'confirmation_required');
  assert.equal((await h.dashboard('contact_delete', { sessionHash: a.sessionHash, contactId: chat.contact.id, confirm: true })).ok, true);
  assert.deepEqual((await h.dashboard('contacts', { sessionHash: a.sessionHash })).value.items, []);
});

test('the server refuses Catalyst exports, imports and broadcasts with plan_required', async () => {
  const { h, a } = await catalyst();
  await h.inbound(a, { from: '96891111111', text: 'Hello' });
  const [chat] = (await h.dashboard('conversations', { sessionHash: a.sessionHash })).value.items;
  for (const [operation, args] of [['export_chat', { conversationId: chat.id }], ['export_contacts', {}], ['export_account', {}]]) {
    assert.equal((await h.dashboard(operation, { sessionHash: a.sessionHash, ...args })).reason, 'plan_required', operation);
  }
  const caps = capabilitiesFor('catalyst');
  for (const operation of ['import_contacts', 'templates', 'campaign_preview', 'campaign_create', 'campaign_cancel']) {
    assert.equal(dashboardGate(operation, caps, 'manager'), 'plan_required', operation);
  }
  assert.equal(dashboardGate('conversations', caps, 'manager'), null);
  const ascend = capabilitiesFor('ascend');
  assert.equal(dashboardGate('import_contacts', ascend, 'manager'), null);
  assert.equal(dashboardGate('import_contacts', capabilitiesFor('ascend', 'employee'), 'employee'), 'manager_required');
});

test('the Catalyst dashboard shows only Chats, Customers and Settings, and hides every gated control', () => {
  const caps = capabilitiesFor('catalyst');
  const map = dashboardMap(null, caps);
  assert.deepEqual(map.sections, ['chats', 'customers', 'settings']);
  assert.deepEqual(map.views.customers, ['contacts']);
  const p = dashboardPermissions({ capabilities: caps, workspaceRole: 'manager' });
  assert.deepEqual(p, { canExport: false, canImport: false, canBroadcast: false, canDeleteCustomer: true });
  const ascend = dashboardPermissions({ capabilities: capabilitiesFor('ascend'), workspaceRole: 'manager' });
  assert.deepEqual(ascend, { canExport: true, canImport: true, canBroadcast: true, canDeleteCustomer: true });
  const employee = dashboardPermissions({ capabilities: capabilitiesFor('ascend', 'employee'), workspaceRole: 'employee' });
  assert.equal(employee.canExport, false);
  assert.equal(employee.canImport, false);
  assert.equal(employee.canDeleteCustomer, false, 'the server denies contact_delete to employees');
});

// Codes only the webhook, worker or email sender can produce; an owner never sees them.
const INTERNAL_CODES = new Set(['invalid_envelope', 'invalid_job', 'invalid_state', 'too_many_bindings', 'too_many_events', 'method', 'email', 'code_invalid']);
const OWNER_CODES = ['plan_required', 'manager_required', 'confirmation_required', 'workspace_access_revoked', 'session_expired', 'csrf', 'origin', 'body_too_large', 'invalid_action',
  'invalid_timezone', 'invalid_search', 'messaging_unavailable', 'account_unavailable', 'send_failed', 'echo_pending', 'profile_changed', 'instagram_reconnect_required', 'instagram_subscription_failed',
  'sign_in_required', 'setup_required', 'connection_not_ready', 'reply_not_allowed', 'window_closed', 'contact_opted_out', 'contact_not_found', 'dashboard_unavailable', 'invalid_phone', 'invalid_import'];

test('every refusal an owner can meet has its own message in English and Arabic, never the generic retry', async () => {
  const { createStrings } = await import('../src/lib/dashboard/strings.js');
  for (const lang of ['en', 'ar']) {
    const s = createStrings(lang), generic = s.reason('__unknown__');
    for (const code of OWNER_CODES) {
      assert.ok(!INTERNAL_CODES.has(code), code);
      assert.notEqual(s.reason(code), generic, `${lang}: ${code}`);
    }
  }
  const { createStrings: c } = await import('../src/lib/dashboard/strings.js');
  assert.match(c('en').reason('plan_required'), /plan/i, 'a plan refusal says it is about the plan, not a retry');
});
