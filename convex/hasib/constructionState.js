import { owned } from '../blueTenant.js';
import { ok, fail, bounded, REQUEST_ID, byRequest, clampLimit, settingsFor } from './shared.js';
import { isMinor } from './money.js';
import { createOrder } from './ordersState.js';
import { audit, workspaceContainsAccount } from './workspaceState.js';

const DAY = 86400000;
const PROJECT_STATES = ['tender','quoted','awarded','active','practical_completion','defects_liability','closed','lost','cancelled'];
const ACTIVE_STATES = new Set(['awarded','active','practical_completion','defects_liability']);
const COST_CATEGORIES = ['labor','material','subcontract','equipment','overhead','rework','other'];
const publicRow = row => { const { _id, _seq, table, accountId, requestId, ...rest } = row; return { id:_id, ...rest }; };
const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;
const list = async (ctx, table, accountId, a, index = 'by_account_created') => {
  const page = await ctx.db.query(table).withIndex(index, q => q.eq('accountId', accountId)).order('desc').paginate({ numItems:clampLimit(a.limit, 200), cursor:a.cursor || null });
  return ok({ items:page.page.map(publicRow), cursor:page.isDone ? null : page.continueCursor });
};
const requireRequest = a => REQUEST_ID.test(a.requestId || '');
const projectFor = async (ctx, accountId, id) => owned(ctx, id, accountId, 'constructionProjects');
const ownsAssignee = (ctx, actor, id) => !id || workspaceContainsAccount(ctx, actor.workspace, id);
const versioned = (row, a, label) => !row ? fail(`${label}_not_found`) : row.version !== a.version ? fail(`${label}_conflict`) : null;

async function task(ctx, accountId, kind, entityType, entityId, reason, now, dueAt) {
  const existing = await ctx.db.query('constructionTasks').withIndex('by_entity', q => q.eq('entityType', entityType).eq('entityId', String(entityId))).take(50);
  if (existing.some(x => x.accountId === accountId && x.kind === kind && x.status === 'open')) return;
  await ctx.db.insert('constructionTasks', { accountId, kind, entityType, entityId:String(entityId), status:'open', reason, ...(dueAt ? { dueAt } : {}), createdAt:now, updatedAt:now });
}

async function projectSave(ctx, tenant, actor, a, now) {
  const w=a.workflow || {}, accountId=tenant.accountId;
  let row=a.projectId ? await projectFor(ctx, accountId, a.projectId) : null;
  if (a.projectId) { const err=versioned(row,a,'project'); if(err)return err; }
  if (!row) {
    if (!requireRequest(a)) return fail('invalid_request');
    const replay=await byRequest(ctx,'constructionProjects',accountId,a.requestId); if(replay)return ok(publicRow(replay));
  }
  const reference=bounded(w.reference ?? row?.reference,40), title=bounded(w.title ?? row?.title,120), location=bounded(w.location ?? row?.location,160);
  const contractType=bounded(w.contractType ?? row?.contractType ?? 'lump_sum',40), status=row?.status ?? 'tender';
  const originalContractMinor=w.originalContractMinor ?? row?.originalContractMinor ?? 0, originalBudgetMinor=w.originalBudgetMinor ?? row?.originalBudgetMinor ?? 0;
  const startAt=w.startAt ?? row?.startAt, contractFinishAt=w.contractFinishAt ?? row?.contractFinishAt, forecastFinishAt=w.forecastFinishAt ?? row?.forecastFinishAt ?? contractFinishAt;
  const estimateToCompleteMinor=w.estimateToCompleteMinor ?? row?.estimateToCompleteMinor ?? originalBudgetMinor;
  const contactId=w.contactId ?? row?.contactId, assignedAccountId=w.assignedAccountId ?? row?.assignedAccountId;
  if (!reference || !title || !location || !['lump_sum','remeasurement','cost_plus','design_build'].includes(contractType) || !PROJECT_STATES.includes(status)
    || !isMinor(originalContractMinor) || !isMinor(originalBudgetMinor) || !isMinor(estimateToCompleteMinor) || !integer(startAt) || !integer(contractFinishAt) || !integer(forecastFinishAt) || startAt >= contractFinishAt) return fail('invalid_project');
  if (contactId && !await owned(ctx,contactId,accountId,'blueContacts')) return fail('contact_not_found');
  if (!await ownsAssignee(ctx,actor,assignedAccountId)) return fail('invalid_assignment');
  const data={reference,title,location,contractType,originalContractMinor,originalBudgetMinor,startAt,contractFinishAt,forecastFinishAt,status,estimateToCompleteMinor,
    ...(contactId?{contactId}:{}),...(assignedAccountId?{assignedAccountId}:{}),version:(row?.version||0)+1,updatedAt:now};
  let id;if(row){await ctx.db.patch(row._id,data);id=row._id;}else id=await ctx.db.insert('constructionProjects',{...data,accountId,requestId:a.requestId,createdAt:now});
  await audit(ctx,tenant,actor,row?'construction_project_updated':'construction_project_created','construction_project',id,now);
  return ok(publicRow(await ctx.db.get(id)));
}

