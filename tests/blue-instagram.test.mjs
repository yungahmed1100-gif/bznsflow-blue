import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { blueHarness, seedTenant } from './helpers/blue-tenant.mjs';
import { executeInstagram, purgeInstagram } from '../convex/blueInstagramState.js';
import { marketingEligibility } from '../convex/blueAudienceState.js';

async function fixture() {
  const h = blueHarness(); await h.enable();
  const tenant = await seedTenant(h.m);
  const ig = (operation, args = {}) => executeInstagram(h.m.ctx, {operation, sessionHash:tenant.sessionHash, ...args}, h.m.now());
  const integration = {id:randomUUID(), channel:'instagram', app:'123456', igAccount:'17841400000000001', username:'bznsflow', credential:{v:1,iv:'test',data:'test',tag:'test'}};
  await ig('begin', {stateHash:'a'.repeat(64), lang:'en'});
  await ig('consume', {stateHash:'a'.repeat(64)});
  assert.equal((await ig('connect', {stateHash:'a'.repeat(64), integration, tokenExpiresAt:h.m.now()+60*86400000})).ok, true);
  return {h,tenant,ig,integration};
}
test('Instagram OAuth state is session-bound, expires and cannot be reused', async () => {
  const {h,tenant,ig}=await fixture();
  assert.equal((await ig('consume',{stateHash:'a'.repeat(64)})).ok,false);
  await ig('begin',{stateHash:'b'.repeat(64),lang:'en'});
  const other=await seedTenant(h.m,{name:'b',phone:'999',waba:'888'});
  assert.equal((await ig('consume',{sessionHash:other.sessionHash,stateHash:'b'.repeat(64)})).ok,false);
  h.m.advance(600001);
  assert.equal((await ig('consume',{stateHash:'b'.repeat(64)})).ok,false);
  assert(tenant.accountId);
});
test('Instagram-only tenant can activate, receive, reply, and use the shared inbox', async () => {
  const {h,tenant,integration}=await fixture();
  await h.m.db.patch(tenant.rowId,{integration:undefined,phone:undefined,status:'draft'});
  const activated=await h.messaging('activate',{sessionHash:tenant.sessionHash,channel:'instagram'});
  assert.equal(activated.ok,true);
  const inbound={kind:'message',id:'mid.1',from:'17890000000000001',at:h.m.now(),text:'services',reply:'Villas',intent:'services'};
  await h.messaging('ingest',{integrationId:integration.id,events:[inbound]});
  await h.messaging('ingest',{integrationId:integration.id,events:[inbound]});
  const jobs=h.m.table('blueMessages').filter(m=>m.direction==='out');
  assert.equal(jobs.length,1);
  const contact=h.m.table('blueContacts')[0];
  assert.equal(contact.channel,'instagram'); assert.equal(contact.waId,undefined);
  const overview=(await h.dashboard('overview',{sessionHash:tenant.sessionHash})).value;
  assert.equal(overview.connected,true);
  const chats=(await h.dashboard('conversations',{sessionHash:tenant.sessionHash})).value.items;
  assert.equal(chats.length,1); assert.equal(chats[0].channel,'instagram');
  const claim=(await h.messaging('claim',{jobId:jobs[0]._id,intent:'send1'})).value;
  assert.equal(claim.integration.channel,'instagram');
  h.m.advance(86400000);
  assert.equal((await h.messaging('send_gate',{jobId:jobs[0]._id,intent:'send1'})).value,false);
});
test('disconnect fences queued and claimed Instagram work without pausing WhatsApp', async () => {
  const {h,tenant,ig,integration}=await fixture();
  await h.messaging('activate',{sessionHash:tenant.sessionHash});
  await h.messaging('activate',{sessionHash:tenant.sessionHash,channel:'instagram'});
  await h.messaging('ingest',{integrationId:integration.id,events:[{kind:'message',id:'mid.2',from:'17890000000000001',at:h.m.now(),text:'hi',reply:'Hi',intent:'greeting'}]});
  const job=h.m.table('blueMessages').find(m=>m.direction==='out');
  await h.messaging('claim',{jobId:job._id,intent:'send2'});
  await ig('disconnect');
  assert.equal((await h.messaging('send_gate',{jobId:job._id,intent:'send2'})).value,false);
  assert.equal((await h.messaging('state',{sessionHash:tenant.sessionHash})).value.active,true);
});
test('our own Instagram echoes do not trigger takeover; external human echoes do',async()=>{
  const {h,tenant,integration}=await fixture();
  await h.messaging('activate',{sessionHash:tenant.sessionHash,channel:'instagram'});
  const from='17890000000000001';
  await h.messaging('ingest',{integrationId:integration.id,events:[{kind:'message',id:'in1',from,at:h.m.now(),text:'hi',reply:'Hello',intent:'greeting'}]});
  const job=h.m.table('blueMessages').find(m=>m.direction==='out');
  await h.messaging('claim',{jobId:job._id,intent:'send'});
  const echo={kind:'echo',id:'mid.sent',from,at:h.m.now(),text:'Hello'};
  assert.equal((await h.messaging('ingest',{integrationId:integration.id,events:[echo]})).reason,'echo_pending');
  await h.messaging('result',{jobId:job._id,intent:'send',status:'submitted',providerId:'mid.sent'});
  await h.messaging('ingest',{integrationId:integration.id,events:[echo]});
  assert.equal(h.m.table('blueConversations')[0].takeover,false);
  await h.messaging('ingest',{integrationId:integration.id,events:[{...echo,id:'human.1',text:'A person replies'}]});
  assert.equal(h.m.table('blueConversations')[0].takeover,true);
});
test('unsend before the original event arrives suppresses the delayed message',async()=>{
  const {h,tenant,integration}=await fixture();
  await h.messaging('activate',{sessionHash:tenant.sessionHash,channel:'instagram'});
  const from='17890000000000001';
  await h.messaging('ingest',{integrationId:integration.id,events:[{kind:'deleted',id:'removed',from}]});
  await h.messaging('ingest',{integrationId:integration.id,events:[{kind:'message',id:'removed',from,at:h.m.now(),text:'removed text',reply:'wrong',intent:'greeting'}]});
  assert.equal(h.m.table('blueMessages').filter(m=>m.direction==='out').length,0);
  assert(!JSON.stringify(h.m.table('blueMessages')).includes('removed text'));
});
test('Instagram contacts cannot enter WhatsApp campaigns even if they have consent',()=>{
  assert.equal(marketingEligibility({state:'active',channel:'instagram',consent:{status:'granted'}}),'wrong_channel');
});
test('revocation fences pending work and stale token refresh cannot restore access',async()=>{
  const {h,tenant,ig,integration}=await fixture();
  const old=(await ig('refresh_context',{integrationId:integration.id})).value;
  await h.messaging('activate',{sessionHash:tenant.sessionHash,channel:'instagram'});
  await ig('revoke',{igAccount:integration.igAccount,deleteData:true,deletionCode:'f'.repeat(64)});
  assert.equal((await ig('refresh_result',{integrationId:integration.id,expectedUpdatedAt:old.updatedAt,credential:integration.credential,tokenExpiresAt:h.m.now()+86400000})).ok,false);
  assert.equal((await ig('context')).value.integration.credential,undefined);
  assert.equal((await ig('deletion_status',{deletionCode:'f'.repeat(64)})).value.status,'pending');
  assert.equal((await h.messaging('activate',{sessionHash:tenant.sessionHash,channel:'instagram'})).ok,false);
});
test('WhatsApp disconnect preserves the Instagram connection and approved facts',async()=>{
  const {h,tenant,ig}=await fixture();
  await h.messaging('activate',{sessionHash:tenant.sessionHash});
  await h.messaging('activate',{sessionHash:tenant.sessionHash,channel:'instagram'});
  assert.equal((await h.messaging('disconnect',{sessionHash:tenant.sessionHash,confirm:true})).ok,true);
  assert.equal((await ig('state')).value.connection.status,'connected');
  assert.equal((await h.messaging('state',{sessionHash:tenant.sessionHash,channel:'instagram'})).value.active,true);
  assert.equal((await h.m.db.get(tenant.rowId)).profile.reviewed,true);
});

