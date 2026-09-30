import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { exchangeInstagram, inspectInstagram, verifiedInstagramRequest, createInstagramApi, INSTAGRAM_CALLBACK, INSTAGRAM_SCOPES } from '../api/_lib/layla/instagram.js';
import { createBlueWorker, createMessagingApi, ingestInstagramEnvelope, instagramSendResult } from '../api/_lib/layla/blue-messaging.js';
import { BLUE_CLOUD } from '../api/_lib/convex.js';
import { sealToken,credentialContext } from '../api/_lib/layla/customer-meta.js';
import { PilotError } from '../api/_lib/layla/config.js';
import { blueReviewWebhook } from '../api/layla-meta-webhook.js';

const env={CONVEX_CLOUD_URL:BLUE_CLOUD,BLUE_REVIEW_SERVICE_SECRET:'a'.repeat(64),LAYLA_CREDENTIAL_ENCRYPTION_KEY:'b'.repeat(64),BLUE_INSTAGRAM_ENABLED:'true',BLUE_INSTAGRAM_APP_ID:'1234',BLUE_INSTAGRAM_APP_SECRET:'synthetic-secret',BLUE_INSTAGRAM_SEND_ENABLED:'true',BLUE_INSTAGRAM_TEST_SENDERS:'178900000000001',BLUE_MESSAGING_WORKER_SECRET:'c'.repeat(64)};
const c={app:'1234',secret:env.BLUE_INSTAGRAM_APP_SECRET,version:'v25.0'};
const response=()=>({headers:{},getHeader(k){return this.headers[k];},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;},end(value){this.body=value?JSON.parse(value):null;}});
test('Instagram webhook accepts either of our app secrets, and nothing else',async()=>{
  // Meta's docs say "your app's App Secret" without saying which of the two
  // apps signs Instagram Login webhooks. Both secrets are ours, so accept either.
  const body=Buffer.from(JSON.stringify({object:'instagram',entry:[]}));
  const signed=secret=>({method:'POST',url:'/api/layla-meta-webhook?channel=instagram',body,headers:{'x-hub-signature-256':`sha256=${createHmac('sha256',secret).update(body).digest('hex')}`}});
  const configured={...env,LAYLA_META_APP_SECRET:'parent-secret'};
  const parent=response();await blueReviewWebhook(signed('parent-secret'),parent,configured);assert.equal(parent.statusCode,200);
  const instagram=response();await blueReviewWebhook(signed(env.BLUE_INSTAGRAM_APP_SECRET),instagram,configured);assert.equal(instagram.statusCode,200);
  const override=response();await blueReviewWebhook(signed('override-secret'),override,{...configured,BLUE_INSTAGRAM_WEBHOOK_SECRET:'override-secret'});assert.equal(override.statusCode,200);
  const forged=response();await blueReviewWebhook(signed('someone-else'),forged,configured);assert.equal(forged.statusCode,403);
});
test('Instagram authorization exchanges credentials only on server and verifies both grants',async()=>{
  const urls=[];
  const answers=[{data:[{access_token:'short',permissions:INSTAGRAM_SCOPES}]},{access_token:'long',expires_in:3600},{user_id:'178414000000001',username:'bznsflow'}];
  const result=await exchangeInstagram({c,code:'one-use-code',now:()=>1000,fetcher:async(url,options)=>{urls.push(String(url));assert.equal(options.redirect,'error');return new Response(JSON.stringify(answers.shift()));}});
  assert.equal(result.igAccount,'178414000000001');assert.equal(result.tokenExpiresAt,3601000);
  assert.match(urls[0],/^https:\/\/api.instagram.com\/oauth\/access_token$/);
  await assert.rejects(exchangeInstagram({c,code:'code',fetcher:async()=>new Response(JSON.stringify({data:[{access_token:'short',permissions:['instagram_business_basic']}]}))}),/instagram_permissions_missing/);
});
test('signed deauthorization and deletion reject tampering',()=>{
  const payload=Buffer.from(JSON.stringify({algorithm:'HMAC-SHA256',issued_at:1000,user_id:'178414000000001'})).toString('base64url');
  const sig=createHmac('sha256',c.secret).update(payload).digest('base64url');
  assert.deepEqual(verifiedInstagramRequest(`${sig}.${payload}`,c.secret,1000000),{igAccount:'178414000000001',issuedAt:1000000});
  assert.throws(()=>verifiedInstagramRequest(`${sig}.bad`,c.secret,1000000),/invalid_signed_request/);
});
test('connection initiation requires authenticated same-origin CSRF and requests only DM scopes',async()=>{
  const calls=[];const store=async(op,args)=>{calls.push({op,args});return null;};
  const api=createInstagramApi({env,store,accounts:async()=>({id:'a',draftHash:'d'.repeat(64)})});
  const csrf='e'.repeat(64),req={method:'POST',url:'/api/layla-meta?surface=instagram',headers:{host:'bznsflow-blue.vercel.app',origin:'https://bznsflow-blue.vercel.app',cookie:`__Host-blue_account=${'f'.repeat(64)}; bf_csrf=${csrf}`,'x-csrf-token':csrf},body:{action:'connect',lang:'en'}};
  const r=response();await api(req,r);assert.equal(r.statusCode,200);
  const url=new URL(r.body.url);assert.equal(url.searchParams.get('redirect_uri'),INSTAGRAM_CALLBACK);assert.equal(url.searchParams.get('scope'),INSTAGRAM_SCOPES.join(','));
  assert.equal(calls[0].op,'begin');assert.notEqual(calls[0].args.stateHash,url.searchParams.get('state'));
  const rejected=response();await api({...req,headers:{...req.headers,origin:'https://evil.invalid'}},rejected);assert.equal(rejected.statusCode,403);
});
test('a retry skips the forced Instagram login so a dropped sign-in can finish',async()=>{
  // Instagram sometimes lands a freshly signed-in person on its feed and never
  // returns. On retry the browser is already signed in, so without force_reauth
  // Instagram goes straight to the Allow screen.
  const calls=[];const store=async(op,args)=>{calls.push({op,args});return null;};
  const api=createInstagramApi({env,store,accounts:async()=>({id:'a',draftHash:'d'.repeat(64)})});
  const csrf='e'.repeat(64),req=body=>({method:'POST',url:'/api/layla-meta?surface=instagram',headers:{host:'bznsflow-blue.vercel.app',origin:'https://bznsflow-blue.vercel.app',cookie:`__Host-blue_account=${'f'.repeat(64)}; bf_csrf=${csrf}`,'x-csrf-token':csrf},body});
  const urlFor=async body=>{const r=response();await api(req(body),r);assert.equal(r.statusCode,200);return new URL(r.body.url);};
  const first=await urlFor({action:'connect',lang:'en'});
  const retry=await urlFor({action:'connect',lang:'en',retry:true});
  const spoofed=await urlFor({action:'connect',lang:'en',retry:'true'});
  assert.equal(first.searchParams.get('force_reauth'),'true');
  assert.equal(retry.searchParams.has('force_reauth'),false);
  assert.equal(spoofed.searchParams.get('force_reauth'),'true');
  for(const key of ['client_id','redirect_uri','response_type','scope']) assert.equal(retry.searchParams.get(key),first.searchParams.get(key));
  assert.notEqual(retry.searchParams.get('state'),first.searchParams.get('state'));
  assert.deepEqual(calls.map(c=>c.op),['begin','begin','begin']);
});
test('Instagram webhook routes by server-bound account and sends unsupported media to a human',async()=>{
  const calls=[];const binding={channel:'instagram',app:'1234',igAccount:'178414000000001',integrationId:'connection',profileVersion:1};
  await ingestInstagramEnvelope({object:'instagram',entry:[{id:binding.igAccount,messaging:[{sender:{id:'178900000000001'},recipient:{id:binding.igAccount},timestamp:1000,message:{mid:'mid.1',attachments:[{type:'image'}]}}]}]}, {app:'1234',now:()=>1000,store:async(op,args)=>{calls.push({op,args});return op==='binding'?binding:null;}});
  assert.equal(calls[1].args.events[0].handoff,true);assert.equal(calls[1].args.events[0].reply,null);
  assert.equal(calls[0].args.channel,'instagram');
});
test('Instagram send result never invents delivery or retries uncertain responses',()=>{
  assert.deepEqual(instagramSendResult(200,{recipient_id:'1',message_id:'mid.1'},'1'),{status:'submitted',providerId:'mid.1'});
  assert.equal(instagramSendResult(200,{recipient_id:'2',message_id:'mid.1'},'1').status,'ambiguous');
  assert.equal(instagramSendResult(503,{},'1').status,'ambiguous');
});
test('Instagram worker uses its own host and recipient shape, with independent sending gate',async()=>{
  const integration={id:'ig-connection',channel:'instagram',app:'1234',igAccount:'178414000000001'};
  const sessionHash='d'.repeat(64);integration.credential=sealToken('synthetic-token',credentialContext(sessionHash,integration),env);
  const job={jobId:'job',intent:'intent',number:'178900000000001',text:'Hello',integration,sessionHash};
  const operations=[];let sends=0;
  const store=async(op,args)=>{operations.push({op,args});return op==='claim'?job:op==='send_gate'?true:null;};
  const worker=createBlueWorker({env,store,fetcher:async(url,options)=>{
    sends++;assert.equal(url,'https://graph.instagram.com/v25.0/178414000000001/messages');
    assert.deepEqual(JSON.parse(options.body),{recipient:{id:job.number},message:{text:'Hello'}});
    return new Response(JSON.stringify({recipient_id:job.number,message_id:'mid.sent'}));
  }});
  const req={method:'POST',headers:{authorization:`Bearer ${env.BLUE_MESSAGING_WORKER_SECRET}`},body:{jobId:'job'}};
  const r=response();await worker(req,r);assert.equal(r.statusCode,200);assert.equal(sends,1);assert.equal(operations.at(-1).args.status,'submitted');
  const blocked=createBlueWorker({env:{...env,BLUE_INSTAGRAM_TEST_SENDERS:''},store,fetcher:()=>assert.fail('No send outside test allowlist')});
  await blocked(req,response());assert.equal(operations.at(-1).args.reason,'test_recipient_not_allowed');
});
test('Instagram callback always returns to the setup page, with only allowlisted reasons',async()=>{
  const state='a'.repeat(64);
  const cookie=`__Host-blue_account=${'f'.repeat(64)}`;
  const callback=(query)=>({method:'GET',url:`/api/layla-meta?${query}`,headers:{host:'bznsflow-blue.vercel.app',cookie}});
  const run=async({query=`state=${state}&code=one-use`,store,accounts=async()=>({id:'a',draftHash:'d'.repeat(64)}),fetcher}={})=>{
    const r=response();
    await createInstagramApi({env,store,accounts,fetcher})(callback(query),r,'instagram-callback');
    assert.equal(r.statusCode,303);
    const location=new URL(r.headers.Location);
    assert.equal(location.origin,'https://bznsflow-blue.vercel.app');
    return location;
  };
  const graph=[{data:[{access_token:'short',permissions:INSTAGRAM_SCOPES}]},{access_token:'long',expires_in:3600},{user_id:'178414000000001',username:'bznsflow'},{success:true},{user_id:'178414000000001',username:'bznsflow'},{data:[{id:'1234',subscribed_fields:['messages']}]}];
  const ops=[];
  const ok=await run({store:async(op)=>{ops.push(op);return op==='consume'?{lang:'en'}:null;},fetcher:async()=>new Response(JSON.stringify(graph.shift()))});
  assert.equal(ok.pathname,'/en/layla/setup');assert.equal(ok.searchParams.get('instagram'),'connected');assert.equal(ok.searchParams.has('reason'),false);
  assert.deepEqual(ops,['consume','connect','checked']);

  const signedOut=await run({store:async()=>null,accounts:async()=>null});
  assert.equal(signedOut.pathname,'/layla/setup');assert.equal(signedOut.searchParams.get('reason'),'sign_in_required');

  const badState=await run({query:'state=nope&code=x',store:async()=>null});
  assert.equal(badState.searchParams.get('instagram'),'connection_failed');assert.equal(badState.searchParams.get('reason'),'invalid_oauth_state');

  const declined=await run({query:'error=access_denied&error_reason=user_denied',store:async()=>null});
  assert.equal(declined.searchParams.get('instagram'),'cancelled');

  const grants=[{data:[{access_token:'short',permissions:INSTAGRAM_SCOPES}]},{access_token:'long',expires_in:3600},{user_id:'178414000000001',username:'bznsflow'}];
  const taken=await run({store:async(op)=>{if(op==='connect')throw new PilotError('asset_in_use',409);return op==='consume'?{lang:'ar'}:null;},fetcher:async()=>new Response(JSON.stringify(grants.shift()))});
  assert.equal(taken.pathname,'/layla/setup');assert.equal(taken.searchParams.get('reason'),'asset_in_use');

  const scopes=await run({store:async(op)=>op==='consume'?{lang:'en'}:null,fetcher:async()=>new Response(JSON.stringify({data:[{access_token:'short',permissions:['instagram_business_basic']}]}))});
  assert.equal(scopes.searchParams.get('reason'),'instagram_permissions_missing');

  const provider=await run({store:async(op)=>op==='consume'?{lang:'en'}:null,fetcher:async()=>new Response(JSON.stringify({error:{code:1,message:'internal detail'}}),{status:500})});
  assert.equal(provider.searchParams.get('instagram'),'connection_failed');assert.equal(provider.searchParams.get('reason'),'instagram_provider_failed','only our own allowlisted word');assert(!provider.href.includes('internal'),'Meta\'s own error text never reaches the URL');
});

