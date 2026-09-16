// The six Convex route clients were six separate copies of one function until
// they were folded into `convexStore` in api/_lib/convex.js. They did not behave
// identically, and the differences are load-bearing: an allowlist keeps backend
// detail away from the review UI, and the dashboard answers 401 rather than 409
// when a session is missing so the client knows to sign in rather than retry.
//
// These tests pin the differences, because a single shared implementation is
// exactly where they would quietly get flattened.

import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewStore, catalogStore, blueAuthStore, dashboardStore, campaignStore, messagingStore } from '../api/_lib/convex.js';

const env = {
  CONVEX_CLOUD_URL: 'https://quaint-nightingale-675.eu-west-1.convex.cloud',
  BLUE_REVIEW_SERVICE_SECRET: 'a'.repeat(64),
};

/** A fetcher that answers every call with one body, and records the request. */
const answering = (body, { ok = true } = {}) => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    return { ok, json: async () => body };
  };
  return { fetcher, calls };
};

const rejected = async (store, body) => {
  const { fetcher } = answering(body);
  try {
    await store({ env, fetcher })('op', {});
    return null;
  } catch (error) { return error; }
};

test('an unconfigured environment never reaches the network', async () => {
  const { fetcher, calls } = answering({ ok: true, value: 1 });
  await assert.rejects(() => reviewStore({ env: {}, fetcher })('op'), (e) => e.code === 'review_backend_unavailable' && e.status === 503);
  assert.equal(calls.length, 0, 'an unconfigured store must not make a request');
});

test('each route posts to its own path with the bearer, and refuses redirects', async () => {
  const expected = [
    [reviewStore, 'blue-review'], [catalogStore, 'blue-catalog'], [blueAuthStore, 'blue-auth'],
    [dashboardStore, 'blue-dashboard'], [campaignStore, 'blue-campaign'], [messagingStore, 'blue-messaging'],
  ];
  for (const [store, route] of expected) {
    const { fetcher, calls } = answering({ ok: true, value: 'x' });
    const value = await store({ env, fetcher })('op', { a: 1 });
    assert.equal(value, 'x');
    assert.equal(calls[0].url, `https://quaint-nightingale-675.eu-west-1.convex.site/${route}`);
    assert.equal(calls[0].init.headers.Authorization, `Bearer ${env.BLUE_REVIEW_SERVICE_SECRET}`);
    // A redirect would carry the service token to wherever it pointed.
    assert.equal(calls[0].init.redirect, 'error');
    assert.deepEqual(JSON.parse(calls[0].init.body), { operation: 'op', a: 1 });
  }
});

test('the review route forwards only its allowlisted reasons', async () => {
  const allowed = await rejected(reviewStore, { ok: false, reason: 'profile_changed' });
  assert.equal(allowed.code, 'profile_changed', 'an allowlisted reason must reach the caller');

  // A real reason code in shape, but not on the review allowlist: it is backend
  // detail and must collapse rather than leak.
  const withheld = await rejected(reviewStore, { ok: false, reason: 'some_internal_detail' });
  assert.equal(withheld.code, 'review_backend_unavailable');
});

test('the auth route forwards only its own, shorter allowlist', async () => {
  assert.equal((await rejected(blueAuthStore, { ok: false, reason: 'code_invalid' })).code, 'code_invalid');
  // On the review list but not the auth one — the two must not have merged.
  assert.equal((await rejected(blueAuthStore, { ok: false, reason: 'attempt_limit' })).code, 'account_unavailable');
});

test('the shape-checked routes forward any well-formed reason and reject the rest', async () => {
  assert.equal((await rejected(messagingStore, { ok: false, reason: 'anything_machine_like' })).code, 'anything_machine_like');
  for (const bad of ['Has Spaces And Caps', 'x'.repeat(61), '', undefined, 42]) {
    assert.equal((await rejected(messagingStore, { ok: false, reason: bad })).code, 'messaging_unavailable', `"${bad}" must not be forwarded`);
  }
});

test('only the dashboard and campaign routes answer 401 for a missing session', async () => {
  for (const store of [dashboardStore, campaignStore]) {
    assert.equal((await rejected(store, { ok: false, reason: 'sign_in_required' })).status, 401,
      'the client retries this by signing in, not by changing the request');
    assert.equal((await rejected(store, { ok: false, reason: 'other_reason' })).status, 409);
  }
  // Elsewhere it is an ordinary conflict.
  assert.equal((await rejected(messagingStore, { ok: false, reason: 'sign_in_required' })).status, 409);
});

test('a transport failure never leaks its shape to the caller', async () => {
  const exploding = async () => { throw new TypeError('fetch failed: ECONNREFUSED 10.0.0.1:443'); };
  await assert.rejects(() => catalogStore({ env, fetcher: exploding })('op'),
    (e) => e.code === 'catalog_unavailable' && e.status === 503);

  const { fetcher } = answering({}, { ok: false });
  await assert.rejects(() => catalogStore({ env, fetcher })('op'),
    (e) => e.code === 'catalog_unavailable' && e.status === 503);
});
