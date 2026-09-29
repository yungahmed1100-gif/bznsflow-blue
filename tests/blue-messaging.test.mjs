import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {executeMessaging} from '../convex/blueMessagingState.js';
import {liveAnswer,ingestBlueEnvelope,createBlueWorker,createMessagingApi} from '../api/_lib/layla/blue-messaging.js';
import {sealToken,credentialContext} from '../api/_lib/layla/customer-meta.js';
import {BLUE_CLOUD} from '../api/_lib/convex.js';

const env={CONVEX_CLOUD_URL:BLUE_CLOUD,BLUE_REVIEW_SERVICE_SECRET:'a'.repeat(64),LAYLA_CREDENTIAL_ENCRYPTION_KEY:'b'.repeat(64),BLUE_MESSAGING_WORKER_SECRET:'c'.repeat(64),BLUE_LIVE_MESSAGING_ENABLED:'true'};
const profile={businessName:'Studio',sector:'Photography',services:'Portraits',hours:'9–5',prices:'20 OMR',humanContact:'team@example.com',reviewed:true};
function memory() {
  const rows=new Map(),scheduled=[];let seq=0,time=100000;
  const db={
    query(table){let filters=[],descending=false,sort='at';const api={withIndex(index,fn){sort=index==='by_account_updated'?'updatedAt':'at';const q={eq:(k,v)=>{filters.push(r=>r[k]===v);return q;},lt:(k,v)=>{filters.push(r=>r[k]<v);return q;},gte:(k,v)=>{filters.push(r=>r[k]>=v);return q;}};fn(q);return api;},order(value){descending=value==='desc';return api;},async take(n){return structuredClone([...rows.values()].filter(r=>r.table===table&&filters.every(f=>f(r))).sort((a,b)=>(descending?-1:1)*((a[sort]||0)-(b[sort]||0))).slice(0,n));},async unique(){const r=await api.take(2);assert(r.length<2);return r[0] || null;}};return api;},
    async insert(table,value){const id=String(++seq);rows.set(id,{_id:id,table,...structuredClone(value)});return id;},
    async get(id){return structuredClone(rows.get(id));},
    async patch(id,value){const r=rows.get(id);for(const[k,v]of Object.entries(value)){if(v===undefined)delete r[k];else r[k]=structuredClone(v);}},
  };
  const call=(operation,args={})=>executeMessaging({db,scheduler:{runAfter:async(...a)=>scheduled.push(a)}},{operation,hashSecret:'9'.repeat(64),...args},time);
  return {db,rows,scheduled,call,now:()=>time,advance:n=>time+=n};
}
async function setup() {
  const m=memory();await m.db.insert('blueMessagingSettings',{key:'global',enabled:true});
  const integration={id:randomUUID(),app:'1388038082832745',waba:'1234',phone:'5678',sender:'96890000000',path:'new_number'};
  const sessionHash='d'.repeat(64);integration.credential=sealToken('synthetic-token-only',credentialContext(sessionHash,integration),env);
  const rowId=await m.db.insert('blueReviewSessions',{accountId:'accountA',sessionHash,expiresAt:1e15,status:'connected',profile,profileVersion:1,checkedAt:m.now(),connectionChecks:{routing:true,registered:true,path:true},integration,phone:integration.phone});
  assert.equal((await m.call('activate',{sessionHash})).ok,true);
  const inbound=(id='in1',extra={})=>m.call('ingest',{integrationId:integration.id,events:[{kind:'message',id,from:'96891111111',at:m.now(),text:'services',reply:'Portraits',intent:'services',...extra}]});
  const outgoing=()=>[...m.rows.values()].filter(r=>r.table==='blueMessages'&&r.direction==='out');
  return {...m,rowId,integration,sessionHash,inbound,outgoing};
}
test('durable incoming deduplication produces exactly one reply and one competing claim',async()=>{
  const m=await setup();await m.inbound();await m.inbound();assert.equal(m.outgoing().length,1);assert.equal(m.scheduled.length,1);
  const jobId=m.outgoing()[0]._id;
  const claimed=await m.call('claim',{jobId,intent:'one'});assert(claimed.value);
  assert.equal((await m.call('claim',{jobId,intent:'two'})).value,null);
  await m.inbound();assert.equal(m.outgoing().length,1);
});
test('cross-account conversation access and activation without approved facts are refused',async()=>{
  const m=await setup();await m.inbound();
  const person=[...m.rows.values()].find(r=>r.table==='blueConversations');
  await m.db.insert('blueReviewSessions',{accountId:'B',sessionHash:'e'.repeat(64),expiresAt:1e15,integration:{id:'other'}});
  assert.equal((await m.call('manual_reply',{sessionHash:'e'.repeat(64),conversationId:person._id,text:'bad',requestId:randomUUID()})).reason,'conversation_not_found');
  await m.db.patch(m.rowId,{profile:{...profile,reviewed:false}});
  assert.equal((await m.call('activate',{sessionHash:m.sessionHash})).reason,'activation_not_ready','facts never confirmed');
  await m.db.patch(m.rowId,{profile:{...profile,humanContact:undefined}});
  assert.equal((await m.call('activate',{sessionHash:m.sessionHash})).reason,'activation_not_ready','no team to hand over to');
});
test('the owner reviews once: no preview approval is needed, and editing answers keeps Layla live',async()=>{
  // Ahmed, 2026-09-24: "ask one time to review business information then go live".
  const m=await setup();
  await m.db.patch(m.rowId,{checkedAt:m.now()});
  assert.equal((await m.call('activate',{sessionHash:m.sessionHash})).ok,true,'no Try Layla approval step');
  // Saving new answers bumps the version.
  await m.db.patch(m.rowId,{profile:{...profile,services:'Portraits and weddings'},profileVersion:2});
  assert.equal((await m.call('state',{sessionHash:m.sessionHash})).value.active,true,'still live after an edit');
  await m.inbound('after-edit');
  const job=m.outgoing().at(-1);
  assert.equal(job.profileVersion,2,'the reply uses the latest saved answers');
  assert(( await m.call('claim',{jobId:job._id,intent:'edit'})).value,'claimable');
  assert.equal((await m.call('send_gate',{jobId:job._id,intent:'edit'})).value,true,'and sendable');
});
test('pause and resume cannot revive queued messages; editing facts fences claimed sends',async()=>{
  const m=await setup();await m.inbound();await m.call('pause',{sessionHash:m.sessionHash});
  await m.call('activate',{sessionHash:m.sessionHash});
  assert.equal((await m.call('claim',{jobId:m.outgoing()[0]._id,intent:'one'})).value,null);
  await m.inbound('in2');const jobId=m.outgoing()[1]._id;
  await m.call('claim',{jobId,intent:'two'});
  await m.db.patch(m.rowId,{profileVersion:2});
  assert.equal((await m.call('send_gate',{jobId,intent:'two'})).value,false);
});
test('human echo fences a claimed reply even after conversation resume',async()=>{
  const m=await setup();await m.inbound();const jobId=m.outgoing()[0]._id;
  await m.call('claim',{jobId,intent:'one'});
  await m.call('ingest',{integrationId:m.integration.id,events:[{kind:'takeover',from:'96891111111',id:'echo:1'}]});
  const person=[...m.rows.values()].find(r=>r.table==='blueConversations');
  await m.call('resume_conversation',{sessionHash:m.sessionHash,conversationId:person._id});
  assert.equal((await m.call('send_gate',{jobId,intent:'one'})).value,false);
});
test('opt-out beats a custom FAQ and prevents manual and automatic replies',async()=>{
  assert.equal(liveAnswer('stop',{...profile,faqs:[{question:'stop',answer:'wrong'}]}).reply,null);
  const m=await setup();await m.inbound('stop',{intent:'optout',reply:null});
  await m.inbound('again');assert.equal(m.outgoing().length,0);
  const person=[...m.rows.values()].find(r=>r.table==='blueConversations');
  assert.equal((await m.call('manual_reply',{sessionHash:m.sessionHash,conversationId:person._id,text:'hello',requestId:randomUUID()})).reason,'contact_opted_out');
});
test('handoff sends one acknowledgement then waits for the team',async()=>{
  const m=await setup();await m.inbound('human',{intent:'human',handoff:true});await m.inbound('more');
  assert.equal(m.outgoing().length,1);const jobId=m.outgoing()[0]._id;
  assert((await m.call('claim',{jobId,intent:'one'})).value);
  assert.equal((await m.call('send_gate',{jobId,intent:'one'})).value,true);
});
test('receipts require tenant and recipient match and never downgrade delivery',async()=>{
  const m=await setup();await m.inbound();const jobId=m.outgoing()[0]._id;
  await m.call('claim',{jobId,intent:'one'});
  const receipt={kind:'receipt',id:'wamid.1',intent:'one',recipient:'96892222222',status:'delivered',at:m.now()};
  await m.call('ingest',{integrationId:m.integration.id,events:[receipt]});assert.equal(m.outgoing()[0].status,'attempting');
  receipt.recipient='96891111111';await m.call('ingest',{integrationId:m.integration.id,events:[receipt]});
  await m.call('result',{jobId,intent:'one',status:'submitted',providerId:'wamid.1'});
  assert.equal(m.outgoing()[0].status,'delivered');
});
test('a rejected send keeps Meta\'s numeric error code for the owner, never its message',async()=>{
  const m=await setup();await m.inbound();const jobId=m.outgoing()[0]._id;
  await m.call('claim',{jobId,intent:'one'});await m.call('result',{jobId,intent:'one',status:'failed',reason:'provider_http_400',errorCode:131030});
  assert.deepEqual([m.outgoing()[0].status,m.outgoing()[0].reason,m.outgoing()[0].errorCode],['failed','provider_http_400',131030]);
});
test('ambiguous sends pause the business and prevent blind reactivation',async()=>{
  const m=await setup();await m.inbound();const jobId=m.outgoing()[0]._id;
  await m.call('claim',{jobId,intent:'one'});await m.call('result',{jobId,intent:'one',status:'ambiguous'});
  assert.equal((await m.call('state',{sessionHash:m.sessionHash})).value.active,false);
  assert.equal((await m.call('activate',{sessionHash:m.sessionHash})).reason,'send_outcome_unknown');
});
test('expired window and per-minute rate caps block outbound attempts',async()=>{
  const m=await setup();await m.inbound();m.advance(86400001);
  assert.equal((await m.call('claim',{jobId:m.outgoing()[0]._id,intent:'old'})).value,null);
  for(let n=0;n<11;n++){await m.inbound(`new${n}`);const jobId=m.outgoing().at(-1)._id;const claimed=await m.call('claim',{jobId,intent:`intent${n}`});if(claimed.value)await m.call('result',{jobId,intent:`intent${n}`,status:'submitted',providerId:`wamid.${n}`});}
  assert.equal(m.outgoing().at(-1).reason,'rate_limit');
});
test('webhook routing ignores unknown bindings without creating jobs',async()=>{
  const ops=[];
  await ingestBlueEnvelope({entry:[{id:'123',changes:[{field:'messages',value:{metadata:{phone_number_id:'456'}}}]}]},{store:async op=>{ops.push(op);return null;}});
  assert.deepEqual(ops,['binding']);
});
const response=()=>({headers:{},getHeader(k){return this.headers[k];},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;},end(value){this.body=JSON.parse(value);}});
test('worker uses only claimed tenant credentials and never retries provider timeout',async()=>{
  const m=await setup();await m.inbound();let sends=0;
  const store=async(op,args)=>{const r=await m.call(op,args);assert(r.ok);return r.value;};
  const worker=createBlueWorker({env,store,inspect:async()=>({connected:true}),fetcher:async()=>{sends++;throw Error('timeout');}});
  const req={method:'POST',headers:{authorization:`Bearer ${env.BLUE_MESSAGING_WORKER_SECRET}`},body:{jobId:m.outgoing()[0]._id}};
  await worker(req,response());await worker(req,response());assert.equal(sends,1);assert.equal(m.outgoing()[0].status,'ambiguous');
});
test('worker rejects forged credentials and browser API rejects forged origin',async()=>{
  const r=response();await createBlueWorker({env,store:()=>assert.fail()})({method:'POST',headers:{}},r);assert.equal(r.statusCode,401);
  const other=response();await createMessagingApi({env,accounts:()=>assert.fail()})({method:'POST',headers:{host:'bznsflow-blue.vercel.app',origin:'https://evil.invalid'}},other);assert.equal(other.statusCode,403);
});