test('an Instagram return that lost its surface parameter still reaches the callback',async()=>{
  const {requestSurface}=await import('../api/layla-meta.js');
  const state='a'.repeat(64);
  const get=(url)=>({method:'GET',url,headers:{}});
  assert.equal(requestSurface(get('/api/layla-meta?surface=dashboard')),'dashboard');
  assert.equal(requestSurface(get(`/api/layla-meta?code=abc&state=${state}`)),'instagram-callback');
  assert.equal(requestSurface(get(`/api/layla-meta?error=access_denied&error_reason=user_denied&state=${state}`)),'instagram-callback');
  assert.equal(requestSurface(get('/api/layla-meta?code=abc&state=short')),null,'only our own 64-hex state is recognised');
  assert.equal(requestSurface({method:'POST',url:`/api/layla-meta?code=abc&state=${state}`,headers:{}}),null,'only a browser GET is a return');
  assert.equal(requestSurface(get('/api/layla-meta')),null);
});

test('the OAuth redirect has no query string, because Instagram drops it on return',()=>{
  const redirect=new URL(INSTAGRAM_CALLBACK);
  assert.equal(redirect.search,'','a query would make the code exchange fail with a redirect_uri mismatch');
  assert.equal(redirect.href,'https://bznsflow-blue.vercel.app/api/layla-meta');
});

