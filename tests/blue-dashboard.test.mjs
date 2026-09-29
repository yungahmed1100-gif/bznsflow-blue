import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { blueHarness, seedTenant } from './helpers/blue-tenant.mjs';
import { SECRET } from './helpers/convex-memory.mjs';
import { displayName } from '../convex/blueContacts.js';
import { createDashboardApi } from '../api/_lib/layla/dashboard-api.js';
import { BLUE_CLOUD } from '../api/_lib/convex.js';

async function twoTenants() {
  const h = blueHarness();
  await h.enable();
  const a = await seedTenant(h.m, { name: 'a' });
  const b = await seedTenant(h.m, { name: 'b', phone: '9999', waba: '8888', sender: '96890000001' });
  await h.m.db.insert('blueEntitlements', { accountId: a.accountId, plan: 'ascend', status: 'active', grantedAt: h.m.now() });
  await h.m.db.insert('blueEntitlements', { accountId: b.accountId, plan: 'ascend', status: 'active', grantedAt: h.m.now() });
  await h.messaging('activate', { sessionHash: a.sessionHash });
  await h.messaging('activate', { sessionHash: b.sessionHash });
  return { h, a, b };
}

test('dashboard lists, threads, edits, deletes and exports only the signed-in tenant', async () => {
  const { h, a, b } = await twoTenants();
  await h.inbound(a, { from: '96891111111', text: 'Do you have villas?' });
  await h.inbound(b, { from: '96892222222', text: 'Hello from B' });
  const listA = (await h.dashboard('conversations', { sessionHash: a.sessionHash })).value.items;
  assert.equal(listA.length, 1);
  assert.equal(listA[0].contact.number, '96891111111');
  const listB = (await h.dashboard('conversations', { sessionHash: b.sessionHash })).value.items;
  const foreignConversation = listB[0].id, foreignContact = listB[0].contact.id;
  for (const [operation, args] of [['thread', { conversationId: foreignConversation }], ['export_chat', { conversationId: foreignConversation }]]) {
    assert.equal((await h.dashboard(operation, { sessionHash: a.sessionHash, ...args })).reason, 'conversation_not_found', operation);
  }
  assert.equal((await h.dashboard('contact_update', { sessionHash: a.sessionHash, contactId: foreignContact, patch: { ownerName: 'Stolen' } })).reason, 'contact_not_found');
  assert.equal((await h.dashboard('contact_delete', { sessionHash: a.sessionHash, contactId: foreignContact, confirm: true })).reason, 'contact_not_found');
  // A message id is not a conversation id, even inside the same tenant.
  const [message] = h.m.table('blueMessages').filter(r => r.accountId === a.accountId);
  assert.equal((await h.dashboard('thread', { sessionHash: a.sessionHash, conversationId: message._id })).reason, 'conversation_not_found');
  const contactsA = (await h.dashboard('contacts', { sessionHash: a.sessionHash })).value.items;
  assert.deepEqual(contactsA.map(c => c.number), ['96891111111']);
  const exported = JSON.stringify((await h.dashboard('export_account', { sessionHash: a.sessionHash })).value);
  assert(!exported.includes('Hello from B') && exported.includes('Do you have villas?'));
  assert.equal((await h.dashboard('overview', { sessionHash: 'f'.repeat(64) })).reason, 'sign_in_required');
});

test('name priority is owner edit, then customer-provided name, then WhatsApp profile, then number', async () => {
  const { h, a } = await twoTenants();
  await h.inbound(a, { from: '96893333333', text: 'Hi', intent: 'greeting' });
  let contact = h.m.table('blueContacts')[0];
  assert.deepEqual(displayName(contact), { name: '+96893333333', source: 'number' });
  await h.inbound(a, { from: '96893333333', text: 'Hello there', profileName: 'Sara WA' });
  contact = h.m.table('blueContacts')[0];
  assert.deepEqual(displayName(contact), { name: 'Sara WA', source: 'whatsapp' });
  await h.inbound(a, { from: '96893333333', text: 'My name is Sara Ahmed and I want to rent' });
  contact = h.m.table('blueContacts')[0];
  assert.deepEqual(displayName(contact), { name: 'Sara Ahmed', source: 'customer' });
  const edited = await h.dashboard('contact_update', { sessionHash: a.sessionHash, contactId: contact._id, patch: { ownerName: 'Sara (VIP)' } });
  assert.equal(edited.value.contact.name, 'Sara (VIP)');
  assert.equal(edited.value.contact.nameSource, 'owner');
  await h.inbound(a, { from: '96893333333', text: 'my name is Someone Else', profileName: 'Another' });
  assert.equal(displayName(h.m.table('blueContacts')[0]).name, 'Sara (VIP)');
});

