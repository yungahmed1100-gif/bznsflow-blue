import test from 'node:test';
import assert from 'node:assert/strict';
import { convexMemory } from './helpers/convex-memory.mjs';
import { assertEntry } from './helpers/hasib-contract.mjs';
import { hasibArgs } from '../api/_lib/hasib/validate.js';
import { executeBookings } from '../convex/hasib/bookingsState.js';
import { executeMemberships } from '../convex/hasib/membershipsState.js';
import { executeFollowups } from '../convex/hasib/followupsState.js';
import { executeJobs } from '../convex/hasib/jobsState.js';
import { executeProperty } from '../convex/hasib/propertyState.js';
import { executeRequests } from '../convex/hasib/requestsState.js';

const cases = [
  ['resources','hasibResources',executeBookings], ['services','hasibServices',executeBookings], ['waitlist','hasibWaitlist',executeBookings],
  ['memberships','hasibMemberships',executeMemberships], ['membership_credits','hasibCredits',executeMemberships],
  ['followups','hasibFollowups',executeFollowups], ['jobs','hasibJobs',executeJobs], ['equipment','hasibEquipment',executeJobs],
  ['properties','hasibProperties',executeProperty], ['product_requests','hasibProductRequests',executeRequests],
];
for (const [operation,table,execute] of cases) test(`${operation}: API cursor reaches records after the default 25 without leaking tenants`, async () => {
  const m=convexMemory(),accountId='accounts_1';
  const membershipId=operation==='membership_credits'?await m.db.insert('hasibMemberships',{accountId}):undefined;
  const ids=[];
  for(let i=0;i<32;i++) {
    const id=await m.db.insert(table,{accountId:i===31?'accounts_foreign':accountId,membershipId:i===31?'hasibMemberships_foreign':membershipId,createdAt:i,dueAt:i,status:'waiting',costs:[],milestones:[],checklist:[],variantId:'hasibVariants_missing'});
    if(i<31) ids.push(id);
  }
  const call=async body=>{
    const a={operation,sessionHash:'f'.repeat(64),...hasibArgs(operation,{membershipId,...body})};
    assertEntry(a);
    const result=await execute(m.ctx,{accountId},a,m.now());
    assert.equal(result.ok,true,result.reason);
    return result.value;
  };
  const first=await call({});
  assert.equal(first.items.length,25);
  assert.equal(typeof first.cursor,'string');
  const second=await call({cursor:first.cursor});
  assert.equal(second.items.length,6);
  assert.equal(second.cursor,null);
  assert.deepEqual(new Set([...first.items,...second.items].map(x=>x.id)),new Set(ids));
  assert.equal((await call({limit:200})).items.length,31);
});

test('bookings: date bounds survive API shaping and cursor pages cover the complete window', async()=>{
  const m=convexMemory(),accountId='accounts_1',start=m.now();
  for(let i=0;i<40;i++) await m.db.insert('hasibBookings',{accountId,startsAt:start+i*60000,endsAt:start+(i+1)*60000,durationMinutes:1,status:'scheduled'});
  const call=async body=>{
    const a={operation:'bookings',sessionHash:'f'.repeat(64),...hasibArgs('bookings',{fromAt:start+5*60000,toAt:start+36*60000,...body})};
    assertEntry(a);
    return executeBookings(m.ctx,{accountId},a,start);
  };
  const first=(await call({})).value,second=(await call({cursor:first.cursor})).value;
  assert.equal(first.items.length,25);
  assert.equal(first.items[0].startsAt,start+5*60000);
  assert.equal(second.items.length,6);
  assert.equal(second.items.at(-1).startsAt,start+35*60000);
  assert.equal(second.cursor,null);
  assert.equal((await call({toAt:start})).reason,'invalid_booking_range');
  const empty=(await call({status:'completed'})).value;
  assert.deepEqual(empty.items,[]);
  assert.equal(typeof empty.cursor,'string','filtered empty pages retain the continuation');
});