test('subscription check reads app_id or id, and fields as a list or a string',async()=>{
  const integration={channel:'instagram',app:'1234',igAccount:'178414000000001'};
  const check=subs=>inspectInstagram({c:{...c,parent:'999'},integration,token:'t',fetcher:async url=>new Response(JSON.stringify(String(url).includes('subscribed_apps')?subs:{user_id:'178414000000001'}))});
  assert.equal((await check({data:[{id:'1234',subscribed_fields:['messages']}]})).connected,true);
  assert.equal((await check({data:[{app_id:'999',subscribed_fields:'messages,comments'}]})).connected,true);
  assert.equal((await check({data:[{id:'5555',subscribed_fields:['messages']}]})).connected,false,'another app does not count');
  const live=await inspectInstagram({c:{...c,app:'1674756910890232',parent:'1388038082832745'},integration:{...integration,app:'1674756910890232'},token:'t',fetcher:async url=>new Response(JSON.stringify(String(url).includes('subscribed_apps')?{data:[{id:'18118498949004481',subscribed_fields:['messages']}]}:{user_id:'178414000000001'}))});
  assert.equal(live.connected,true,'Meta reports our app under its Instagram-side ID (seen live 2026-09-24)');
  assert.equal((await check({data:[]})).connected,false);
});

