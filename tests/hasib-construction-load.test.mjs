import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { convexMemory } from './helpers/convex-memory.mjs';
import { executeConstruction } from '../convex/hasib/constructionState.js';
import { hasibPack } from '../config/hasib-packs.js';

test('construction synthetic release profile stays bounded and idempotent under bursts',async()=>{
  const m=convexMemory(),accountId='load-account',manager='load-manager',now=m.now();
  const workspaceId=await m.db.insert('ascendWorkspaces',{managerAccountId:manager,employeeLimit:5,createdAt:now,updatedAt:now});
  const actor={workspace:{_id:workspaceId,managerAccountId:manager,employeeLimit:5},role:'manager',actorAccountId:manager};
  const tenant={accountId,pack:hasibPack('construction'),actor};
  const run=(operation,args={})=>executeConstruction(m.ctx,tenant,actor,{operation,...args},m.now());
  const projects=[];
  for(let i=0;i<2250;i++)projects.push(await m.db.insert('constructionProjects',{accountId,requestId:randomUUID(),reference:`P-${i}`,title:`Synthetic project ${i}`,location:'Oman',contractType:'lump_sum',originalContractMinor:1_000_000,originalBudgetMinor:800_000,startAt:now-10,status:i<250?'active':'closed',contractFinishAt:now+86400000,forecastFinishAt:now+86400000,estimateToCompleteMinor:100_000,baselineApprovedAt:now-20,baselineApprovedBy:manager,version:1,createdAt:now-i,updatedAt:now}));
  for(let i=0;i<5000;i++)await m.db.insert('constructionMilestones',{accountId,requestId:randomUUID(),projectId:projects[i%projects.length],label:`Milestone ${i}`,weightBps:1000,budgetMinor:80_000,plannedStartAt:now-100,plannedFinishAt:now-1,forecastFinishAt:now+100,actualProgressBps:5000,status:'in_progress',version:1,createdAt:now,updatedAt:now});
  for(let i=0;i<20000;i++){
    const projectId=projects[i%projects.length];
    await m.db.insert('constructionCosts',{accountId,requestId:randomUUID(),projectId,category:i%10?'labor':'rework',amountMinor:1000,incurredAt:now,rework:i%10===0,createdBy:manager,version:1,createdAt:now});
    await m.db.insert('constructionProgress',{accountId,requestId:randomUUID(),projectId,asOfAt:now,plannedBps:6000,actualBps:5000,workerHours:8,createdBy:manager,createdAt:now});
    await m.db.insert('constructionSiteReports',{accountId,requestId:randomUUID(),projectId,reportDate:now,workerHours:8,toolboxTalks:1,inspections:1,recordableIncidents:0,lostTimeIncidents:0,lostDays:0,createdBy:manager,createdAt:now});
  }
  for(let i=0;i<2000;i++)await m.db.insert('constructionVariations',{accountId,requestId:randomUUID(),projectId:projects[i%projects.length],reference:`VO-${i}`,title:'Synthetic variation',reason:'Synthetic release test',contractDeltaMinor:1000,budgetDeltaMinor:500,scheduleDeltaDays:0,status:'submitted',version:1,createdAt:now,updatedAt:now});
  for(let i=0;i<5000;i++){await m.db.insert('constructionCommitments',{accountId,requestId:randomUUID(),projectId:projects[i%projects.length],kind:'purchase_order',supplier:'Synthetic supplier',package:'Fit-out',label:`PO-${i}`,amountMinor:1000,requiredAt:now+100,status:'ordered',version:1,createdAt:now,updatedAt:now});await m.db.insert('constructionClaims',{accountId,requestId:randomUUID(),projectId:projects[i%projects.length],reference:`IPC-${i}`,grossMinor:1000,retentionMinor:100,advanceRecoveryMinor:0,netMinor:900,status:'draft',dueAt:now+100,retentionReleaseAt:now+100,version:1,createdAt:now,updatedAt:now});}
  for(let i=0;i<500;i++)await m.db.insert('constructionTasks',{accountId,kind:'backlog',entityType:'project',entityId:projects[i%projects.length],status:'open',reason:'Synthetic backlog',createdAt:now,updatedAt:now});
  const burstProject=projects[0];
  const burst=await Promise.all(Array.from({length:50},(_,i)=>run('construction_cost_save',{requestId:randomUUID(),projectId:burstProject,workflow:{projectId:burstProject,category:'labor',amountMinor:1000+i,incurredAt:now}})));
  assert.equal(burst.filter(x=>x.ok).length,50);assert.equal(new Set(burst.map(x=>x.value.id)).size,50);
  const replayId=randomUUID(),first=await run('construction_cost_save',{requestId:replayId,projectId:burstProject,workflow:{projectId:burstProject,category:'labor',amountMinor:999,incurredAt:now}}),replay=await run('construction_cost_save',{requestId:replayId,projectId:burstProject,workflow:{projectId:burstProject,category:'labor',amountMinor:999,incurredAt:now}});assert.equal(first.value.id,replay.value.id);
  const started=performance.now(),overview=await run('construction_overview'),elapsed=performance.now()-started;
  assert.equal(overview.ok,true);assert.equal(overview.value.metrics.length,3);assert.equal(overview.value.tasks.length,200,'attention backlog reads are bounded');assert.ok(elapsed<2000,`overview took ${elapsed.toFixed(1)}ms`);
  assert.deepEqual({projects:m.table('constructionProjects').length,milestones:m.table('constructionMilestones').length,variations:m.table('constructionVariations').length,tasks:m.table('constructionTasks').length},{projects:2250,milestones:5000,variations:2000,tasks:500});
});