test('manual reply retry preserves the queued job and never duplicates it',async()=>{
  const m=await setup();await m.inbound();
  const person=[...m.rows.values()].find(r=>r.table==='blueConversations');
  const args={sessionHash:m.sessionHash,conversationId:person._id,text:'Team reply',requestId:randomUUID()};
  await m.call('manual_reply',args);await m.call('manual_reply',args);
  const manual=m.outgoing().filter(j=>j.manual);assert.equal(manual.length,1);assert.equal(manual[0].status,'queued');
});
test('real webhook envelope persists incoming facts and mirrors business-app echoes',async()=>{
  const m=await setup();
  const store=async(operation,args)=>{const r=await m.call(operation,args);assert(r.ok);return r.value;};
  const value={messaging_product:'whatsapp',metadata:{phone_number_id:m.integration.phone},messages:[{id:'wamid.in',from:'96891111111',timestamp:String(m.now()/1000),type:'text',text:{body:'What services do you offer?'}}]};
  const envelope={entry:[{id:m.integration.waba,changes:[{field:'messages',value}]}]};
  await ingestBlueEnvelope(envelope,{store,now:m.now});
  // Layla answers first, then asks the sector's first group of missing fields.
  assert.match(m.outgoing()[0].text,/^Portraits\n\nTo help you further, could you share .+\?$/);
  envelope.entry[0].changes=[{field:'smb_message_echoes',value:{messaging_product:'whatsapp',metadata:value.metadata,message_echoes:[{id:'wamid.echo',from:m.integration.sender,to:'96891111111',type:'text',text:{body:'I will help you'}}]}}];
  await ingestBlueEnvelope(envelope,{store,now:m.now});
  assert.equal(m.outgoing()[0].status,'blocked');
  assert([...m.rows.values()].some(r=>r.direction==='human'&&r.text==='I will help you'));
});

test('activation immediately after signup reuses fresh verified routing without refresh throttling',async()=>{
  const m=await setup();await m.db.patch(m.rowId,{checkedAt:Date.now()});
  const api=createMessagingApi({env,accounts:async()=>({id:'accountA',draftHash:m.sessionHash}),reviews:async op=>{assert.equal(op,'get');return m.db.get(m.rowId);},inspect:()=>assert.fail('fresh proof should be reused'),store:async(op,args)=>{assert.equal(op,'activate');assert.equal(args.sessionHash,m.sessionHash);return {active:true};}});
  const csrf='e'.repeat(64),r=response();
  await api({method:'POST',headers:{host:'bznsflow-blue.vercel.app',origin:'https://bznsflow-blue.vercel.app',cookie:`__Host-blue_account=${'f'.repeat(64)}; bf_csrf=${csrf}`,'x-csrf-token':csrf},body:{action:'activate'}},r);
  assert.equal(r.statusCode,200);assert.equal(r.body.active,true);
});