test('connect subscribes with the fields in the query, and finishes when Meta confirms the subscribe',async()=>{
  const state='b'.repeat(64),calls=[],ops=[];
  const answers=[{data:[{access_token:'short',permissions:INSTAGRAM_SCOPES}]},{access_token:'long',expires_in:3600},{user_id:'178414000000001',username:'bznsflow'},{success:true},{user_id:'178414000000001'},{data:[]}];
  const fetcher=async(url,options)=>{calls.push({url:String(url),method:options.method||'GET',body:options.body});return new Response(JSON.stringify(answers.shift()));};
  const store=async(op,args)=>{ops.push({op,args});return op==='consume'?{lang:'en'}:null;};
  const r=response();
  await createInstagramApi({env,store,fetcher,accounts:async()=>({id:'a',draftHash:'d'.repeat(64)})})({method:'GET',url:`/api/layla-meta?code=one-use&state=${state}`,headers:{host:'bznsflow-blue.vercel.app',cookie:`__Host-blue_account=${'f'.repeat(64)}`}},r,'instagram-callback');
  const subscribe=calls.find(x=>x.method==='POST' && x.url.includes('/subscribed_apps'));
  assert.equal(new URL(subscribe.url).searchParams.get('subscribed_fields'),'messages','Meta documents the fields as a query parameter');
  assert.equal(new URL(r.headers.Location).searchParams.get('instagram'),'connected');
  assert.equal(ops.find(o=>o.op==='checked').args.connected,true);
});

