import { PilotError, settings } from './config.js';
import { metaRequest } from './customer-meta.js';
import { owner } from './owner.js';
import { createStore } from './store.js';
import { send, sendPilotError } from '../http.js';

// Configuration membership proves neither permission approval nor number eligibility.
export async function verifySignupConfiguration(c, env, fetcher = fetch) {
  const id = env.LAYLA_EMBEDDED_SIGNUP_CONFIG_ID;
  if (!/^\d{1,30}$/.test(id || '') || !c.app || !c.secret || !c.version) throw new PilotError('customer_configuration_missing', 503);
  const app = await metaRequest(c, `${c.app}?fields=id,config_ids`, `${c.app}|${c.secret}`, fetcher);
  const configs = Array.isArray(app.config_ids) ? app.config_ids : app.config_ids?.data;
  if (app.id !== c.app || !Array.isArray(configs)) throw new PilotError('signup_configuration_unverified', 409);
  if (!configs.some(config => config.id === id)) throw new PilotError('signup_configuration_not_in_app', 409);
  return id;
}

// Embedded Signup reports completion on account_update; Coexistence also syncs
// history and contacts. A missing app-level field is invisible until a customer fails.
export const REQUIRED_WEBHOOK_FIELDS = ['messages', 'account_update', 'history', 'smb_app_state_sync', 'smb_message_echoes'];
export async function verifyWebhookFields(c, fetcher = fetch) {
  const value = await metaRequest(c, `${c.app}/subscriptions`, `${c.app}|${c.secret}`, fetcher);
  const topic = Array.isArray(value.data) ? value.data.find(item => item.object === 'whatsapp_business_account' && item.active !== false) : null;
  const fields = new Set((topic?.fields || []).map(field => typeof field === 'string' ? field : field?.name));
  const missing = REQUIRED_WEBHOOK_FIELDS.filter(field => !fields.has(field));
  return missing.length ? { status: 'needs_action', reason: 'webhook_fields_missing', missing } : { status: 'passed', reason: 'webhook_fields_subscribed' };
}

export function createHandler({ configuration = settings, env = process.env, store = createStore(), sessionLookup, fetcher = fetch, now = Date.now } = {}) {
  return async (req, res) => {
    try {
      if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); throw new PilotError('method', 405); }
      const c = configuration();
      await owner(req, c, sessionLookup);
      const { state } = await store.read(c);
      let config = { status: 'passed', reason: 'configuration_belongs_to_app' };
      try { await verifySignupConfiguration(c, env, fetcher); }
      catch (e) { config = { status: ['customer_configuration_missing', 'signup_configuration_not_in_app'].includes(e.code) ? 'needs_action' : 'not_verified', reason: e instanceof PilotError ? e.code : 'unavailable' }; }
      const unknown = reason => ({ status: 'not_verified', reason });
      const webhookFields = await verifyWebhookFields(c, fetcher).catch(() => unknown('webhook_subscription_unavailable'));
      return send(res, 200, { ok: true, checkedAt: now(), customerAccessApproved: false, checks: {
        signupConfiguration: config,
        businessVerification: unknown('check_meta_business_verification'),
        techProvider: unknown('check_meta_tech_provider_requirements'),
        accessVerification: unknown('check_meta_access_verification'),
        appPermissions: unknown('check_meta_advanced_access'),
        publication: unknown('check_meta_app_publication'),
        oauthAndSdkDomains: unknown('check_meta_oauth_and_sdk_domains'),
        signupProducts: unknown('check_meta_v4_cloud_api_only_configuration'),
        webhookFields,
        ownerNumber: { status: state.activation?.readiness?.ready ? 'passed' : 'not_verified', reason: 'saved_owner_connection_check' },
        egyptianCoexistence: unknown('complete_authorized_meta_signup'),
        customerNewNumber: unknown('separate_customer_number_required'),
        scheduler: { status: Number.isFinite(state.openWorkerAt) && state.openWorkerAt <= now() && now() - state.openWorkerAt < 180000 ? 'passed' : 'needs_action', reason: 'worker_heartbeat_freshness' },
        customerMessaging: { status: 'needs_action', reason: 'customer_live_release_pending_review' },
      } }, { vary: 'Cookie' });
    } catch (e) { return sendPilotError(res, e, { vary: 'Cookie' }); }
  };
}