test('duplicate deletion callbacks retain the pending receipt',async()=>{
  const {ig,integration}=await fixture();
  const first='1'.repeat(64),second='2'.repeat(64);
  await ig('revoke',{igAccount:integration.igAccount,deleteData:true,deletionCode:first});
  const retry=await ig('revoke',{igAccount:integration.igAccount,deleteData:true,deletionCode:second});
  assert.equal(retry.value.deletionCode,first);
  assert.equal((await ig('deletion_status',{deletionCode:first})).value.status,'pending');
});

test('a callback issued before the current authorization cannot revoke it',async()=>{
  const {h,ig,integration}=await fixture();
  await ig('revoke',{igAccount:integration.igAccount,issuedAt:h.m.now()-60000});
  assert.equal((await ig('state')).value.connection.status,'connected');
});

test('a different Instagram account cannot replace the historical deletion binding',async()=>{
  const {h,ig,integration}=await fixture();
  await ig('disconnect');
  await ig('disconnected',{integrationId:integration.id});
  h.m.advance(11000);
  await ig('begin',{stateHash:'c'.repeat(64)});
  await ig('consume',{stateHash:'c'.repeat(64)});
  const result=await ig('connect',{stateHash:'c'.repeat(64),integration:{...integration,id:randomUUID(),igAccount:'17841499999999999'},tokenExpiresAt:h.m.now()+86400000});
  assert.equal(result.reason,'different_account');
});

