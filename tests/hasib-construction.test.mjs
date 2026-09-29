import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { convexMemory } from './helpers/convex-memory.mjs';
import { executeConstruction } from '../convex/hasib/constructionState.js';
import { hasibPack } from '../config/hasib-packs.js';

async function setup(){
  const m=convexMemory(),accountId='construction-account',manager='construction-manager';
  const workspaceId=await m.db.insert('ascendWorkspaces',{managerAccountId:manager,employeeLimit:5,createdAt:m.now(),updatedAt:m.now()});
  const workspace={_id:workspaceId,managerAccountId:manager,employeeLimit:5},actor={workspace,role:'manager',actorAccountId:manager};
  const tenant={accountId,pack:hasibPack('construction'),actor};
  const run=(operation,args={},who=actor)=>executeConstruction(m.ctx,tenant,who,{operation,...args},m.now());
  return {m,tenant,actor,workspace,run};
}
async function project(run,m,overrides={}){
  return (await run('construction_project_save',{requestId:randomUUID(),workflow:{reference:'OM-001',title:'Muscat fit-out',location:'Muscat',contractType:'lump_sum',originalContractMinor:150_000_000,originalBudgetMinor:100_000_000,estimateToCompleteMinor:100_000_000,startAt:m.now(),contractFinishAt:m.now()+90*86400000,forecastFinishAt:m.now()+90*86400000,...overrides}})).value;
}

test('construction baseline requires weighted milestones totalling 100% and exact budget',async()=>{
  const {m,run}=await setup();let p=await project(run,m);
  const first=await run('construction_milestone_save',{requestId:randomUUID(),projectId:p.id,workflow:{projectId:p.id,label:'Mobilisation',weightBps:5000,budgetMinor:50_000_000,plannedStartAt:m.now(),plannedFinishAt:m.now()+30*86400000}});assert.equal(first.ok,true,first.reason);
  assert.equal((await run('construction_baseline_approve',{projectId:p.id,version:p.version})).reason,'milestone_weights_incomplete');
  await run('construction_milestone_save',{requestId:randomUUID(),projectId:p.id,workflow:{projectId:p.id,label:'Completion',weightBps:5000,budgetMinor:50_000_000,plannedStartAt:m.now()+30*86400000,plannedFinishAt:m.now()+90*86400000}});
  const approved=await run('construction_baseline_approve',{projectId:p.id,version:p.version});assert.equal(approved.ok,true,approved.reason);assert.ok(approved.value.baselineApprovedAt);
  assert.equal((await run('construction_milestone_save',{requestId:randomUUID(),projectId:p.id,workflow:{projectId:p.id,label:'Late edit',weightBps:1,budgetMinor:1,plannedStartAt:m.now(),plannedFinishAt:m.now()+1}})).reason,'baseline_locked');
});

test('project lifecycle is bounded and activation is blocked before baseline approval',async()=>{
  const {m,run}=await setup();let p=await project(run,m);
  const edited=await run('construction_project_save',{projectId:p.id,version:p.version,workflow:{status:'closed',title:'Safe edit'}});assert.equal(edited.value.status,'tender','ordinary edits cannot bypass the lifecycle');p=edited.value;
  p=(await run('construction_project_status',{projectId:p.id,version:p.version,status:'quoted'})).value;p=(await run('construction_project_status',{projectId:p.id,version:p.version,status:'awarded'})).value;
  assert.equal((await run('construction_project_status',{projectId:p.id,version:p.version,status:'active'})).reason,'baseline_required');assert.equal((await run('construction_project_status',{projectId:p.id,version:1,status:'cancelled'})).reason,'project_conflict');
});

test('variation approval is manager-only and only approved changes affect revised contract',async()=>{
  const {m,run,workspace}=await setup();const p=await project(run,m);
  let variation=(await run('construction_variation_save',{requestId:randomUUID(),projectId:p.id,workflow:{projectId:p.id,reference:'VO-01',title:'Client ceiling change',reason:'Client instruction',contractDeltaMinor:10_000_000,budgetDeltaMinor:7_000_000,scheduleDeltaDays:5}})).value;
  variation=(await run('construction_variation_status',{variationId:variation.id,version:variation.version,status:'submitted'})).value;
  assert.equal((await run('construction_variation_save',{variationId:variation.id,version:variation.version,workflow:{title:'Changed after submission'}})).reason,'variation_locked');
  assert.equal((await run('construction_variation_status',{variationId:variation.id,version:variation.version,status:'approved'},{workspace,role:'employee',actorAccountId:'employee'})).reason,'manager_required');
  variation=(await run('construction_variation_status',{variationId:variation.id,version:variation.version,status:'approved'})).value;assert.equal(variation.status,'approved');
  const report=await run('construction_insights');assert.equal(report.value.metrics.revisedContractMinor,160_000_000);assert.equal(report.value.metrics.revisedBudgetMinor,107_000_000);
});

