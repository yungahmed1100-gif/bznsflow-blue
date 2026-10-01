// Local owner journeys through dashboard API shaping and the exported Convex entry validator.
import test from 'node:test';
import assert from 'node:assert/strict';
import { convexMemory, SECRET } from './helpers/convex-memory.mjs';
import { seedTenant } from './helpers/blue-tenant.mjs';
import { hasibPack } from '../config/hasib-packs.js';
import { executeHasib } from '../convex/hasib/hasibState.js';
import { grantPlan } from '../convex/hasib/plans.js';
import { BLUE_CLOUD } from '../api/_lib/convex.js';
import { createHasibApi } from '../api/_lib/hasib/hasib-api.js';
import { PilotError } from '../api/_lib/layla/config.js';
import { hasibArgs } from '../api/_lib/hasib/validate.js';
import { assertEntry, assertHasibRows } from './helpers/hasib-contract.mjs';
import { seedIndustry } from '../scripts/hasib-demo-industries.mjs';

// Dental runs its own clinic journey (visits, not bookings) in tests/hasib-dental.test.mjs.
const INDUSTRIES = ['retail', 'retail-tech', 'beauty', 'clinic', 'restaurant', 'cafe', 'cakes', 'automotive', 'fitness', 'education', 'cleaning', 'hvac', 'construction', 'real-estate'];
for (const packId of INDUSTRIES) test(`${packId}: synthetic owner journey passes API shaping and Convex entry contract`, async () => {
  const m = convexMemory();
  m.ctx.hasibPreview = true;
  const tenant = await seedTenant(m, { name: 'industry', sector: 'Retail' });
  await m.db.insert('blueMessagingSettings', { key: 'hasib', enabled: true });
  await m.db.insert('blueBusinessSettings', { accountId: tenant.accountId, timezone: 'Asia/Muscat', updatedAt: m.now() });
  await grantPlan(m.ctx, { email: 'industry@example.com', plan: 'ascend', packId: 'retail' }, m.now());
  // Local harness setup happens behind the public API. Customer HTTP requests
  // cannot select a pack; founder HTTP previews are intentionally read-only.
  const selected = await executeHasib(m.ctx, { operation: 'settings_update', sessionHash: tenant.sessionHash, hashSecret: SECRET, packId }, m.now());
  assert.equal(selected.ok, true);
  const seen = new Set();
  const csrf = 'e'.repeat(64);
  const api = createHasibApi({ env: { CONVEX_CLOUD_URL:BLUE_CLOUD,BLUE_REVIEW_SERVICE_SECRET:SECRET,BLUE_ACCOUNT_SAVE_ENABLED:'true',BLUE_DASHBOARD_ENABLED:'true',BLUE_HASIB_ENABLED:'true' },
    accounts:async()=>({id:tenant.accountId,email:'industry@example.com',draftHash:tenant.sessionHash}),
    store:async(operation,args)=> {
      assertEntry({operation,...args});
      const result=await executeHasib(m.ctx,{operation,...args,hashSecret:SECRET},m.now());
      if(!result.ok) throw new PilotError(result.reason,409);
      assertHasibRows(m);
      return result.value;
    } });
  const hasib = async (operation, body = {}) => {
    // Also assert the independent shape exactly matches the production HTTP call.
    assertEntry({operation,sessionHash:tenant.sessionHash,...(operation==='overview'?{}:hasibArgs(operation,body))});
    const response={headers:{},getHeader(k){return this.headers[k];},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;},end(v){this.body=JSON.parse(v);}};
    await api({method:operation==='overview'?'GET':'POST',headers:{host:'bznsflow-blue.vercel.app',origin:'https://bznsflow-blue.vercel.app',cookie:`__Host-blue_account=${'f'.repeat(64)}; bf_csrf=${csrf}`,'x-csrf-token':csrf},body:{action:operation,...body}},response);
    assert.equal(response.statusCode,200,`${packId}/${operation}: ${response.body?.reason}`);
    seen.add(operation);
    return response.body;
  };
  const refs = await seedIndustry({ m, tenant, hasib, pack: hasibPack(packId) });
  assertHasibRows(m);
  const overview = await hasib('overview');
  assert.equal(overview.pack.id, packId);
  assert.equal(overview.pack.todayMetrics.length, 3);
  const today = await hasib('today');
  assert.equal(today.industryMetrics.length,3);
  assert.deepEqual(today.industryMetrics.map(m=>m.id),overview.pack.todayMetrics.map(m=>m.id));
  const money = await hasib('insights',{period:'today'});
  assert.equal(seen.has('payment_record'), true, 'journey links operational records to the existing payment ledger');
  assert.ok(refs.orderId);
  assert.ok((await hasib('followups')).items.length);
  assert.equal(m.scheduled.length, 0, 'seed never schedules live messages');
  if (['beauty', 'dental', 'clinic', 'fitness', 'education'].includes(packId)) {
    assert.equal((await m.db.get(refs.completedBookingId)).status, 'completed');
    assert.equal((await hasib('bookings')).items.length, 2);
    assert.equal((await hasib('waitlist')).items.length, 1);
    if (packId === 'education') assert.equal((await m.db.get(refs.membershipId)).remainingCredits, 3);
    if (packId === 'fitness') assert.equal((await hasib('memberships')).items[0].active, true);
  }
  if (['restaurant', 'cafe', 'cakes'].includes(packId)) {
    assert.equal(m.table('hasibInventoryCounts').length, 2);
    assert.equal(m.table('hasibWaste').length, 1);
    assert.ok(m.table('hasibStockLots').length >= 3);
    const order = await m.db.get(refs.orderId);
    assert.ok(order.lines[0].unitCostMinor > 0);
    if (packId === 'cafe') assert.equal(order.lines[0].unitPriceMinor, 12500, 'extra shot changes price and recipe cost');
    if (packId === 'cakes') assert.equal(m.table('hasibPrepBatches')[0].inputs.length, 3);
  }
  if (['cleaning', 'hvac', 'construction'].includes(packId)) {
    const job = await hasib('job', { jobId: refs.jobId });
    assert.equal(job.status, 'completed');
    assert.equal(job.recordedProfitMinor, 12000);
    assert.equal(money.recordedProfitMinor,12000,'Today job profit and Money share operational costs once');
    assert.equal(job.orderId, refs.orderId);
    assert.equal(m.table('hasibOrders').length, 1, 'estimates and jobs do not duplicate financial charges');
  }
  if (packId === 'automotive') {
    const work = await hasib('automotive_work_order', { workOrderId: refs.workOrderId });
    assert.equal(work.status, 'ready');
    assert.equal(work.orderId, refs.orderId);
    assert.equal(m.table('hasibOrders').length, 1, 'approved work creates exactly one financial charge');
    assert.equal(m.table('automotivePartAllocations')[0].status, 'issued');
    assert.equal((await hasib('automotive_overview')).metrics.length, 3);
  }
  if (packId === 'real-estate') {
    const order = await m.db.get(refs.orderId);
    assert.equal(order.totalMinor, 150000, 'only commission is booked as agency revenue');
    assert.equal((await m.db.get(refs.propertyId)).askingPriceMinor, 65000000);
    assert.equal((await hasib('property_enquiries')).items.length, 2);
  }
  if (packId === 'retail-tech') {
    assert.equal(m.table('hasibSerials').filter(s => s.status === 'sold').length, 1);
    assert.equal((await hasib('repairs')).items.length, 1);
  }
  if (!['retail', 'retail-tech', 'dental', 'real-estate', 'construction', 'automotive'].includes(packId)) {
    const live = await executeHasib({ ...m.ctx, hasibPreview: false }, { operation: 'today', sessionHash: tenant.sessionHash, hashSecret: SECRET }, m.now());
    assert.equal(live.reason, 'pack_not_live', 'synthetic preview never opens the live release gate');
  }
});
