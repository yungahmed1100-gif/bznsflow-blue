import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { PilotError } from './config.js';

function key(env) {
  if (!/^[a-f0-9]{64}$/i.test(env.LAYLA_CREDENTIAL_ENCRYPTION_KEY || '')) throw new PilotError('credential_key_missing', 503);
  return Buffer.from(env.LAYLA_CREDENTIAL_ENCRYPTION_KEY, 'hex');
}
export function sealToken(token, context, env) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(env), iv);
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return { v: 1, iv: iv.toString('base64'), data: data.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}
export function openToken(envelope, context, env) {
  try {
    if (envelope?.v !== 1) throw Error('version');
    const decipher = createDecipheriv('aes-256-gcm', key(env), Buffer.from(envelope.iv, 'base64'));
    decipher.setAAD(Buffer.from(context)); decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]).toString('utf8');
  } catch { throw new PilotError('credential_unavailable', 503); }
}
export const credentialContext = (account, i) => ['layla-credential-v1', account, i.id, i.app, i.waba, i.phone].join(':');
export async function metaRequest(c, path, token, fetcher, body) {
  try {
    const url = new URL(`https://graph.facebook.com/${c.version}/${path}`);
    const response = await fetcher(url, { method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(6000),
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      ...(body ? { body: new URLSearchParams(body).toString() } : {}),
    });
    const raw = await response.text(); if (raw.length > 100000) throw Error('response_limit');
    const value = JSON.parse(raw);
    if (!response.ok || !value || value.error) {
      const error = new PilotError('meta_connection_unavailable', 502);
      if (Number.isSafeInteger(value?.error?.code)) error.providerCode = value.error.code;
      throw error;
    }
    return value;
  } catch (error) { if (error instanceof PilotError) throw error; throw new PilotError('meta_connection_unavailable', 502); }
}
export async function exchangeAndVerify({ c, code, token: existingToken, waba, phone, path, allowPhoneSelection = false, ownerBusiness, fetcher = fetch, now = Date.now }) {
  if ((!existingToken && (typeof code !== 'string' || !code || code.length > 4096)) || !/^\d{1,30}$/.test(waba || '') || (!/^\d{1,30}$/.test(phone || '') && !(allowPhoneSelection && !phone))) throw new PilotError('invalid_signup_result');
  const token = existingToken || (await metaRequest(c, 'oauth/access_token', `${c.app}|${c.secret}`, fetcher, { client_id: c.app, client_secret: c.secret, code })).access_token;
  if (typeof token !== 'string' || token.length < 20 || token.length > 8192) throw new PilotError('invalid_customer_token', 502);
  const debug = await metaRequest(c, `debug_token?input_token=${encodeURIComponent(token)}`, `${c.app}|${c.secret}`, fetcher);
  const d = debug.data;
  const expired = value => value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (value !== 0 && value * 1000 <= now()));
  if (d?.is_valid !== true || d.app_id !== c.app || expired(d.expires_at) || expired(d.data_access_expires_at) ||
    !['whatsapp_business_management', 'whatsapp_business_messaging'].every(scope => d.scopes?.includes(scope))) throw new PilotError('token_permissions_incomplete', 409);
  const granted = d.granular_scopes?.find(s => s.scope === 'whatsapp_business_management');
  // Signup tokens list the granted WABAs. A business system-user token with broad access
  // lists none; it is accepted only on the owner path, for a WABA the owner portfolio owns.
  const listed = Array.isArray(granted?.target_ids) && granted.target_ids.length > 0;
  const ownerToken = !listed && !!granted && /^\d{1,30}$/.test(ownerBusiness || '') && d.type === 'SYSTEM_USER';
  if (listed ? !granted.target_ids.includes(waba) : !ownerToken) throw new PilotError('waba_not_granted', 403);
  const [account, phones] = await Promise.all([
    metaRequest(c, `${waba}?fields=id${ownerToken ? ',owner_business_info' : ''}`, token, fetcher),
    metaRequest(c, `${waba}/phone_numbers?fields=id,display_phone_number,platform_type,is_on_biz_app&limit=100`, token, fetcher),
  ]);
  if (account.id !== waba || !Array.isArray(phones.data)) throw new PilotError('phone_not_in_customer_waba', 403);
  if (ownerToken && account.owner_business_info?.id !== ownerBusiness) throw new PilotError('waba_not_granted', 403);
  if (!phone && allowPhoneSelection) {
    const eligible = phones.data.filter(p => /^\d{1,30}$/.test(p.id) && p.is_on_biz_app === (path === 'coexistence') && /^\d{7,15}$/.test(String(p.display_phone_number || '').replace(/\D/g,'')));
    if (!eligible.length) throw new PilotError('phone_not_in_customer_waba',403);
    // Never silently choose among multiple numbers (including paginated results).
    if (eligible.length !== 1 || phones.paging?.next) return {token, candidates: eligible.map(p => ({id:p.id, sender:String(p.display_phone_number).replace(/\D/g,'')}))};
    phone = eligible[0].id;
  }
  const selected = phones.data?.find(p => p.id === phone);
  if (account.id !== waba || !selected) throw new PilotError('phone_not_in_customer_waba', 403);
  if (path === 'coexistence' && selected.is_on_biz_app !== true) throw new PilotError('coexistence_not_verified', 409);
  if (['new_number','existing_cloud'].includes(path) && selected.is_on_biz_app !== false) throw new PilotError('business_app_requires_coexistence', 409);
  const sender = String(selected.display_phone_number || '').replace(/\D/g, '');
  if (!/^\d{7,15}$/.test(sender)) throw new PilotError('sender_not_verified', 409);
  return { token, phone, sender, coexistence: selected.is_on_biz_app === true, cloudApi: selected.platform_type === 'CLOUD_API' };
}