async function projectStatus(ctx,tenant,actor,a,now){
  const row=await projectFor(ctx,tenant.accountId,a.projectId), err=versioned(row,a,'project');if(err)return err;
  const to=a.status, transitions={tender:['quoted','lost','cancelled'],quoted:['awarded','lost','cancelled'],awarded:['active','cancelled'],active:['practical_completion','cancelled'],practical_completion:['defects_liability'],defects_liability:['closed']};
  if(!(transitions[row.status]||[]).includes(to))return fail('invalid_project_transition');
  if(to==='active'&&!row.baselineApprovedAt)return fail('baseline_required');
  await ctx.db.patch(row._id,{status:to,version:row.version+1,updatedAt:now});
  await audit(ctx,tenant,actor,'construction_project_status','construction_project',row._id,now,`${row.status}:${to}`);return ok(publicRow(await ctx.db.get(row._id)));
}

async function milestoneSave(ctx,tenant,actor,a,now){
  const w=a.workflow||{};let row=a.milestoneId?await owned(ctx,a.milestoneId,tenant.accountId,'constructionMilestones'):null;
  if(a.milestoneId){const err=versioned(row,a,'milestone');if(err)return err;}else{if(!requireRequest(a))return fail('invalid_request');const replay=await byRequest(ctx,'constructionMilestones',tenant.accountId,a.requestId);if(replay)return ok(publicRow(replay));}
  const projectId=w.projectId??a.projectId??row?.projectId, project=await projectFor(ctx,tenant.accountId,projectId);if(!project)return fail('project_not_found');
  if(project.baselineApprovedAt)return fail('baseline_locked');
  const label=bounded(w.label??row?.label,100),weightBps=w.weightBps??row?.weightBps,budgetMinor=w.budgetMinor??row?.budgetMinor;
  const plannedStartAt=w.plannedStartAt??row?.plannedStartAt,plannedFinishAt=w.plannedFinishAt??row?.plannedFinishAt,forecastFinishAt=w.forecastFinishAt??row?.forecastFinishAt??plannedFinishAt;
  if(!label||!integer(weightBps,1,10000)||!isMinor(budgetMinor)||!integer(plannedStartAt)||!integer(plannedFinishAt)||plannedStartAt>=plannedFinishAt)return fail('invalid_milestone');
  const data={projectId,label,weightBps,budgetMinor,plannedStartAt,plannedFinishAt,forecastFinishAt,actualProgressBps:row?.actualProgressBps||0,status:row?.status||'planned',version:(row?.version||0)+1,updatedAt:now};
  let id;if(row){await ctx.db.patch(row._id,data);id=row._id;}else id=await ctx.db.insert('constructionMilestones',{...data,accountId:tenant.accountId,requestId:a.requestId,createdAt:now});
  await audit(ctx,tenant,actor,row?'construction_milestone_updated':'construction_milestone_created','construction_milestone',id,now);return ok(publicRow(await ctx.db.get(id)));
}

async function baselineApprove(ctx,tenant,actor,a,now){
  if(actor.role!=='manager')return fail('manager_required');const project=await projectFor(ctx,tenant.accountId,a.projectId),err=versioned(project,a,'project');if(err)return err;
  const rows=await ctx.db.query('constructionMilestones').withIndex('by_project',q=>q.eq('projectId',project._id)).take(1000);
  if(!rows.length||rows.reduce((n,x)=>n+x.weightBps,0)!==10000)return fail('milestone_weights_incomplete');
  if(rows.reduce((n,x)=>n+x.budgetMinor,0)!==project.originalBudgetMinor)return fail('milestone_budget_mismatch');
  await ctx.db.patch(project._id,{baselineApprovedAt:now,baselineApprovedBy:actor.actorAccountId,version:project.version+1,updatedAt:now});
  await audit(ctx,tenant,actor,'construction_baseline_approved','construction_project',project._id,now);return ok(publicRow(await ctx.db.get(project._id)));
}

