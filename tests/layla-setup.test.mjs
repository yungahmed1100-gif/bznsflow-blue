import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initialState } from '../api/_lib/layla/domain.js';
import { APPROVED, activate, prepareActivation, activationGate, recoverSubscription } from '../api/_lib/layla/activation.js';
import { checkMetaReadiness, WEBHOOK_URL } from '../api/_lib/layla/readiness.js';
import { previewTest, confirmTest, stopTest, acceptTestEvents, testView, TEST_TIMEOUT, TEST_TRANSPORT_ENABLED } from '../api/_lib/layla/supervised.js';
import { createHandler as activationApi } from '../api/_lib/layla/activation-api.js';
import { createHandler as testApi } from '../api/_lib/layla/test-api.js';
import { createHandler as ownerApi } from '../api/layla-meta.js';
const c = { ...APPROVED, mode: 'mock', kill: true, owner: '11111111-1111-4111-8111-111111111111', missing: [], token: 'SECRET_TOKEN', secret: 'SECRET_APP', verify: 'SECRET_VERIFY' };
const NOW = 1000000000000, recipient = '96899999999';
test('Blue documents omit marketing scripts and analytics storage completely', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('fbevents.js'));
  assert.equal(script, undefined);
  assert(!html.includes('facebook.com/tr?'));
  assert(!html.includes('bf_uid'));
});
export function memory() {
  let state = initialState(c), revision = 0;
  state.profile = { sector: 'Test', services: 'Approved services', humanContact: 'test@example.test', reviewed: true };
  return { async read() { return { state: structuredClone(state), revision }; }, async cas(_, r, s) { if (r !== revision) return false; state = structuredClone(s); revision++; return true; }, get state() { return structuredClone(state); } };
}
const ok = body => ({ ok: true, text: async () => JSON.stringify(body) });
function provider(url) {
  const path = new URL(url).pathname;
  if (path.endsWith('/register') || path.endsWith('/subscribed_apps') && typeof url === 'string') return ok({ success: true });
  if (path.endsWith(`/${c.waba}`)) return ok({ id: c.waba });
  if (path.endsWith(`/${c.phone}`)) return ok({ id: c.phone, display_phone_number: c.sender, platform_type: 'CLOUD_API' });
  if (path.endsWith('/subscriptions')) return ok({ data: [{ object: 'whatsapp_business_account', active: true, callback_url: WEBHOOK_URL, fields: [{ name: 'messages', version: 'v25.0' }] }] });
  return ok({ data: [{ whatsapp_business_api_data: { id: c.app } }] });
}
const input = { recipient, text: 'services', allowed: true };
async function blockedActivation(store) {
  const { state, revision } = await store.read();
  state.activation = { status: 'blocked', code: 'registration_outcome_unknown', updatedAt: NOW - 120000 };
  await store.cas(c, revision, state);
}
test('subscription recovery verifies identity, posts only subscription, preserves registration evidence', async () => {
  const store = memory(); await blockedActivation(store); let subscribed = false, posts = [];
  const fetcher = async (url, init) => {
    if (init.method === 'POST') { posts.push(String(url)); subscribed = true; return ok({ success: true }); }
    if (String(url).includes('/subscribed_apps') && !subscribed) return ok({ data: [] });
    return provider(url);
  };
  const outcomes = await Promise.allSettled([1, 2].map(() => recoverSubscription({ store, c, now: () => NOW, fetcher })));
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
  assert.deepEqual(posts, [`https://graph.facebook.com/v25.0/${c.waba}/subscribed_apps`]);
  assert.equal(store.state.activation.status, 'ready');
  assert.equal(store.state.activation.originalOutcome.code, 'registration_outcome_unknown');
  await recoverSubscription({ store, c, now: () => NOW, fetcher }); assert.equal(posts.length, 1);
  assert(store.state.paused); assert(!JSON.stringify(store.state).includes(c.token));
});
test('recovery rejects unsafe identities and checks Meta again after unknown subscription outcome', async () => {
  const store = memory(); await blockedActivation(store); let posts = 0;
  const fetcher = async (url, init) => {
    if (init.method === 'POST') { posts++; throw Error(c.token); }
    if (String(url).includes('/subscribed_apps')) return ok({ data: [] });
    return provider(url);
  };
  await recoverSubscription({ store, c, now: () => NOW, fetcher: async (url, init) => String(url).includes(`/${c.phone}?`) ? ok({ id: c.phone, display_phone_number: c.sender, platform_type: 'OTHER' }) : fetcher(url, init) });
  assert.equal(posts, 0);
  await recoverSubscription({ store, c, now: () => NOW, fetcher });
  assert.equal(store.state.activation.code, 'subscription_outcome_unknown'); assert.equal(posts, 1);
  await recoverSubscription({ store, c, now: () => NOW, fetcher: async url => provider(url) });
  assert.equal(store.state.activation.status, 'ready'); assert.equal(posts, 1);
});
test('recovery claim failure and active lease prevent effects; expired lease requires fresh reads', async () => {
  const store = memory(); await blockedActivation(store); let calls = 0;
  await assert.rejects(recoverSubscription({ store: { ...store, cas: async () => false }, c, now: () => NOW, fetcher: async () => { calls++; } }), /storage_contention/);
  assert.equal(calls, 0);
  const { state, revision } = await store.read(); state.activation.recovery = { operation: 'old', leaseUntil: NOW + 1000 }; await store.cas(c, revision, state);
  await assert.rejects(recoverSubscription({ store, c, now: () => NOW }), /recovery_in_progress/);
  await recoverSubscription({ store, c, now: () => NOW + 1001, fetcher: async (url, init) => { assert.equal(init.method, 'GET'); calls++; return provider(url); } });
  assert.equal(calls, 4); assert.equal(store.state.activation.status, 'ready');
});
async function preview(store, body = input) { const { state, revision } = await store.read(); previewTest(state, body, NOW); await store.cas(c, revision, state); return state.supervised.review?.id; }
const lookup = async () => ({ ok: true, account: { id: c.owner } });
function request(body) { return { method: body ? 'POST' : 'GET', body, headers: { host: 'localhost:5173', origin: 'http://localhost:5173', cookie: `bf_session=${'b'.repeat(64)}; bf_csrf=${'a'.repeat(64)}`, 'x-csrf-token': 'a'.repeat(64) } }; }
async function call(h, req) { const res = { headers: {}, status(n) { this.code = n; }, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } }; await h(req, res); return res; }