test('an Instagram sender is shown by their @username, looked up once per message batch',async()=>{
  const {displayName}=await import('../convex/blueContacts.js');
  assert.deepEqual(displayName({channel:'instagram',igId:'1089774000208272',profileName:'@yungramsis21'}),{name:'@yungramsis21',source:'instagram'});
  assert.deepEqual(displayName({channel:'instagram',igId:'1089774000208272'}),{name:'Instagram 1089774000208272',source:'instagram'});
  assert.equal(displayName({waId:'96890000000',profileName:'Sara'}).source,'whatsapp');

  const integration={id:'ig-connection',channel:'instagram',app:'1234',igAccount:'178414000000001'};
  const sessionHash='d'.repeat(64);integration.credential=sealToken('synthetic-token',credentialContext(sessionHash,integration),env);
  const binding={channel:'instagram',app:'1234',igAccount:integration.igAccount,integrationId:integration.id,profileVersion:1,sessionHash,integration,profile:{services:'AI front desk',faqs:[],humanContact:'team@example.test',reviewed:true}};
  const message=(mid,text)=>({sender:{id:'1089774000208272'},recipient:{id:integration.igAccount},timestamp:1000,message:{mid,text}});
  const lookups=[],calls=[];
  const fetcher=async(url,options)=>{lookups.push(String(url));assert.equal(options.headers.Authorization,'Bearer synthetic-token');return new Response(JSON.stringify({username:'yungramsis21',id:'1089774000208272'}));};
  await ingestInstagramEnvelope({object:'instagram',entry:[{id:integration.igAccount,messaging:[message('mid.1','hello'),message('mid.2','hi again')]}]},{app:'1234',env,fetcher,now:()=>1000,store:async(op,args)=>{calls.push({op,args});return op==='binding'?binding:null;}});
  assert.equal(lookups.length,1,'one profile lookup per sender per batch');
  assert.match(lookups[0],/^https:\/\/graph\.instagram\.com\/v25\.0\/1089774000208272\?fields=username$/);
  assert.deepEqual(calls.find(c=>c.op==='ingest').args.events.map(e=>e.profileName),['@yungramsis21','@yungramsis21']);

  const quiet=[];
  await ingestInstagramEnvelope({object:'instagram',entry:[{id:integration.igAccount,messaging:[message('mid.3','hello')]}]},{app:'1234',env,now:()=>1000,fetcher:async()=>new Response('{"error":{"code":10}}',{status:400}),store:async(op,args)=>{quiet.push({op,args});return op==='binding'?binding:null;}});
  assert.equal(quiet.find(c=>c.op==='ingest').args.events[0].profileName,undefined,'a failed lookup never blocks the message');
});

test('an Instagram reply accepted by Meta is labelled as sent to Instagram, not WhatsApp',async()=>{
  const {createStrings,statusKey}=await import('../src/lib/dashboard/strings.js');
  const en=createStrings('en'),ar=createStrings('ar');
  assert.equal(en.t(statusKey('submitted','instagram')),'Sent to Instagram');
  assert.equal(en.t(statusKey('submitted','whatsapp')),'Sent to WhatsApp');
  assert.equal(en.t(statusKey('submitted')),'Sent to WhatsApp');
  assert.equal(ar.t(statusKey('submitted','instagram')),'أُرسلت إلى إنستغرام');
  assert.equal(statusKey('delivered','instagram'),'status_delivered');
});

test('disconnect always finishes on our side, even when Meta refuses the revoke',async()=>{
  const integration={id:'ig-connection',channel:'instagram',app:'1234',igAccount:'178414000000001'};
  const sessionHash='d'.repeat(64);integration.credential=sealToken('synthetic-token',credentialContext(sessionHash,integration),env);
  const ops=[];
  const store=async(op,args)=>{ops.push(op);return op==='disconnect'?{integrationId:integration.id,integration}:null;};
  const api=createInstagramApi({env,store,accounts:async()=>({id:'a',draftHash:sessionHash}),fetcher:async()=>new Response('{"error":{"code":1,"message":"server"}}',{status:500})});
  const csrf='e'.repeat(64);
  const r=response();
  await api({method:'POST',url:'/api/layla-meta?surface=instagram',headers:{host:'bznsflow-blue.vercel.app',origin:'https://bznsflow-blue.vercel.app',cookie:`__Host-blue_account=${'f'.repeat(64)}; bf_csrf=${csrf}`,'x-csrf-token':csrf},body:{action:'disconnect',confirm:true}},r);
  assert.equal(r.statusCode,200);assert.equal(r.body.revoked,false,'the owner is told to remove the app in Instagram too');
  assert.deepEqual(ops,['disconnect','disconnected']);
});

test('messages for an Instagram account Blue no longer serves are logged, not silently dropped',async()=>{
  const warnings=[];const original=console.warn;console.warn=(...a)=>warnings.push(a.join(' '));
  try {
    await ingestInstagramEnvelope({object:'instagram',entry:[{id:'178414000000009',messaging:[{sender:{id:'1'},recipient:{id:'178414000000009'},timestamp:1,message:{mid:'m',text:'hi'}}]}]},{app:'1234',store:async()=>null});
  } finally {console.warn=original;}
  assert(warnings.some(w=>w.includes('webhook_unbound') && w.includes('instagram')));
});


test('Meta send errors become plain reasons; only a truly unknown outcome stays ambiguous',()=>{
  const err=(status,code,subcode)=>instagramSendResult(status,{error:{code,...(subcode?{error_subcode:subcode}:{})}},'1');
  assert.deepEqual(err(400,10,2534022),{status:'failed',error:'outside_window',errorCode:10});
  assert.equal(err(400,10,2018278).error,'outside_window');
  assert.equal(err(400,551).error,'recipient_unavailable');
  assert.equal(err(400,200,2534041).error,'messages_access_off');
  assert.equal(err(400,190).error,'reconnect_required');
  assert.equal(err(400,613).error,'rate_limited');
  assert.equal(err(400,100,2534014).error,'invalid_recipient');
  assert.equal(err(400,1).error,'instagram_send_rejected');
  assert.equal(err(500,2).status,'failed','a coded error from Meta is a definite no, even on a 5xx');
  assert.equal(instagramSendResult(502,null,'1').status,'ambiguous');
});

