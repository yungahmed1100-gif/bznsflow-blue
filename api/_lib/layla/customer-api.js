import { createHash, randomUUID, randomBytes } from 'node:crypto';
import { hashToken } from '../auth.js';
import { parseCookies, SESSION_COOKIE } from '../cookies.js';
import { getSession } from '../db.js';
import { readBody, send } from '../http.js';
import { owner } from './owner.js';
import { PilotError, settings } from './config.js';
import { answer, reviewProfile } from './domain.js';
import { customerStore } from './customer-store.js';
import { credentialContext, exchangeAndVerify, sealToken, openToken, metaRequest } from './customer-meta.js';
import { checkMetaReadiness } from './readiness.js';
import { verifySignupConfiguration } from './eligibility.js';

const digest = value => createHash('sha256').update(value).digest('hex');
export async function customerIdentity(req, c, env, sessionLookup = getSession) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) throw new PilotError('sign_in_required', 401);
  let session;
  try { session = await sessionLookup(hashToken(token)); } catch { throw new PilotError('session_unavailable', 503); }
  if (!session?.ok || !session.account?.id) throw new PilotError('sign_in_required', 401);
  // Reuse the same HTTPS/origin/CSRF checks; the verified session supplies tenant
  // identity. No request body, callback or query parameter selects an account.
  await owner(req, { owner: session.account.id }, async () => session);
  const invited = (env.LAYLA_CUSTOMER_ACCOUNT_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (invited.length > 2) throw new PilotError('beta_configuration_invalid', 503);
  if (session.account.id !== c.owner && !invited.includes(session.account.id)) throw new PilotError('customer_invitation_required', 403);
  return session.account.id;
}
export function createHandler({ configuration = settings, env = process.env, store = customerStore({ env }), sessionLookup, fetcher = fetch, now = Date.now } = {}) {
  return async (req, res) => {
    let body;
    try {
      if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); throw new PilotError('method', 405); }
      const c = configuration(), account = await customerIdentity(req, c, env, sessionLookup);
      if (env.LAYLA_CUSTOMER_ONBOARDING_ENABLED !== 'true') throw new PilotError('customer_onboarding_not_enabled', 409);
      if (req.method === 'POST') {
        body = readBody(req);
        if (!body || JSON.stringify(body).length > 8000) throw new PilotError('invalid_body');
        if (body.action === 'profile') {
          const profile = reviewProfile(body.profile);
          if (typeof body.businessName !== 'string' || !body.businessName.trim() || body.businessName.length > 100) throw new PilotError('business_name_required');
          await store.profile(account, { ...profile, businessName: body.businessName.trim() });
        } else if (body.action === 'preview') {
          const { tenant } = await store.view(account);
          if (!tenant?.profile?.reviewed) throw new PilotError('profile_unreviewed', 409);
          if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 1000) throw new PilotError('invalid_text');
          // Explicit customer brand prevents the owner pilot's name leaking into
          // customer answers. Fact text remains exactly what the customer reviewed.
          const result = answer(body.text, tenant.profile, true);
          const text = ['identity', 'greeting'].includes(result.intent)
            ? `Layla · ${tenant.profile.businessName}. ${tenant.profile.services}` : result.text;
          return send(res, 200, { ok: true, preview: text, intent: result.intent }, { vary: 'Cookie' });
        } else if (body.action === 'begin') {
          const { tenant } = await store.view(account);
          if (!tenant?.profile?.reviewed) throw new PilotError('profile_unreviewed', 409);
          if (!['coexistence', 'new_number'].includes(body.path)) throw new PilotError('invalid_onboarding_path');
          if (!c.app || !c.secret || !c.version || !/^\d+$/.test(env.LAYLA_EMBEDDED_SIGNUP_CONFIG_ID || '') || !/^[a-f0-9]{64}$/i.test(env.LAYLA_CREDENTIAL_ENCRYPTION_KEY || '')) throw new PilotError('customer_configuration_missing', 503);
          await verifySignupConfiguration(c, env, fetcher);
          const state = randomBytes(32).toString('hex'), attempt = randomUUID();
          if (!await store.rpc('layla_signup_begin', { p_account: account, p_id: attempt, p_hash: digest(state), p_path: body.path })) throw new PilotError('onboarding_in_progress_or_limited', 409);
          return send(res, 200, { ok: true, attempt, state, path: body.path, appId: c.app, configId: env.LAYLA_EMBEDDED_SIGNUP_CONFIG_ID, version: c.version, expiresAt: now() + 600000 }, { vary: 'Cookie' });
        } else if (body.action === 'finish') {
          if (!/^[a-f0-9-]{36}$/.test(body.attempt || '') || !/^[a-f0-9]{64}$/.test(body.state || '')) throw new PilotError('invalid_onboarding_state');
          const claimed = await store.rpc('layla_signup_claim', { p_account: account, p_id: body.attempt, p_hash: digest(body.state) });
          if (!claimed) throw new PilotError('expired_or_used_onboarding', 409);
          try {
            const verified = await exchangeAndVerify({ c, code: body.code, waba: body.waba, phone: body.phone, path: claimed.path, fetcher, now });
            const i = { id: randomUUID(), app: c.app, waba: body.waba, phone: body.phone, sender: verified.sender, path: claimed.path, coexistence: verified.coexistence };
            const credential = sealToken(verified.token, credentialContext(account, i), env);
            if (!await store.rpc('layla_signup_finish', { p_account: account, p_attempt: claimed.id, p_integration: { ...i, credential } })) throw new PilotError('onboarding_finish_conflict', 409);
            // Only after durable exclusive sender ownership. Coexistence never
            // calls /register or deregisters a WhatsApp Business app account.
            try {
              await metaRequest(c, `${i.waba}/subscribed_apps`, verified.token, fetcher, {});
              const readiness = await checkMetaReadiness({ ...c, ...i, token: verified.token, missing: [] }, fetcher);
              await store.update(account, i.id, { status: readiness.ready ? 'ready' : verified.cloudApi ? 'needs_attention' : 'needs_registration', readiness });
            } catch { await store.update(account, i.id, { status: 'needs_attention' }); }
          } catch (e) { await store.fail(account, claimed.id, e instanceof PilotError ? e.code : 'onboarding_unavailable'); throw e; }
        } else if (body.action === 'register_number') {
          const i = await store.integration(account, body.integration);
          if (i.path !== 'new_number' || i.coexistence_verified) throw new PilotError('coexistence_registration_forbidden', 409);
          if (typeof body.pin !== 'string' || !/^\d{6}$/.test(body.pin)) throw new PilotError('invalid_pin');
          const mapping = { id: i.id, app: i.app_id, waba: i.waba_id, phone: i.phone_id };
          const token = openToken(i.credential, credentialContext(account, mapping), env);
          const phone = await metaRequest(c, `${i.phone_id}?fields=id,display_phone_number,is_on_biz_app`, token, fetcher);
          if (phone.id !== i.phone_id || phone.is_on_biz_app !== false || String(phone.display_phone_number || '').replace(/\D/g, '') !== i.sender) throw new PilotError('registration_identity_not_verified', 409);
          // Consume the durable registration claim before the external effect.
          // An unknown outcome stays blocked and must be checked, never retried.
          if (!await store.claimRegistration(account, i.id)) throw new PilotError('registration_already_attempted', 409);
          try {
            const result = await metaRequest(c, `${i.phone_id}/register`, token, fetcher, { messaging_product: 'whatsapp', pin: body.pin });
            delete body.pin;
            if (result.success !== true) throw new PilotError('registration_outcome_unknown', 409);
            const readiness = await checkMetaReadiness({ ...c, ...mapping, sender: i.sender, token, missing: [] }, fetcher);
            await store.update(account, i.id, { status: readiness.ready ? 'ready' : 'needs_attention', readiness });
          } catch { await store.update(account, i.id, { status: 'needs_attention' }); throw new PilotError('registration_requires_readiness_check', 409); }
        } else if (body.action === 'refresh') {
          const i = await store.integration(account, body.integration);
          const mapping = { id: i.id, app: i.app_id, waba: i.waba_id, phone: i.phone_id };
          const token = openToken(i.credential, credentialContext(account, mapping), env);
          try {
            const readiness = await checkMetaReadiness({ ...c, ...mapping, sender: i.sender, token, missing: [] }, fetcher);
            await store.update(account, i.id, { status: readiness.ready ? 'ready' : 'needs_attention', readiness });
            if (!readiness.ready) await store.pause(account);
          } catch { await store.pause(account); await store.update(account, i.id, { status: 'needs_attention' }); throw new PilotError('connection_requires_attention', 409); }
        } else if (body.action === 'pause') await store.pause(account);
        else if (body.action === 'enable') throw new PilotError('customer_live_release_pending_review', 409);
        else throw new PilotError('unknown_action');
      }
      return send(res, 200, { ok: true, ...await store.view(account), liveEnabled: false, beta: true }, { vary: 'Cookie' });
    } catch (e) { return send(res, e instanceof PilotError ? e.status : 503, { ok: false, reason: e instanceof PilotError ? e.code : 'unavailable' }, { vary: 'Cookie' }); }
    finally { if (body && typeof body === 'object') { delete body.code; delete body.pin; } }
  };
}