async function progressSave(ctx,tenant,actor,a,now){
  const w=a.workflow||{};if(!requireRequest(a))return fail('invalid_request');const replay=await byRequest(ctx,'constructionProgress',tenant.accountId,a.requestId);if(replay)return ok(publicRow(replay));
  const project=await projectFor(ctx,tenant.accountId,w.projectId??a.projectId);if(!project||!project.baselineApprovedAt)return fail(project?'baseline_required':'project_not_found');
  let milestone=null;if(w.milestoneId??a.milestoneId){milestone=await owned(ctx,w.milestoneId??a.milestoneId,tenant.accountId,'constructionMilestones');if(!milestone||milestone.projectId!==project._id)return fail('milestone_not_found');}
  const asOfAt=w.asOfAt??now,plannedBps=w.plannedBps,actualBps=w.actualBps,workerHours=w.workerHours??0;
  if(!integer(asOfAt)||!integer(plannedBps,0,10000)||!integer(actualBps,0,10000)||!integer(workerHours,0,1000000))return fail('invalid_progress');
  const id=await ctx.db.insert('constructionProgress',{accountId:tenant.accountId,requestId:a.requestId,projectId:project._id,...(milestone?{milestoneId:milestone._id}:{}),asOfAt,plannedBps,actualBps,workerHours,createdBy:actor.actorAccountId,createdAt:now});
  if(milestone&&actualBps>=milestone.actualProgressBps)await ctx.db.patch(milestone._id,{actualProgressBps:actualBps,status:actualBps===10000?'complete':'in_progress',version:milestone.version+1,updatedAt:now});
  await audit(ctx,tenant,actor,'construction_progress_recorded','construction_progress',id,now);return ok(publicRow(await ctx.db.get(id)));
}

async function costSave(ctx,tenant,actor,a,now){
  const w=a.workflow||{};if(!requireRequest(a))return fail('invalid_request');const replay=await byRequest(ctx,'constructionCosts',tenant.accountId,a.requestId);if(replay)return ok(publicRow(replay));
  const project=await projectFor(ctx,tenant.accountId,w.projectId??a.projectId);if(!project)return fail('project_not_found');
  const category=w.category??a.category,amountMinor=w.amountMinor??a.amountMinor,incurredAt=w.incurredAt??now,rework=w.rework===true||category==='rework';
  if(!COST_CATEGORIES.includes(category)||!isMinor(amountMinor)||amountMinor===0||!integer(incurredAt))return fail('invalid_cost');
  let expenseId=a.expenseId;if(expenseId&&!await owned(ctx,expenseId,tenant.accountId,'hasibExpenses'))return fail('expense_not_found');
  const id=await ctx.db.insert('constructionCosts',{accountId:tenant.accountId,requestId:a.requestId,projectId:project._id,category,amountMinor,incurredAt,rework,createdBy:actor.actorAccountId,...(expenseId?{expenseId}:{}),version:1,createdAt:now});
  await audit(ctx,tenant,actor,'construction_cost_recorded','construction_cost',id,now);return ok(publicRow(await ctx.db.get(id)));
}

async function variationSave(ctx,tenant,actor,a,now){
  const w=a.workflow||{};let row=a.variationId?await owned(ctx,a.variationId,tenant.accountId,'constructionVariations'):null;
  if(a.variationId){const err=versioned(row,a,'variation');if(err)return err;if(row.status!=='draft')return fail('variation_locked');}else{if(!requireRequest(a))return fail('invalid_request');const replay=await byRequest(ctx,'constructionVariations',tenant.accountId,a.requestId);if(replay)return ok(publicRow(replay));}
  const projectId=w.projectId??a.projectId??row?.projectId;if(!await projectFor(ctx,tenant.accountId,projectId))return fail('project_not_found');
  const data={projectId,reference:bounded(w.reference??row?.reference,40),title:bounded(w.title??row?.title,120),reason:bounded(w.reason??row?.reason,200),contractDeltaMinor:w.contractDeltaMinor??row?.contractDeltaMinor,budgetDeltaMinor:w.budgetDeltaMinor??row?.budgetDeltaMinor,scheduleDeltaDays:w.scheduleDeltaDays??row?.scheduleDeltaDays??0,status:row?.status||'draft',version:(row?.version||0)+1,updatedAt:now};
  if(!data.reference||!data.title||!data.reason||!isMinor(data.contractDeltaMinor,{allowNegative:true})||!isMinor(data.budgetDeltaMinor,{allowNegative:true})||!integer(data.scheduleDeltaDays,-3650,3650))return fail('invalid_variation');
  let id;if(row){await ctx.db.patch(row._id,data);id=row._id;}else id=await ctx.db.insert('constructionVariations',{...data,accountId:tenant.accountId,requestId:a.requestId,createdAt:now});
  await audit(ctx,tenant,actor,'construction_variation_saved','construction_variation',id,now);return ok(publicRow(await ctx.db.get(id)));
}

