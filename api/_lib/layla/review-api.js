import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { BLUE_CLOUD, convexConfigured, reviewStore, catalogStore } from '../convex.js';
import { blueAccountsAvailable, blueAuthStore, blueAccount, BLUE_ACCOUNT_COOKIE, hashAccountToken } from '../blue-auth.js';
import { parseCookies } from '../cookies.js';
import { safeEqual } from '../cookies.js';
import { readBody, send } from '../http.js';
import { PilotError } from './config.js';
import { importWebsite } from './website-import.js';
import { validateReviewProfile, previewAnswer } from './review-profile.js';
import { credentialContext, exchangeAndVerify, metaRequest, openToken, sealToken } from './customer-meta.js';

const ORIGIN = 'https://bznsflow-blue.vercel.app';
const CALLBACK = `${ORIGIN}/api/layla-meta-webhook`;
const APP = '1388038082832745', CONFIG = '2144711899802123';
const COOKIE = '__Host-blue_review';
const digest = text => createHash('sha256').update(text).digest('hex');
const assetId = value => typeof value === 'string' && /^\d{1,30}$/.test(value);
export function reviewAvailable(env = process.env) {
  return convexConfigured(env) && env.BLUE_CUSTOMER_SETUP_ENABLED === 'true' && env.LAYLA_META_APP_ID === APP &&
    env.LAYLA_CUSTOMER_CONFIG_ID === CONFIG && !!env.LAYLA_META_APP_SECRET && /^[a-f0-9]{64}$/i.test(env.LAYLA_CREDENTIAL_ENCRYPTION_KEY || '') &&
    !!env.BLUE_REVIEW_VERIFY_TOKEN && !env.LAYLA_META_ACCESS_TOKEN && env.LAYLA_META_KILL_SWITCH !== 'false' && env.LAYLA_META_MODE !== 'live' && env.LAYLA_OPEN_TEST_ENABLED !== 'true';
}
function configuration(env) {
  if (!reviewAvailable(env)) throw new PilotError('customer_onboarding_not_enabled', 503);
  return { app: APP, secret: env.LAYLA_META_APP_SECRET, version: 'v25.0' };
}
function publicState(row, available, accountReady = true) {
  if (!row) throw new PilotError('review_backend_unavailable', 503);
  return { ok: true, review: true, synthetic: true, available, status: row.status, expiresAt: row.expiresAt,
    profile: row.profile || null, messagingStateUrl: '/api/layla-meta?surface=messaging',
    journeyStep: row.journeyStep ?? (row.profile ? 2 : 0), profileVersion: row.profileVersion || 1,
    previewReviewedVersion: row.previewReviewedVersion || null, lastPreview: row.lastPreview || null, previewIntents: row.previewIntents || [],
    capabilities: { preview: !!row.profile?.reviewed, connect: accountReady && available && !!row.profile?.humanContact && !row.integration && !row.pendingSelection, manageMessaging: accountReady && !!row.accountId && !!row.integration },
    nextAction: row.status === 'registration_required' ? 'register_number' : row.integration && !['connected','paused'].includes(row.status) ? 'refresh' : row.profile ? 'preview' : 'profile',
    selection: row.pendingSelection ? { candidates: row.pendingSelection.candidates, expiresAt: row.attempt?.expiresAt } : null,
    connectionChecks: row.connectionChecks || null, checkedAt: row.checkedAt || null, diagnostic: row.diagnostic || null,
    integration: row.integration ? { id: row.integration.id, sender: row.integration.sender, path: row.integration.path, status: row.status } : null };
}
function allowedAssets(env, waba, phone) {
  if (!assetId(waba) || !assetId(phone)) throw new PilotError('invalid_signup_result');
  // All customer-owned assets may enter signup. Meta-granted WABA membership,
  // durable ownership and verified routing are checked before external writes.
}
// Provider-confirmed overrides are required before any subscribe/register write.
// Existing non-Blue routing for this app is never overwritten. A new WABA
// subscription includes its Blue override in the same provider request.
export async function inspectReviewConnection({ c, integration: i, token, fetcher }) {
  const [apps, phone, name] = await Promise.all([
    metaRequest(c, `${i.waba}/subscribed_apps`, token, fetcher),
    metaRequest(c, `${i.phone}?fields=id,status,is_on_biz_app,webhook_configuration`, token, fetcher),
    metaRequest(c, `${i.phone}?fields=name_status`, token, fetcher).catch(() => null),
  ]);
  const app = apps.data?.find(item => item.whatsapp_business_api_data?.id === c.app);
  const routing = phone.webhook_configuration;
  const isolated = phone.id === i.phone && app?.override_callback_uri === CALLBACK &&
    routing?.whatsapp_business_account === CALLBACK && (!routing.phone_number || routing.phone_number === CALLBACK);
  const pathVerified = i.path === 'coexistence' ? phone.is_on_biz_app === true : phone.is_on_biz_app === false;
  const safeToSubscribe = phone.id === i.phone && pathVerified && Array.isArray(apps.data) &&
    (!app || app.override_callback_uri === CALLBACK) &&
    (!routing?.phone_number || routing.phone_number === CALLBACK) &&
    (!routing?.whatsapp_business_account || routing.whatsapp_business_account === CALLBACK);
  return { nameStatus: ['APPROVED','AVAILABLE_WITHOUT_REVIEW','DECLINED','EXPIRED','PENDING_REVIEW','NONE'].includes(name?.name_status) ? name.name_status : 'UNKNOWN', pathVerified, registered: phone.status === 'CONNECTED', isolated: isolated && pathVerified, safeToSubscribe, connected: isolated && pathVerified && phone.status === 'CONNECTED', subscribed: !!app };
}
export function createReviewHandler({ env = process.env, fetcher = fetch, now = Date.now, store = reviewStore({ env, fetcher }), catalog = catalogStore({env,fetcher}), exchange = exchangeAndVerify, inspect = inspectReviewConnection, reviewMode = true, accountStore = blueAuthStore({env,fetcher}), websiteImport = importWebsite } = {}) {
  return async (req, res) => {
    let body;
    try {
      if (!['GET','POST'].includes(req.method)) { res.setHeader('Allow','GET, POST'); throw new PilotError('method',405); }
      if (!convexConfigured(env) || env.CONVEX_CLOUD_URL !== BLUE_CLOUD) throw new PilotError('review_backend_unavailable',503);
      const cookies = String(req.headers?.cookie || '').split(';').map(s => s.trim()).filter(s => s.startsWith(`${COOKIE}=`));
      let session = cookies.length === 1 ? cookies[0].slice(COOKIE.length + 1) : '';
      const validSession = /^[a-f0-9]{64}$/.test(session);
      if (req.method === 'POST') {
        if (req.headers?.origin !== ORIGIN || req.headers?.host !== new URL(ORIGIN).host || (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin')) throw new PilotError('origin',403);
        if (!validSession) throw new PilotError('session_expired',401);
        if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new PilotError('content_type',415);
      }
      if (!validSession) session = randomBytes(32).toString('hex');
      let sessionHash = digest(session);
      const accountsAvailable = blueAccountsAvailable(env);
      const account = accountsAvailable ? await blueAccount(req,accountStore) : null;
      if (account?.draftHash) sessionHash = account.draftHash;
      const csrf = createHmac('sha256', env.BLUE_REVIEW_SERVICE_SECRET).update(`blue-review-csrf:${session}`).digest('hex');
      if (req.method === 'POST' && !safeEqual(req.headers['x-csrf-token'] || '', csrf)) throw new PilotError('csrf',403);
      let row;
      try { row = await store(validSession ? 'get' : 'create', { sessionHash }); }
      catch (error) {
        if (error.code === 'session_expired' && req.method === 'GET') res.setHeader('Set-Cookie', `${COOKIE}=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax`);
        throw error;
      }
      if (!row || row.expiresAt <= now()) throw new PilotError('session_expired',401);
      if (!validSession) res.setHeader('Set-Cookie', `${COOKIE}=${session}; Max-Age=86400; Path=/; Secure; HttpOnly; SameSite=Lax`);
      const attemptState = attempt => createHmac('sha256', env.BLUE_REVIEW_SERVICE_SECRET).update(`blue-review-attempt:${sessionHash}:${attempt}`).digest('hex');
      const result = () => ({ ...publicState(row, reviewAvailable(env), reviewMode || !!account && !!row.accountId), csrfToken: csrf,
        reviewMode, websiteImportAvailable: env.BLUE_WEBSITE_IMPORT_ENABLED === 'true', accountSaveAvailable: accountsAvailable, savedToAccount: !!row.accountId,
        account: account ? { email:account.email } : null,
        ...(row.attempt && !row.attempt.claimed && ['prepared','awaiting_meta'].includes(row.status) && row.attempt.expiresAt > now() ? {
          prepared: {attempt:row.attempt.id,state:attemptState(row.attempt.id),path:row.attempt.path,expiresAt:row.attempt.expiresAt,appId:APP,configId:CONFIG,version:'v25.0'},
        } : {}),
      });
      if (req.method === 'GET') return send(res,200,result(),{vary:'Cookie'});
      body = readBody(req);
      if (!body || Array.isArray(body) || JSON.stringify(body).length > 12000) throw new PilotError('body_too_large',413);
      const write = async (operation, args = {}) => {
        const next = await store(operation, { ...args, sessionHash });
        if (!next || next.expiresAt <= now()) throw new PilotError('review_backend_unavailable',503);
        row = next; return row;
      };
      const ownerKey=String(row.accountId||sessionHash);
      const persistConnection = async (verified, waba, phone) => {
        const token = verified.token;
        const i = {id:randomUUID(),app:APP,waba,phone:verified.phone || phone,sender:verified.sender,path:row.attempt.path};
        i.credential = sealToken(token,credentialContext(sessionHash,i),env);
        await write('credential',{attempt:row.attempt.id,integration:i});
        const c = configuration(env);
        const proof = await inspect({c,integration:i,token,fetcher});
        if (!proof.isolated && !proof.safeToSubscribe) throw new PilotError('test_routing_not_verified',409);
        const operationId = randomUUID();
        await write('claim_operation',{operationId,effect:'subscribe'});
        try {
          const subscribed = await metaRequest(c,`${i.waba}/subscribed_apps`,token,fetcher,{override_callback_uri:CALLBACK,verify_token:env.BLUE_REVIEW_VERIFY_TOKEN});
          if (subscribed.success !== true) throw new PilotError('meta_connection_unavailable',502);
          const after = await inspect({c,integration:i,token,fetcher});
          const status = after.connected ? 'connected' : after.isolated && i.path === 'new_number' ? 'registration_required' : 'reconciliation_required';
          await write('result',{operationId,status,connectionChecks:checks(after)});
        } catch (error) { await write('result',{operationId,status:'reconciliation_required',diagnostic:diagnostic(error,'subscription')}); }
      };
      const checks = proof => ({ routing:!!proof.isolated, registered:!!(proof.registered ?? proof.connected), path:!!(proof.pathVerified ?? proof.isolated), nameStatus:proof.nameStatus || 'UNKNOWN' });
      const diagnostic = (error, stage) => ({reason:error instanceof PilotError ? error.code : 'review_backend_unavailable',stage,at:now(),...(Number.isSafeInteger(error.providerCode) ? {providerCode:error.providerCode} : {})});
      if (body.action === 'claim_draft') {
        if (!accountsAvailable || !account) throw new PilotError('sign_in_required',401);
        const token = parseCookies(req)[BLUE_ACCOUNT_COOKIE];
        const draftHash = randomBytes(32).toString('hex');
        let credential;
        if (row.integration) {
          let customerToken;
          try {
            customerToken = openToken(row.integration.credential,credentialContext(sessionHash,row.integration),env);
            credential = sealToken(customerToken,credentialContext(draftHash,row.integration),env);
          } finally { customerToken = undefined; }
        }
        const claimed = await accountStore('claim_draft',{tokenHash:hashAccountToken(token),sessionHash,draftHash,...(credential ? {credential} : {})});
        sessionHash = claimed.draftHash;
        row = await store('get',{sessionHash});
      } else if (body.action === 'import_website') {
        if (env.BLUE_WEBSITE_IMPORT_ENABLED !== 'true') throw new PilotError('website_import_unavailable',503);
        const ip = String(req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0];
        const ipHash = createHmac('sha256',env.BLUE_REVIEW_SERVICE_SECRET).update(`blue-import:${ip}`).digest('hex');
        await accountStore('limit_import',{ipHash});
        const imported = await websiteImport(body.url);
        return send(res,200,{...result(),imported},{vary:'Cookie'});
      } else if (body.action === 'profile') {
        const businessName = body.businessName?.trim();
        if (typeof businessName !== 'string' || !businessName || businessName.length > 100 || /[\x00-\x1f]/.test(businessName)) throw new PilotError('invalid_profile');
        await write('profile', { profile: { ...validateReviewProfile(body.profile), businessName } });
      } else if (body.action === 'preview') {
        if (!row.profile?.reviewed) throw new PilotError('profile_unreviewed',409);
        if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 1000) throw new PilotError('invalid_text');
        const catalogPage=row.accountId?await catalog('match',{ownerKey,query:body.text.trim()}):{entries:[]};
        const preview = previewAnswer(body.text.trim(), row.profile,catalogPage.entries);
        await write('preview_result', { profileVersion: row.profileVersion || 1, preview });
        return send(res,200,{...result(), preview: preview.text, sourceFields: preview.sourceFields, needsHuman: preview.needsHuman},{vary:'Cookie'});
      } else if (body.action === 'save_progress') {
        await write('save_progress', { journeyStep: body.journeyStep });
      } else if (body.action === 'review_preview') {
        await write('review_preview', { profileVersion: body.profileVersion });
      } else if (body.action === 'catalog_list') {
        if(!row.accountId)throw new PilotError('sign_in_required',401);
        const value=await catalog('list',{ownerKey,cursor:body.cursor,limit:body.limit});return send(res,200,{...result(),catalog:value},{vary:'Cookie'});
      } else if (body.action === 'catalog_save') {
        if(!row.accountId)throw new PilotError('sign_in_required',401);
        const value=await catalog('save',{ownerKey,entry:body.entry});return send(res,200,{...result(),catalog:value},{vary:'Cookie'});
      } else if (body.action === 'catalog_save_many') {
        if(!row.accountId)throw new PilotError('sign_in_required',401);
        const value=await catalog('saveMany',{ownerKey,entries:body.entries});return send(res,200,{...result(),catalog:value},{vary:'Cookie'});
      } else if (['catalog_archive','catalog_approve'].includes(body.action)) {
        if(!row.accountId)throw new PilotError('sign_in_required',401);
        const value=await catalog(body.action==='catalog_approve'?'approve':'archive',{ownerKey,entryKey:body.entryKey});return send(res,200,{...result(),catalog:value},{vary:'Cookie'});
      } else if (body.action === 'catalog_publish') {
        if(!row.accountId)throw new PilotError('sign_in_required',401);
        const value=await catalog('publish',{ownerKey});return send(res,200,{...result(),catalog:value},{vary:'Cookie'});
      } else if (body.action === 'begin') {
        configuration(env);
        if (!reviewMode && (!account || !row.accountId)) throw new PilotError('sign_in_required',401);
        if (!['coexistence','new_number','existing_cloud'].includes(body.path)) throw new PilotError('invalid_path');
        const attempt = randomUUID(), state = attemptState(attempt);
        await write('begin',{attempt,stateHash:digest(state),path:body.path});
        return send(res,200,{...result(),attempt,state,path:row.attempt.path,expiresAt:row.attempt.expiresAt,appId:APP,configId:CONFIG,version:'v25.0'},{vary:'Cookie'});
      } else if (['cancel','finish'].includes(body.action)) {
        if (typeof body.state !== 'string' || !/^[a-f0-9]{64}$/.test(body.state) || typeof body.attempt !== 'string') throw new PilotError('invalid_state',409);
        if (body.action === 'cancel') await write('cancel',{attempt:body.attempt,stateHash:digest(body.state)});
        else {
          const c = configuration(env);
          if (!assetId(body.waba) || (body.phone !== undefined && !assetId(body.phone))) throw new PilotError('invalid_signup_result');
          if (typeof body.code !== 'string' || !body.code || body.code.length > 4096) throw new PilotError('invalid_signup_result');
          await write('claim',{attempt:body.attempt,stateHash:digest(body.state)});
          let token;
          try {
            const verified = await exchange({ c, code:body.code,waba:body.waba,phone:body.phone,path:row.attempt.path,allowPhoneSelection:true,fetcher,now });
            token = verified.token;
            if (verified.candidates) {
              const credential = sealToken(token,`review-selection:${sessionHash}:${row.attempt.id}:${body.waba}`,env);
              await write('pending_selection',{selection:{waba:body.waba,path:row.attempt.path,candidates:verified.candidates,credential}});
            } else await persistConnection(verified,body.waba,body.phone);
          } catch (error) {
            // If a provider operation was claimed, its record survives even if
            // persistence fails. A refresh can reconcile it after 60 seconds.
            if (!row.operation) await write('result',{attempt:body.attempt,status:row.integration ? 'reconciliation_required' : 'failed',diagnostic:diagnostic(error,'verification')});
            throw error;
          } finally { token = undefined; delete body.code; }
        }
      } else if (body.action === 'cancel_selection') {
        await write('cancel_selection');
      } else if (body.action === 'select_phone') {
        if (!row.pendingSelection || !row.attempt || row.attempt.expiresAt <= now()) throw new PilotError('attempt_expired',409);
        const selection = row.pendingSelection;
        if (!selection.candidates.some(p => p.id === body.phone)) throw new PilotError('invalid_signup_result');
        let token;
        try {
          token = openToken(selection.credential,`review-selection:${sessionHash}:${row.attempt.id}:${selection.waba}`,env);
          const verified = await exchange({ c:configuration(env), token, waba:selection.waba, phone:body.phone,path:selection.path,fetcher,now });
          await persistConnection(verified,selection.waba,body.phone);
        } catch (error) {
          if (row.integration && !row.operation && row.status === 'verifying') await write('result',{attempt:row.attempt.id,status:'reconciliation_required',diagnostic:diagnostic(error,'selection')});
          throw error;
        } finally { token = undefined; }
      } else if (['register_number','refresh'].includes(body.action)) {
        const i = row.integration;
        if (!i) throw new PilotError('operation_conflict',409);
        allowedAssets(env,i.waba,i.phone);
        // Read-only reconciliation remains possible when new setup is disabled.
        const c = {app:APP,secret:env.LAYLA_META_APP_SECRET,version:'v25.0'};
        const register = body.action === 'register_number';
        if (register) {
          configuration(env);
          if (i.path !== 'new_number' || row.status !== 'registration_required' || !/^\d{6}$/.test(body.pin || '') || body.confirm !== true) throw new PilotError('registration_confirmation_required',409);
        }
        const operationId = randomUUID();
        await write('claim_operation',{operationId,effect:register ? 'register' : 'refresh'});
        let token;
        try {
          token = openToken(i.credential,credentialContext(sessionHash,i),env);
          let proof = await inspect({c,integration:i,token,fetcher});
          if (register) {
            if (!proof.isolated) throw new PilotError('test_routing_not_verified',409);
            const r = await metaRequest(c,`${i.phone}/register`,token,fetcher,{messaging_product:'whatsapp',pin:body.pin});
            if (r.success !== true) throw new PilotError('meta_connection_unavailable',502);
            proof = await inspect({c,integration:i,token,fetcher});
          }
          await write('result',{operationId,status:proof.connected ? 'connected' : proof.isolated && i.path === 'new_number' && !row.registrationAttempted ? 'registration_required' : 'reconciliation_required',connectionChecks:checks(proof)});
        } catch (error) { await write('result',{operationId,status:'reconciliation_required',diagnostic:diagnostic(error,register ? 'registration' : 'refresh')}); }
        finally { token = undefined; delete body.pin; }
      } else if (body.action === 'pause') await write('pause');
      else throw new PilotError('unknown_action');
      return send(res,200,result(),{vary:'Cookie'});
    } catch (error) {
      return send(res,error instanceof PilotError ? error.status : 503,{ok:false,reason:error instanceof PilotError ? error.code : 'review_backend_unavailable'},{vary:'Cookie'});
    } finally { if (body && typeof body === 'object') { delete body.code; delete body.pin; } }
  };
}
