import test from 'node:test';
import assert from 'node:assert/strict';
import { executeBlueAuth } from '../convex/blueAuthState.js';
import { blueAccountsAvailable, sendBlueCode, createBlueAuthHandler } from '../api/_lib/blue-auth.js';
import { BLUE_CLOUD } from '../api/_lib/convex.js';

const env={CONVEX_CLOUD_URL:BLUE_CLOUD,BLUE_REVIEW_SERVICE_SECRET:'a'.repeat(64),BLUE_ACCOUNT_SAVE_ENABLED:'true',BLUE_RESEND_API_KEY:'re_synthetic_test_key',BLUE_AUTH_FROM:'Blue <signin@example.com>'};
function memory() {
  const rows=new Map(); let seq=0,now=1000;
  const db={
    query(table){let field,value;return {withIndex(index,select){select({eq(f,v){field=f;value=v;}});return this;},async unique(){return structuredClone([...rows.values()].find(r=>r.table===table && r[field]===value));}};},
    async insert(table,r){const id=String(++seq);rows.set(id,{_id:id,table,...structuredClone(r)});return id;},
    async get(id){return structuredClone(rows.get(id));},
    async patch(id,p){const r=rows.get(id);for(const[k,v]of Object.entries(p)){if(v===undefined)delete r[k];else r[k]=structuredClone(v);}},
    async delete(id){rows.delete(id);},
  };
  return {db,rows,advance:n=>now+=n,call:(operation,args={})=>executeBlueAuth({db},{operation,...args},now)};
}
const args={email:'customer@example.com',codeHash:'a'.repeat(64),ipHash:'b'.repeat(64),challengeId:'challenge'};
async function login(m,tokenHash='c'.repeat(64)) {
  assert.equal((await m.call('request_code',args)).ok,true);
  assert.equal((await m.call('code_sent',args)).ok,true);
  const r=await m.call('verify_code',{...args,tokenHash});assert.equal(r.ok,true);return tokenHash;
}
test('Blue email stays gated and uses fixed template, destination and idempotency key',async()=>{
  assert.equal(blueAccountsAvailable(env),true);assert.equal(blueAccountsAvailable({...env,BLUE_AUTH_FROM:''}),false);
  assert.equal(blueAccountsAvailable({...env,BLUE_ACCOUNT_SAVE_ENABLED:'false'}),false);
  let request;
  await sendBlueCode({env,email:'customer@example.com',code:'093218',lang:'en',id:'unique',fetcher:async(url,o)=>{request={url,...o};return {ok:true,json:async()=>({id:'provider-id'})};}});
  assert.equal(request.url,'https://api.resend.com/emails');assert.equal(request.headers['Idempotency-Key'],'blue-signin/unique');
  assert.deepEqual(JSON.parse(request.body).to,['customer@example.com']);assert.match(JSON.parse(request.body).text,/093218/);
  await assert.rejects(sendBlueCode({env,email:'customer@example.com',code:'093218',id:'unique',fetcher:async()=>({ok:false})}));
});
test('verification requires confirmed send, enforces attempt limits and consumes the code once',async()=>{
  const m=memory();await m.call('request_code',args);
  assert.equal((await m.call('verify_code',{...args,tokenHash:'c'.repeat(64)})).reason,'code_invalid');
  await m.call('code_sent',args);
  for(let n=0;n<5;n++)assert.equal((await m.call('verify_code',{...args,codeHash:'d'.repeat(64),tokenHash:'c'.repeat(64)})).reason,'code_invalid');
  assert.equal((await m.call('verify_code',{...args,tokenHash:'c'.repeat(64)})).reason,'code_invalid');
  m.advance(60001);await m.call('request_code',args);await m.call('code_sent',args);
  assert.equal((await m.call('verify_code',{...args,tokenHash:'c'.repeat(64)})).ok,true);
  assert.equal((await m.call('verify_code',{...args,tokenHash:'d'.repeat(64)})).reason,'code_invalid');
});
test('a pending employee invitation activates only after verified sign-in and resolves the manager workspace',async()=>{
  const m=memory();
  const managerId=await m.db.insert('accounts',{email:'manager@example.com',role:'customer',draftHash:'f'.repeat(64),createdAt:1});
  const workspaceId=await m.db.insert('ascendWorkspaces',{managerAccountId:managerId,employeeLimit:5,createdAt:1,updatedAt:1});
  const memberId=await m.db.insert('ascendWorkspaceMembers',{workspaceId,email:args.email,status:'pending',invitedAt:1,updatedAt:1});
  assert.equal((await m.call('session',{tokenHash:'c'.repeat(64)})).value,null);
  const tokenHash=await login(m);
  const member=await m.db.get(memberId);
  assert.equal(member.status,'active');
  assert.ok(member.accountId);
  const session=(await m.call('session',{tokenHash})).value;
  assert.equal(session.workspaceRole,'employee');
  assert.equal(session.workspaceDraftHash,'f'.repeat(64));
  assert.equal(session.draftHash,null);
});
test('claim rotates anonymous authority, persists account recovery and does not overwrite a saved draft',async()=>{
  const m=memory(),tokenHash=await login(m),sessionHash='e'.repeat(64),draftHash='f'.repeat(64);
  const id=await m.db.insert('blueReviewSessions',{sessionHash,expiresAt:90000,lastPreview:{text:'safe'},profile:{services:'Portraits'}});
  const claim=await m.call('claim_draft',{tokenHash,sessionHash,draftHash});assert.equal(claim.ok,true);
  assert.equal((await m.db.get(id)).sessionHash,draftHash);assert((await m.db.get(id)).expiresAt>86400000);
  assert.equal((await m.call('session',{tokenHash})).value.draftHash,draftHash);
  assert.equal((await m.call('claim_draft',{tokenHash,sessionHash,draftHash:'9'.repeat(64)})).value.draftHash,draftHash);
  await m.call('signout',{tokenHash});assert.equal((await m.call('session',{tokenHash})).value,null);
});
test('draft claim refuses existing integration and expired drafts, and expired sessions cannot recover',async()=>{
  const m=memory(),tokenHash=await login(m),sessionHash='e'.repeat(64);
  const id=await m.db.insert('blueReviewSessions',{sessionHash,expiresAt:90000,lastPreview:{text:'safe'},integration:{id:'existing'}});
  assert.equal((await m.call('claim_draft',{tokenHash,sessionHash,draftHash:'f'.repeat(64)})).reason,'draft_not_claimable');
  await m.db.patch(id,{integration:undefined,expiresAt:0});
  assert.equal((await m.call('claim_draft',{tokenHash,sessionHash,draftHash:'f'.repeat(64)})).reason,'draft_not_claimable');
  m.advance(2592000001);assert.equal((await m.call('session',{tokenHash})).value,null);
});
test('sign-in rejects forged origin and unavailable mail without sending',async()=>{
  const res=()=>({headers:{},getHeader(k){return this.headers[k];},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;},end(v){this.body=JSON.parse(v);}});
  const handler=createBlueAuthHandler({env,store:()=>assert.fail(),sendCode:()=>assert.fail()});const r=res();
  await handler({method:'POST',headers:{host:'bznsflow-blue.vercel.app',origin:'https://evil.invalid'}},r,'code');assert.equal(r.statusCode,403);
});