async function variationStatus(ctx,tenant,actor,a,now){
  const row=await owned(ctx,a.variationId,tenant.accountId,'constructionVariations'),err=versioned(row,a,'variation');if(err)return err;
  const to=a.status, allowed={draft:['submitted','withdrawn'],submitted:['approved','rejected','withdrawn']};if(!(allowed[row.status]||[]).includes(to))return fail('invalid_variation_transition');
  if(['approved','rejected'].includes(to)&&actor.role!=='manager')return fail('manager_required');
  await ctx.db.patch(row._id,{status:to,...(to==='submitted'?{submittedAt:now}:{}),...(['approved','rejected'].includes(to)?{decidedAt:now,approvedBy:actor.actorAccountId}:{}),version:row.version+1,updatedAt:now});
  await audit(ctx,tenant,actor,'construction_variation_status','construction_variation',row._id,now,`${row.status}:${to}`);return ok(publicRow(await ctx.db.get(row._id)));
}

async function commitmentSave(ctx,tenant,actor,a,now){
  const w=a.workflow||{};let row=a.commitmentId?await owned(ctx,a.commitmentId,tenant.accountId,'constructionCommitments'):null;
  if(a.commitmentId){const err=versioned(row,a,'commitment');if(err)return err;if(row.status!=='draft')return fail('commitment_locked');}else{if(!requireRequest(a))return fail('invalid_request');const replay=await byRequest(ctx,'constructionCommitments',tenant.accountId,a.requestId);if(replay)return ok(publicRow(replay));}
  const projectId=w.projectId??a.projectId??row?.projectId;if(!await projectFor(ctx,tenant.accountId,projectId))return fail('project_not_found');
  const data={projectId,kind:bounded(w.kind??row?.kind??'purchase_order',40),supplier:bounded(w.supplier??row?.supplier,120),package:bounded(w.package??row?.package,100),label:bounded(w.label??row?.label,120),amountMinor:w.amountMinor??row?.amountMinor,requiredAt:w.requiredAt??row?.requiredAt,status:row?.status||'draft',version:(row?.version||0)+1,updatedAt:now};
  if(!data.kind||!data.supplier||!data.package||!data.label||!isMinor(data.amountMinor)||!integer(data.requiredAt))return fail('invalid_commitment');
  let id;if(row){await ctx.db.patch(row._id,data);id=row._id;}else id=await ctx.db.insert('constructionCommitments',{...data,accountId:tenant.accountId,requestId:a.requestId,createdAt:now});
  await audit(ctx,tenant,actor,'construction_commitment_saved','construction_commitment',id,now);return ok(publicRow(await ctx.db.get(id)));
}

async function commitmentStatus(ctx,tenant,actor,a,now){
  const row=await owned(ctx,a.commitmentId,tenant.accountId,'constructionCommitments'),err=versioned(row,a,'commitment');if(err)return err;
  const to=a.status,allowed={draft:['approved','cancelled'],approved:['ordered','cancelled'],ordered:['delivered','cancelled'],delivered:['closed'],closed:[]};if(!(allowed[row.status]||[]).includes(to))return fail('invalid_commitment_transition');
  if((to==='approved'||(to==='cancelled'&&row.status!=='draft'))&&actor.role!=='manager')return fail('manager_required');
  await ctx.db.patch(row._id,{status:to,...(to==='approved'?{approvedBy:actor.actorAccountId}:{}),...(to==='delivered'?{deliveredAt:now}:{}),version:row.version+1,updatedAt:now});
  await audit(ctx,tenant,actor,'construction_commitment_status','construction_commitment',row._id,now,`${row.status}:${to}`);return ok(publicRow(await ctx.db.get(row._id)));
}

async function claimSave(ctx,tenant,actor,a,now){
  const w=a.workflow||{};let row=a.claimId?await owned(ctx,a.claimId,tenant.accountId,'constructionClaims'):null;
  if(a.claimId){const err=versioned(row,a,'claim');if(err)return err;if(row.status!=='draft')return fail('claim_locked');}else{if(!requireRequest(a))return fail('invalid_request');const replay=await byRequest(ctx,'constructionClaims',tenant.accountId,a.requestId);if(replay)return ok(publicRow(replay));}
  const projectId=w.projectId??a.projectId??row?.projectId;if(!await projectFor(ctx,tenant.accountId,projectId))return fail('project_not_found');
  const grossMinor=w.grossMinor??row?.grossMinor,retentionMinor=w.retentionMinor??row?.retentionMinor??0,advanceRecoveryMinor=w.advanceRecoveryMinor??row?.advanceRecoveryMinor??0,netMinor=grossMinor-retentionMinor-advanceRecoveryMinor;
  const data={projectId,reference:bounded(w.reference??row?.reference,40),grossMinor,retentionMinor,advanceRecoveryMinor,netMinor,dueAt:w.dueAt??row?.dueAt,retentionReleaseAt:w.retentionReleaseAt??row?.retentionReleaseAt,status:row?.status||'draft',version:(row?.version||0)+1,updatedAt:now};
  if(!data.reference||![grossMinor,retentionMinor,advanceRecoveryMinor,netMinor].every(isMinor)||netMinor<=0||!integer(data.dueAt)||!integer(data.retentionReleaseAt||data.dueAt))return fail('invalid_claim');
  let id;if(row){await ctx.db.patch(row._id,data);id=row._id;}else id=await ctx.db.insert('constructionClaims',{...data,accountId:tenant.accountId,requestId:a.requestId,createdAt:now});
  await audit(ctx,tenant,actor,'construction_claim_saved','construction_claim',id,now);return ok(publicRow(await ctx.db.get(id)));
}

