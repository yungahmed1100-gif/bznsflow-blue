import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../ops/layla-minute-worker.js';

test('scheduled trigger authenticates one canonical request using Cloudflare-supported redirect mode', async t => {
  let calls = 0, cancelled = false;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls++;
    // workerd rejects redirect:error at Request construction, before networking.
    if (!['follow', 'manual'].includes(init.redirect)) throw TypeError('Unsupported redirect mode');
    assert.equal(init.redirect, 'manual');
    assert.equal(url, 'https://www.bznsflowai.com/api/layla-meta-worker');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers.Authorization, 'Bearer PRIVATE_TEST_SECRET');
    assert(init.signal instanceof AbortSignal);
    return { status: 200, ok: true, body: { cancel: async () => { cancelled = true; } } };
  });
  await worker.scheduled({}, { LAYLA_META_WORKER_SECRET: 'PRIVATE_TEST_SECRET' });
  assert.equal(calls, 1); assert.equal(cancelled, true);
});

test('redirect responses never send credentials to another destination or retry', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response('', { status: 307, headers: { Location: 'https://other.invalid/PRIVATE' } }); });
  await assert.rejects(worker.scheduled({}, { LAYLA_META_WORKER_SECRET: 'PRIVATE_TEST_SECRET' }), { message: 'worker_redirect_rejected' });
  assert.equal(calls, 1);
});

test('missing credentials and public requests cannot trigger processing', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; });
  await assert.rejects(worker.scheduled({}, {}), { message: 'worker_configuration_missing' });
  assert.equal((await worker.fetch(new Request('https://worker.invalid'))).status, 404);
  assert.equal(calls, 0);
});

test('provider and network failures expose fixed codes only and are never retried', async t => {
  for (const [failure, expected] of [[new TypeError('PRIVATE_NETWORK_DETAIL'), 'worker_request_failed'], [new DOMException('PRIVATE_TIMEOUT_DETAIL', 'TimeoutError'), 'worker_timeout'], [new Error('PRIVATE_OTHER_DETAIL'), 'worker_unavailable']]) {
    let calls = 0;
    const mock = t.mock.method(globalThis, 'fetch', async () => { calls++; throw failure; });
    await assert.rejects(worker.scheduled({}, { LAYLA_META_WORKER_SECRET: 'PRIVATE_TEST_SECRET' }), { message: expected });
    assert.equal(calls, 1); mock.mock.restore();
  }
  t.mock.method(globalThis, 'fetch', async () => new Response('PRIVATE_PROVIDER_BODY', { status: 401 }));
  await assert.rejects(worker.scheduled({}, { LAYLA_META_WORKER_SECRET: 'PRIVATE_TEST_SECRET' }), { message: 'worker_http_401' });
});
