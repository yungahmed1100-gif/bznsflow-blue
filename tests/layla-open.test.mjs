import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { APPROVED } from '../api/_lib/layla/activation.js';
import { initialState, DAY } from '../api/_lib/layla/domain.js';
import { transact } from '../api/_lib/layla/store.js';
import { prepareOpen, startOpen, stopOpen, acceptOpen, maintainOpen, openView, runOpen, feedbackOpen, RETENTION } from '../api/_lib/layla/open-test.js';
import { createHandler } from '../api/_lib/layla/open-api.js';
const c = { ...APPROVED, owner: '11111111-1111-4111-8111-111111111111', mode: 'mock', kill: true, missing: [], token: 'SECRET_TOKEN' };
const env = { LAYLA_OPEN_TEST_ENABLED: 'true', LAYLA_META_WORKER_SECRET: 'SECRET_WORKER' };
const NOW = 1700000000000, from = '96899999999';
const profile = { sector: 'BznsFlow', services: 'Reviewed FAQ answers.', prices: '', hours: '', location: 'Oman', humanContact: 'test@example.test', reviewed: true };
function memory() {
  let state = initialState(c), revision = 0;
  state.openWorkerAt = NOW; state.activation = { readiness: { ready: true } };
  return { async read() { return { state: structuredClone(state), revision }; }, async cas(_, r, s) { if (r !== revision) return false; state = structuredClone(s); revision++; return true; }, get state() { return structuredClone(state); } };
}
async function started() {
  const store = memory(), challenge = randomUUID();
  await transact(store, c, s => { prepareOpen(s, c, env, profile, NOW, challenge); startOpen(s, c, env, challenge, NOW, 'run'); });
  return store;
}
const message = (id = 'in.1', text = 'services', sender = from, at = NOW) => ({ kind: 'message', id, from: sender, text, at });
const accept = (store, events) => transact(store, c, s => acceptOpen(s, events, NOW));
const provider = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ messages: [{ id: `wamid.${randomUUID()}` }] }) });
const worker = (store, options = {}) => runOpen({ store, configuration: () => c, env, now: () => NOW, fetcher: provider, ...options });

