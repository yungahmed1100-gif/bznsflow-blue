import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { sealToken, openToken, credentialContext, exchangeAndVerify } from '../api/_lib/layla/customer-meta.js';
import { customerIdentity, createHandler } from '../api/_lib/layla/customer-api.js';
import { routeCustomerEnvelope, persistCustomerEvents } from '../api/_lib/layla/customer-webhook.js';
import { verifySignupConfiguration, createHandler as eligibilityHandler } from '../api/_lib/layla/eligibility.js';
import { signupOptions, signupEvent } from '../src/lib/layla-signup.js';
const env = { LAYLA_CREDENTIAL_ENCRYPTION_KEY: 'a'.repeat(64) };
const owner = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
const c = { owner, app: '123', secret: 'SECRET_APP', version: 'v25.0' };
test('v4 signup separates coexistence, validates origins and ignores incomplete or wrong-flow events', () => {
  const options = signupOptions({ configId: '456', path: 'coexistence' });
  const extras = options.extras;
  assert.equal(extras.version, 'v4'); assert.equal(extras.featureType, 'whatsapp_business_app_onboarding');
  assert.equal(signupOptions({ configId: '456', path: 'new_number' }).extras.featureType, undefined);
  assert.deepEqual(options.extras.setup, {});
  const preselect = { business: '4360221360973294', waba: '2213485365896306' };
  assert.deepEqual(signupOptions({ configId: '456', path: 'existing_cloud', preselect }).extras.setup, { business: { id: '4360221360973294' }, whatsAppBusinessAccount: { ids: ['2213485365896306'] } });
  assert.deepEqual(signupOptions({ configId: '456', path: 'new_number', preselect: { business: '4360221360973294' } }).extras.setup, { business: { id: '4360221360973294' } });
  const coexistence = signupOptions({ configId: '456', path: 'coexistence', preselect }).extras;
  assert.deepEqual(coexistence.setup, {}); assert.equal(coexistence.featureType, 'whatsapp_business_app_onboarding');
  const event = { origin: 'https://www.facebook.com', data: { type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING', data: { waba_id: '456', phone_number_id: '789' } } };
  assert.deepEqual(signupEvent(event, 'coexistence'), { assets: { waba: '456', phone: '789' } });
  assert.equal(signupEvent(event, 'new_number'), null);
  assert.equal(signupEvent({ ...event, origin: 'https://evilfacebook.com' }, 'coexistence'), null);
  assert.equal(signupEvent({ ...event, data: '{' }, 'coexistence'), null);
  assert.deepEqual(signupEvent({ ...event, data: { type: 'WA_EMBEDDED_SIGNUP', event: 'CANCEL' } }, 'coexistence'), { cancelled: true });
});
test('existing API numbers launch the business-first flow and may finish with only a WABA', () => {
  assert.equal(signupOptions({ configId: '456', path: 'existing_cloud', esVersion: 'v3' }).extras.version, 'v3');
  assert.equal(signupOptions({ configId: '456', path: 'existing_cloud', esVersion: 'v9' }).extras.version, 'v4');
  assert.equal(signupOptions({ configId: '456', path: 'coexistence', esVersion: 'v3' }).extras.version, 'v4');
  const finish = (event, data) => ({ origin: 'https://www.facebook.com', data: { type: 'WA_EMBEDDED_SIGNUP', event, data } });
  assert.deepEqual(signupEvent(finish('FINISH_ONLY_WABA', { waba_id: '2213485365896306' }), 'existing_cloud'), { assets: { waba: '2213485365896306' } });
  assert.deepEqual(signupEvent(finish('FINISH', { waba_id: '2213485365896306', phone_number_id: '1250149564857596' }), 'existing_cloud'), { assets: { waba: '2213485365896306', phone: '1250149564857596' } });
  assert.equal(signupEvent(finish('FINISH_ONLY_WABA', { waba_id: '2213485365896306' }), 'new_number'), null);
  assert.equal(signupEvent(finish('FINISH', { waba_id: '2213485365896306' }), 'new_number'), null);
});
test('signup configuration requires app identity and membership; provider errors are redacted', async () => {
  const configEnv = { LAYLA_EMBEDDED_SIGNUP_CONFIG_ID: '456' };
  const reply = value => async (_url, options) => { assert.equal(options.method, 'GET'); return { ok: true, text: async () => JSON.stringify(value) }; };
  assert.equal(await verifySignupConfiguration(c, configEnv, reply({ id: '123', config_ids: [{ id: '456' }] })), '456');
  await assert.rejects(verifySignupConfiguration(c, configEnv, reply({ id: '999', config_ids: [{ id: '456' }] })), /signup_configuration_unverified/);
  await assert.rejects(verifySignupConfiguration(c, configEnv, reply({ id: '123', config_ids: [{ id: '999' }] })), /signup_configuration_not_in_app/);
  await assert.rejects(verifySignupConfiguration(c, configEnv, async () => { throw Error('SECRET_PROVIDER_ERROR'); }), /meta_connection_unavailable/);
});
test('owner eligibility cannot infer customer approval from a ready pilot and rejects nonowners before Meta', async () => {
  let calls = 0;
  const req = { method: 'GET', headers: { cookie: `bf_session=${'a'.repeat(64)}` } };
  const makeRes = () => ({ status(n) { this.code = n; }, setHeader() {}, end(b) { this.body = JSON.parse(b); } });
  const options = { configuration: () => c, env: { LAYLA_EMBEDDED_SIGNUP_CONFIG_ID: '456' }, now: () => 1000000,
    store: { read: async () => ({ state: { activation: { readiness: { ready: true } }, openWorkerAt: 1 } }) },
    fetcher: async () => { calls++; return { ok: true, text: async () => JSON.stringify({ id: '123', config_ids: [{ id: '456' }] }) }; } };
  const denied = makeRes(); await eligibilityHandler({ ...options, sessionLookup: async () => ({ ok: true, account: { id: other } }) })(req, denied);
  assert.equal(denied.code, 403); assert.equal(calls, 0);
  const result = makeRes(); await eligibilityHandler({ ...options, sessionLookup: async () => ({ ok: true, account: { id: owner } }) })(req, result);
  assert.equal(result.code, 200); assert.equal(result.body.customerAccessApproved, false);
  assert.equal(result.body.checks.ownerNumber.status, 'passed'); assert.equal(result.body.checks.appPermissions.status, 'not_verified');
  assert.equal(result.body.checks.scheduler.status, 'needs_action'); assert(!JSON.stringify(result.body).includes(c.secret));
});
test('customer registration refuses every coexistence integration before reading credentials or contacting Meta', async () => {
  let calls = 0;
  const h = createHandler({ configuration: () => c, env: { LAYLA_CUSTOMER_ONBOARDING_ENABLED: 'true' },
    sessionLookup: async () => ({ ok: true, account: { id: owner } }),
    store: { integration: async () => ({ path: 'coexistence', coexistence_verified: true }) }, fetcher: async () => { calls++; } });
  const req = { method: 'POST', body: { action: 'register_number', integration: randomUUID(), pin: '123456' }, headers: { host: 'localhost', origin: 'http://localhost', cookie: `bf_session=${'a'.repeat(64)}; bf_csrf=${'b'.repeat(64)}`, 'x-csrf-token': 'b'.repeat(64) } };
  const res = { status(n) { this.code = n; }, setHeader() {}, end(b) { this.body = b; } };
  await h(req, res); assert.equal(res.code, 409); assert.equal(calls, 0); assert.equal(req.body.pin, undefined);
  assert(!res.body.includes('123456'));
});
test('signed customer routing uses the exclusive registry, rejects unknown bindings and persists normalized deduplication keys', async () => {
  const integration = { id: randomUUID(), account_id: other, app_id: c.app, waba_id: '456', phone_id: '789', sender: '201036755930' };
  const envelope = { object: 'whatsapp_business_account', entry: [{ id: '456', changes: [{ field: 'messages', value: { metadata: { phone_number_id: '789' }, messaging_product: 'whatsapp', messages: [{ id: 'wamid.test', from: '96899999999', type: 'text', timestamp: '1700000000', text: { body: 'services' } }] } }] }] };
  let rows;
  const registry = { binding: async (w, p) => w === '456' && p === '789' ? integration : null, inbox: async value => { rows = value; } };
  const groups = await routeCustomerEnvelope(Buffer.from(JSON.stringify(envelope)), { ...c, waba: '111', phone: '222' }, registry, 1700000000000);
  assert.equal(groups[0].integration.account_id, other);
  await persistCustomerEvents(registry, integration, groups[0].events); assert.equal(rows[0].account_id, other); assert.equal(rows[0].event.text, 'services'); assert.equal(rows[0].event_id.length, 64);
  envelope.entry[0].id = '999'; await assert.rejects(routeCustomerEnvelope(Buffer.from(JSON.stringify(envelope)), c, registry, 1700000000000), /unknown_sender_binding/);
});
test('customer credential authenticated encryption rejects tampering and tenant/asset swaps', () => {
  const i = { id: randomUUID(), app: '123', waba: '456', phone: '789' }, context = credentialContext(owner, i);
  const sealed = sealToken('SECRET_CUSTOMER_TOKEN', context, env);
  assert(!JSON.stringify(sealed).includes('SECRET_CUSTOMER_TOKEN')); assert.equal(openToken(sealed, context, env), 'SECRET_CUSTOMER_TOKEN');
  for (const wrong of [credentialContext(other, i), credentialContext(owner, { ...i, phone: '890' })]) assert.throws(() => openToken(sealed, wrong, env), /credential_unavailable/);
  assert.throws(() => openToken({ ...sealed, data: 'AAAA' }, context, env), /credential_unavailable/);
});
test('customer guard derives tenant from session and rejects account parameters, foreign origins and noninvited users', async () => {
  const req = { method: 'POST', body: { account: owner }, headers: { host: 'localhost', origin: 'http://localhost', cookie: `bf_session=${'a'.repeat(64)}; bf_csrf=${'b'.repeat(64)}`, 'x-csrf-token': 'b'.repeat(64) } };
  const lookup = async () => ({ ok: true, account: { id: other } });
  await assert.rejects(customerIdentity(req, c, {}, lookup), /customer_invitation_required/);
  assert.equal(await customerIdentity(req, c, { LAYLA_CUSTOMER_ACCOUNT_IDS: other }, lookup), other);
  await assert.rejects(customerIdentity({ ...req, headers: { ...req.headers, origin: 'https://foreign.test' } }, c, { LAYLA_CUSTOMER_ACCOUNT_IDS: other }, lookup), /origin/);
});
test('server verifies app, permissions, granted WABA, phone relationship and actual coexistence', async () => {
  const token = 'SECRET_CUSTOMER_TOKEN_LONG', waba = '456', phone = '789';
  const fixture = (url) => String(url).includes('oauth/access_token') ? { access_token: token } : String(url).includes('debug_token')
    ? { data: { is_valid: true, app_id: c.app, scopes: ['whatsapp_business_management', 'whatsapp_business_messaging'], granular_scopes: [{ scope: 'whatsapp_business_management', target_ids: [waba] }] } }
    : String(url).includes('/phone_numbers') ? { data: [{ id: phone, display_phone_number: '+20 1036755930', platform_type: 'CLOUD_API', is_on_biz_app: true }] } : { id: waba };
  const verify = (change = () => {}) => exchangeAndVerify({ c, code: 'PRIVATE_CODE', waba, phone, path: 'coexistence', fetcher: async url => { const body = fixture(url); change(body, String(url)); return { ok: true, text: async () => JSON.stringify(body) }; } });
  assert.equal((await verify()).sender, '201036755930');
  for (const change of [b => { if (b.data?.app_id) b.data.app_id = 'wrong'; }, b => { if (b.data?.scopes) b.data.scopes = []; }, b => { if (b.data?.granular_scopes) b.data.granular_scopes = []; }, b => { if (Array.isArray(b.data)) b.data[0].id = 'wrong'; }, b => { if (Array.isArray(b.data)) b.data[0].is_on_biz_app = false; }]) await assert.rejects(verify(change));
});
test('an owner system-user token without listed targets is accepted only for a WABA the owner portfolio owns', async () => {
  const token = 'OWNER_SYSTEM_USER_TOKEN_LONG', waba = '2213485365896306', phone = '1250149564857596', business = '4360221360973294';
  const fixture = url => url.includes('debug_token')
    ? { data: { is_valid: true, app_id: c.app, type: 'SYSTEM_USER', expires_at: 0, data_access_expires_at: 0, scopes: ['whatsapp_business_management', 'whatsapp_business_messaging'], granular_scopes: [{ scope: 'whatsapp_business_management' }] } }
    : url.includes('/phone_numbers') ? { data: [{ id: phone, display_phone_number: '+968 7113 4025', platform_type: 'CLOUD_API', is_on_biz_app: false }] }
    : { id: waba, owner_business_info: { id: business } };
  const verify = ({ change = () => {}, ownerBusiness = business } = {}) => exchangeAndVerify({ c, token, waba, phone, path: 'existing_cloud', ownerBusiness,
    fetcher: async url => { const body = fixture(String(url)); change(body, String(url)); return { ok: true, text: async () => JSON.stringify(body) }; } });
  assert.equal((await verify()).sender, '96871134025');
  await assert.rejects(verify({ ownerBusiness: null }), /waba_not_granted/);
  await assert.rejects(verify({ change: b => { if (b.owner_business_info) b.owner_business_info.id = '999'; } }), /waba_not_granted/);
  await assert.rejects(verify({ change: b => { if (b.data?.type) b.data.type = 'USER'; } }), /waba_not_granted/);
  await assert.rejects(verify({ change: b => { if (b.data?.granular_scopes) b.data.granular_scopes = [{ scope: 'whatsapp_business_management', target_ids: ['111'] }]; } }), /waba_not_granted/);
});
test('additive migration preserves auth and enforces sender uniqueness, callback replay and cross-tenant foreign keys', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;');
    for (const file of ['003-accounts.sql', '004-oauth-identities.sql', '007-layla-customer-onboarding.sql']) await db.exec(await readFile(new URL(`../web-chatbot/migrations/${file}`, import.meta.url), 'utf8'));
    await db.query('insert into web_accounts(id,email) values($1,$2),($3,$4)', [owner, 'owner@example.test', other, 'other@example.test']);
    await db.query('insert into layla_tenants(account_id) values($1),($2)', [owner, other]);
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      for (const table of ['layla_tenants', 'layla_integrations', 'layla_customer_inbox', 'layla_customer_outbox']) await assert.rejects(db.query(`select * from ${table}`), /permission denied/);
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    const attempt = randomUUID(), hash = 'b'.repeat(64);
    assert.equal((await db.query('select layla_signup_begin($1,$2,$3,$4) as ok', [owner, attempt, hash, 'coexistence'])).rows[0].ok, true);
    assert.equal((await db.query('select layla_signup_claim($1,$2,$3) as result', [other, attempt, hash])).rows[0].result, null);
    const claims = await Promise.all([1, 2].map(() => db.query('select layla_signup_claim($1,$2,$3) as result', [owner, attempt, hash])));
    assert.equal(claims.filter(r => r.rows[0].result).length, 1);
    const i = { id: randomUUID(), app: '123', waba: '456', phone: '789', sender: '201036755930', path: 'coexistence', coexistence: true, credential: { sealed: true } };
    assert.equal((await db.query('select layla_signup_finish($1,$2,$3) as ok', [owner, attempt, i])).rows[0].ok, true);
    const attempt2 = randomUUID();
    await db.query('select layla_signup_begin($1,$2,$3,$4)', [other, attempt2, 'c'.repeat(64), 'coexistence']);
    await db.query('select layla_signup_claim($1,$2,$3)', [other, attempt2, 'c'.repeat(64)]);
    await assert.rejects(db.query('select layla_signup_finish($1,$2,$3)', [other, attempt2, { ...i, id: randomUUID() }]), /duplicate key/);
    await assert.rejects(db.query('insert into layla_customer_inbox(account_id,integration_id,event_id,event) values($1,$2,$3,$4)', [other, i.id, 'fake', {}]), /foreign key/);
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int as n from web_accounts')).rows[0].n, 2);
  } finally { await db.close(); }
});
