import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { detachIntegration, executeReview, resetAttempts } from '../convex/reviewState.js';
import { createReviewHandler, inspectReviewConnection } from '../api/_lib/layla/review-api.js';
import { BLUE_CLOUD, reviewStore } from '../api/_lib/convex.js';
import { PilotError } from '../api/_lib/layla/config.js';
import { createSignupAttempt, signupInit, signupOptions } from '../src/lib/layla-signup.js';

const env = {CONVEX_CLOUD_URL:BLUE_CLOUD,BLUE_REVIEW_SERVICE_SECRET:'a'.repeat(64),LAYLA_CREDENTIAL_ENCRYPTION_KEY:'b'.repeat(64),BLUE_CUSTOMER_SETUP_ENABLED:'true',BLUE_REVIEW_ROUTING_APPROVED:'true',LAYLA_META_APP_ID:'1388038082832745',LAYLA_CUSTOMER_CONFIG_ID:'2144711899802123',LAYLA_META_APP_SECRET:'test-only-secret',BLUE_REVIEW_VERIFY_TOKEN:'test-verification'};
const profile = {businessName:'Blue Review Studio',sector:'Studio',services:'Portraits',prices:'20 OMR',hours:'9–5',location:'Muscat',humanContact:'team@example.com',reviewed:true};
function memory() {
  const rows = new Map(); let clock = 1000, queue = Promise.resolve();
  const db = {
    query(table) {
      const conditions=[];const matches=()=>[...rows.values()].filter(r=>r.__table===table && conditions.every(([f,v])=>String(r[f])===String(v)));
      return {withIndex(index, select) {const q={eq(f,v){conditions.push([f,v]);return q;}};select(q);return this;},async unique(){return structuredClone(matches()[0]);},async first(){return this.unique();},async take(n){return structuredClone(matches().slice(0,n));}};
    },
    async delete(id){rows.delete(id);},
    async insert(table,value){const id=randomUUID();rows.set(id,{_id:id,__table:table,...structuredClone(value)});return id;},
    async get(id){return structuredClone(rows.get(id));},
    async patch(id,value){const row=rows.get(id); for(const [k,v] of Object.entries(value)) {if(v===undefined) delete row[k];else row[k]=structuredClone(v);}},
  };
  const store = (operation,args) => {
    const run = queue.then(async()=>{const r=await executeReview({db},{operation,...args},clock); if(!r.ok) throw new PilotError(r.reason,409);return r.value;});
    queue=run.catch(()=>{});return run;
  };
  return {store,rows,db,now:()=>clock,advance:n=>{clock+=n;}};
}
const response = () => ({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;},end(v){this.body=JSON.parse(v);}});
async function client(handler, extraCookie='') {
  let cookie='',csrf='';
  const call=async(body,headers={})=>{const res=response();await handler({method:body?'POST':'GET',headers:{host:'bznsflow-blue.vercel.app',origin:'https://bznsflow-blue.vercel.app','content-type':'application/json',cookie:[cookie,extraCookie].filter(Boolean).join('; '),'x-csrf-token':csrf,...headers},body:body?structuredClone(body):undefined},res);if(res.headers['Set-Cookie']) cookie=res.headers['Set-Cookie'].split(';')[0];if(res.body.csrfToken)csrf=res.body.csrfToken;return res;};
  const initial=await call();return {call,initial};
}
function harness(overrides={}) {
  const db=memory();const effects=[];
  const fetcher=async(url,options)=>{effects.push({path:new URL(url).pathname,body:options.body});return {ok:true,text:async()=>JSON.stringify({success:true})};};
  const handler=createReviewHandler({env,store:db.store,now:db.now,fetcher,exchange:async()=>({token:'synthetic-token-'.repeat(4),sender:'96890000000'}),inspect:async()=>({isolated:true,connected:true}),...overrides});
  return {db,handler,effects};
}
async function begin(c,path='coexistence') {assert.equal((await c.call({action:'profile',businessName:profile.businessName,profile})).statusCode,200);const r=await c.call({action:'begin',path});assert.equal(r.statusCode,200);return {action:'finish',attempt:r.body.attempt,state:r.body.state,code:'secret-code',waba:'1712714900182074',phone:'1234'};}