test('every send reason has an English and Arabic explanation in the inbox',async()=>{
  const {createStrings,issueKey}=await import('../src/lib/dashboard/strings.js');
  const en=createStrings('en'),ar=createStrings('ar');
  for (const reason of ['outside_window','recipient_unavailable','messages_access_off','reconnect_required','rate_limited','invalid_recipient','instagram_send_rejected','test_recipient_not_allowed','owner_paused','window_expired','human_takeover','profile_changed','conversation_or_profile_changed','connection_not_ready']) {
    const key=issueKey(reason);
    assert.notEqual(en.t(key),key,`${reason} en`);assert.notEqual(ar.t(key),key,`${reason} ar`);
  }
  assert.equal(issueKey(null),null);assert.equal(issueKey('something_new'),null,'unknown reasons fall back to the status label');
});

test('a 190 while sending marks the Instagram connection for reconnect',async()=>{
  const integration={id:'ig-connection',channel:'instagram',app:'1234',igAccount:'178414000000001'};
  const sessionHash='d'.repeat(64);integration.credential=sealToken('synthetic-token',credentialContext(sessionHash,integration),env);
  const job={jobId:'job',intent:'intent',number:'178900000000001',text:'Hello',integration,sessionHash};
  const ops=[],igOps=[];
  const store=async(op,args)=>{ops.push({op,args});return op==='claim'?job:op==='send_gate'?true:null;};
  const worker=createBlueWorker({env,store,instagram:async(op,args)=>{igOps.push({op,args});return null;},fetcher:async()=>new Response(JSON.stringify({error:{code:190,message:'expired'}}),{status:400})});
  await worker({method:'POST',headers:{authorization:`Bearer ${env.BLUE_MESSAGING_WORKER_SECRET}`},body:{jobId:'job'}},response());
  assert.equal(ops.at(-1).args.reason,'reconnect_required');
  assert.deepEqual(igOps.find(o=>o.op==='checked')?.args,{sessionHash,integrationId:integration.id,connected:false});
});

test('the #_ Meta may append to the code is not sent to the exchange',async()=>{
  let sent;
  await exchangeInstagram({c,code:'one-use-code#_',fetcher:async(url,options)=>{sent=sent||new URLSearchParams(options.body).get('code');return new Response(JSON.stringify({error_type:'OAuthException',code:400}),{status:400});}}).catch(()=>{});
  assert.equal(sent,'one-use-code');
});

test('an Instagram DM reaches Instagram ingest whichever webhook URL Meta has saved',async()=>{
  const configured={...env,LAYLA_META_APP_SECRET:'parent-secret',BLUE_INSTAGRAM_VERIFY_TOKEN:'ig-verify',BLUE_REVIEW_VERIFY_TOKEN:'wa-verify'};
  const post=(url,object,secret)=>{
    const body=Buffer.from(JSON.stringify({object,entry:[]}));
    return {method:'POST',url,body,headers:{'x-hub-signature-256':`sha256=${createHmac('sha256',secret).update(body).digest('hex')}`}};
  };
  for (const url of ['/api/layla-meta-webhook','/api/layla-meta-webhook?channel=instagram']) {
    const r=response();await blueReviewWebhook(post(url,'instagram',env.BLUE_INSTAGRAM_APP_SECRET),r,configured);
    assert.equal(r.statusCode,200,url);assert.equal(r.body.accepted,true,`${url} goes to Instagram ingest`);
  }
  const crossed=response();await blueReviewWebhook(post('/api/layla-meta-webhook','whatsapp_business_account',env.BLUE_INSTAGRAM_APP_SECRET),crossed,configured);
  assert.equal(crossed.statusCode,403,'the Instagram secret never authenticates a WhatsApp payload');
  const verify=async(query)=>{const r=response();await blueReviewWebhook({method:'GET',url:`/api/layla-meta-webhook?${query}`,headers:{}},r,configured);return r.statusCode;};
  assert.equal(await verify('hub.mode=subscribe&hub.verify_token=ig-verify&hub.challenge=12345'),200,'Instagram can verify the bare URL');
  assert.equal(await verify('hub.mode=subscribe&hub.verify_token=wa-verify&hub.challenge=12345'),200);
  assert.equal(await verify('channel=instagram&hub.mode=subscribe&hub.verify_token=wa-verify&hub.challenge=12345'),403,'the Instagram URL takes only the Instagram token');
  assert.equal(await verify('hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345'),403);
});