async function claimStatus(ctx,tenant,actor,a,now){
  const row=await owned(ctx,a.claimId,tenant.accountId,'constructionClaims'),err=versioned(row,a,'claim');if(err)return err;const to=a.status;
  const allowed={draft:['submitted','cancelled'],submitted:['certified','rejected','cancelled'],certified:['part_paid','paid'],part_paid:['paid']};if(!(allowed[row.status]||[]).includes(to))return fail('invalid_claim_transition');
  if(['certified','rejected'].includes(to)&&actor.role!=='manager')return fail('manager_required');
  if(['part_paid','paid'].includes(to)){
    const order=row.orderId?await owned(ctx,row.orderId,tenant.accountId,'hasibOrders'):null;if(!order)return fail('claim_receivable_not_found');
    if(to==='part_paid'&&!(order.paidMinor>0&&order.paidMinor<order.totalMinor))return fail('claim_payment_mismatch');
    if(to==='paid'&&order.paidMinor<order.totalMinor)return fail('claim_payment_mismatch');
  }
  let orderId=row.orderId;if(to==='certified'){
    const project=await projectFor(ctx,tenant.accountId,row.projectId);
    const result=await createOrder(ctx,tenant,{requestId:`construction-claim-${row._id}`.padEnd(36,'0').slice(0,36),channel:'other',fulfilment:{type:'in_store',dueAt:row.dueAt},contactId:project.contactId,customerName:project.title,kind:'construction_claim',source:'construction',confirm:true,lines:[{name:`Certified claim ${row.reference}`,qty:1,unitPriceMinor:row.netMinor}],customFields:[]},now,{internal:true});
    if(!result.ok)return result;orderId=result.value.id;
  }
  await ctx.db.patch(row._id,{status:to,...(to==='submitted'?{submittedAt:now}:{}),...(to==='certified'?{certifiedAt:now,orderId}:{}),version:row.version+1,updatedAt:now});
  await audit(ctx,tenant,actor,'construction_claim_status','construction_claim',row._id,now,`${row.status}:${to}`);return ok(publicRow(await ctx.db.get(row._id)));
}

async function retentionRelease(ctx,tenant,actor,a,now){
  if(actor.role!=='manager')return fail('manager_required');const row=await owned(ctx,a.claimId,tenant.accountId,'constructionClaims'),err=versioned(row,a,'claim');if(err)return err;
  if(!['certified','part_paid','paid'].includes(row.status)||row.retentionMinor<=0||row.retentionOrderId||row.retentionReleaseAt>now)return fail('retention_not_releasable');
  const project=await projectFor(ctx,tenant.accountId,row.projectId), result=await createOrder(ctx,tenant,{requestId:`construction-ret-${row._id}`.padEnd(36,'0').slice(0,36),channel:'other',fulfilment:{type:'in_store',dueAt:now},contactId:project.contactId,customerName:project.title,kind:'construction_retention',source:'construction',confirm:true,lines:[{name:`Retention ${row.reference}`,qty:1,unitPriceMinor:row.retentionMinor}],customFields:[]},now,{internal:true});
  if(!result.ok)return result;await ctx.db.patch(row._id,{retentionOrderId:result.value.id,version:row.version+1,updatedAt:now});await audit(ctx,tenant,actor,'construction_retention_released','construction_claim',row._id,now);return ok(publicRow(await ctx.db.get(row._id)));
}

