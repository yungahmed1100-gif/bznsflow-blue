import { PilotError, stateKey } from './config.js';
import { initialState, assertBinding } from './domain.js';

export function createStore({ fetcher = fetch, env = process.env } = {}) {
  async function rpc(name, args) {
    const url = env.SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new PilotError('storage_configuration_missing', 503);
    const endpoint = new URL(url);
    if (endpoint.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(endpoint.hostname)) throw new PilotError('invalid_storage_url', 503);
    try {
      const r = await fetcher(`${url.replace(/\/+$/, '')}/rest/v1/rpc/${name}`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(2000),
        headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
        body: JSON.stringify(args),
      });
      if (!r.ok) throw new Error('storage');
      return await r.json();
    } catch { throw new PilotError('storage_unavailable', 503); }
  }
  return {
    async read(c) {
      const row = await rpc('layla_meta_read', { p_key: stateKey(c) });
      const state = row?.state || initialState(c);
      assertBinding(state, c);
      return { revision: row?.revision || 0, state };
    },
    async cas(c, revision, state) {
      return rpc('layla_meta_cas', { p_key: stateKey(c), p_revision: revision, p_state: state });
    },
  };
}
// The callback must be synchronous and side-effect free: conflicts rerun it.
export async function transact(store, c, change) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { revision, state } = await store.read(c);
    assertBinding(state, c);
    const result = change(state);
    if (result && typeof result.then === 'function') throw new PilotError('async_transaction_forbidden', 500);
    if (await store.cas(c, revision, state)) return result;
  }
  throw new PilotError('storage_contention', 503);
}