test('Instagram Graph helpers own the username lookup and the send request',async()=>{
  const {instagramUsername,postInstagramMessage}=await import('../api/_lib/layla/instagram.js');
  const reply=value=>async()=>new Response(JSON.stringify(value));
  assert.equal(await instagramUsername(c,'1089774000208272','t',reply({username:'yungramsis21'})),'@yungramsis21');
  assert.equal(await instagramUsername(c,'1','t',reply({username:'not a name!'})),null);
  assert.equal(await instagramUsername(c,'1','t',async()=>new Response('{"error":{"code":10}}',{status:400})),null);
  assert.equal(await instagramUsername(c,'1','t',async()=>{throw new Error('down');}),null);
  let sent;
  const result=await postInstagramMessage({c,integration:{igAccount:'178414000000001'},recipient:'1',text:'Hi',token:'t',fetcher:async(url,o)=>{sent={url:String(url),body:JSON.parse(o.body),auth:o.headers.Authorization,redirect:o.redirect};return new Response(JSON.stringify({recipient_id:'1',message_id:'m'}));}});
  assert.deepEqual(sent,{url:'https://graph.instagram.com/v25.0/178414000000001/messages',body:{recipient:{id:'1'},message:{text:'Hi'}},auth:'Bearer t',redirect:'error'});
  assert.deepEqual(result,{status:200,payload:{recipient_id:'1',message_id:'m'}});
  await assert.rejects(postInstagramMessage({c,integration:{igAccount:'1'},recipient:'1',text:'Hi',token:'t',fetcher:async()=>{throw new Error('down');}}),'a network failure is left to the worker, which records it as ambiguous');
});

test('the connection card learns from the server that a sign-in never came back',async()=>{
  const api=createInstagramApi({env,store:async op=>op==='state'?{connection:null,pendingSignIn:true}:null,accounts:async()=>({id:'a',draftHash:'d'.repeat(64)})});
  const r=response();
  await api({method:'GET',url:'/api/layla-meta?surface=instagram',headers:{host:'bznsflow-blue.vercel.app',cookie:`__Host-blue_account=${'f'.repeat(64)}`}},r);
  assert.equal(r.statusCode,200);assert.equal(r.body.connection,null);assert.equal(r.body.pendingSignIn,true);
});

// Meta rate-limits /subscribed_apps hard (code 613, seen live 2026-09-24 after a
// few reconnects). The subscription is proven at connect and refreshed at most
// daily; everyday checks use only GET me, and sends use only the Send API.
const HOUR=3600000;
const igIntegration=()=>{
  const integration={id:'ig-connection',channel:'instagram',app:'1234',igAccount:'178414000000001'};
  integration.credential=sealToken('synthetic-token',credentialContext('d'.repeat(64),integration),env);
  return integration;
};
const graphLog=(answers)=>{
  const calls=[];
  const fetcher=async(url,o)=>{
    const u=new URL(url),key=`${o.method||'GET'} ${u.pathname.replace('/v25.0','')}`;calls.push(key);
    const a=answers[key];if(a instanceof Error) throw a;
    return new Response(JSON.stringify(a?.body ?? a ?? {}),{status:a?.status || 200});
  };
  return {calls,fetcher};
};
const me={user_id:'178414000000001',username:'bznsflow'};
const limited={status:500,body:{error:{code:613,type:'IGApiException',message:'Subscribed Apps API called too many times too quickly'}}};
async function checkRun({action='check_connection',checkedAt,answers}) {
  const integration=igIntegration(),sessionHash='d'.repeat(64),csrf='e'.repeat(64),checked=[];
  const {calls,fetcher}=graphLog(answers);
  const r=response();
  await createMessagingApi({env,fetcher,accounts:async()=>({id:'a',draftHash:sessionHash}),
    instagram:async(op,args)=>{if(op==='checked')checked.push(args.connected);return op==='context'?{status:'connected',integrationId:integration.id,integration,checkedAt}:null;},
    store:async()=>({active:true})})({method:'POST',headers:{host:'bznsflow-blue.vercel.app',origin:'https://bznsflow-blue.vercel.app',cookie:`__Host-blue_account=${'f'.repeat(64)}; bf_csrf=${csrf}`,'x-csrf-token':csrf},body:{action,channel:'instagram'}},r);
  return {status:r.statusCode,reason:r.body.reason,calls,checked};
}

test('Activate and Check use only GET me while the subscription proof is fresh',async()=>{
  for (const action of ['activate','check_connection']) {
    const run=await checkRun({action,checkedAt:Date.now()-HOUR,answers:{'GET /me':me}});
    assert.equal(run.status,200,action);
    assert.deepEqual(run.calls,['GET /me'],`${action} never touches subscribed_apps`);
  }
});