async function siteReportSave(ctx,tenant,actor,a,now){
  const w=a.workflow||{};if(!requireRequest(a))return fail('invalid_request');const replay=await byRequest(ctx,'constructionSiteReports',tenant.accountId,a.requestId);if(replay)return ok(publicRow(replay));
  const project=await projectFor(ctx,tenant.accountId,w.projectId??a.projectId);if(!project)return fail('project_not_found');
  const data={reportDate:w.reportDate??now,workerHours:w.workerHours??0,toolboxTalks:w.toolboxTalks??0,inspections:w.inspections??0,recordableIncidents:w.recordableIncidents??0,lostTimeIncidents:w.lostTimeIncidents??0,lostDays:w.lostDays??0};
  if(!integer(data.reportDate)||![data.workerHours,data.toolboxTalks,data.inspections,data.recordableIncidents,data.lostTimeIncidents,data.lostDays].every(x=>integer(x,0,1000000)))return fail('invalid_site_report');const id=await ctx.db.insert('constructionSiteReports',{...data,accountId:tenant.accountId,requestId:a.requestId,projectId:project._id,createdBy:actor.actorAccountId,createdAt:now});
  if(data.recordableIncidents||data.lostTimeIncidents)await task(ctx,tenant.accountId,'safety_review','site_report',id,'Review aggregated site safety event counts',now,now+DAY);
  await audit(ctx,tenant,actor,'construction_site_reported','construction_site_report',id,now);return ok(publicRow(await ctx.db.get(id)));
}

async function simpleSave(ctx,tenant,actor,a,now,type){
  const isQuality=type==='quality',table=isQuality?'constructionQuality':'constructionRisks',idKey=isQuality?'qualityId':'riskId',w=a.workflow||{};let row=a[idKey]?await owned(ctx,a[idKey],tenant.accountId,table):null;
  if(a[idKey]){const err=versioned(row,a,type);if(err)return err;}else{if(!requireRequest(a))return fail('invalid_request');const replay=await byRequest(ctx,table,tenant.accountId,a.requestId);if(replay)return ok(publicRow(replay));}
  const projectId=w.projectId??a.projectId??row?.projectId;if(!await projectFor(ctx,tenant.accountId,projectId))return fail('project_not_found');
  let data;if(isQuality)data={projectId,kind:bounded(w.kind??row?.kind??'ncr',30),severity:bounded(w.severity??row?.severity??'medium',20),title:bounded(w.title??row?.title,160),status:row?.status||'open',dueAt:w.dueAt??row?.dueAt};
  else data={projectId,category:bounded(w.category??row?.category??'delivery',40),title:bounded(w.title??row?.title,160),probability:w.probability??row?.probability,impact:w.impact??row?.impact,mitigation:bounded(w.mitigation??row?.mitigation,300)||undefined,assignedAccountId:w.assignedAccountId??row?.assignedAccountId,status:row?.status||'open',dueAt:w.dueAt??row?.dueAt};
  if(!data.title||!integer(data.dueAt)||(isQuality?!['low','medium','high','critical'].includes(data.severity):(!integer(data.probability,1,5)||!integer(data.impact,1,5)||!await ownsAssignee(ctx,actor,data.assignedAccountId))))return fail(`invalid_${type}`);
  const payload={...data,version:(row?.version||0)+1,updatedAt:now};let id;if(row){await ctx.db.patch(row._id,payload);id=row._id;}else id=await ctx.db.insert(table,{...payload,accountId:tenant.accountId,requestId:a.requestId,createdAt:now});
  await audit(ctx,tenant,actor,`construction_${type}_saved`,`construction_${type}`,id,now);return ok(publicRow(await ctx.db.get(id)));
}

async function simpleStatus(ctx,tenant,actor,a,now,type){
  const isQuality=type==='quality',table=isQuality?'constructionQuality':'constructionRisks',id=a[isQuality?'qualityId':'riskId'];const row=await owned(ctx,id,tenant.accountId,table),err=versioned(row,a,type);if(err)return err;
  const allowed={open:['mitigating','closed'],mitigating:['closed','open'],closed:[]};if(!(allowed[row.status]||[]).includes(a.status))return fail(`invalid_${type}_transition`);
  await ctx.db.patch(row._id,{status:a.status,...(a.status==='closed'&&isQuality?{closedAt:now}:{}),version:row.version+1,updatedAt:now});await audit(ctx,tenant,actor,`construction_${type}_status`,`construction_${type}`,row._id,now,a.status);return ok(publicRow(await ctx.db.get(row._id)));
}

async function experienceSave(ctx,tenant,actor,a,now){
  if(!requireRequest(a))return fail('invalid_request');const replay=await byRequest(ctx,'constructionExperience',tenant.accountId,a.requestId);if(replay)return ok(publicRow(replay));
  const project=await projectFor(ctx,tenant.accountId,a.projectId),rating=a.rating;if(!project||!integer(rating,1,5))return fail(project?'invalid_rating':'project_not_found');
  const existing=await ctx.db.query('constructionExperience').withIndex('by_project',q=>q.eq('projectId',project._id)).first();if(existing)return fail('rating_exists');
  const reason=['quality','communication','timeliness','value','other'].includes(a.experienceReason)?a.experienceReason:undefined;
  const id=await ctx.db.insert('constructionExperience',{accountId:tenant.accountId,requestId:a.requestId,projectId:project._id,rating,...(reason?{reason}:{}),submittedAt:now});await audit(ctx,tenant,actor,'construction_experience_recorded','construction_project',project._id,now);return ok(publicRow(await ctx.db.get(id)));
}

