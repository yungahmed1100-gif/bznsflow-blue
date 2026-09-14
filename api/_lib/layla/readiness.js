import { PilotError } from './config.js';

const digits = value => typeof value === 'string' ? value.replace(/\D/g, '') : '';
export const WEBHOOK_URL = 'https://www.bznsflowai.com/api/layla-meta-webhook';

export async function checkMetaReadiness(c, fetcher = fetch) {
  if (c.missing.length) throw new PilotError('configuration_missing', 503);
  const read = async (path, fields, token = c.token) => {
    const url = new URL(`https://graph.facebook.com/${c.version}/${path}`);
    if (fields) url.searchParams.set('fields', fields);
    try {
      const response = await fetcher(url, {
        method: 'GET', redirect: 'error', signal: AbortSignal.timeout(6000),
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('provider');
      const raw = await response.text();
      if (raw.length > 100000) throw new Error('provider');
      const body = JSON.parse(raw);
      if (!body || typeof body !== 'object' || body.error) throw new Error('provider');
      return body;
    } catch { throw new PilotError('meta_readiness_unavailable', 502); }
  };
  const [waba, phone, subscriptions, webhooks] = await Promise.all([
    read(c.waba, 'id'),
    read(c.phone, 'id,display_phone_number,platform_type'),
    // This edge returns nested whatsapp_business_api_data, not app nodes.
    // Request its documented default shape; fields=id can hide the nested ID.
    read(`${c.waba}/subscribed_apps`, null),
    read(`${c.app}/subscriptions`, null, `${c.app}|${c.secret}`),
  ]);
  const platformType =
    typeof phone.platform_type === 'string' && /^[A-Z_]{1,40}$/.test(phone.platform_type)
      ? phone.platform_type
      : 'UNKNOWN';
  const isConfiguredApp = app =>
    app?.id === c.app || app?.whatsapp_business_api_data?.id === c.app;
  const checks = {
    waba: waba.id === c.waba,
    phone: phone.id === c.phone,
    sender: digits(phone.display_phone_number) === c.sender,
    cloudApi: platformType === 'CLOUD_API',
    webhookApp: Array.isArray(subscriptions.data) && subscriptions.data.some(isConfiguredApp),
    webhookConfiguration: Array.isArray(webhooks.data) && webhooks.data.some(h =>
      h.object === 'whatsapp_business_account' && h.active === true && h.callback_url === WEBHOOK_URL &&
      // Webhook subscription versions are configured independently of Graph
      // registration calls. Preserve the existing active messages subscription.
      Array.isArray(h.fields) && h.fields.some(f => f.name === 'messages')),
  };
  return { ready: Object.values(checks).every(Boolean), checks, details: { platformType } };
}