test('pre-dashboard conversations are linked lazily and paginate without repeats', async () => {
  const { h, a } = await twoTenants();
  for (let i = 0; i < 30; i++) {
    h.m.advance(1000);
    await h.m.db.insert('blueConversations', { key: `${a.integration.id}:9689000${String(i).padStart(4, '0')}`, integrationId: a.integration.id, accountId: a.accountId,
      number: `9689000${String(i).padStart(4, '0')}`, lastInbound: h.m.now(), takeover: false, optout: i === 3, updatedAt: h.m.now() });
  }
  assert.equal((await h.dashboard('overview', { sessionHash: a.sessionHash })).value.migrationPending, true);
  const first = (await h.dashboard('conversations', { sessionHash: a.sessionHash, limit: 20 })).value;
  const second = (await h.dashboard('conversations', { sessionHash: a.sessionHash, limit: 20, cursor: first.cursor })).value;
  const ids = [...first.items, ...second.items].map(i => i.id);
  assert.equal(ids.length, 30);
  assert.equal(new Set(ids).size, 30);
  assert.equal(second.cursor, null);
  assert.equal(h.m.table('blueConversations').filter(r => !r.contactId).length, 0);
  assert.equal((await h.dashboard('overview', { sessionHash: a.sessionHash })).value.migrationPending, false);
  // A legacy opt-out survives linking.
  assert.equal(h.m.table('blueContacts').find(c => c.waId === '96890000003').optout, true);
});

test('deleting a contact removes readable data, keeps a hashed opt-out tombstone and never revives sends', async () => {
  const { h, a } = await twoTenants();
  await h.inbound(a, { from: '96894444444', text: 'I want to buy a villa in Seeb', profileName: 'Khalid' });
  const job = h.m.table('blueMessages').find(r => r.direction === 'out');
  await h.m.db.patch(job._id, { status: 'attempting' });
  await h.inbound(a, { from: '96894444444', text: 'stop', intent: 'optout', reply: null });
  const contact = h.m.table('blueContacts')[0];
  assert.equal(contact.optout, true);
  assert.equal((await h.dashboard('contact_delete', { sessionHash: a.sessionHash, contactId: contact._id })).reason, 'confirmation_required');
  assert.equal((await h.dashboard('contact_delete', { sessionHash: a.sessionHash, contactId: contact._id, confirm: true })).ok, true);
  const tomb = h.m.table('blueContacts')[0];
  assert.equal(tomb.state, 'deleted');
  assert.equal(tomb.optout, true);
  for (const key of ['waId', 'ownerName', 'customerName', 'profileName', 'searchText']) assert.equal(tomb[key], undefined, key);
  assert.equal(JSON.stringify(tomb).includes('96894444444'), false);
  assert.equal(h.m.table('blueConversations').length, 0);
  const kept = h.m.table('blueMessages');
  assert.deepEqual(kept.map(r => [r.status, r.text]), [['attempting', undefined]]);
  // The same customer writing again is a new contact that inherits the opt-out.
  await h.inbound(a, { from: '96894444444', text: 'Hello again' });
  const fresh = h.m.table('blueContacts').find(c => c.state === 'active');
  assert.equal(fresh.optout, true);
  assert.equal(fresh.consent.status, 'revoked');
  assert.equal(h.m.table('blueMessages').filter(r => r.direction === 'out' && r.status === 'queued').length, 0);
});

test('exports carry only readable retained data and no internal identifiers or credentials', async () => {
  const { h, a } = await twoTenants();
  await h.inbound(a, { from: '96895555555', text: 'Villa for rent please' });
  const person = h.m.table('blueConversations')[0];
  h.m.advance(31 * 86400000);
  await h.inbound(a, { from: '96895555555', text: 'Still interested' });
  const chat = (await h.dashboard('export_chat', { sessionHash: a.sessionHash, conversationId: person._id })).value;
  const json = JSON.stringify(chat) + JSON.stringify((await h.dashboard('export_contacts', { sessionHash: a.sessionHash })).value);
  // The 31-day-old exchange is gone; only retained text is exported.
  assert.equal(chat.messages.length, 2);
  assert.equal(chat.messages[0].text, 'Still interested');
  assert.match(chat.messages[1].text, /^Thanks/);
  // A filler reply to a month-old question is not captured as the area.
  assert.equal(h.m.table('blueContacts')[0].fields.some(f => f.value === 'Still interested'), false);
  for (const secret of [a.integration.id, a.sessionHash, h.m.table('blueContacts')[0].numberHash, person._id, 'credential', a.accountId, 'providerId']) {
    assert.equal(json.includes(secret), false, `export leaked ${secret}`);
  }
});

test('new message text is retained for 30 days and expired text cannot be restored', async () => {
  const { h, a } = await twoTenants();
  await h.inbound(a, { text: 'Retention check' });
  const incoming = h.m.table('blueMessages').find(r => r.direction === 'in');
  assert.equal(incoming.textExpiresAt - incoming.at, 30 * 86400000);
  const thread = (await h.dashboard('thread', { sessionHash: a.sessionHash, conversationId: incoming.conversationId })).value;
  assert.equal(thread.messages[0].text, 'Retention check');
  await h.m.db.patch(incoming._id, { textExpiresAt: h.m.now() - 1 });
  const expired = (await h.dashboard('thread', { sessionHash: a.sessionHash, conversationId: incoming.conversationId })).value;
  assert.equal(expired.messages[0].text, null);
  assert.equal(expired.messages[0].textExpired, true);
});

