import { createHash } from 'node:crypto';

// Server-only general automation lock. The separately authorized open-test
// transport has its own owner confirmation, environment gate and hard budget.
export const LIVE_RELEASE_ENABLED = false;
export class PilotError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
export function settings(env = process.env) {
  const mode = env.LAYLA_META_MODE || 'mock';
  if (!['mock', 'live'].includes(mode)) throw new PilotError('invalid_mode', 503);
  const c = {
    mode, owner: env.LAYLA_OWNER_ACCOUNT_ID || '',
    app: env.LAYLA_META_APP_ID || '', waba: env.LAYLA_META_WABA_ID || '',
    phone: env.LAYLA_META_PHONE_NUMBER_ID || '', sender: env.LAYLA_META_SENDER || env.LAYLA_META_SENDER_NUMBER || '',
    secret: env.LAYLA_META_APP_SECRET || '', token: env.LAYLA_META_ACCESS_TOKEN || '',
    verify: env.LAYLA_META_VERIFY_TOKEN || '', version: env.LAYLA_META_GRAPH_VERSION || '',
    kill: env.LAYLA_META_KILL_SWITCH !== 'false',
  };
  c.missing = ['owner', 'app', 'waba', 'phone', 'sender', 'secret', 'token', 'verify', 'version'].filter(k => !c[k]);
  if (c.owner && !/^[a-f0-9-]{36}$/i.test(c.owner)) throw new PilotError('invalid_owner_config', 503);
  for (const k of ['app', 'waba', 'phone']) if (c[k] && !/^\d{1,30}$/.test(c[k])) throw new PilotError('invalid_asset_config', 503);
  if (c.sender && !/^\d{7,15}$/.test(c.sender)) throw new PilotError('invalid_sender_config', 503);
  if (c.version && !/^v\d{1,3}\.0$/.test(c.version)) throw new PilotError('invalid_graph_version', 503);
  return c;
}
export const binding = c => [c.owner, c.mode, c.app, c.waba, c.phone, c.sender].join(':');
// A sender change gets a fresh state row. This preserves the retired pilot state
// as evidence and prevents its contacts, receipts or trial clock crossing into a
// newly reviewed Meta asset binding.
export const stateKey = c => `bznsflow:${c.mode}:${createHash('sha256').update(binding(c)).digest('hex').slice(0,16)}`;