test('activation requires approved binding and every safeguard', () => {
  const s = memory().state; assert.equal(activationGate(c, s), null);
  for (const key of Object.keys(APPROVED)) assert.equal(activationGate({ ...c, [key]: 'other' }, s), 'unapproved_binding');
  for (const change of [{ mode: 'live' }, { kill: false }]) assert.equal(activationGate({ ...c, ...change }, s), 'safeguards_required');
  assert.equal(activationGate(c, { ...s, paused: false }), 'safeguards_required');
  assert.equal(activationGate({ ...c, missing: ['token'] }, s), 'configuration_missing');
});
test('activation single-use claim serializes concurrent registration; stores no PIN/token', async () => {
  const store = memory(), { challenge } = await prepareActivation(store, c, NOW); let posts = [];
  const options = { store, c, challenge, pin: '654321', now: () => NOW, fetcher: async (url, init) => { if (init.method === 'POST') posts.push([url, JSON.parse(init.body)]); return provider(url); } };
  const results = await Promise.allSettled([activate(options), activate(options)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(posts.length, 2); assert.deepEqual(posts[0][1], { messaging_product: 'whatsapp', pin: '654321' });
  assert.equal(store.state.activation.status, 'ready');
  for (const secret of ['654321', c.token, c.secret, challenge]) assert(!JSON.stringify(store.state).includes(secret));
  assert(store.state.paused); await assert.rejects(activate(options), /activation_already_attempted/);
});
test('PIN type/format, missing challenge, expiration and replacement reject before network', async () => {
  const store = memory(), { challenge } = await prepareActivation(store, c, NOW);
  for (const pin of [123456, '', '12345', '1234567', 'abcdef', '１２３４５６']) await assert.rejects(activate({ store, c, challenge, pin }), /invalid_pin/);
  await assert.rejects(activate({ store, c, challenge, pin: '654321', now: () => NOW + 300000 }), /expired_or_used/);
  await prepareActivation(store, c, NOW);
  await assert.rejects(activate({ store, c, challenge, pin: '654321', now: () => NOW }), /expired_or_used/);
});
test('failed durable claim makes no provider call; crash after claim cannot re-register', async () => {
  const store = memory(), { challenge } = await prepareActivation(store, c, NOW); let calls = 0;
  await assert.rejects(activate({ store: { ...store, cas: async () => { throw Error('storage'); } }, c, challenge, pin: '654321', now: () => NOW, fetcher: async () => { calls++; } }));
  assert.equal(calls, 0);
  let writes = 0;
  const crash = { ...store, async cas(...args) { if (++writes > 1) throw Error('storage'); return store.cas(...args); } };
  await assert.rejects(activate({ store: crash, c, challenge, pin: '654321', now: () => NOW, fetcher: async url => { calls++; return provider(url); } }));
  assert.equal(calls, 1); assert.equal(store.state.activation.status, 'registering');
  await assert.rejects(activate({ store, c, challenge, pin: '654321', now: () => NOW }), /activation_already_attempted/);
});
test('successful effects with unavailable readiness remain unready and never repeat effects', async () => {
  const store = memory(), { challenge } = await prepareActivation(store, c, NOW); let calls = 0;
  await activate({ store, c, challenge, pin: '654321', now: () => NOW, fetcher: async (url, init) => { if (init.method === 'POST') { calls++; return provider(url); } throw Error(c.token); } });
  assert.equal(calls, 2); assert.equal(store.state.activation.status, 'needs_attention'); assert(!store.state.activation.readiness?.ready);
});
test('stop after intent claim blocks even the synthetic transport', async () => {
  const store = memory(), reviewId = await preview(store); let reads = 0, sends = 0;
  const wrapped = { ...store, async read() { if (++reads === 2) { const { state, revision } = await store.read(); stopTest(state); await store.cas(c, revision, state); } return store.read(); } };
  await confirmTest({ store: wrapped, c, reviewId, now: () => NOW, mockSend: async () => { sends++; } });
  assert.equal(sends, 0); assert.equal(store.state.supervised.status, 'stopped');
});
for (const stage of ['registration', 'subscription']) for (const failure of ['reject', 'throw', 'malformed']) test(`${stage} ${failure} is redacted and cannot retry`, async () => {
  const store = memory(), { challenge } = await prepareActivation(store, c, NOW); let count = 0;
  const fetcher = async url => { count++; if (stage === 'subscription' && count === 1) return provider(url); if (failure === 'throw') throw Error(c.token); return failure === 'reject' ? { ok: false, text: () => { throw Error('must not read raw errors'); } } : ok({ error: { message: c.token } }); };
  await activate({ store, c, challenge, pin: '654321', now: () => NOW, fetcher });
  assert.equal(count, stage === 'registration' ? 1 : 2); assert.equal(store.state.activation.status, 'blocked');
  assert(store.state.activation.code.startsWith(stage)); assert(!JSON.stringify(store.state).includes(c.token));
});
test('readiness requires every identity, platform, subscription and webhook condition', async () => {
  assert((await checkMetaReadiness(c, async url => {
    if (new URL(url).pathname.endsWith('/subscribed_apps')) assert.equal(new URL(url).searchParams.has('fields'), false);
    return provider(url);
  })).ready);
  assert((await checkMetaReadiness(c, async url => provider(url))).ready);
  assert((await checkMetaReadiness(c, async url => {
    const body = JSON.parse(await provider(url).text());
    if (body.data?.[0]?.object) body.data[0].fields[0].version = 'v26.0';
    return ok(body);
  })).ready, 'an existing webhook version is independent of the v25.0 registration API');
  const corruptions = [body => { if (body.id === c.waba) body.id = 'wrong'; }, body => { if (body.id === c.phone) body.id = 'wrong'; },
    body => { if (body.display_phone_number) body.display_phone_number = '000000000'; }, body => { if (body.platform_type) body.platform_type = 'UNKNOWN'; },
    body => { if (body.data?.[0]?.whatsapp_business_api_data) body.data = []; }, body => { if (body.data?.[0]?.object) body.data[0].active = false; },
    body => { if (body.data?.[0]?.object) body.data[0].callback_url = 'https://evil.test'; }, body => { if (body.data?.[0]?.object) body.data[0].fields = []; }];
  for (const corrupt of corruptions) assert.equal((await checkMetaReadiness(c, async url => { const body = JSON.parse(await provider(url).text()); corrupt(body); return ok(body); })).ready, false);
});
for (const api of [activationApi, testApi]) test(`${api === activationApi ? 'activation' : 'test'} API owner, CSRF, origin, methods and redaction`, async () => {
  const h = api({ store: memory(), configuration: () => c, sessionLookup: lookup, now: () => NOW });
  const anon = request(); anon.headers = {}; assert.equal((await call(h, anon)).code, 401);
  assert.equal((await call(api({ store: memory(), configuration: () => c, sessionLookup: async () => ({ ok: true, account: { id: 'other' } }) }), request())).code, 403);
  for (const field of ['origin', 'x-csrf-token']) { const req = request({ action: 'prepare' }); delete req.headers[field]; assert.equal((await call(h, req)).code, 403); }
  const cross = request({ action: 'prepare' }); cross.headers.origin = 'https://evil.test'; assert.equal((await call(h, cross)).code, 403);
  const insecure = request({ action: 'prepare' }); insecure.headers.host = 'www.bznsflowai.com'; insecure.headers.origin = 'http://www.bznsflowai.com'; assert.equal((await call(h, insecure)).code, 403);
  assert.equal((await call(h, { ...request(), method: 'DELETE' })).code, 405);
  const res = await call(h, request()); assert.equal(res.code, 200); assert.equal(res.headers['Cache-Control'], 'no-store'); assert(!res.body.includes(c.token));
});
test('handler clears submitted PIN even after rejection', async () => {
  const h = activationApi({ store: memory(), configuration: () => c, sessionLookup: lookup });
  const body = { action: 'activate', pin: '654321' }, req = request(body), res = await call(h, req);
  assert.equal(body.pin, undefined); assert.equal(req.body, undefined); assert(!res.body.includes('654321'));
});
test('getter-only Vercel request bodies are cleared without breaking activation', async () => {
  const store = memory(), h = activationApi({ store, configuration: () => c, sessionLookup: lookup, now: () => NOW, fetcher: async url => provider(url) });
  const prepared = JSON.parse((await call(h, request({ action: 'prepare' }))).body);
  const body = { action: 'activate', challenge: prepared.challenge, pin: '654321' }, req = request(); req.method = 'POST';
  Object.defineProperty(req, 'body', { configurable: true, get() { return body; } });
  const response = await call(h, req); assert.equal(response.code, 200); assert.equal(JSON.parse(response.body).status, 'ready');
  assert.equal(req.body, undefined); assert.equal(body.pin, undefined);
});
test('public rewrites and direct dispatch retain owner protection within the existing function', async () => {
  const h = ownerApi({ store: memory(), configuration: () => c, sessionLookup: lookup, fetcher: async url => provider(url) });
  for (const surface of ['activation', 'test']) {
    for (const req of [{ ...request(), url: `/api/layla-meta-${surface}` }, { ...request(), url: `/api/layla-meta?surface=${surface}` }, { ...request(), query: { surface } }]) {
      const response = await call(h, req); assert.equal(response.code, 200);
      assert(surface === 'activation' ? JSON.parse(response.body).target.phone === c.phone : JSON.parse(response.body).transportEnabled === false);
      req.headers = {}; assert.equal((await call(h, req)).code, 401);
    }
  }
});
test('five reviewed replies, one recipient and intent replay/concurrency limits', async () => {
  const store = memory(); let calls = 0;
  for (let i = 0; i < 5; i++) {
    const reviewId = await preview(store);
    const results = await Promise.allSettled([1, 2].map(() => confirmTest({ store, c, reviewId, now: () => NOW, mockSend: async () => { calls++; return { providerId: `mock.${calls}` }; } })));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    await assert.rejects(confirmTest({ store, c, reviewId, now: () => NOW }), /expired_or_used_review/);
  }
  assert.equal(calls, 5); assert.equal(store.state.supervised.status, 'limit'); assert.equal(store.state.paused, true);
  await assert.rejects(preview(store), /test_not_active/);
  const other = memory(); await preview(other); await assert.rejects(preview(other, { ...input, recipient: '96811111111' }), /one_recipient/);
});
test('expiry/stop/opt-out/takeover block confirmation and duplicate inbound cannot replace review', async () => {
  for (const reason of ['expired', 'stopped', 'optout', 'takeover']) {
    const store = memory(), reviewId = await preview(store); const { state, revision } = await store.read();
    if (reason === 'stopped') stopTest(state);
    if (['optout', 'takeover'].includes(reason)) acceptTestEvents(state, [{ kind: reason, from: recipient, id: 'control' }], NOW);
    await store.cas(c, revision, state);
    await assert.rejects(confirmTest({ store, c, reviewId, now: () => reason === 'expired' ? NOW + TEST_TIMEOUT : NOW }), /expired_or_used_review/);
    assert.equal(testView(store.state, NOW + (reason === 'expired' ? TEST_TIMEOUT : 0)).session.status, reason);
  }
  const s = memory().state; previewTest(s, input, NOW); const e = { kind: 'message', from: recipient, id: 'duplicate', text: 'services', at: NOW };
  acceptTestEvents(s, [e], NOW); const reviewId = s.supervised.review.id; acceptTestEvents(s, [e], NOW); assert.equal(s.supervised.review.id, reviewId);
  acceptTestEvents(s, [{ ...e, id: 'stop', text: 'STOP' }, { ...e, id: 'later' }], NOW); assert.equal(s.supervised.status, 'optout'); assert.equal(s.supervised.review, null);
});
test('receipts correlate and dedupe without downgrade; safe latency and errors', async () => {
  const store = memory(), reviewId = await preview(store); await confirmTest({ store, c, reviewId, now: () => NOW + 25 });
  const s = store.state, job = s.supervised.events[0]; assert.equal(job.latencyMs, 0);
  const receipt = { kind: 'receipt', id: job.providerId, recipient, intent: job.id, at: NOW + 30, status: 'delivered' };
  acceptTestEvents(s, [{ ...receipt, recipient: '96811111111' }], NOW + 30); assert.equal(s.supervised.events[0].status, 'accepted');
  acceptTestEvents(s, [receipt, receipt, { ...receipt, status: 'sent' }], NOW + 30); assert.equal(s.supervised.events[0].status, 'delivered'); assert.equal(s.supervised.seen.filter(k => k.startsWith('receipt:')).length, 2);
  const failed = memory(), id = await preview(failed); await confirmTest({ store: failed, c, reviewId: id, now: () => NOW, mockSend: async () => { throw Error(c.token); } });
  assert.equal(failed.state.supervised.status, 'ambiguous'); assert(!JSON.stringify(testView(failed.state, NOW)).includes(c.token));
});
test('live test transport cannot be enabled or reached from API', async () => {
  assert.equal(TEST_TRANSPORT_ENABLED, false);
  for (const mode of ['mock', 'live']) assert.equal((await call(testApi({ store: memory(), configuration: () => ({ ...c, mode }), sessionLookup: lookup }), request({ action: 'send' }))).code, 403);
  await assert.rejects(confirmTest({ store: memory(), c: { ...c, mode: 'live' } }), /test_transport_disabled/);
});