test('open start requires explicit reviewed facts, fresh scheduler, separate transport gate and single-use confirmation', async () => {
  const store = memory(), challenge = randomUUID();
  for (const invalid of [{}, { ...env, LAYLA_OPEN_TEST_ENABLED: 'false' }]) assert.throws(() => prepareOpen(store.state, c, invalid, profile, NOW, challenge), /transport_disabled/);
  assert.throws(() => prepareOpen({ ...store.state, openWorkerAt: NOW - 180000 }, c, env, profile, NOW, challenge), /scheduler_unverified/);
  assert.throws(() => prepareOpen(store.state, c, env, { ...profile, reviewed: false }, NOW, challenge), /review_sector_services_contact/);
  await transact(store, c, s => prepareOpen(s, c, env, profile, NOW, challenge));
  assert(!JSON.stringify(store.state).includes(challenge));
  assert.throws(() => startOpen(store.state, c, env, 'wrong', NOW, 'run'), /expired_or_used/);
  const results = await Promise.allSettled([1, 2].map(() => transact(store, c, s => startOpen(s, c, env, challenge, NOW, 'run'))));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(store.state.paused, true);
});
test('only fresh inbound messages create replies, any sender allowed; global concurrency and deduplication', async () => {
  const store = await started(); let sends = 0;
  assert.equal((await worker(store)).processed, false);
  await accept(store, [message(), message(), message('old', 'hi', from, NOW - 1000), message('future', 'hi', from, NOW + 1000)]);
  await Promise.all([worker(store, { fetcher: async (...args) => { sends++; return provider(...args); } }), worker(store, { fetcher: async (...args) => { sends++; return provider(...args); } })]);
  assert.equal(sends, 1); assert.equal(store.state.openTest.attempts, 1);
  const j = Object.values(store.state.openTest.jobs)[0]; assert(j.reply.includes('30 days')); assert(j.reply.includes('STOP'));
  await accept(store, [message('second', 'services', '201234567890')]); await worker(store);
  assert.equal(store.state.openTest.attempts, 2);
  const view = JSON.stringify(openView(store.state, c, env, NOW)); assert(!view.includes(from)); assert(!view.includes(c.token));
});
test('STOP, human request and echoes outrank questions and prevent later automation', async () => {
  for (const control of [message('stop', 'STOP'), message('human', 'human'), { kind: 'takeover', from, id: 'echo.1' }, { kind: 'optout', from }]) {
    const store = await started(); await accept(store, [message(), control, message('later')]);
    assert.equal((await worker(store)).processed, false);
    await accept(store, [message('yet-later')]); assert.equal((await worker(store)).processed, false);
  }
});
test('failed and ambiguous sends count toward cap and block that conversation without retries', async () => {
  for (const fetcher of [async () => { throw Error(c.token); }, async () => ({ ok: false, status: 400, text() { throw Error('raw errors must not be read'); } })]) {
    const store = await started(); await accept(store, [message()]); await worker(store, { fetcher });
    await accept(store, [message('another')]); assert.equal((await worker(store)).processed, false);
    assert.equal(store.state.openTest.attempts, 1); assert(!JSON.stringify(store.state).includes(c.token));
  }
});
test('100-attempt hard cap, 10/minute throttle and automatic 24-hour timeout', async () => {
  const store = await started();
  for (let i = 0; i < 11; i++) await accept(store, [message(`in.${i}`)]);
  for (let i = 0; i < 11; i++) await worker(store);
  assert.equal(store.state.openTest.attempts, 10);
  await transact(store, c, s => { s.openTest.attempts = 99; s.openTest.rates = []; });
  await worker(store); assert.equal(store.state.openTest.attempts, 100); assert.equal(store.state.openTest.status, 'limit');
  assert.equal((await worker(store)).processed, false);
  const expired = await started(); await accept(expired, [message()]); await worker(expired, { now: () => NOW + DAY });
  assert.equal(expired.state.openTest.status, 'expired'); assert.equal(expired.state.openTest.attempts, 0);
});
test('stop after durable claim blocks transport; claim write failure never sends; lost claims never resend', async () => {
  const store = await started(); await accept(store, [message()]); let reads = 0, sends = 0;
  const wrapped = { ...store, async read() { if (++reads === 2) await transact(store, c, s => stopOpen(s, NOW)); return store.read(); } };
  await worker(wrapped, { fetcher: async () => { sends++; return provider(); } }); assert.equal(sends, 0);
  const crash = await started(); await accept(crash, [message()]);
  await assert.rejects(worker({ ...crash, cas: async () => { throw Error('storage'); } }, { fetcher: async () => { sends++; } })); assert.equal(sends, 0);
  let writes = 0;
  await assert.rejects(worker({ ...crash, cas: async (...args) => { if (++writes > 1) throw Error('storage'); return crash.cas(...args); } }));
  assert.equal(crash.state.openTest.attempts, 1);
  await worker(crash, { now: () => NOW + 60001, fetcher: async () => { sends++; } });
  assert.equal(sends, 0); assert.equal(Object.values(crash.state.openTest.jobs)[0].status, 'ambiguous');
});
test('receipts can precede HTTP completion, correlate recipients and intents, and never downgrade delivery', async () => {
  const store = await started(); await accept(store, [message()]);
  await worker(store, { fetcher: async (_, init) => {
    const intent = JSON.parse(init.body).biz_opaque_callback_data;
    await accept(store, [{ kind: 'receipt', id: 'wamid.receipt', recipient: from, intent, status: 'delivered', at: NOW }]);
    return { ok: true, status: 200, text: async () => JSON.stringify({ messages: [{ id: 'wamid.receipt' }] }) };
  } });
  const j = Object.values(store.state.openTest.jobs)[0]; assert.equal(j.status, 'delivered');
  const r = { kind: 'receipt', id: j.providerId, recipient: from, intent: j.intentId, at: NOW, status: 'sent' };
  await accept(store, [r, r, { ...r, status: 'read', recipient: '96811111111' }]);
  assert.equal(Object.values(store.state.openTest.jobs)[0].status, 'delivered'); assert.equal(store.state.openTest.receipts.length, 3);
});
test('feedback changes no answer facts; retention deletes conversation and identifiers without restarting test', async () => {
  const store = await started(); await accept(store, [message()]); await worker(store);
  const id = Object.values(store.state.openTest.jobs)[0].id;
  await transact(store, c, s => feedbackOpen(s, { id, feedback: 'incorrect' }, NOW));
  assert.deepEqual(store.state.openTest.profile, profile);
  await transact(store, c, s => maintainOpen(s, NOW + RETENTION));
  assert.equal(store.state.openTest.status, 'deleted'); assert.equal(store.state.openTest.attempts, 1);
  assert(!JSON.stringify(store.state).includes(from)); assert(!JSON.stringify(store.state).includes('wamid'));
});
test('open API rejects anonymous/nonowner, absent CSRF, foreign origins and any arbitrary send action', async () => {
  const req = { method: 'POST', body: { action: 'send', recipient: from, text: 'arbitrary' }, headers: { host: 'localhost', origin: 'http://localhost', cookie: `bf_session=${'a'.repeat(64)}; bf_csrf=${'b'.repeat(64)}`, 'x-csrf-token': 'b'.repeat(64) } };
  async function call(request, account = c.owner) {
    const h = createHandler({ store: memory(), configuration: () => c, env, sessionLookup: async () => ({ ok: true, account: { id: account } }) });
    const res = { status(code) { this.code = code; }, setHeader() {}, end(body) { this.body = body; } };
    await h(request, res); return res;
  }
  assert.equal((await call({ ...req, headers: {} })).code, 401);
  assert.equal((await call(req, 'other')).code, 403);
  assert.equal((await call({ ...req, headers: { ...req.headers, origin: 'https://evil.test' } })).code, 403);
  assert.equal((await call({ ...req, headers: { ...req.headers, 'x-csrf-token': '' } })).code, 403);
  assert.equal((await call(req)).code, 400);
});
