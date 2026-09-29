// Medical-clinic operations only. This module stores operational scheduling,
// consent, communications and money references; it has no clinical free text.
import { owned } from '../blueTenant.js';
import { ok, fail, bounded, clampLimit } from './shared.js';
import { workflowBegin, workflowFinish, workflowPublic, workflowTime } from './followupsState.js';
import { audit, workspaceContainsAccount } from './workspaceState.js';
export { clinicSafetyMessage, containsClinicalContent } from '../../config/clinic-safety.js';

const REQUEST_STATES = new Set(['new','assigned','booked','declined','withdrawn']);
const SOURCES = new Set(['whatsapp','instagram','phone','walk_in','staff']);
const CHANNELS = new Set(['whatsapp','instagram','phone','none']);
const DECLINE_REASONS = new Set(['outside_scope','no_availability','duplicate','patient_withdrew','other_operational']);
const NOTIFICATION_KINDS = new Set(['confirmation','reschedule','cancellation','reminder_24h','reminder_2h','waitlist_offer','experience_survey']);
const EXPERIENCE_REASONS = new Set(['staff','waiting_time','booking_process','communication','facilities','other_structured']);
const GOVERNANCE_STATUSES = new Set(['draft','review_required','approved','suspended']);
const PERMIT_STATUSES = new Set(['unknown','required','approved','not_required_with_advice']);
const CROSS_BORDER = new Set(['unknown','not_used','approved','blocked']);
const NOTIFICATION_TRANSITIONS = { queued:['attempting','blocked'], attempting:['provider_submitted','failed','blocked'], provider_submitted:['delivered','failed'], delivered:[], failed:['queued'], blocked:['queued'] };
const median = values => values.length ? [...values].sort((a,b)=>a-b)[Math.floor((values.length-1)/2)] : null;
const percentile = (values, p) => values.length ? [...values].sort((a,b)=>a-b)[Math.ceil(p*values.length)-1] : null;
const ratio = (n,d) => d ? n/d : null;

async function page(ctx, table, accountId, a, index = 'by_account_created') {
  const result = await ctx.db.query(table).withIndex(index, q => q.eq('accountId', accountId)).order('desc').paginate({numItems:clampLimit(a.limit,200),cursor:a.cursor||null});
  return {items:result.page.map(workflowPublic),cursor:result.isDone?null:result.continueCursor};
}
async function assignable(ctx, actor, accountId) {
  return !accountId || await workspaceContainsAccount(ctx, actor.workspace, accountId);
}
async function openTask(ctx, accountId, kind, entityType, entityId, reason, now, assignedAccountId) {
  const existing = await ctx.db.query('clinicTasks').withIndex('by_entity',q=>q.eq('entityType',entityType).eq('entityId',String(entityId))).take(20);
  if (existing.some(row=>row.status==='open'&&row.kind===kind)) return;
  await ctx.db.insert('clinicTasks',{accountId,kind,entityType,entityId:String(entityId),status:'open',reason,...(assignedAccountId?{assignedAccountId}:{}),createdAt:now,updatedAt:now});
}
async function governance(ctx, accountId) {
  return ctx.db.query('clinicGovernance').withIndex('by_account',q=>q.eq('accountId',accountId)).unique();
}
const governancePublic = row => row ? workflowPublic(row) : {status:'draft',jurisdiction:'OM',permitStatus:'unknown',approved:false};