test('anonymous sessions persist facts, isolate visitors, bind CSRF and expose no credentials',async()=>{
  const h=harness(),a=await client(h.handler),b=await client(h.handler);
  assert.match(a.initial.headers['Set-Cookie'],/Secure; HttpOnly; SameSite=Lax/);
  assert.equal((await a.call({action:'profile',businessName:profile.businessName,profile})).body.profile.businessName,profile.businessName);
  assert.equal((await b.call()).body.profile,null);
  assert.equal((await a.call()).body.profile.services,'Portraits');
  assert.equal((await a.call({action:'pause'},{origin:'https://evil.invalid'})).statusCode,403);
  assert.equal((await a.call({action:'pause'},{'x-csrf-token':'bad'})).statusCode,403);
  const preview=await a.call({action:'preview',text:'Who are you?'});assert.match(preview.body.preview,/Blue Review Studio/);assert.equal(preview.body.synthetic,true);
  h.db.advance(86400001);assert.equal((await a.call()).body.reason,'session_expired');
});
test('both callback orders finish once; other popups, stale attempts and expiry cannot finish',async()=>{
  for(const order of ['code','event']) {
    const done=[],fail=[],popup={}; const prepared={attempt:'a',state:'s',path:'coexistence',expiresAt:100};
    const a=createSignupAttempt({prepared,complete:async b=>done.push({...b}),failed:r=>fail.push(r),now:()=>1});a.capture(popup);
    const e={origin:'https://www.facebook.com',source:popup,data:{type:'WA_EMBEDDED_SIGNUP',event:'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',data:{waba_id:'1',phone_number_id:'2'}}};
    a.message({...e,source:{}});a.callback({authResponse:{code:'code'}});if(order==='event') {a.dispose(); const b=createSignupAttempt({prepared,complete:async v=>done.push({...v}),failed:r=>fail.push(r),now:()=>1});b.capture(popup);b.message(e);b.callback({authResponse:{code:'code'}});b.message(e);}else {a.message(e);a.message(e);}
    await new Promise(r=>setImmediate(r));assert.equal(done.length,1);assert.equal(fail.length,0);
  }
  let expired;const a=createSignupAttempt({prepared:{expiresAt:1},complete:()=>assert.fail(),failed:r=>expired=r,now:()=>2});a.callback({authResponse:{code:'x'}});assert.equal(expired,'attempt_expired');
});
test('single-use competing finish claims and stored path prevent duplicate exchange and coexistence registration',async()=>{
  let exchanges=0;const h=harness({exchange:async()=>{exchanges++;return {token:'t'.repeat(30),sender:'96890000000'};}});const c=await client(h.handler),body=await begin(c);
  const results=await Promise.all([c.call({...body,path:'new_number'}),c.call(body)]);
  assert.equal(exchanges,1);assert.equal(results.filter(r=>r.statusCode===200).length,1);
  const state=(await c.call()).body;assert.equal(state.integration.path,'coexistence');assert.equal(state.status,'connected');
  assert.equal((await c.call({action:'register_number',pin:'123456',confirm:true})).statusCode,409);
  assert.equal(h.effects.filter(e=>e.path.endsWith('/register')).length,0);
  assert(!JSON.stringify(state).includes('credential'));assert(!JSON.stringify(state).includes('stateHash'));assert(!JSON.stringify(state).includes('tttt'));
});
test('exchange failure, missing persistence and unverified routing never become connected',async()=>{
  for(const overrides of [{exchange:async()=>{throw Error('RAW_TOKEN-secret');}},{inspect:async()=>({isolated:false,connected:false})}]) {
    const h=harness(overrides),c=await client(h.handler),body=await begin(c);const r=await c.call(body);assert.notEqual(r.statusCode,200);assert(!JSON.stringify(r.body).includes('RAW_TOKEN'));assert.equal(h.effects.length,0);assert.notEqual((await c.call()).body.status,'connected');
  }
  const h=harness(),c=await client(h.handler);await begin(c);
  const broken=createReviewHandler({env,store:async()=>null});const res=response();await broken({method:'GET',headers:{}},res);assert.equal(res.statusCode,401);
});
test('ambiguous subscribe is never repeated; read-only refresh can establish provider readiness',async()=>{
  const h=harness({fetcher:async()=>{throw Error('uncertain');}}),c=await client(h.handler),body=await begin(c);
  assert.equal((await c.call(body)).body.status,'reconciliation_required');
  assert.equal((await c.call(body)).statusCode,409);
  assert.equal((await c.call({action:'refresh'})).body.status,'connected');
});
test('new number requires explicit PIN confirmation and registration cannot be retried after ambiguity',async()=>{
  const h=harness({inspect:async()=>({isolated:true,connected:false})}),c=await client(h.handler),body=await begin(c,'new_number');
  assert.equal((await c.call(body)).body.status,'registration_required');
  assert.equal((await c.call({action:'register_number',pin:'123456'})).statusCode,409);
  assert.equal((await c.call({action:'register_number',pin:'123456',confirm:true})).body.status,'reconciliation_required');
  assert.equal((await c.call({action:'register_number',pin:'123456',confirm:true})).statusCode,409);
  assert.equal(h.effects.filter(e=>e.path.endsWith('/register')).length,1);
  assert(!JSON.stringify([...h.db.rows.values()]).includes('123456'));
});
test('crashed operation allows read-only recovery after deadline and fences late results',async()=>{
  const h=harness(),c=await client(h.handler);await c.call(await begin(c));
  h.db.advance(5001); const row=[...h.db.rows.values()][0],old=randomUUID(),fresh=randomUUID();
  await h.db.store('claim_operation',{sessionHash:row.sessionHash,operationId:old,effect:'refresh'});
  await assert.rejects(h.db.store('claim_operation',{sessionHash:row.sessionHash,operationId:fresh,effect:'refresh'}));h.db.advance(60001);
  await h.db.store('claim_operation',{sessionHash:row.sessionHash,operationId:fresh,effect:'refresh'});
  await assert.rejects(h.db.store('result',{sessionHash:row.sessionHash,operationId:old,status:'connected'}));
  await h.db.store('result',{sessionHash:row.sessionHash,operationId:fresh,status:'reconciliation_required'});
});
test('backend rejects missing secret, wrong target, provider failure and null results',async()=>{
  for(const e of [{},{...env,CONVEX_CLOUD_URL:'https://wrong.convex.cloud'},{...env,BLUE_REVIEW_SERVICE_SECRET:''}]) await assert.rejects(reviewStore({env:e,fetcher:()=>assert.fail()})('get'));
  await assert.rejects(reviewStore({env,fetcher:async()=>({ok:false})})('get'));
});
test('routing inspection requires provider-confirmed WABA and phone override with correct app and path',async()=>{
  const callback='https://bznsflow-blue.vercel.app/api/layla-meta-webhook';
  const inspect=async(phoneOverride)=>inspectReviewConnection({c:{app:env.LAYLA_META_APP_ID,version:'v25.0'},integration:{waba:'1',phone:'2',path:'coexistence'},token:'synthetic',fetcher:async url=>({ok:true,text:async()=>JSON.stringify(String(url).includes('subscribed_apps')?{data:[{whatsapp_business_api_data:{id:env.LAYLA_META_APP_ID},override_callback_uri:callback}]}:{id:'2',status:'CONNECTED',is_on_biz_app:true,webhook_configuration:{whatsapp_business_account:callback,phone_number:phoneOverride}})})});
  assert.equal((await inspect(callback)).connected,true);assert.equal((await inspect('https://www.bznsflowai.com/api/layla-meta-webhook')).connected,false);
});

