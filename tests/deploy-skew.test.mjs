import test from 'node:test';
import assert from 'node:assert/strict';
import { installDeploySkewGuard } from '../src/lib/deploy-skew.js';

function fakeWindow(respond) {
  const store = new Map(), listeners = {};
  const win = {
    reloads: 0,
    location: { pathname: '/en/layla/dashboard', reload() { win.reloads++; } },
    sessionStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    addEventListener: (type, fn) => { listeners[type] = fn; },
    dispatch: (type, event) => listeners[type]?.(event),
    fetch: async url => respond(url),
  };
  return win;
}
const html = () => new Response('<!DOCTYPE html><html></html>', { status: 404, headers: { 'Content-Type': 'text/html' } });
const manifest = '/static-loader-data-manifest-jjk9bc4a9f.json';

test('a missing build data file after a redeploy reloads once instead of crashing', async () => {
  const win = fakeWindow(html);
  installDeploySkewGuard(win);
  const first = win.fetch(manifest);
  assert.equal(win.reloads, 0);
  const settled = await Promise.race([first.then(() => 'resolved'), new Promise(r => setTimeout(() => r('pending'), 20))]);
  assert.equal(settled, 'pending'); assert.equal(win.reloads, 1);
  // Still missing after the reload: render without prerendered data rather than crash.
  const again = await win.fetch(manifest);
  assert.deepEqual(await again.json(), {}); assert.equal(win.reloads, 1);
});

test('valid build data and unrelated requests pass through untouched', async () => {
  const data = { '/en/layla/dashboard': { route: { a: 1 } } };
  const win = fakeWindow(url => url === manifest ? Response.json(data) : html());
  installDeploySkewGuard(win);
  assert.deepEqual(await (await win.fetch(manifest)).json(), data);
  assert.equal((await win.fetch('/api/layla-meta?surface=dashboard')).status, 404);
  assert.equal(win.reloads, 0);
});

test('a missing code chunk reloads the page once per path', () => {
  const win = fakeWindow(html);
  installDeploySkewGuard(win);
  let prevented = 0; const event = { preventDefault: () => { prevented++; } };
  win.dispatch('vite:preloadError', event); win.dispatch('vite:preloadError', event);
  assert.equal(win.reloads, 1); assert.equal(prevented, 1);
});

test('the guard installs once and is inert without a browser window', () => {
  assert.doesNotThrow(() => installDeploySkewGuard(undefined));
  const win = fakeWindow(html); installDeploySkewGuard(win); const wrapped = win.fetch;
  installDeploySkewGuard(win); assert.equal(win.fetch, wrapped);
});
