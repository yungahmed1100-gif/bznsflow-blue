// Local-only browser fixture. All Meta/storage/session dependencies are synthetic.
import { createServer } from 'node:http';
import { createServer as createVite } from 'vite';
import { initialState } from '../api/_lib/layla/domain.js';
import { APPROVED } from '../api/_lib/layla/activation.js';
import { WEBHOOK_URL } from '../api/_lib/layla/readiness.js';
import { createHandler as ownerApi } from '../api/layla-meta.js';
import { createHandler as readinessApi } from '../api/layla-meta-readiness.js';
const c = { ...APPROVED, mode: 'mock', kill: true, owner: '11111111-1111-4111-8111-111111111111', missing: [], token: 'fixture-token', secret: 'fixture-secret' };
let state, revision, persona = 'owner';
function reset() { state = initialState(c); state.profile = { sector: 'Synthetic business', services: 'Approved fixture services', prices: '', hours: '', location: '', humanContact: 'fixture@example.test', reviewed: true }; state.openWorkerAt = Date.now(); revision = 0; }
reset();
const store = { async read() { return { state: structuredClone(state), revision }; }, async cas(_, r, s) { if (r !== revision) return false; state = structuredClone(s); revision++; return true; } };
const fetcher = async (url, init) => {
  const path = new URL(url).pathname;
  let body;
  if (init.method === 'POST') body = { success: true };
  else if (path.endsWith(`/${c.waba}`)) body = { id: c.waba };
  else if (path.endsWith(`/${c.phone}`)) body = { id: c.phone, display_phone_number: c.sender, platform_type: 'CLOUD_API' };
  else if (path.endsWith('/subscriptions')) body = { data: [{ object: 'whatsapp_business_account', active: true, callback_url: WEBHOOK_URL, fields: [{ name: 'messages', version: c.version }] }] };
  else body = { data: [{ whatsapp_business_api_data: { id: c.app } }] };
  return { ok: true, text: async () => JSON.stringify(body) };
};
const options = { store, configuration: () => c, fetcher, env: { LAYLA_OPEN_TEST_ENABLED: 'true', LAYLA_META_WORKER_SECRET: 'fixture-worker' }, sessionLookup: async () => ({ ok: persona !== 'anonymous', account: { id: persona === 'owner' ? c.owner : 'nonowner' } }) };
const routes = { '/api/layla-meta': ownerApi(options), '/api/layla-meta-activation': ownerApi(options), '/api/layla-meta-test': ownerApi(options), '/api/layla-meta-readiness': readinessApi(options) };
const vite = await createVite({ server: { middlewareMode: true }, appType: 'spa' });
createServer(async (req, res) => {
  if (req.url === '/__fixture') { res.setHeader('Content-Type', 'text/html'); return res.end('<h1>Local Layla fixture</h1><a href="/__fixture/owner">Reset owner fixture</a><a href="/__fixture/nonowner">Nonowner fixture</a><a href="/__fixture/anonymous">Anonymous fixture</a>'); }
  if (/^\/__fixture\/(owner|nonowner|anonymous)$/.test(req.url)) {
    persona = req.url.split('/').pop(); if (persona === 'owner') reset();
    res.setHeader('Set-Cookie', [`bf_session=${'b'.repeat(64)}; Path=/; SameSite=Strict`, `bf_csrf=${'a'.repeat(64)}; Path=/; SameSite=Strict`]);
    res.writeHead(302, { Location: '/owner/layla' }); return res.end();
  }
  if (req.url === '/api/auth-session') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ ok: true, csrfToken: 'a'.repeat(64) })); }
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (routes[pathname]) {
    let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 10000) { res.writeHead(413); return res.end(); } }
    try { req.body = raw ? JSON.parse(raw) : undefined; } catch { req.body = {}; }
    res.status = n => { res.statusCode = n; return res; }; return routes[pathname](req, res);
  }
  vite.middlewares(req, res);
}).listen(5187, '127.0.0.1', () => console.log('Synthetic Layla fixture: http://127.0.0.1:5187/__fixture'));