test('reload resumes the same prepared attempt and another session cannot use it',async()=>{
  const h=harness(),a=await client(h.handler),b=await client(h.handler),body=await begin(a);
  const resumed=(await a.call()).body.prepared;assert.equal(resumed.attempt,body.attempt);assert.equal(resumed.state,body.state);
  assert.equal((await b.call(body)).statusCode,409);
  assert.equal((await a.call({...body,action:'cancel'})).body.status,'cancelled');
  assert.equal((await a.call(body)).statusCode,409);
});
test('expired attempts and occupied assets cannot trigger additional subscriptions',async()=>{
  const h=harness(),a=await client(h.handler),body=await begin(a);h.db.advance(600001);assert.equal((await a.call(body)).body.reason,'attempt_expired');
  const second=await begin(a);assert.equal((await a.call(second)).body.status,'connected');
  const b=await client(h.handler),other=await begin(b);assert.equal((await b.call(other)).body.reason,'asset_in_use');assert.equal(h.effects.length,1);
});
const routedElsewhere={isolated:false,safeToSubscribe:false,pathVerified:true,phoneMatches:true,phoneRoutedElsewhere:true};
test('an owner-approved WABA and phone pair moves existing routing to Blue, including the phone override',async()=>{
  let calls=0;
  const h=harness({env:{...env,BLUE_ROUTING_TAKEOVER:'1712714900182074:1234'},inspect:async()=>calls++===0?routedElsewhere:{isolated:true,connected:true,pathVerified:true,registered:true}});
  const c=await client(h.handler),body=await begin(c,'existing_cloud');
  const r=await c.call(body);assert.equal(r.body.status,'connected');
  assert.deepEqual(h.effects.map(e=>e.path),['/v25.0/1712714900182074/subscribed_apps','/v25.0/1234']);
  const phoneOverride=JSON.parse(new URLSearchParams(h.effects[1].body).get('webhook_configuration'));
  assert.equal(phoneOverride.override_callback_uri,'https://bznsflow-blue.vercel.app/api/layla-meta-webhook');
  assert.equal((await c.call()).body.connectionChecks.routing,true);
});
test('a preselected portfolio and WABA survive reload, are validated, and must match what Meta returns',async()=>{
  const preselect={business:'4360221360973294',waba:'1712714900182074'};
  const h=harness(),c=await client(h.handler);
  assert.equal((await c.call({action:'profile',businessName:profile.businessName,profile})).statusCode,200);
  assert.equal((await c.call({action:'begin',path:'coexistence',...preselect})).body.reason,'invalid_path');
  assert.equal((await c.call({action:'begin',path:'existing_cloud',business:'12ab'})).body.reason,'invalid_signup_result');
  const r=await c.call({action:'begin',path:'existing_cloud',...preselect});assert.equal(r.statusCode,200);
  assert.deepEqual(r.body.prepared.preselect,preselect);assert.deepEqual((await c.call()).body.prepared.preselect,preselect);
  const body={action:'finish',attempt:r.body.attempt,state:r.body.state,code:'secret-code',waba:'9999',phone:'1234'};
  assert.equal((await c.call(body)).body.reason,'invalid_signup_result');assert.equal(h.effects.length,0);
});
test('the approved takeover still connects when the launch preselected its WABA',async()=>{
  let calls=0;
  const h=harness({env:{...env,BLUE_ROUTING_TAKEOVER:'1712714900182074:1234'},inspect:async()=>calls++===0?routedElsewhere:{isolated:true,connected:true,pathVerified:true,registered:true}});
  const c=await client(h.handler);
  assert.equal((await c.call({action:'profile',businessName:profile.businessName,profile})).statusCode,200);
  const r=await c.call({action:'begin',path:'existing_cloud',waba:'1712714900182074'});
  assert.equal((await c.call({action:'finish',attempt:r.body.attempt,state:r.body.state,code:'secret-code',waba:'1712714900182074',phone:'1234'})).body.status,'connected');
});
test('the server chooses the signup flow version per path',async()=>{
  for(const [path,extra,version] of [['existing_cloud',{},'v3'],['existing_cloud',{BLUE_SIGNUP_VERSION_EXISTING:'v4'},'v4'],['existing_cloud',{BLUE_SIGNUP_VERSION_EXISTING:'v99'},'v3'],['new_number',{BLUE_SIGNUP_VERSION_EXISTING:'v3'},'v4'],['coexistence',{},'v4']]) {
    const h=harness({env:{...env,...extra}}),c=await client(h.handler);
    assert.equal((await c.call({action:'profile',businessName:profile.businessName,profile})).statusCode,200);
    const r=await c.call({action:'begin',path});assert.equal(r.body.esVersion,version);assert.equal((await c.call()).body.prepared.esVersion,version);
  }
});
test('operator attempt reset restores the connection budget only while nothing is in flight',async()=>{
  const h=harness(),c=await client(h.handler);
  assert.equal((await c.call({action:'profile',businessName:profile.businessName,profile})).statusCode,200);
  const row=[...h.db.rows.values()].find(r=>r.__table==='blueReviewSessions');row.attempts=9;
  h.db.rows.set('acct-2',{_id:'acct-2',__table:'accounts',email:'owner@example.com',draftHash:row.sessionHash});row.accountId='acct-2';
  assert.equal((await resetAttempts({db:h.db.db},{email:'owner@example.com'},h.db.now())).reason,'confirmation_required');
  row.operation='op';assert.equal((await resetAttempts({db:h.db.db},{email:'owner@example.com',confirm:true},h.db.now())).reason,'operation_in_progress');delete row.operation;
  assert.deepEqual(await resetAttempts({db:h.db.db},{email:'owner@example.com',confirm:true},h.db.now()),{ok:true,value:{reset:true}});
  assert.equal(h.db.rows.get(row._id).attempts,0);
});
const OWNER={email:'ahmed@bznsflowai.com',waba:'2213485365896306',phone:'1250149564857596'};
const OWNER_TOKEN='owner-system-user-token-'.repeat(3);
const ownerEnv=(extra={})=>({...env,BLUE_ACCOUNT_SAVE_ENABLED:'true',BLUE_RESEND_API_KEY:'re_test_key_123456',BLUE_AUTH_FROM:'Blue <auth@example.com>',
  BLUE_ROUTING_TAKEOVER:`${OWNER.waba}:${OWNER.phone}`,BLUE_OWNER_CONNECT:`${OWNER.email}:${OWNER.waba}:${OWNER.phone}`,BLUE_OWNER_CONNECT_TOKEN:OWNER_TOKEN,...extra});
