// Hasib HTTP boundary: sign-in, gates, origin/CSRF, per-action argument
// allow-lists, body caps, and a tenant taken only from the session.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHasibApi, hasibAvailable } from '../api/_lib/hasib/hasib-api.js';
import { BLUE_CLOUD } from '../api/_lib/convex.js';
import { SECRET } from './helpers/convex-memory.mjs';

const response = () => ({ headers: {}, getHeader(k) { return this.headers[k]; }, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.statusCode = n; }, end(v) { this.body = JSON.parse(v); } });
const env = { CONVEX_CLOUD_URL: BLUE_CLOUD, BLUE_REVIEW_SERVICE_SECRET: SECRET, BLUE_ACCOUNT_SAVE_ENABLED: 'true', BLUE_DASHBOARD_ENABLED: 'true', BLUE_HASIB_ENABLED: 'true' };
const request = (method, body, headers = {}) => ({ method, headers: { host: 'bznsflow-blue.vercel.app', origin: 'https://bznsflow-blue.vercel.app',
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
  assert.deepEqual(calls.at(-1), { operation: 'orders', args: { sessionHash: 'd'.repeat(64), status: 'pending' } });
  await run(request('GET'));
  assert.deepEqual(calls.at(-1), { operation: 'overview', args: { sessionHash: 'd'.repeat(64) } });
});

test('order and payment arguments are shaped, bounded and typed before Convex sees them', async () => {
  const { calls, run } = harness();
  await run(request('POST', { action: 'order_create', requestId: UUID, channel: 'whatsapp', confirm: 'yes', conversationId: 'blueConversations_1',
    lines: [{ variantId: 'hasibVariants_1', qty: 2, unitPriceMinor: 25000, hack: true }, { name: 'Hemming', qty: 1, unitPriceMinor: 2000 }],
    fulfilment: { type: 'delivery', area: 'Al Khuwair', extra: 1 }, customFields: [{ key: 'measurements', value: '56/58' }], deliveryFeeMinor: 1500 }));
  assert.deepEqual(calls.at(-1).args, { sessionHash: 'd'.repeat(64), requestId: UUID, channel: 'whatsapp', confirm: false, conversationId: 'blueConversations_1',
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
