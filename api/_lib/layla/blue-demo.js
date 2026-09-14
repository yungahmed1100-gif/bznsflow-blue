// Blue-only, disposable synthetic state. No database or provider credentials.
import { randomBytes } from 'node:crypto';
import { initialState } from './domain.js';
import { parseCookies } from '../cookies.js';

const sessions = new Map(), ttl = 3600000;
const c = { mode: 'mock', kill: true, owner: '11111111-1111-4111-8111-111111111111', app: '900000000000001', waba: '900000000000002', phone: '900000000000003', sender: '999000000000', version: 'v25.0', missing: [], secret: '', token: '', verify: '' };
const csrf = 'b'.repeat(64);

export function demoOptions(req, res, now = Date.now()) {
  for (const [id, value] of sessions) if (value.expires < now) sessions.delete(id);
  let id = parseCookies(req).bf_blue_demo;
  if (!/^[a-f0-9]{48}$/.test(id || '') || !sessions.has(id)) {
    id = randomBytes(24).toString('hex');
    if (sessions.size >= 100) sessions.delete(sessions.keys().next().value);
    const state = initialState(c);
    state.profile = { sector: 'BznsFlow demo', services: 'WhatsApp FAQ replies and human handoff', prices: '', hours: '', location: '', humanContact: 'demo@example.test', reviewed: true };
    sessions.set(id, { state, revision: 0, expires: now + ttl });
    res.setHeader('Set-Cookie', `bf_blue_demo=${id}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600`);
  }
  const data = sessions.get(id);
  req.headers = { ...req.headers, cookie: `bf_session=${'a'.repeat(64)}; bf_csrf=${csrf}` };
  return {
    configuration: () => ({ ...c }), env: {}, sessionLookup: async () => ({ ok: true, account: { id: c.owner } }),
    // Fail closed if a simulated use case accidentally attempts any external API.
    fetcher: async () => { throw Error('blue_integrations_disabled'); },
    store: {
      async read() { return { state: structuredClone(data.state), revision: data.revision }; },
      async cas(_config, revision, state) { if (revision !== data.revision) return false; data.state = structuredClone(state); data.revision++; return true; },
    },
  };
}