async function ownerClient({envExtra={},email=OWNER.email,exchange,inspect}={}) {
  const draftHash='d'.repeat(64);const exchanges=[];let inspections=0;
  const h=harness({reviewMode:false,env:ownerEnv(envExtra),accountStore:async op=>op==='session'?{id:'acct-owner',email,draftHash}:null,
    exchange:exchange||(async args=>{exchanges.push(args);return {token:args.token,phone:OWNER.phone,sender:'96871134025'};}),
    inspect:inspect||(async()=>inspections++===0?routedElsewhere:{isolated:true,connected:true,pathVerified:true,registered:true})});
  const c=await client(h.handler,`__Host-blue_account=${'a'.repeat(64)}`);
  const row=[...h.db.rows.values()].find(r=>r.__table==='blueReviewSessions'&&r.sessionHash===draftHash);row.accountId='acct-owner';
  assert.equal((await c.call({action:'profile',businessName:profile.businessName,profile})).statusCode,200);
  return {h,c,exchanges,row};
}
test('the owner connects their own directly created number with the Blue-only token, never through the browser',async()=>{
  const {h,c,exchanges}=await ownerClient();
  const before=(await c.call()).body;assert.equal(before.ownerConnectAvailable,true);
  await c.call({action:'begin',path:'existing_cloud'});
  const r=await c.call({action:'connect_owner_number'});
  assert.equal(r.statusCode,200);assert.equal(r.body.status,'connected');assert.equal(r.body.integration.path,'existing_cloud');
  assert.equal(exchanges.length,1);assert.equal(exchanges[0].token,OWNER_TOKEN);assert.equal(exchanges[0].code,undefined);
  assert.deepEqual([exchanges[0].waba,exchanges[0].phone,exchanges[0].path],[OWNER.waba,OWNER.phone,'existing_cloud']);
  assert.deepEqual(h.effects.map(e=>e.path),[`/v25.0/${OWNER.waba}/subscribed_apps`,`/v25.0/${OWNER.phone}`]);
  assert.equal(r.body.ownerConnectAvailable,false);
  for(const body of [before,r.body]) assert(!JSON.stringify(body).includes('owner-system-user-token'));
});
test('owner connection is refused for other accounts, a malformed binding or a missing token',async()=>{
  for(const setup of [{email:'someone@example.com'},{envExtra:{BLUE_OWNER_CONNECT:`${OWNER.email}:${OWNER.waba}`}},{envExtra:{BLUE_OWNER_CONNECT_TOKEN:''}},{envExtra:{BLUE_OWNER_CONNECT:`${OWNER.email}:${OWNER.waba}:12ab`}}]) {
    const {h,c,exchanges}=await ownerClient(setup);
    assert.equal((await c.call()).body.ownerConnectAvailable,false);
    const r=await c.call({action:'connect_owner_number'});assert.equal(r.statusCode,403);assert.equal(r.body.reason,'owner_connection_unavailable');
    assert.equal(exchanges.length,0);assert.equal(h.effects.length,0);
  }
});
test('a failed owner token check records a safe diagnostic and makes no provider writes',async()=>{
  const {h,c}=await ownerClient({exchange:async()=>{throw new PilotError('waba_not_granted',403);}});
  const r=await c.call({action:'connect_owner_number'});assert.equal(r.body.reason,'waba_not_granted');
  const state=(await c.call()).body;assert.equal(state.status,'failed');assert.deepEqual([state.diagnostic.reason,state.diagnostic.stage],['waba_not_granted','owner_connection']);
  assert.equal(h.effects.length,0);assert.equal(state.ownerConnectAvailable,true);
});
test('existing routing stays refused without the exact approved pair and path',async()=>{
  for(const [takeover,path] of [[undefined,'existing_cloud'],['1712714900182074:9999','existing_cloud'],['1712714900182074:1234','coexistence'],['1712714900182074:1234:1','existing_cloud']]) {
    const h=harness({env:{...env,...(takeover?{BLUE_ROUTING_TAKEOVER:takeover}:{})},inspect:async()=>routedElsewhere});
    const c=await client(h.handler),body=await begin(c,path);
    assert.equal((await c.call(body)).body.reason,'test_routing_not_verified');assert.equal(h.effects.length,0);
  }
});
async function savedConnection(h) {
  const a=await client(h.handler),body=await begin(a);assert.equal((await a.call(body)).body.status,'connected');
  const row=[...h.db.rows.values()].find(r=>r.__table==='blueReviewSessions' && r.integration);
  h.db.rows.set('acct-1',{_id:'acct-1',__table:'accounts',email:'owner@example.com',draftHash:row.sessionHash});
  row.accountId='acct-1';return {a,row};
}
const detach=(h,args={email:'Owner@Example.com ',confirm:true})=>detachIntegration({db:h.db.db},args,h.db.now());
test('operator detach clears an idle connection so the same setup can connect another number',async()=>{
  const h=harness(),{a,row}=await savedConnection(h);
  assert.equal((await a.call({action:'begin',path:'coexistence'})).body.reason,'operation_conflict');
  assert.equal((await detach(h,{email:'owner@example.com'})).reason,'confirmation_required');
  assert.deepEqual(await detach(h),{ok:true,value:{detached:true}});
  const after=h.db.rows.get(row._id);
  assert.equal(after.status,'business_saved');assert.equal(after.integration,undefined);assert.equal(after.phone,undefined);assert.equal(after.connectionChecks,undefined);
  assert.equal(after.profile.businessName,profile.businessName);assert.equal(after.accountId,'acct-1');
  assert.equal([...h.db.rows.values()].filter(r=>r.__table==='blueAssetClaims').length,0);
  assert.equal((await a.call({action:'begin',path:'coexistence'})).statusCode,200);
  assert.equal((await detach(h)).reason,'not_connected');
});
test('operator detach refuses while Layla is active or a send is still open',async()=>{
  const h=harness(),{row}=await savedConnection(h);
  h.db.rows.set('control',{_id:'control',__table:'blueMessagingControls',integrationId:row.integration.id,active:true});
  assert.equal((await detach(h)).reason,'messaging_active');
  h.db.rows.get('control').active=false;
  h.db.rows.set('msg',{_id:'msg',__table:'blueMessages',integrationId:row.integration.id,status:'ambiguous'});
  assert.equal((await detach(h)).reason,'sends_pending');
  h.db.rows.delete('msg');
  h.db.rows.set('camp',{_id:'camp',__table:'blueCampaigns',integrationId:row.integration.id,status:'scheduled'});
  assert.equal((await detach(h)).reason,'campaign_open');
  h.db.rows.delete('camp');
  assert.equal((await detach(h)).ok,true);assert.equal(h.db.rows.has('control'),false);
  assert.equal((await executeReview({db:h.db.db},{operation:'detach',sessionHash:row.sessionHash},h.db.now())).reason,'operation_conflict');
});
test('a failed signup keeps its diagnostic until the next attempt is prepared',async()=>{
  const h=harness(),a=await client(h.handler);assert.equal((await a.call(await begin(a))).body.status,'connected');
  const b=await client(h.handler),other=await begin(b);assert.equal((await b.call(other)).body.reason,'asset_in_use');
  const failed=(await b.call()).body;assert.equal(failed.status,'failed');assert.deepEqual({reason:failed.diagnostic.reason,stage:failed.diagnostic.stage},{reason:'asset_in_use',stage:'verification'});
  const retry=await b.call({action:'begin',path:'coexistence'});assert.equal(retry.statusCode,200);assert.equal(retry.body.diagnostic,null);
});
test('Blue review webhook checks challenge/signature and never creates message jobs',async()=>{
  const {blueReviewWebhook}=await import('../api/layla-meta-webhook.js');
  const {createHmac}=await import('node:crypto');const {Readable}=await import('node:stream');
  const r=response();await blueReviewWebhook({method:'GET',url:'/api/layla-meta-webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123'},r,env);assert.equal(r.statusCode,403);
  const raw=JSON.stringify({object:'whatsapp_business_account',entry:[{id:'1712714900182074',changes:[]}]});
  for(const valid of [false,true]) {
    const req=Readable.from([Buffer.from(raw)]);req.method='POST';req.headers={'x-hub-signature-256':valid?'sha256='+createHmac('sha256',env.LAYLA_META_APP_SECRET).update(raw).digest('hex'):'wrong'};
    const r=response();await blueReviewWebhook(req,r,env);assert.equal(r.statusCode,valid?200:403);if(valid){assert.equal(r.body.ignored,true);assert.equal(r.body.messagingEnabled,false);}
  }
});

