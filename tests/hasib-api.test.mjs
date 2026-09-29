// Hasib HTTP boundary: sign-in, gates, origin/CSRF, per-action argument
// allow-lists, body caps, and a tenant taken only from the session.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHasibApi, hasibAvailable, sendTeamInvitation } from '../api/_lib/hasib/hasib-api.js';
import { BLUE_CLOUD } from '../api/_lib/convex.js';
import { SECRET } from './helpers/convex-memory.mjs';

const response = () => ({ headers: {}, getHeader(k) { return this.headers[k]; }, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.statusCode = n; }, end(v) { this.body = JSON.parse(v); } });
const env = { CONVEX_CLOUD_URL: BLUE_CLOUD, BLUE_REVIEW_SERVICE_SECRET: SECRET, BLUE_ACCOUNT_SAVE_ENABLED: 'true', BLUE_DASHBOARD_ENABLED: 'true', BLUE_HASIB_ENABLED: 'true' };
const request = (method, body, headers = {}, url = '/api/layla-meta?surface=hasib') => ({ method, url, headers: { host: 'bznsflow-blue.vercel.app', origin: 'https://bznsflow-blue.vercel.app',
  cookie: `__Host-blue_account=${'f'.repeat(64)}; bf_csrf=${'e'.repeat(64)}`, 'x-csrf-token': 'e'.repeat(64), ...headers }, body });
const signedIn = { accounts: async () => ({ id: 'acct', email: 'a@example.com', draftHash: 'd'.repeat(64) }) };
const UUID = '0b6f6c7e-8f4a-4d3b-9c2e-1a2b3c4d5e6f';

function harness(options = {}) {
  const calls = [];
  const store = async (operation, args) => { calls.push({ operation, args }); return { items: [], operation }; };
  const run = async req => { const res = response(); await createHasibApi({ env, store, ...signedIn, ...options })(req, res); return res; };
  return { calls, run };
}

test('Hasib is available only with the dashboard, account saving and its own flag', () => {
  assert.equal(hasibAvailable(env), true);
  assert.equal(hasibAvailable({ ...env, BLUE_HASIB_ENABLED: 'false' }), false);
  assert.equal(hasibAvailable({ ...env, BLUE_DASHBOARD_ENABLED: 'false' }), false);
});

test('team invitation email points the verified employee to the existing sign-in flow', async () => {
  let sent;
  const mailEnv = { ...env, BLUE_RESEND_API_KEY: 're_1234567890abc', BLUE_AUTH_FROM: 'BznsFlow <auth@bznsflowai.com>' };
  await sendTeamInvitation({ member: { id: 'member_1', email: 'employee@example.com', invitedAt: 123 }, env: mailEnv, fetcher: async (url, init) => {
    sent = { url, init, body: JSON.parse(init.body) };
    return { ok: true, json: async () => ({ id: 'email_1' }) };
  } });
  assert.equal(sent.body.to[0], 'employee@example.com');
  assert.match(sent.body.text, /layla\/dashboard/);
  assert.equal(sent.init.headers['Idempotency-Key'], 'ascend-invite/member_1/123');
});

test('the API requires sign-in, a saved setup, its flag, the Blue origin and CSRF', async () => {
  assert.equal((await harness({ accounts: async () => null }).run(request('GET'))).statusCode, 401);
  assert.equal((await harness({ accounts: async () => ({ id: 'x', email: 'e', draftHash: null }) }).run(request('GET'))).body.reason, 'setup_required');
  assert.equal((await harness({ env: { ...env, BLUE_HASIB_ENABLED: 'false' } }).run(request('GET'))).statusCode, 503);
  const { run } = harness();
  assert.equal((await run(request('POST', { action: 'items' }, { origin: 'https://evil.invalid' }))).statusCode, 403);
  assert.equal((await run(request('POST', { action: 'items' }, { host: 'evil.invalid' }))).statusCode, 403);
  assert.equal((await run(request('POST', { action: 'items' }, { 'x-csrf-token': 'bad' }))).statusCode, 403);
  assert.equal((await run(request('POST', { action: 'drop_tables' }))).body.reason, 'invalid_action');
  assert.equal((await run(request('PUT', {}))).statusCode, 405);
});