test('reconnecting the same Instagram account keeps one control row for it',async()=>{
  const {h,tenant,ig,integration}=await fixture();
  for (const [i,s] of ['d','e'].entries()) {
    h.m.advance(11000);
    await ig('begin',{stateHash:s.repeat(64)});
    await ig('consume',{stateHash:s.repeat(64)});
    assert.equal((await ig('connect',{stateHash:s.repeat(64),integration:{...integration,id:randomUUID()},tokenExpiresAt:h.m.now()+86400000})).ok,true,`reconnect ${i}`);
  }
  const connection=h.m.table('blueInstagramConnections')[0];
  const igControls=h.m.table('blueMessagingControls').filter(c=>c.accountId===tenant.accountId && c.integrationId!==tenant.integration.id);
  assert.deepEqual(igControls.map(c=>c.integrationId),[connection.integrationId],'replaced integrations leave no control rows behind');
});

test('owner WhatsApp disconnect leaves nothing that blocks the next connect',async()=>{
  const {h,tenant}=await fixture();
  await h.m.db.patch(tenant.rowId,{subscriptionAttempted:true,diagnostic:{reason:'x',stage:'y',at:1},operationAt:1,operationEffect:'subscribe'});
  await h.m.db.insert('blueTemplates',{accountId:tenant.accountId,integrationId:tenant.integration.id,templateId:'t1',syncedAt:1});
  const result=await h.messaging('disconnect',{sessionHash:tenant.sessionHash,confirm:true});
  assert.equal(result.ok,true);
  const row=h.m.table('blueReviewSessions').find(r=>r._id===tenant.rowId);
  for (const field of ['integration','subscriptionAttempted','diagnostic','operationAt','operationEffect','pendingSelection']) assert.equal(row[field],undefined,field);
  assert.equal(h.m.table('blueMessagingControls').some(c=>c.integrationId===tenant.integration.id),false);
  assert.equal(h.m.table('blueTemplates').some(t=>t.integrationId===tenant.integration.id),false);
});

test('state reports a sign-in that started but never came back from Instagram',async()=>{
  const {h,ig}=await fixture();
  assert.equal((await ig('state')).value.pendingSignIn,false);
  h.m.advance(11000);
  await ig('begin',{stateHash:'f'.repeat(64),lang:'en'});
  assert.equal((await ig('state')).value.pendingSignIn,true,'Instagram has not sent the person back yet');
  await ig('consume',{stateHash:'f'.repeat(64)});
  assert.equal((await ig('state')).value.pendingSignIn,false,'Instagram came back');
  h.m.advance(11000);
  await ig('begin',{stateHash:'9'.repeat(64),lang:'en'});
  h.m.advance(600001);
  assert.equal((await ig('state')).value.pendingSignIn,false,'an expired sign-in is not offered');
});

test('Instagram reply controls without a live connection ask for a reconnect, not a sign-in',async()=>{
  const {h,tenant,ig,integration}=await fixture();
  await ig('disconnect');
  await ig('disconnected',{integrationId:integration.id});
  for (const operation of ['pause','activate','state']) {
    const result=await h.messaging(operation,{sessionHash:tenant.sessionHash,channel:'instagram'});
    assert.equal(result.reason,'instagram_reconnect_required',operation);
  }
  assert.equal((await h.messaging('pause',{sessionHash:'0'.repeat(64),channel:'instagram'})).reason,'sign_in_required','an unknown session is still a sign-in problem');
});