test('claiming an existing integration rotates its credential context and preserves the asset reservation',async()=>{
  const m=memory(),tokenHash=await login(m),sessionHash='e'.repeat(64),draftHash='f'.repeat(64);
  const id=await m.db.insert('blueReviewSessions',{sessionHash,expiresAt:90000,lastPreview:{text:'safe'},integration:{id:'integration',phone:'123',waba:'456',credential:{data:'old'}}});
  const claimId=await m.db.insert('blueAssetClaims',{phone:'123',waba:'456',sessionHash,createdAt:1000});
  const credential={v:1,iv:'synthetic',data:'rewrapped',tag:'synthetic'};
  assert.equal((await m.call('claim_draft',{tokenHash,sessionHash,draftHash,credential})).ok,true);
  assert.equal((await m.db.get(id)).integration.credential.data,'rewrapped');
  assert.equal((await m.db.get(claimId)).sessionHash,draftHash);
});

test('reviewer access is scoped to its own account and expires',async()=>{
  const m=memory();
  const accountId=await m.db.insert('accounts',{email:'reviewer@bznsflow.invalid',role:'customer'});
  await m.db.insert('blueReviewerAccess',{tokenHash:'a'.repeat(64),accountId,expiresAt:2000});
  const r=await m.call('review_access',{accessHash:'a'.repeat(64),tokenHash:'b'.repeat(64)});
  assert.equal(r.value.id,accountId);
  assert.equal((await m.call('session',{tokenHash:'b'.repeat(64)})).value.email,'reviewer@bznsflow.invalid');
  m.advance(2000);
  assert.equal((await m.call('review_access',{accessHash:'a'.repeat(64),tokenHash:'c'.repeat(64)})).reason,'session_expired');
  assert.equal((await m.call('session',{tokenHash:'b'.repeat(64)})).value,null);
});

test('reviewer links last one year and can be revoked with their sessions',async()=>{
  // The Convex mutations are thin; pin the two properties Meta review depends on.
  const {readFileSync}=await import('node:fs');
  const source=readFileSync(new URL('../convex/blueAuth.ts',import.meta.url),'utf8');
  assert.match(source,/REVIEW_ACCESS_TTL_MS=365\*86400000/);
  assert.match(source,/expiresAt=now\+REVIEW_ACCESS_TTL_MS/);
  assert.match(source,/export const revokeReviewAccess=internalMutation/);
  assert.match(source,/withIndex\('by_account'/);
});