test('the tenant comes from the session; smuggled tenant fields and unknown keys are dropped', async () => {
  const { calls, run } = harness();
  const res = await run(request('POST', { action: 'orders', status: 'pending', sessionHash: 'a'.repeat(64), accountId: 'other', integrationId: 'x', evil: 1 }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls.at(-1), { operation: 'orders', args: { sessionHash: 'd'.repeat(64), actorAccountId: 'acct', status: 'pending' } });
  await run(request('GET'));
  assert.deepEqual(calls.at(-1), { operation: 'overview', args: { sessionHash: 'd'.repeat(64), actorAccountId: 'acct' } });
});

test('order and payment arguments are shaped, bounded and typed before Convex sees them', async () => {
  const { calls, run } = harness();
  await run(request('POST', { action: 'order_create', requestId: UUID, channel: 'whatsapp', confirm: 'yes', conversationId: 'blueConversations_1',
    lines: [{ variantId: 'hasibVariants_1', qty: 2, unitPriceMinor: 25000, hack: true }, { name: 'Hemming', qty: 1, unitPriceMinor: 2000 }],
    fulfilment: { type: 'delivery', area: 'Al Khuwair', extra: 1 }, customFields: [{ key: 'measurements', value: '56/58' }], deliveryFeeMinor: 1500 }));
  assert.deepEqual(calls.at(-1).args, { sessionHash: 'd'.repeat(64), actorAccountId: 'acct', requestId: UUID, channel: 'whatsapp', confirm: false, conversationId: 'blueConversations_1',
    lines: [{ variantId: 'hasibVariants_1', qty: 2, unitPriceMinor: 25000 }, { name: 'Hemming', qty: 1, unitPriceMinor: 2000 }],
    fulfilment: { type: 'delivery', area: 'Al Khuwair' }, customFields: [{ key: 'measurements', value: '56/58' }], deliveryFeeMinor: 1500 });
  await run(request('POST', { action: 'payment_record', requestId: UUID, orderId: 'hasibOrders_1', amountMinor: '5000', method: 'cash' }));
  assert.equal(calls.at(-1).args.amountMinor, undefined, 'strings are not coerced into money');
  assert.equal((await run(request('POST', { action: 'order_create', requestId: 'not-a-uuid', channel: 'whatsapp', lines: [] }))).body.reason, 'invalid_request');
  assert.equal((await run(request('POST', { action: 'order', orderId: '../../etc' }))).body.reason, 'invalid_request');
});

test('oversized bodies are refused before any backend call', async () => {
  const { calls, run } = harness();
  const res = await run(request('POST', { action: 'items', search: 'x'.repeat(7000) }));
  assert.equal(res.statusCode, 413);
  assert.equal(calls.length, 0);
});

test('the founder real dashboard reads the account store without synthetic data', async () => {
  const founder = { accounts: async () => ({ id: 'founder', email: 'ahmed@bznsflowai.com', draftHash: 'd'.repeat(64) }) };
  const { calls, run } = harness(founder);
  const live = await run(request('GET'));
  assert.equal(live.statusCode, 200);
  assert.equal(live.body.synthetic, undefined);
  assert.deepEqual(calls, [{ operation: 'overview', args: { sessionHash: 'd'.repeat(64), actorAccountId: 'founder' } }]);
});

test('only the founder can switch a live dashboard from the dashboard selector', async () => {
  const founder = { accounts: async () => ({ id: 'founder', email: 'ahmed@bznsflowai.com', draftHash: 'd'.repeat(64) }) };
  const { calls, run } = harness(founder);
  const changed = await run(request('POST', { action: 'settings_update', packId: 'dental' }));
  assert.equal(changed.statusCode, 200);
  assert.deepEqual(calls, [{ operation: 'settings_update', args: { sessionHash: 'd'.repeat(64), actorAccountId: 'founder', packId: 'dental' } }]);
});

test('founder previews use empty read-only data and cannot replace a live dashboard', async () => {
  const founder = { accounts: async () => ({ id: 'founder', email: '  AHMED@BZNSFLOWAI.COM ', draftHash: 'd'.repeat(64) }) };
  const { calls, run } = harness(founder);
  const preview = await run(request('GET', undefined, {}, '/api/layla-meta?surface=hasib&previewIndustry=beauty'));
  assert.equal(preview.statusCode, 200);
  assert.equal(preview.body.synthetic, true);
  assert.equal(preview.body.readOnly, true);
  assert.equal(preview.body.pack.id, 'beauty');
  assert.equal(calls.length, 0, 'preview never reads the account Hasib store');
  const data = await run(request('POST', { action: 'today', previewIndustry: 'beauty' }));
  assert.equal(data.body.synthetic, true);
  assert.equal(data.body.industryMetrics.length, 3);
  assert.deepEqual(data.body.industryMetrics.map(metric => metric.value), [0, 0, 0]);
  assert.equal((await run(request('POST', { action: 'order_create', previewIndustry: 'beauty' }))).body.reason, 'preview_read_only');
  assert.equal((await run(request('GET', undefined, {}, '/api/layla-meta?surface=hasib&previewIndustry=retail-tech'))).body.reason, 'preview_not_available');
  assert.equal((await run(request('POST', { action: 'today', previewIndustry: 'travel' }))).body.reason, 'preview_not_available');
  assert.equal(calls.length, 0);
});

test('a non-founder cannot forge a preview pack or founder identity in the request', async () => {
  const { calls, run } = harness();
  const result = await run(request('POST', { action: 'today', previewIndustry: 'beauty', email: 'ahmed@bznsflowai.com', founder: true }));
  assert.equal(result.statusCode, 403);
  assert.equal(result.body.reason, 'preview_forbidden');
  assert.equal(calls.length, 0);
});

test('regular users cannot switch industries through the old Hasib settings API', async () => {
  const { calls, run } = harness();
  const result = await run(request('POST', { action: 'settings_update', packId: 'retail-tech' }));
  assert.equal(result.statusCode, 409);
  assert.equal(result.body.reason, 'industry_profile_required');
  assert.equal(calls.length, 0);
});