test('certifying a claim creates one receivable and retention releases separately and once',async()=>{
  const {m,run}=await setup();const p=await project(run,m);
  let claim=(await run('construction_claim_save',{requestId:randomUUID(),projectId:p.id,workflow:{projectId:p.id,reference:'IPC-01',grossMinor:20_000_000,retentionMinor:2_000_000,advanceRecoveryMinor:1_000_000,dueAt:m.now()-1,retentionReleaseAt:m.now()-1}})).value;
  claim=(await run('construction_claim_status',{claimId:claim.id,version:claim.version,status:'submitted'})).value;claim=(await run('construction_claim_status',{claimId:claim.id,version:claim.version,status:'certified'})).value;
  assert.ok(claim.orderId);assert.equal(m.table('hasibOrders').length,1);assert.equal(m.table('hasibOrders')[0].totalMinor,17_000_000);
  assert.equal((await run('construction_claim_status',{claimId:claim.id,version:claim.version,status:'paid'})).reason,'claim_payment_mismatch');
  claim=(await run('construction_retention_release',{claimId:claim.id,version:claim.version})).value;assert.ok(claim.retentionOrderId);assert.equal(m.table('hasibOrders').length,2);assert.equal(m.table('hasibOrders')[1].totalMinor,2_000_000);
  assert.equal((await run('construction_retention_release',{claimId:claim.id,version:claim.version})).reason,'retention_not_releasable');
});

test('earned value, actual cost, safety and coverage have explicit denominators',async()=>{
  const {m,run}=await setup();let p=await project(run,m,{estimateToCompleteMinor:40_000_000});
  const milestone=(await run('construction_milestone_save',{requestId:randomUUID(),projectId:p.id,workflow:{projectId:p.id,label:'All works',weightBps:10000,budgetMinor:100_000_000,plannedStartAt:m.now()-10,plannedFinishAt:m.now()-1}})).value;p=(await run('construction_baseline_approve',{projectId:p.id,version:p.version})).value;
  await run('construction_progress_save',{requestId:randomUUID(),projectId:p.id,workflow:{projectId:p.id,milestoneId:milestone.id,asOfAt:m.now(),plannedBps:6000,actualBps:5000,workerHours:1000}});await run('construction_cost_save',{requestId:randomUUID(),projectId:p.id,workflow:{projectId:p.id,category:'labor',amountMinor:25_000_000,incurredAt:m.now()}});await run('construction_cost_save',{requestId:randomUUID(),projectId:p.id,workflow:{projectId:p.id,category:'rework',amountMinor:5_000_000,incurredAt:m.now(),rework:true}});await run('construction_site_report_save',{requestId:randomUUID(),projectId:p.id,workflow:{projectId:p.id,reportDate:m.now(),workerHours:1000,toolboxTalks:2,inspections:3,recordableIncidents:1,lostTimeIncidents:0,lostDays:0}});
  const report=await run('construction_insights'),k=report.value.metrics;assert.equal(k.evMinor,50_000_000);assert.equal(k.actualCostMinor,30_000_000);assert.equal(k.cpi,50/30);assert.equal(k.spi,0.5);assert.equal(k.reworkRate,1/6);assert.equal(k.incidentFrequency,200);assert.deepEqual(report.value.coverage.earnedValue,{numerator:1,denominator:1});
});

test('today returns exactly the three approved exception measures',async()=>{
  const {m,run}=await setup();const p=await project(run,m,{contractFinishAt:m.now()+10,forecastFinishAt:m.now()+20});let variation=(await run('construction_variation_save',{requestId:randomUUID(),projectId:p.id,workflow:{projectId:p.id,reference:'VO-02',title:'Unapproved work',reason:'Pending instruction',contractDeltaMinor:3_000_000,budgetDeltaMinor:2_000_000,scheduleDeltaDays:2}})).value;await run('construction_variation_status',{variationId:variation.id,version:variation.version,status:'submitted'});
  const overview=await run('construction_overview');assert.equal(overview.value.metrics.length,3);assert.deepEqual(overview.value.metrics.map(x=>x.key),['schedule_risk','variation_exposure','overdue_receivables']);assert.equal(overview.value.metrics[1].value,3_000_000);
});

test('site reports store aggregate counts and create explicit safety review tasks',async()=>{
  const {m,run}=await setup();const p=await project(run,m);const report=await run('construction_site_report_save',{requestId:randomUUID(),projectId:p.id,workflow:{projectId:p.id,reportDate:m.now(),workerHours:80,toolboxTalks:1,inspections:2,recordableIncidents:1,lostTimeIncidents:0,lostDays:0}});
  assert.equal(report.ok,true,report.reason);assert.equal('notes' in report.value,false);assert.equal(m.table('constructionTasks').length,1);assert.equal(m.table('constructionTasks')[0].kind,'safety_review');assert.ok(m.table('ascendActivity').some(x=>x.action==='construction_site_reported'));
});