test('Embedded Signup explicitly opts out of SDK FedCM defaults and retains config/code parameters',()=>{
  const prepared={appId:'1388038082832745',configId:'2144711899802123',version:'v25.0',path:'coexistence'};
  assert.equal(signupInit(prepared).fedCM,false);
  const options=signupOptions(prepared);assert.equal(options.config_id,prepared.configId);assert.equal(options.response_type,'code');assert.equal(options.override_default_response_type,true);assert.equal(options.scope,undefined);
});

test('preview-first accepts missing contact, persists answer and step, and does not connect or send', async () => {
  const h = harness(), c = await client(h.handler);
  assert.equal((await c.call({action:'preview',text:'What services do you offer?'})).statusCode,409);
  const saved = await c.call({action:'profile',businessName:profile.businessName,profile:{...profile,humanContact:''}});
  assert.equal(saved.body.journeyStep,2); assert.equal(saved.body.capabilities.preview,true); assert.equal(saved.body.capabilities.connect,false);
  assert.equal((await c.call({action:'begin',path:'new_number'})).statusCode,409);
  const preview = await c.call({action:'preview',text:'What services do you offer?'});
  assert.equal(preview.body.preview,'Portraits'); assert.deepEqual(preview.body.sourceFields,['services']);
  assert.equal((await c.call()).body.lastPreview.text,'Portraits');
  assert.equal((await c.call({action:'review_preview',profileVersion:preview.body.profileVersion})).body.journeyStep,3);
  assert.equal((await c.call()).body.journeyStep,3); assert.equal(h.effects.length,0);
});
test('editing facts during reconciliation preserves integration and invalidates preview approval', async () => {
  const h = harness({inspect:async()=>({isolated:true,connected:false})}), c = await client(h.handler);
  await c.call(await begin(c,'new_number'));
  await c.call({action:'register_number',pin:'654321',confirm:true});
  const before=(await c.call()).body;
  await c.call({action:'preview',text:'What are your prices?'});
  await c.call({action:'review_preview',profileVersion:before.profileVersion});
  const edited=await c.call({action:'profile',businessName:profile.businessName,profile:{...profile,prices:'30 OMR'}});
  assert.equal(edited.body.status,'reconciliation_required'); assert.equal(edited.body.integration.id,before.integration.id);
  assert.equal(edited.body.lastPreview,null); assert.equal(edited.body.previewReviewedVersion,null);
  assert.equal((await c.call({action:'review_preview',profileVersion:before.profileVersion})).statusCode,409);
  assert.equal((await c.call({action:'save_progress',journeyStep:3})).statusCode,409);
  assert.equal((await c.call({action:'preview',text:'What are your prices?'})).body.preview,'30 OMR');
  assert.equal(h.effects.filter(e=>e.path.endsWith('/register')).length,1);
});
test('unknown answers explain missing facts without inventing a source', async () => {
  const h=harness(), c=await client(h.handler);
  await c.call({action:'profile',businessName:profile.businessName,profile:{...profile,prices:'',humanContact:''}});
  const r=await c.call({action:'preview',text:'How much does it cost?'});
  assert.equal(r.body.needsHuman,true); assert.deepEqual(r.body.sourceFields,[]);
  assert.match(r.body.preview,/Add your team/); assert.equal(h.effects.length,0);
});

