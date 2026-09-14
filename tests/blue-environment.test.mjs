import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBlue } from '../scripts/check-blue-environment.mjs';
import blueHandler from '../api/layla-meta.js';
import { demoOptions } from '../api/_lib/layla/blue-demo.js';
import { INDUSTRIES } from '../src/lib/industries.js';
import { suggestionsFor, LAYLA_SUGGESTIONS } from '../src/lib/layla-suggestions.js';

const response = () => ({ headers: {}, setHeader(k,v) { this.headers[k] = v; }, status(n) { this.statusCode = n; }, end(body) { this.body = JSON.parse(body); } });

test('Blue guard refuses Green project, production storage, live transports and outbound credentials', () => {
  assert.doesNotThrow(() => checkBlue({}, {projectId:'prj_TOWvngBTz4mVpI0p0Rrtgk62ZF1Q'}));
  assert.throws(() => checkBlue({}, {projectId:'prj_4UheWOGFd6uC8yEgsM9J7eEcmu9t'}));
  for (const env of [{SUPABASE_URL:'https://svmrfzahbgmvesclbqke.supabase.co',BLUE_SUPABASE_PROJECT_REF:'svmrfzahbgmvesclbqke'}, {LAYLA_META_ACCESS_TOKEN:'secret'}, {LAYLA_META_MODE:'live'}, {LAYLA_OPEN_TEST_ENABLED:'true'}, {LAYLA_META_KILL_SWITCH:'false'}, {LEAD_ENDPOINT:'https://production.invalid'}]) assert.throws(() => checkBlue(env));
});

test('Blue demo loads without login or external fetches and keeps simulated sessions separate', async t => {
  t.mock.method(globalThis,'fetch',async()=>{throw Error('network forbidden');});
  const res = response(); await blueHandler({method:'GET',url:'/api/layla-meta',headers:{}},res);
  assert.equal(res.statusCode,200); assert.equal(res.body.mode,'mock'); assert.equal(res.body.paused,true);
  assert(res.headers['Set-Cookie'].includes('HttpOnly'));
  const cookie=res.headers['Set-Cookie'].split(';')[0];
  const a=demoOptions({headers:{cookie}},response()),b=demoOptions({headers:{}},response());
  const row=await a.store.read();row.state.profile.services='First session only';
  await a.store.cas(a.configuration(),row.revision,row.state);
  assert.notEqual((await b.store.read()).state.profile.services,'First session only');
  await assert.rejects(a.fetcher('https://graph.facebook.com'),/blue_integrations_disabled/);
});

test('Blue demo rejects cross-origin mutations and cannot enable open live tests', async () => {
  for(const [origin,surface,body] of [['https://foreign.invalid','',{action:'pause',paused:false}],['https://blue.invalid','open',{action:'prepare',profile:{}}]]) {
    const res=response(); await blueHandler({method:'POST',url:'/api/layla-meta'+(surface?'?surface='+surface:''),body,headers:{host:'blue.invalid',origin,'x-csrf-token':'b'.repeat(64)}},res);
    assert.notEqual(res.statusCode,200); assert.equal(res.body.ok,false);
  }
});

test('Customer entry never inherits the public demo identity and status exposes no configuration', async () => {
  const status=response(); await blueHandler({method:'GET',url:'/api/layla-meta?surface=customer-status',headers:{}},status);
  assert.deepEqual(status.body,{ok:true,available:false});
  const customer=response(); const req={method:'POST',url:'/api/layla-meta?surface=customer',headers:{},body:{action:'begin',path:'coexistence'}};
  await blueHandler(req,customer);
  assert.equal(customer.statusCode,503); assert.equal(req.headers.cookie,undefined);
  assert.equal(customer.body.reason,'review_backend_unavailable');
});

test('Real Blue setup cannot bypass database and webhook isolation or enable general sends', () => {
  assert.throws(()=>checkBlue({LAYLA_META_APP_SECRET:'test',BLUE_CUSTOMER_SETUP_ENABLED:'true'}));
  const env={CONVEX_CLOUD_URL:'https://quaint-nightingale-675.eu-west-1.convex.cloud',BLUE_REVIEW_SERVICE_SECRET:'a'.repeat(64),LAYLA_CREDENTIAL_ENCRYPTION_KEY:'b'.repeat(64),BLUE_CUSTOMER_SETUP_ENABLED:'true',BLUE_REVIEW_ROUTING_APPROVED:'true',LAYLA_META_APP_SECRET:'test'};
  assert.doesNotThrow(()=>checkBlue(env));
  assert.throws(()=>checkBlue({...env,LAYLA_META_KILL_SWITCH:'false'}));
});

test('Every canonical industry has localized, contextual onboarding suggestions', () => {
  for (const industry of INDUSTRIES) {
    assert(LAYLA_SUGGESTIONS[industry.id], `missing ${industry.id}`);
    for (const lang of ['en', 'ar']) {
      const result = suggestionsFor(industry.id, lang);
      assert(result.service.length > 10, `${industry.id} ${lang} service`);
      assert.equal(result.questions.length, 4, `${industry.id} questions`);
      assert(result.questions.every(question => question.length > 8));
    }
  }
});

test('Review refuses synthetic connection success when backend is unavailable', async () => {
  for (const action of ['begin','finish']) {
    const res = response();
    await blueHandler({method:'POST',url:'/api/layla-meta?surface=customer-review',headers:{},body:{action,code:'review-code',path:'coexistence'}},res);
    assert.equal(res.statusCode,503); assert.equal(res.body.ok,false); assert.equal(res.body.integration,undefined);
  }
});

test('Dashboard and Broadcast gates are independent and Broadcast requires live messaging and worker credentials', async () => {
  const base={CONVEX_CLOUD_URL:'https://quaint-nightingale-675.eu-west-1.convex.cloud',BLUE_REVIEW_SERVICE_SECRET:'a'.repeat(64),BLUE_ACCOUNT_SAVE_ENABLED:'true'};
  assert.doesNotThrow(()=>checkBlue({...base,BLUE_DASHBOARD_ENABLED:'true'}));
  assert.throws(()=>checkBlue({BLUE_DASHBOARD_ENABLED:'true'}),/dashboard requires/);
  assert.throws(()=>checkBlue({...base,BLUE_DASHBOARD_ENABLED:'true',BLUE_BROADCAST_ENABLED:'true'}),/broadcast requires/);
  assert.throws(()=>checkBlue({...base,BLUE_BROADCAST_ENABLED:'true',BLUE_LIVE_MESSAGING_ENABLED:'true',BLUE_MESSAGING_WORKER_SECRET:'c'.repeat(64)}),/requires/);
  // With the dashboard gate off, the dashboard surface is unavailable and exposes nothing.
  const res=response();
  await blueHandler({method:'GET',url:'/api/layla-meta?surface=dashboard',headers:{host:'bznsflow-blue.vercel.app'}},res);
  assert.equal(res.statusCode,503); assert.deepEqual(res.body,{ok:false,reason:'dashboard_unavailable'});
});