async function all(ctx,table,accountId,index='by_account_created',field='accountId',limit=3000){return ctx.db.query(table).withIndex(index,q=>q.eq(field,accountId)).take(limit);}
async function metrics(ctx,accountId,now){
  const settings=await settingsFor(ctx,accountId),incidentHoursDenominator=settings.constructionIncidentHoursDenominator??200000;
  const projects=await all(ctx,'constructionProjects',accountId), variations=await all(ctx,'constructionVariations',accountId,'by_account_status'), commitments=await all(ctx,'constructionCommitments',accountId,'by_account_status'), claims=await all(ctx,'constructionClaims',accountId,'by_account_status');
  const costs=await all(ctx,'constructionCosts',accountId,'by_account_date'),milestones=await all(ctx,'constructionMilestones',accountId,'by_account_finish'),reports=await all(ctx,'constructionSiteReports',accountId,'by_account_date'),quality=await all(ctx,'constructionQuality',accountId,'by_account_status'),ratings=await all(ctx,'constructionExperience',accountId,'by_account_submitted');
  const approved=variations.filter(x=>x.status==='approved'), revisedContract=projects.reduce((n,x)=>n+x.originalContractMinor,0)+approved.reduce((n,x)=>n+x.contractDeltaMinor,0), revisedBudget=projects.reduce((n,x)=>n+x.originalBudgetMinor,0)+approved.reduce((n,x)=>n+x.budgetDeltaMinor,0);
  const ac=costs.filter(x=>!x.voidedAt).reduce((n,x)=>n+x.amountMinor,0), etc=projects.reduce((n,x)=>n+x.estimateToCompleteMinor,0), finalForecast=ac+etc;
  const pv=milestones.reduce((n,m)=>n+(m.plannedFinishAt<=now?m.budgetMinor:0),0),ev=milestones.reduce((n,m)=>n+Math.round(m.budgetMinor*m.actualProgressBps/10000),0),hours=reports.reduce((n,x)=>n+x.workerHours,0);
  const submitted=variations.filter(x=>x.status==='submitted'),delivered=commitments.filter(x=>x.status==='delivered'||x.status==='closed'),ordered=commitments.filter(x=>['ordered','delivered','closed'].includes(x.status));
  const certified=claims.filter(x=>['certified','part_paid','paid'].includes(x.status)),orders=(await Promise.all(certified.map(x=>x.orderId?ctx.db.get(x.orderId):null))).filter(Boolean),openAr=orders.reduce((n,x)=>n+Math.max(0,x.totalMinor-x.paidMinor),0),billings=orders.reduce((n,x)=>n+x.totalMinor,0),cash=orders.reduce((n,x)=>n+x.paidMinor,0);
  return {projects,claims,variations,metrics:{revisedContractMinor:revisedContract,revisedBudgetMinor:revisedBudget,actualCostMinor:ac,forecastFinalCostMinor:finalForecast,forecastVarianceMinor:revisedBudget-finalForecast,forecastMargin:revisedContract?(revisedContract-finalForecast)/revisedContract:null,pvMinor:pv,evMinor:ev,cpi:ac?ev/ac:null,spi:pv?ev/pv:null,variationExposureMinor:submitted.reduce((n,x)=>n+x.contractDeltaMinor,0),procurementOnTimeRate:ordered.length?delivered.filter(x=>x.deliveredAt<=x.requiredAt).length/ordered.length:null,reworkRate:ac?costs.filter(x=>x.rework&&!x.voidedAt).reduce((n,x)=>n+x.amountMinor,0)/ac:null,ncrClosureRate:quality.length?quality.filter(x=>x.status==='closed').length/quality.length:null,incidentFrequency:hours?reports.reduce((n,x)=>n+x.recordableIncidents,0)*incidentHoursDenominator/hours:null,incidentHoursDenominator,earnedValuePerWorkerHour:hours?ev/hours:null,certifiedBillingsMinor:billings,cashCollectedMinor:cash,collectionRate:billings?cash/billings:null,openReceivablesMinor:openAr,retentionHeldMinor:certified.filter(x=>!x.retentionOrderId).reduce((n,x)=>n+x.retentionMinor,0),clientRating:ratings.length?ratings.reduce((n,x)=>n+x.rating,0)/ratings.length:null},coverage:{earnedValue:{numerator:milestones.filter(x=>x.actualProgressBps>=0).length,denominator:milestones.length},safety:{numerator:reports.length,denominator:projects.filter(x=>ACTIVE_STATES.has(x.status)).length},experience:{numerator:ratings.length,denominator:projects.filter(x=>x.status==='closed').length}}};
}