test('reconnecting the same Instagram account keeps replies on if they were on',async()=>{
  // Seen live 2026-09-24: a reconnect silently paused replies, so "hi" went unanswered.
  const {h,tenant,ig,integration}=await fixture();
  assert.equal((await h.messaging('activate',{sessionHash:tenant.sessionHash,channel:'instagram'})).ok,true);
  const reconnect=async(stateHash)=>{
    h.m.advance(11000);
    await ig('begin',{stateHash});await ig('consume',{stateHash});
    return ig('connect',{stateHash,integration:{...integration,id:randomUUID()},tokenExpiresAt:h.m.now()+86400000});
  };
  assert.equal((await reconnect('d'.repeat(64))).ok,true);
  assert.equal((await h.messaging('state',{sessionHash:tenant.sessionHash,channel:'instagram'})).value.active,true,'still replying after a reconnect');
  await h.messaging('pause',{sessionHash:tenant.sessionHash,channel:'instagram'});
  assert.equal((await reconnect('e'.repeat(64))).ok,true);
  assert.equal((await h.messaging('state',{sessionHash:tenant.sessionHash,channel:'instagram'})).value.active,false,'a paused channel stays paused');
});

test('a deletion request from Instagram removes everything quickly and leaves a clean Connect Instagram',async()=>{
  // Seen live 2026-09-24: after removing the app in Instagram the card said
  // "Disconnected" and Reconnect answered "still disconnecting" for 30+ minutes.
  const {h,tenant,ig,integration}=await fixture();
  await h.messaging('activate',{sessionHash:tenant.sessionHash});
  await h.messaging('activate',{sessionHash:tenant.sessionHash,channel:'instagram'});
  await h.messaging('ingest',{integrationId:integration.id,events:[{kind:'message',id:'mid.9',from:'17890000000000001',at:h.m.now(),text:'hi',reply:'Hello',intent:'greeting'}]});
  assert(h.m.table('blueContacts').some(c=>c.channel==='instagram'));
  const code='3'.repeat(64);
  const receipt=await executeInstagram(h.m.ctx,{operation:'revoke',igAccount:integration.igAccount,deleteData:true,deletionCode:code,purgeFunction:'purge'},h.m.now());
  assert.equal(receipt.value.deletionCode,code);
  const connectionId=h.m.table('blueInstagramConnections')[0]._id;
  assert(h.m.scheduled.some(job=>job.connectionId===connectionId),'the cleanup starts at once, not on the next 15-minute run');
  assert.equal((await ig('state')).value.connection.status,'deleting','the card says the data is being removed');
  assert.equal((await ig('begin',{stateHash:'4'.repeat(64)})).reason,'connection_busy');

  let rounds=0;
  while(!(await purgeInstagram(h.m.ctx,connectionId,h.m.now())) && rounds<20) rounds++;
  assert(rounds<20,'the cleanup finishes');
  assert.equal(h.m.table('blueInstagramConnections').length,0,'nothing of the connection remains');
  assert.equal(h.m.table('blueConversations').some(c=>c.channel==='instagram'),false);
  // deleteContact keeps a PII-free tombstone (keyed hash, opt-out) by design.
  assert(h.m.table('blueContacts').filter(c=>c.channel==='instagram').every(c=>c.state==='deleted' && !c.igId && !c.igAccount && !c.profileName),'no Instagram personal data remains');
  assert.equal(h.m.table('blueMessages').some(m=>m.integrationId===integration.id),false);
  assert.equal(h.m.table('blueMessagingControls').some(c=>c.integrationId===integration.id),false);
  assert.equal((await h.messaging('state',{sessionHash:tenant.sessionHash})).value.active,true,'WhatsApp is untouched');
  assert.deepEqual((await ig('state')).value,{connection:null,pendingSignIn:false},'the card is back to a clean Connect Instagram');
  assert.equal((await ig('deletion_status',{deletionCode:code})).value.status,'complete');
  assert.equal(await purgeInstagram(h.m.ctx,connectionId,h.m.now()),true,'a late extra run is harmless');

  h.m.advance(11000);
  await ig('begin',{stateHash:'5'.repeat(64)});await ig('consume',{stateHash:'5'.repeat(64)});
  assert.equal((await ig('connect',{stateHash:'5'.repeat(64),integration:{...integration,id:randomUUID()},tokenExpiresAt:h.m.now()+86400000})).ok,true,'connect again straight away');
});

test('removing the app in Instagram without a deletion request stops it and allows connecting again at once',async()=>{
  const {h,ig,integration}=await fixture();
  await ig('revoke',{igAccount:integration.igAccount});
  const {connection}=(await ig('state')).value;
  assert.equal(connection.status,'revoked');
  assert.equal(h.m.table('blueInstagramConnections')[0].integration.credential,undefined);
  h.m.advance(11000);
  assert.equal((await ig('begin',{stateHash:'6'.repeat(64)})).ok,true);
});