test('leave-this-chat blocks queued bot replies, resume never replays them, and owner replies need the 24-hour window', async () => {
  const { h, a } = await twoTenants();
  await h.inbound(a, { from: '96896666666', text: 'What services?' });
  const person = h.m.table('blueConversations')[0];
  const queued = h.m.table('blueMessages').find(r => r.direction === 'out');
  assert.equal(queued.status, 'queued');
  await h.messaging('takeover', { sessionHash: a.sessionHash, conversationId: person._id });
  assert.equal((await h.m.db.get(queued._id)).status, 'blocked');
  await h.messaging('resume_conversation', { sessionHash: a.sessionHash, conversationId: person._id });
  assert.equal((await h.m.db.get(queued._id)).status, 'blocked');
  assert.equal((await h.messaging('claim', { jobId: queued._id, intent: 'x' })).value, null);
  const item = (await h.dashboard('conversations', { sessionHash: a.sessionHash })).value.items[0];
  assert.equal(item.windowOpenUntil, person.lastInbound + 86400000);
  h.m.advance(86400001);
  assert.equal((await h.messaging('manual_reply', { sessionHash: a.sessionHash, conversationId: person._id, text: 'Late reply', requestId: randomUUID() })).reason, 'window_closed');
});

const response = () => ({ headers: {}, getHeader(k) { return this.headers[k]; }, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.statusCode = n; }, end(v) { this.body = JSON.parse(v); } });
const apiEnv = { CONVEX_CLOUD_URL: BLUE_CLOUD, BLUE_REVIEW_SERVICE_SECRET: SECRET, BLUE_ACCOUNT_SAVE_ENABLED: 'true', BLUE_DASHBOARD_ENABLED: 'true', LAYLA_CREDENTIAL_ENCRYPTION_KEY: 'b'.repeat(64) };
const request = (method, body, headers = {}) => ({ method, headers: { host: 'bznsflow-blue.vercel.app', origin: 'https://bznsflow-blue.vercel.app', cookie: `__Host-blue_account=${'f'.repeat(64)}; bf_csrf=${'e'.repeat(64)}`, 'x-csrf-token': 'e'.repeat(64), ...headers }, body });

test('dashboard API requires sign-in, a saved setup, its gate and CSRF, and derives the tenant from the session only', async () => {
  const calls = [];
  const store = async (operation, args) => { calls.push({ operation, args }); return operation === 'overview' ? { messaging: { broadcastAvailable: true }, connected: true } : { items: [] }; };
  const run = async (options, req) => { const res = response(); await createDashboardApi({ env: apiEnv, store, ...options })(req, res); return res; };
  assert.equal((await run({ accounts: async () => null }, request('GET'))).statusCode, 401);
  assert.equal((await run({ accounts: async () => ({ id: 'acct', email: 'a@example.com', draftHash: null }) }, request('GET'))).body.reason, 'setup_required');
  const signedIn = { accounts: async () => ({ id: 'acct', email: 'a@example.com', draftHash: 'd'.repeat(64) }) };
  const off = response();
  await createDashboardApi({ env: { ...apiEnv, BLUE_DASHBOARD_ENABLED: 'false' }, store, ...signedIn })(request('GET'), off);
  assert.equal(off.statusCode, 503);
  assert.equal((await run(signedIn, request('POST', { action: 'contacts' }, { origin: 'https://evil.invalid' }))).statusCode, 403);
  assert.equal((await run(signedIn, request('POST', { action: 'contacts' }, { 'x-csrf-token': 'bad' }))).statusCode, 403);
  const ok = await run(signedIn, request('POST', { action: 'contacts', sessionHash: 'a'.repeat(64), accountId: 'other', integrationId: 'other' }));
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(calls.at(-1), { operation: 'contacts', args: { sessionHash: 'd'.repeat(64), actorAccountId: 'acct' } });
  assert.equal((await run(signedIn, request('POST', { action: 'sync_templates' }))).body.reason, 'broadcast_unavailable');
  const overview = await run(signedIn, request('GET'));
  assert.equal(overview.body.broadcastEnabled, false);
  assert.equal(overview.body.founderPreview, false);
  const founder = await run({ accounts: async () => ({ id: 'founder', email: ' AHMED@BZNSFLOWAI.COM ', draftHash: 'd'.repeat(64) }) }, request('GET'));
  assert.equal(founder.body.founderPreview, true, 'founder capability comes from the authenticated normalized email');
  // Vercel gate on, durable Convex gate off: templates may sync, campaigns stay off.
  const apiOn = response();
  await createDashboardApi({ env: { ...apiEnv, BLUE_BROADCAST_ENABLED: 'true', BLUE_LIVE_MESSAGING_ENABLED: 'true' }, store: async op => op === 'overview' ? { messaging: { broadcastAvailable: false } } : { templates: [] }, ...signedIn })(request('GET'), apiOn);
  assert.deepEqual([apiOn.body.broadcastApiEnabled, apiOn.body.broadcastEnabled], [true, false]);
});