async function overview(ctx, tenant, actor, now) {
  const from = now - 86400000, to = now + 48*3600000;
  const bookings = await ctx.db.query('hasibBookings').withIndex('by_account_start',q=>q.eq('accountId',tenant.accountId).gte('startsAt',from).lt('startsAt',to)).take(3001);
  if (bookings.length>3000) return fail('clinic_window_full');
  const requests = await ctx.db.query('clinicAppointmentRequests').withIndex('by_account_status',q=>q.eq('accountId',tenant.accountId).eq('status','new')).take(501);
  const tasks = await ctx.db.query('clinicTasks').withIndex('by_account_status',q=>q.eq('accountId',tenant.accountId).eq('status','open')).take(501);
  const completed = bookings.filter(row=>row.status==='completed'&&row.orderId);
  let outstandingMinor=0;
  for (const row of completed) { const order=await owned(ctx,row.orderId,tenant.accountId,'hasibOrders'); if(order) outstandingMinor+=Math.max(0,order.totalMinor-order.paidMinor); }
  const unconfirmed=bookings.filter(row=>row.status==='scheduled'&&row.startsAt>=now&&row.startsAt<to).length;
  const missed=bookings.filter(row=>row.status==='missed'&&row.endsAt>=from&&row.endsAt<now&&row.confirmedAt!==undefined).length;
  const gov=await governance(ctx,tenant.accountId);
  return ok({governance:governancePublic(gov),activationReady:gov?.status==='approved'&&gov?.permitStatus==='approved',metrics:[
    {id:'unconfirmed_48h',value:unconfirmed},{id:'missed_today',value:missed},{id:'outstanding_minor',value:outstandingMinor}],
    requests:requests.slice(0,20).map(workflowPublic),bookings:bookings.sort((a,b)=>a.startsAt-b.startsAt).map(workflowPublic),tasks:tasks.slice(0,30).map(workflowPublic),workspaceRole:actor.role});
}

async function insights(ctx, accountId, a, now) {
  const to=a.toAt||now, from=a.fromAt||to-30*86400000;
  if(!workflowTime(from)||!workflowTime(to)||to<=from||to-from>366*86400000) return fail('invalid_period');
  const bookings=await ctx.db.query('hasibBookings').withIndex('by_account_start',q=>q.eq('accountId',accountId).gte('startsAt',from).lt('startsAt',to)).take(3001);
  const requests=await ctx.db.query('clinicAppointmentRequests').withIndex('by_account_created',q=>q.eq('accountId',accountId).gte('createdAt',from)).take(3001);
  const ratings=await ctx.db.query('clinicExperienceRatings').withIndex('by_account_submitted',q=>q.eq('accountId',accountId).gte('submittedAt',from)).take(3001);
  if([bookings,requests,ratings].some(rows=>rows.length>3000)) return fail('clinic_report_too_large');
  const eligible=bookings.filter(row=>row.confirmedAt!==undefined&&row.endsAt<to&&row.endsAt>=from&&!['scheduled','confirmed','cancelled'].includes(row.status));
  const missed=eligible.filter(row=>row.status==='missed').length;
  const cancellations=bookings.filter(row=>row.status==='cancelled');
  const waits=bookings.filter(row=>row.arrivedAt&&row.serviceStartedAt).map(row=>row.serviceStartedAt-row.arrivedAt);
  const responses=requests.filter(row=>row.firstResponseSubmittedAt).map(row=>row.firstResponseSubmittedAt-row.firstInboundAt);
  const confirmed7=requests.filter(row=>row.bookingId&&row.updatedAt-row.createdAt<=7*86400000).length;
  const completed=bookings.filter(row=>row.status==='completed');
  const withOutcome=bookings.filter(row=>['missed','arrived','in_service','completed'].includes(row.status)).length;
  const byPatient=new Map(); for(const row of completed){const list=byPatient.get(row.contactId)||[];list.push(row);byPatient.set(row.contactId,list);}
  const returning=[...byPatient.values()].filter(rows=>rows.length>1);
  const continuity=returning.filter(rows=>new Set(rows.flatMap(row=>row.resourceIds.filter(Boolean))).size===1).length;
  const orders=[]; for(const row of completed){if(row.orderId){const order=await owned(ctx,row.orderId,accountId,'hasibOrders');if(order)orders.push(order);}}
  const revenue=orders.reduce((n,o)=>n+o.totalMinor,0), collected=orders.reduce((n,o)=>n+o.paidMinor,0);
  const resolvedWaitlist=await ctx.db.query('hasibWaitlist').withIndex('by_account_created',q=>q.eq('accountId',accountId).gte('createdAt',from)).take(3001);
  const resolved=resolvedWaitlist.filter(row=>['booked','expired','cancelled'].includes(row.status));
  return ok({from,to,coverage:{bookings:bookings.length,requests:requests.length,arrivalToStart:{numerator:waits.length,denominator:completed.length}},metrics:{
    thirdNextAvailableDays:null,responseMedianMinutes:responses.length?median(responses)/60000:null,responseP90Minutes:responses.length?percentile(responses,.9)/60000:null,
    requestConversion7d:ratio(confirmed7,requests.length),noShowRate:ratio(missed,eligible.length),cancellationRate:ratio(cancellations.length,bookings.length),
    cancellationLeadMedianHours:cancellations.length?median(cancellations.map(row=>Math.max(0,row.startsAt-(row.cancelledAt||row.updatedAt))))/3600000:null,
    waitlistRecoveryRate:ratio(resolved.filter(row=>row.status==='booked').length,resolved.length),arrivalWaitMedianMinutes:waits.length?median(waits)/60000:null,arrivalWaitP90Minutes:waits.length?percentile(waits,.9)/60000:null,
    completionRate:ratio(completed.length,withOutcome),sameProviderContinuity:ratio(continuity,returning.length),experienceResponseRate:ratio(ratings.length,completed.length),averageRating:ratings.length?ratings.reduce((n,r)=>n+r.rating,0)/ratings.length:null,
    recordedRevenueMinor:revenue,cashCollectedMinor:collected,collectionRate:ratio(collected,revenue),openReceivablesMinor:Math.max(0,revenue-collected)}});
}

