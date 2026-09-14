import { PilotError } from './config.js';

export function customerStore({ env = process.env, fetcher = fetch } = {}) {
  async function request(path, method = 'GET', body, prefer) {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new PilotError('storage_configuration_missing', 503);
    try {
      const response = await fetcher(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(5000), headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}),
        }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) throw new PilotError(response.status === 409 ? 'sender_or_operation_conflict' : 'storage_unavailable', response.status === 409 ? 409 : 503);
      const raw = await response.text();
      if (raw.length > 1000000) throw new PilotError('storage_response_limit', 503);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { if (e instanceof PilotError) throw e; throw new PilotError('storage_unavailable', 503); }
  }
  const id = value => { if (typeof value !== 'string' || !/^[a-f0-9-]{36}$/.test(value)) throw new PilotError('invalid_identifier'); return value; };
  return {
    async view(account) {
      const [tenants, integrations] = await Promise.all([
        request(`layla_tenants?account_id=eq.${id(account)}&select=profile,paused,trial_started_at`),
        request(`layla_integrations?account_id=eq.${id(account)}&active=eq.true&select=id,waba_id,phone_id,sender,path,status,coexistence_verified,readiness`),
      ]);
      return { tenant: tenants[0] || null, integration: integrations[0] || null };
    },
    async profile(account, profile) {
      const existing = await request(`layla_tenants?account_id=eq.${id(account)}&select=account_id`);
      if (existing.length) await request(`layla_tenants?account_id=eq.${id(account)}`, 'PATCH', { profile, paused: true, updated_at: new Date().toISOString() }, 'return=minimal');
      else await request('layla_tenants', 'POST', { account_id: id(account), profile, paused: true }, 'return=minimal');
    },
    rpc(name, args) {
      if (!['layla_signup_begin', 'layla_signup_claim', 'layla_signup_finish'].includes(name)) throw new PilotError('invalid_operation');
      return request(`rpc/${name}`, 'POST', args);
    },
    fail(account, attempt, code) { return request(`layla_onboarding_attempts?account_id=eq.${id(account)}&id=eq.${id(attempt)}&status=eq.working`, 'PATCH', { status: 'failed', code }, 'return=minimal'); },
    async integration(account, integration) {
      const rows = await request(`layla_integrations?account_id=eq.${id(account)}&id=eq.${id(integration)}&active=eq.true&select=*`);
      if (rows.length !== 1) throw new PilotError('integration_not_found', 404);
      return rows[0];
    },
    update(account, integration, patch) { return request(`layla_integrations?account_id=eq.${id(account)}&id=eq.${id(integration)}&active=eq.true`, 'PATCH', patch, 'return=minimal'); },
    async claimRegistration(account, integration) {
      const rows = await request(`layla_integrations?account_id=eq.${id(account)}&id=eq.${id(integration)}&active=eq.true&path=eq.new_number&status=eq.needs_registration`, 'PATCH', { status: 'checking', updated_at: new Date().toISOString() }, 'return=representation');
      return rows.length === 1;
    },
    pause(account) { return request(`layla_tenants?account_id=eq.${id(account)}`, 'PATCH', { paused: true }, 'return=minimal'); },
    async binding(waba, phone) {
      if (!/^\d{1,30}$/.test(waba) || !/^\d{1,30}$/.test(phone)) throw new PilotError('invalid_binding');
      const rows = await request(`layla_integrations?waba_id=eq.${waba}&phone_id=eq.${phone}&active=eq.true&select=id,account_id,app_id,waba_id,phone_id,sender`);
      return rows.length === 1 ? rows[0] : null;
    },
    inbox(rows) { return request('layla_customer_inbox?on_conflict=account_id,integration_id,event_id', 'POST', rows, 'resolution=ignore-duplicates,return=minimal'); },
    async cleanup() {
      // Data deletion is scoped to the additive Layla tables. Keep trial clocks
      // and integration ownership intact; never delete auth/account data.
      const cutoff = encodeURIComponent(new Date(Date.now() - 30 * 86400000).toISOString());
      await request(`layla_customer_outbox?created_at=lt.${cutoff}`, 'DELETE', undefined, 'return=minimal');
      await request(`layla_customer_inbox?received_at=lt.${cutoff}`, 'DELETE', undefined, 'return=minimal');
      await request(`layla_onboarding_attempts?created_at=lt.${cutoff}&status=in.(failed,expired)`, 'DELETE', undefined, 'return=minimal');
    },
  };
}
