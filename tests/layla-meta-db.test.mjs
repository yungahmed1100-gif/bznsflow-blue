import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { initialState } from '../api/_lib/layla/domain.js';
import { settings, stateKey } from '../api/_lib/layla/config.js';
const migration=await readFile(new URL('../web-chatbot/migrations/005-layla-meta-pilot.sql',import.meta.url),'utf8');
const bindingMigration=await readFile(new URL('../web-chatbot/migrations/006-layla-meta-binding-keys.sql',import.meta.url),'utf8');
async function setup(path) {
 const db=new PGlite(path);
 await db.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;');
 for(const file of ['003-accounts.sql','004-oauth-identities.sql'])await db.exec(await readFile(new URL(`../web-chatbot/migrations/${file}`,import.meta.url),'utf8'));
 await db.exec(migration);await db.exec(bindingMigration);return db;
}
const c=settings({LAYLA_OWNER_ACCOUNT_ID:'11111111-1111-4111-8111-111111111111'});
test('migration is additive/idempotent; anonymous and registered roles have no pilot access',async()=>{
 const db=await setup();
 try {
  await db.exec(migration);
  await db.exec(bindingMigration);
  for(const role of ['anon','authenticated']) {
   await db.exec(`set role ${role}`);
   await assert.rejects(db.query('select * from public.layla_meta_state'),/permission denied/);
   await assert.rejects(db.query("select public.layla_meta_read('bznsflow:mock')"),/permission denied/);
   await assert.rejects(db.query("select public.layla_meta_cas('bznsflow:mock',0,$1)",[initialState(c)]),/permission denied/);
   await db.exec('reset role');
  }
  await db.exec('set role service_role');
  assert.equal((await db.query("select public.layla_meta_cas('bznsflow:mock',0,$1) as ok",[initialState(c)])).rows[0].ok,true);
  assert.equal((await db.query("select public.layla_meta_read('bznsflow:mock') as result")).rows[0].result.revision,1);
 } finally {await db.close();}
});
test('binding migration preserves retired rows and accepts isolated current keys',async()=>{
 const db=await setup();
 try {
  await db.exec('set role service_role');
  const oldState=initialState(c), currentState=initialState(c), key=stateKey(c);
  assert.equal((await db.query("select public.layla_meta_cas('bznsflow:mock',0,$1) as ok",[oldState])).rows[0].ok,true);
  assert.equal((await db.query('select public.layla_meta_cas($1,0,$2) as ok',[key,currentState])).rows[0].ok,true);
  assert.equal((await db.query('select count(*)::int as n from public.layla_meta_state')).rows[0].n,2);
  await assert.rejects(db.query("select public.layla_meta_cas('bznsflow:mock:bad',0,$1)",[currentState]),/check constraint/);
 } finally {await db.close();}
});
test('revision compare-and-swap permits one winner and preserves isolated mock/live rows',async()=>{
 const db=await setup();
 try {
  await db.exec('set role service_role');
  const query=()=>db.query("select public.layla_meta_cas('bznsflow:mock',0,$1) as ok",[initialState(c)]);
  const outcomes=await Promise.all([query(),query()]);
  assert.deepEqual(outcomes.map(r=>r.rows[0].ok).sort(),[false,true]);
  const s=initialState(c);s.paused=false;
  const results=await Promise.all([true,false].map(paused=>db.query("select public.layla_meta_cas('bznsflow:mock',1,$1) as ok",[{...s,paused}])));
  assert.deepEqual(results.map(r=>r.rows[0].ok).sort(),[false,true]);
  assert.equal((await db.query("select public.layla_meta_read('bznsflow:live') as result")).rows[0].result,null);
  await assert.rejects(db.query("select public.layla_meta_cas('attacker',0,$1)",[s]),/check constraint/);
 } finally {await db.close();}
});
test('committed inbox, optout and activation survive local database restart',async()=>{
 const path=await mkdtemp(join(tmpdir(),'layla-meta-db-'));
 let db=await setup(path);
 const s=initialState(c);s.activatedAt=123456789;s.contacts['999000000000']={optout:true};s.jobs['fixture']={status:'ambiguous',intentId:'do-not-replay'};
 s.activation={status:'registering',updatedAt:123456789};s.supervised={status:'stopped',replies:5,expiresAt:123456789};
 await db.query("select public.layla_meta_cas('bznsflow:mock',0,$1)",[s]);await db.close();
 db=new PGlite(path);
 try {const result=(await db.query("select public.layla_meta_read('bznsflow:mock') as result")).rows[0].result;assert.deepEqual(result.state,s);}
 finally {await db.close();}
});
test('existing OTP login, profile registration and session lookup work beside pilot schema',async()=>{
 const db=await setup();
 try {
  const token='a'.repeat(64), hash='b'.repeat(64);
  assert.equal((await db.query('select public.auth_request_code($1,$2,$3) as result',['synthetic@example.test',hash,10])).rows[0].result.ok,true);
  const login=(await db.query('select public.auth_verify_code($1,$2,$3,$4) as result',['synthetic@example.test',hash,token,30])).rows[0].result;
  assert.equal(login.ok,true);assert.equal(login.needs_profile,true);
  const registered=(await db.query('select public.auth_complete_profile($1,$2,$3,$4,$5,$6) as result',[token,'Synthetic Owner','+96899999999','OM','other','en'])).rows[0].result;
  assert.equal(registered.ok,true);
  const session=(await db.query('select public.auth_session($1) as result',[token])).rows[0].result;
  assert.equal(session.ok,true);assert.equal(session.account.id,login.account.id);assert.equal(session.needs_profile,false);
  assert.equal((await db.query('select count(*)::int as n from public.layla_meta_state')).rows[0].n,0);
 } finally {await db.close();}
});