test('a stale proof re-subscribes once; a Meta rate limit on it changes nothing',async()=>{
  const fresh=await checkRun({checkedAt:Date.now()-30*HOUR,answers:{'GET /me':me,'POST /178414000000001/subscribed_apps':{success:true}}});
  assert.equal(fresh.status,200);assert.deepEqual(fresh.calls,['GET /me','POST /178414000000001/subscribed_apps']);assert.deepEqual(fresh.checked,[true]);
  const throttled=await checkRun({checkedAt:Date.now()-30*HOUR,answers:{'GET /me':me,'POST /178414000000001/subscribed_apps':limited}});
  assert.equal(throttled.status,200,'an older proof stands while Meta throttles');assert.deepEqual(throttled.checked,[]);
  assert(!throttled.calls.includes('GET /178414000000001/subscribed_apps'),'no read-back');
  const refused=await checkRun({checkedAt:undefined,answers:{'GET /me':me,'POST /178414000000001/subscribed_apps':{status:400,body:{error:{code:100,message:'no'}}}}});
  assert.equal(refused.reason,'connection_not_ready','never subscribed and Meta refuses: the owner fixes it in Instagram');
});

test('only a definite answer about the token changes the connection',async()=>{
  const fresh=Date.now()-HOUR;
  const dead=await checkRun({checkedAt:fresh,answers:{'GET /me':{status:400,body:{error:{code:190,message:'expired'}}}}});
  assert.deepEqual([dead.status,dead.reason,dead.checked],[409,'instagram_reconnect_required',[false]]);
  const other=await checkRun({checkedAt:fresh,answers:{'GET /me':{user_id:'999'}}});
  assert.deepEqual([other.reason,other.checked],['instagram_reconnect_required',[false]]);
  const busy=await checkRun({checkedAt:fresh,answers:{'GET /me':limited}});
  assert.deepEqual([busy.status,busy.reason,busy.checked],[429,'instagram_rate_limited',[]]);
  const down=await checkRun({checkedAt:fresh,answers:{'GET /me':new Error('timeout')}});
  assert.deepEqual([down.status,down.reason,down.checked],[502,'instagram_provider_unavailable',[]]);
});

test('the Instagram health check calls only GET me and pauses only on a definite answer',async()=>{
  const integration=igIntegration(),sessionHash='d'.repeat(64);
  const run=async answers=>{
    const results=[];const {calls,fetcher}=graphLog(answers);
    const store=async(op,args)=>{if(op==='health_result')results.push(args.connected);return op==='health_context'?{integration,sessionHash}:null;};
    const r=response();await createBlueWorker({env,store,fetcher})({method:'POST',headers:{authorization:`Bearer ${env.BLUE_MESSAGING_WORKER_SECRET}`},body:{integrationId:integration.id}},r);
    assert.equal(r.statusCode,200);return {results,calls};
  };
  assert.deepEqual(await run({'GET /me':me}),{results:[true],calls:['GET /me']});
  assert.deepEqual((await run({'GET /me':limited})).results,[],'a Meta rate limit never pauses replies');
  assert.deepEqual((await run({'GET /me':new Error('down')})).results,[],'nor does an outage');
  assert.deepEqual((await run({'GET /me':{status:400,body:{error:{code:190}}}})).results,[false]);
});

test('Meta throttling is reported as a rate limit, not as Instagram not responding',async()=>{
  const {instagramGraph}=await import('../api/_lib/layla/instagram.js');
  for (const code of [4,17,32,613]) {
    await assert.rejects(instagramGraph(c,'me',"t",async()=>new Response(JSON.stringify({error:{code}}),{status:400})),e=>e.code==='instagram_rate_limited' && e.status===429,String(code));
  }
});

test('an employee reads the manager Instagram state but cannot connect or disconnect it',async()=>{
  const managerHash='d'.repeat(64),seen=[];
  const store=async(op,args)=>{seen.push([op,args.sessionHash]);return op==='state'?{connection:null}:assert.fail(`employees never reach ${op}`);};
  const api=createInstagramApi({env,store,accounts:async()=>({id:'staff',draftHash:null,workspaceDraftHash:managerHash,workspaceRole:'employee'})});
  const csrf='e'.repeat(64),headers={host:'bznsflow-blue.vercel.app',origin:'https://bznsflow-blue.vercel.app',cookie:`__Host-blue_account=${'f'.repeat(64)}; bf_csrf=${csrf}`,'x-csrf-token':csrf};
  const read=response();
  await api({method:'GET',url:'/api/layla-meta?surface=instagram',headers},read);
  assert.equal(read.statusCode,200);assert.deepEqual(seen,[['state',managerHash]]);
  for (const body of [{action:'connect'},{action:'disconnect',confirm:true}]) {
    const r=response();await api({method:'POST',url:'/api/layla-meta?surface=instagram',headers,body},r);
    assert.equal(r.statusCode,403);assert.equal(r.body.reason,'manager_required');
  }
});