test('Coexistence WABA-only completion resolves on the server and requires selection for multiple phones',async()=>{
  let result; const popup={};
  const a=createSignupAttempt({prepared:{attempt:'a',state:'s',path:'coexistence',expiresAt:100},complete:async v=>{result=v;},failed:()=>assert.fail(),now:()=>1});a.capture(popup);
  a.message({origin:'https://www.facebook.com',source:popup,data:{type:'WA_EMBEDDED_SIGNUP',event:'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',data:{waba_id:'1'}}});a.callback({authResponse:{code:'x'}});
  await new Promise(r=>setImmediate(r));assert.equal(result.waba,'1');assert.equal(result.phone,undefined);
  let exchanges=0;
  const h=harness({exchange:async({phone,token})=>{if(!token){exchanges++;return {token:'t'.repeat(30),candidates:[{id:'12',sender:'96890000001'},{id:'13',sender:'96890000002'}]};}return {token,phone,sender:'96890000002'};}});
  const c=await client(h.handler),body=await begin(c);delete body.phone;
  const pending=await c.call(body);assert.equal(pending.body.status,'selection_required');assert.equal(pending.body.selection.candidates.length,2);
  assert.equal(h.effects.length,0);assert(!JSON.stringify(pending.body).includes('credential'));
  assert.equal((await c.call({action:'select_phone',phone:'99'})).statusCode,400);
  assert.equal((await c.call({action:'select_phone',phone:'13'})).body.status,'connected');assert.equal(exchanges,1);assert.equal(h.effects.length,1);
  assert.equal((await c.call({action:'select_phone',phone:'12'})).statusCode,409);
});
test('existing Cloud API setup cannot register the number, and diagnostics retain only safe provider code',async()=>{
  const h=harness({fetcher:async()=>({ok:false,text:async()=>JSON.stringify({error:{code:2655122,message:'SECRET_PROVIDER_PAYLOAD'}})})});
  const c=await client(h.handler);const r=await c.call(await begin(c,'existing_cloud'));
  assert.equal(r.body.status,'reconciliation_required');assert.equal(r.body.diagnostic.providerCode,2655122);
  assert(!JSON.stringify(r.body).includes('SECRET_PROVIDER_PAYLOAD'));
  assert.equal((await c.call({action:'register_number',pin:'123456',confirm:true})).statusCode,409);
});