export async function executeClinic(ctx, tenant, actor, a, now) {
  if(tenant.pack?.id!=='clinic'||!a.operation.startsWith('clinic_')) return null;
  const accountId=tenant.accountId;
  if(a.operation==='clinic_overview') return overview(ctx,tenant,actor,now);
  if(a.operation==='clinic_insights') return actor.role==='manager'?insights(ctx,accountId,a,now):fail('manager_required');
  if(a.operation==='clinic_governance') return actor.role==='manager'?ok(governancePublic(await governance(ctx,accountId))):fail('manager_required');
  if(a.operation==='clinic_requests') return ok(await page(ctx,'clinicAppointmentRequests',accountId,a));
  if(a.operation==='clinic_notifications') return ok(await page(ctx,'clinicNotifications',accountId,a));
  if(a.operation==='clinic_tasks') { const data=await page(ctx,'clinicTasks',accountId,a,'by_account_status'); return ok(data); }
  if(a.operation==='clinic_preferences') return ok(await page(ctx,'clinicCommunicationPreferences',accountId,a,'by_account'));
  if(a.operation==='clinic_patient_summary') {
    const contact=await owned(ctx,a.contactId,accountId,'blueContacts'); if(!contact||contact.state==='deleted')return fail('contact_not_found');
    const [bookings,requests]=await Promise.all([ctx.db.query('hasibBookings').withIndex('by_account_start',q=>q.eq('accountId',accountId)).take(3000),ctx.db.query('clinicAppointmentRequests').withIndex('by_contact_created',q=>q.eq('contactId',contact._id)).take(200)]);
    const ownBookings=bookings.filter(row=>row.contactId===contact._id); return ok({contactId:contact._id,bookings:ownBookings.map(workflowPublic),requests:requests.filter(row=>row.accountId===accountId).map(workflowPublic)});
  }
  const begun=await workflowBegin(ctx,accountId,a); if(begun.error)return fail(begun.error); if(begun.replay)return ok(workflowPublic(begun.replay));
  const finish=async(table,id,action)=>{await audit(ctx,tenant,actor,action,table,id,now);return workflowFinish(ctx,accountId,a,begun.fingerprint,table,id,now);};
  if(a.operation==='clinic_governance_update'){
    if(actor.role!=='manager')return fail('manager_required'); const previous=await governance(ctx,accountId); if(previous&&a.version!==previous.version)return fail('governance_conflict');
    const g=a.governance||{}; if(!GOVERNANCE_STATUSES.has(g.status)||!PERMIT_STATUSES.has(g.permitStatus)||!CROSS_BORDER.has(g.crossBorderStatus)||g.jurisdiction!=='OM'||!Number.isSafeInteger(g.retentionDays)||g.retentionDays<1||g.retentionDays>3650||!Number.isSafeInteger(g.backupRetentionDays)||g.backupRetentionDays<1||g.backupRetentionDays>3650)return fail('invalid_governance');
    for(const key of ['controller','processor','supportAccess','incidentOwner','rightsOwner'])if(!bounded(g[key],120))return fail('invalid_governance');
    if(!Array.isArray(g.approvedRegions)||!Array.isArray(g.subprocessors)||g.approvedRegions.length>20||g.subprocessors.length>40)return fail('invalid_governance');
    if(g.status==='approved'&&(g.permitStatus!=='approved'||g.crossBorderStatus==='unknown'))return fail('governance_incomplete');
    const value={accountId,status:g.status,jurisdiction:'OM',permitStatus:g.permitStatus,controller:g.controller,processor:g.processor,approvedRegions:g.approvedRegions.map(x=>bounded(x,80)).filter(Boolean),subprocessors:g.subprocessors.map(x=>bounded(x,120)).filter(Boolean),retentionDays:g.retentionDays,backupRetentionDays:g.backupRetentionDays,supportAccess:g.supportAccess,incidentOwner:g.incidentOwner,rightsOwner:g.rightsOwner,crossBorderStatus:g.crossBorderStatus,...(g.status==='approved'?{approvedBy:actor.actorAccountId,approvedAt:now}:{}),version:(previous?.version||0)+1,updatedAt:now};
    const id=previous?._id||await ctx.db.insert('clinicGovernance',value); if(previous)await ctx.db.replace(id,value); return finish('clinicGovernance',id,'clinic_governance_updated');
  }
  if(a.operation==='clinic_request_save'){
    const contact=await owned(ctx,a.contactId,accountId,'blueContacts'),service=await owned(ctx,a.serviceId,accountId,'hasibServices'); if(!contact||contact.state==='deleted')return fail('contact_not_found');if(!service)return fail('service_not_found');
    if(!SOURCES.has(a.source)||!CHANNELS.has(a.channel)||!workflowTime(a.preferredFrom)||!workflowTime(a.preferredTo)||a.preferredTo<=a.preferredFrom||a.preferredTo-a.preferredFrom>31*86400000)return fail('invalid_appointment_request');
    if(a.assignedAccountId&&!await assignable(ctx,actor,a.assignedAccountId))return fail('assignee_not_found');
    if(a.conversationId){const c=await owned(ctx,a.conversationId,accountId,'blueConversations');if(!c||c.contactId!==contact._id)return fail('conversation_not_found');}
    const id=await ctx.db.insert('clinicAppointmentRequests',{accountId,requestId:a.requestId,contactId:contact._id,...(a.conversationId?{conversationId:a.conversationId}:{}),source:a.source,channel:a.channel,serviceId:service._id,preferredFrom:a.preferredFrom,preferredTo:a.preferredTo,...(a.assignedAccountId?{assignedAccountId:a.assignedAccountId,status:'assigned'}:{status:'new'}),firstInboundAt:a.firstInboundAt||now,version:1,createdAt:now,updatedAt:now});
    await openTask(ctx,accountId,'request_response','appointment_request',id,'awaiting_staff_response',now,a.assignedAccountId); return finish('clinicAppointmentRequests',id,'clinic_request_created');
  }
  if(['clinic_request_assign','clinic_request_decline','clinic_request_withdraw','clinic_request_book'].includes(a.operation)){
    const row=await owned(ctx,a.appointmentRequestId,accountId,'clinicAppointmentRequests');if(!row)return fail('appointment_request_not_found');if(a.version!==row.version)return fail('appointment_request_conflict');if(!REQUEST_STATES.has(row.status)||['declined','withdrawn','booked'].includes(row.status))return fail('invalid_transition');
    let patch={version:row.version+1,updatedAt:now};
    if(a.operation==='clinic_request_assign'){if(!a.assignedAccountId||!await assignable(ctx,actor,a.assignedAccountId))return fail('assignee_not_found');patch={...patch,status:'assigned',assignedAccountId:a.assignedAccountId};}
    if(a.operation==='clinic_request_decline'){if(!DECLINE_REASONS.has(a.reason))return fail('invalid_decline_reason');patch={...patch,status:'declined',declineReason:a.reason};}
    if(a.operation==='clinic_request_withdraw')patch={...patch,status:'withdrawn'};
    if(a.operation==='clinic_request_book'){const booking=await owned(ctx,a.bookingId,accountId,'hasibBookings');if(!booking||booking.contactId!==row.contactId||booking.serviceId!==row.serviceId)return fail('booking_not_found');patch={...patch,status:'booked',bookingId:booking._id};}
    await ctx.db.patch(row._id,patch);return finish('clinicAppointmentRequests',row._id,a.operation);
  }
  if(a.operation==='clinic_preference_update'){
    const contact=await owned(ctx,a.contactId,accountId,'blueContacts');if(!contact||contact.state==='deleted'||!CHANNELS.has(a.channel)||!['granted','revoked'].includes(a.preferenceStatus)||!['patient_message','staff_recorded','import_attestation'].includes(a.evidenceSource))return fail('invalid_preference');
    const previous=await ctx.db.query('clinicCommunicationPreferences').withIndex('by_contact',q=>q.eq('contactId',contact._id)).unique();if(previous&&previous.accountId!==accountId)return fail('contact_not_found');if(previous&&a.version!==previous.version)return fail('preference_conflict');
    const value={accountId,contactId:contact._id,operationalReminders:a.preferenceStatus==='granted',channel:a.channel,status:a.preferenceStatus,evidenceSource:a.evidenceSource,evidenceAt:a.evidenceAt||now,version:(previous?.version||0)+1,updatedAt:now};const id=previous?._id||await ctx.db.insert('clinicCommunicationPreferences',value);if(previous)await ctx.db.replace(id,value);return finish('clinicCommunicationPreferences',id,'clinic_preference_updated');
  }
  if(a.operation==='clinic_experience_save'){
    const booking=await owned(ctx,a.bookingId,accountId,'hasibBookings');if(!booking||booking.status!=='completed'||!Number.isInteger(a.rating)||a.rating<1||a.rating>5||(a.experienceReason&&!EXPERIENCE_REASONS.has(a.experienceReason)))return fail('invalid_experience');
    const prior=await ctx.db.query('clinicExperienceRatings').withIndex('by_booking',q=>q.eq('bookingId',booking._id)).unique();if(prior)return fail('experience_exists');const id=await ctx.db.insert('clinicExperienceRatings',{accountId,requestId:a.requestId,bookingId:booking._id,contactId:booking.contactId,rating:a.rating,...(a.experienceReason?{reason:a.experienceReason}:{}),submittedAt:now});return finish('clinicExperienceRatings',id,'clinic_experience_recorded');
  }
  if(a.operation==='clinic_notification_queue'){
    const contact=await owned(ctx,a.contactId,accountId,'blueContacts');if(!contact||contact.state==='deleted'||!NOTIFICATION_KINDS.has(a.notificationKind)||!['whatsapp','instagram'].includes(a.channel))return fail('invalid_notification');
    const preference=await ctx.db.query('clinicCommunicationPreferences').withIndex('by_contact',q=>q.eq('contactId',contact._id)).unique();
    const booking=a.bookingId?await owned(ctx,a.bookingId,accountId,'hasibBookings'):null;if(a.bookingId&&(!booking||booking.contactId!==contact._id))return fail('booking_not_found');
    const appointmentRequest=a.appointmentRequestId?await owned(ctx,a.appointmentRequestId,accountId,'clinicAppointmentRequests'):null;if(a.appointmentRequestId&&(!appointmentRequest||appointmentRequest.contactId!==contact._id))return fail('appointment_request_not_found');
    const key=bounded(a.idempotencyKey,160);if(!key)return fail('invalid_notification');const prior=await ctx.db.query('clinicNotifications').withIndex('by_idempotency',q=>q.eq('accountId',accountId).eq('idempotencyKey',key)).unique();if(prior)return ok(workflowPublic(prior));
    const blocked=!preference?.operationalReminders||contact.optout||a.channel==='instagram'&&a.outsideServiceWindow===true||a.channel==='whatsapp'&&a.outsideServiceWindow===true&&!a.templateId;
    const reason=!preference?.operationalReminders?'preference_missing':contact.optout?'contact_opted_out':a.channel==='instagram'?'window_closed':'template_required';
    const id=await ctx.db.insert('clinicNotifications',{accountId,requestId:a.requestId,contactId:contact._id,...(booking?{bookingId:booking._id}:{}),...(appointmentRequest?{appointmentRequestId:appointmentRequest._id}:{}),kind:a.notificationKind,channel:a.channel,...(a.templateId?{templateId:a.templateId}:{}),idempotencyKey:key,status:blocked?'blocked':'queued',...(blocked?{blockedAt:now,reason}:{queuedAt:now}),version:1,createdAt:now,updatedAt:now});
    if(blocked)await openTask(ctx,accountId,'notification_blocked','notification',id,reason,now);return finish('clinicNotifications',id,'clinic_notification_queued');
  }
  if(a.operation==='clinic_notification_retry'||a.operation==='clinic_notification_resolve'){
    const row=await owned(ctx,a.notificationId,accountId,'clinicNotifications');if(!row)return fail('notification_not_found');if(a.version!==row.version)return fail('notification_conflict');if(!NOTIFICATION_TRANSITIONS[row.status]?.includes('queued'))return fail('invalid_transition');await ctx.db.patch(row._id,{status:'queued',queuedAt:now,reason:undefined,version:row.version+1,updatedAt:now});return finish('clinicNotifications',row._id,a.operation);
  }
  if(a.operation==='clinic_waitlist_offer'){
    const wait=await owned(ctx,a.waitlistId,accountId,'hasibWaitlist');if(!wait||wait.status!=='waiting'||!workflowTime(a.startsAt)||a.startsAt<wait.earliestAt||a.startsAt>=wait.latestAt||!workflowTime(a.expiresAt)||a.expiresAt<=now||a.expiresAt>a.startsAt)return fail('invalid_waitlist_offer');
    const id=await ctx.db.insert('clinicWaitlistOffers',{accountId,requestId:a.requestId,waitlistId:wait._id,startsAt:a.startsAt,expiresAt:a.expiresAt,status:'offered',version:1,createdAt:now,updatedAt:now});await ctx.db.patch(wait._id,{status:'offered',version:wait.version+1,updatedAt:now});return finish('clinicWaitlistOffers',id,'clinic_waitlist_offered');
  }
  if(['clinic_waitlist_expire','clinic_waitlist_cancel'].includes(a.operation)){
    const offer=await owned(ctx,a.waitlistOfferId,accountId,'clinicWaitlistOffers');if(!offer||offer.status!=='offered'||a.version!==offer.version)return fail('waitlist_offer_conflict');const status=a.operation.endsWith('expire')?'expired':'cancelled';await ctx.db.patch(offer._id,{status,version:offer.version+1,updatedAt:now});const wait=await owned(ctx,offer.waitlistId,accountId,'hasibWaitlist');if(wait)await ctx.db.patch(wait._id,{status,version:wait.version+1,updatedAt:now});return finish('clinicWaitlistOffers',offer._id,a.operation);
  }
  if(a.operation==='clinic_task_resolve'){
    const task=await owned(ctx,a.taskId,accountId,'clinicTasks');if(!task||task.status!=='open')return fail('task_not_found');await ctx.db.patch(task._id,{status:'resolved',updatedAt:now});return finish('clinicTasks',task._id,'clinic_task_resolved');
  }
  if(a.operation==='clinic_metric_snapshot'){
    if(actor.role!=='manager')return fail('manager_required');if(!/^\d{4}-\d{2}-\d{2}$/.test(a.weekStart||''))return fail('invalid_week');const existing=await ctx.db.query('clinicMetricSnapshots').withIndex('by_account_week',q=>q.eq('accountId',accountId).eq('weekStart',a.weekStart)).unique();if(existing)return ok(workflowPublic(existing));const report=await insights(ctx,accountId,{fromAt:a.fromAt,toAt:a.toAt},now);if(!report.ok)return report;const metrics=Object.entries(report.value.metrics).map(([key,value])=>({key,...(value===null?{}:{value})}));const id=await ctx.db.insert('clinicMetricSnapshots',{accountId,weekStart:a.weekStart,metrics,createdAt:now});return finish('clinicMetricSnapshots',id,'clinic_metric_snapshotted');
  }
  return null;
}