async function overview(ctx,tenant,now){
  const result=await metrics(ctx,tenant.accountId,now),tasks=await ctx.db.query('constructionTasks').withIndex('by_account_status',q=>q.eq('accountId',tenant.accountId).eq('status','open')).take(200);
  const risk=result.projects.filter(x=>ACTIVE_STATES.has(x.status)&&x.forecastFinishAt>x.contractFinishAt),submitted=result.variations.filter(x=>x.status==='submitted');let overdue=0;
  for(const claim of result.claims.filter(x=>['certified','part_paid'].includes(x.status)&&x.dueAt<now)){const order=claim.orderId?await ctx.db.get(claim.orderId):null;overdue+=order?Math.max(0,order.totalMinor-order.paidMinor):0;}
  return ok({metrics:[{key:'schedule_risk',value:risk.length},{key:'variation_exposure',value:submitted.reduce((n,x)=>n+x.contractDeltaMinor,0)},{key:'overdue_receivables',value:overdue}],projects:result.projects.slice(0,100).map(publicRow),tasks:tasks.map(publicRow)});
}

export async function executeConstruction(ctx,tenant,actor,a,now){
  if(tenant.pack.id!=='construction'||!a.operation.startsWith('construction_'))return null;const op=a.operation;
  if(op==='construction_overview')return overview(ctx,tenant,now);if(op==='construction_insights'){if(actor.role!=='manager')return fail('manager_required');return ok(await metrics(ctx,tenant.accountId,now));}
  const lists={construction_projects:['constructionProjects','by_account_created'],construction_milestones:['constructionMilestones','by_account_request'],construction_progress:['constructionProgress','by_account_request'],construction_costs:['constructionCosts','by_account_request'],construction_variations:['constructionVariations','by_account_status'],construction_commitments:['constructionCommitments','by_account_status'],construction_claims:['constructionClaims','by_account_status'],construction_site_reports:['constructionSiteReports','by_account_request'],construction_quality:['constructionQuality','by_account_status'],construction_risks:['constructionRisks','by_account_status'],construction_tasks:['constructionTasks','by_account_status']};
  if(lists[op])return list(ctx,lists[op][0],tenant.accountId,a,lists[op][1]);if(op==='construction_project'){const row=await projectFor(ctx,tenant.accountId,a.projectId);return row?ok(publicRow(row)):fail('project_not_found');}
  if(op==='construction_project_save')return projectSave(ctx,tenant,actor,a,now);if(op==='construction_project_status')return projectStatus(ctx,tenant,actor,a,now);if(op==='construction_baseline_approve')return baselineApprove(ctx,tenant,actor,a,now);if(op==='construction_milestone_save')return milestoneSave(ctx,tenant,actor,a,now);if(op==='construction_progress_save')return progressSave(ctx,tenant,actor,a,now);if(op==='construction_cost_save')return costSave(ctx,tenant,actor,a,now);if(op==='construction_variation_save')return variationSave(ctx,tenant,actor,a,now);if(op==='construction_variation_status')return variationStatus(ctx,tenant,actor,a,now);if(op==='construction_commitment_save')return commitmentSave(ctx,tenant,actor,a,now);if(op==='construction_commitment_status')return commitmentStatus(ctx,tenant,actor,a,now);if(op==='construction_claim_save')return claimSave(ctx,tenant,actor,a,now);if(op==='construction_claim_status')return claimStatus(ctx,tenant,actor,a,now);if(op==='construction_retention_release')return retentionRelease(ctx,tenant,actor,a,now);if(op==='construction_site_report_save')return siteReportSave(ctx,tenant,actor,a,now);if(op==='construction_quality_save')return simpleSave(ctx,tenant,actor,a,now,'quality');if(op==='construction_quality_status')return simpleStatus(ctx,tenant,actor,a,now,'quality');if(op==='construction_risk_save')return simpleSave(ctx,tenant,actor,a,now,'risk');if(op==='construction_risk_status')return simpleStatus(ctx,tenant,actor,a,now,'risk');if(op==='construction_experience_save')return experienceSave(ctx,tenant,actor,a,now);
  if(op==='construction_task_resolve'){const row=await owned(ctx,a.taskId,tenant.accountId,'constructionTasks');if(!row)return fail('task_not_found');await ctx.db.patch(row._id,{status:'resolved',updatedAt:now});await audit(ctx,tenant,actor,'construction_task_resolved','construction_task',row._id,now);return ok(publicRow(await ctx.db.get(row._id)));}
  return fail('invalid_action');
}
