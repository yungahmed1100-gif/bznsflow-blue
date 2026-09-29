import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { convexMemory } from './helpers/convex-memory.mjs';
import { executeClinic, containsClinicalContent, clinicSafetyMessage } from '../convex/hasib/clinicState.js';
import { executeBookings } from '../convex/hasib/bookingsState.js';
import { clinicIngressDecision } from '../config/clinic-safety.js';
import { liveAnswer } from '../api/_lib/layla/blue-messaging.js';
import { blueHarness, seedTenant } from './helpers/blue-tenant.mjs';

async function setup() {
  const m=convexMemory(),accountId='a',manager='manager';
  const workspaceId=await m.db.insert('ascendWorkspaces',{managerAccountId:manager,employeeLimit:5,createdAt:m.now(),updatedAt:m.now()});
  const actor={workspace:{_id:workspaceId,managerAccountId:manager,employeeLimit:5},role:'manager',actorAccountId:manager};
  const tenant={accountId,pack:{id:'clinic'},actor};
  const contactId=await m.db.insert('blueContacts',{accountId,state:'active',optout:false});
  const resource=(await executeBookings(m.ctx,tenant,{operation:'resource_save',requestId:randomUUID(),name:'Dr A',kind:'provider',capacity:1,availability:[]},m.now())).value;
  const service=(await executeBookings(m.ctx,tenant,{operation:'service_save',requestId:randomUUID(),name:'Routine visit',durationMinutes:30,resourceIds:[resource.id]},m.now())).value;
  const clinic=(operation,args={})=>executeClinic(m.ctx,tenant,actor,{operation,...args},m.now());
  const booking=(operation,args={})=>executeBookings(m.ctx,tenant,{operation,...args},m.now());
  return {m,tenant,actor,contactId,resource,service,clinic,booking};
}

test('clinic ingress withholds medical text and uses deterministic bilingual emergency handoff',()=>{
  assert.equal(containsClinicalContent('I have severe pain and swelling'),true);
  assert.equal(clinicIngressDecision('أشعر بألم ونزيف',{sector:'Medical clinics'}).withheld,true);
  assert.equal(clinicIngressDecision('I prefer Tuesday at 10',{sector:'Medical clinics'}).withheld,false);
  assert.match(clinicSafetyMessage('en'),/9999/);
  assert.match(clinicSafetyMessage('ar'),/9999/);
});

test('medical content never persists and creates one reception handoff task and safety reply',async()=>{
  const h=blueHarness();await h.enable();const tenant=await seedTenant(h.m,{name:'clinic',sector:'Medical clinics'});await h.messaging('activate',{sessionHash:tenant.sessionHash});
  const text='I have severe pain and swelling. What treatment should I take?';
  const safety=liveAnswer(text,{sector:'Medical clinics',humanContact:'reception@example.com',reviewed:true},[]);
  await h.messaging('ingest',{integrationId:tenant.integration.id,events:[{kind:'message',id:'medical-1',from:'96891111111',at:h.m.now(),text,...safety}]});
  const incoming=h.m.table('blueMessages').find(row=>row.key.endsWith('medical-1')&&row.direction==='in');
  assert.equal(incoming.text,undefined);assert.equal(incoming.reason,'medical_content_withheld');
  assert.equal(h.m.table('clinicTasks').filter(row=>row.kind==='medical_handoff').length,1);
  const reply=h.m.table('blueMessages').find(row=>row.direction==='out');assert.match(reply.text,/9999/);assert.equal(reply.handoff,true);
  assert.ok(!JSON.stringify([...h.m.rows.values()]).includes('severe pain'));
});

test('governance cannot approve clinic activation without permit and cross-border disposition',async()=>{
  const {clinic}=await setup();
  const base={requestId:randomUUID(),version:0,governance:{status:'approved',jurisdiction:'OM',permitStatus:'required',controller:'Clinic',processor:'BznsFlow',approvedRegions:['OM'],subprocessors:[],retentionDays:365,backupRetentionDays:30,supportAccess:'Named support only',incidentOwner:'Manager',rightsOwner:'Manager',crossBorderStatus:'unknown'}};
  assert.equal((await clinic('clinic_governance_update',base)).reason,'governance_incomplete');
  base.requestId=randomUUID();base.governance.permitStatus='approved';base.governance.crossBorderStatus='not_used';
  const approved=await clinic('clinic_governance_update',base);assert.equal(approved.ok,true,approved.reason);
  const overview=await clinic('clinic_overview');assert.equal(overview.value.activationReady,true);
});

test('appointment requests are allow-listed, versioned, assigned and linked only to matching bookings',async()=>{
  const {m,clinic,booking,contactId,service}=await setup();
  const created=await clinic('clinic_request_save',{requestId:randomUUID(),contactId,serviceId:service.id,source:'whatsapp',channel:'whatsapp',preferredFrom:m.now(),preferredTo:m.now()+86400000});
  assert.equal(created.ok,true,created.reason);assert.equal(created.value.status,'new');
  const visit=await booking('booking_create',{requestId:randomUUID(),contactId,serviceId:service.id,startsAt:m.now()});
  const linked=await clinic('clinic_request_book',{requestId:randomUUID(),appointmentRequestId:created.value.id,bookingId:visit.value.id,version:created.value.version});
  assert.equal(linked.value.status,'booked');
  assert.equal((await clinic('clinic_request_decline',{requestId:randomUUID(),appointmentRequestId:created.value.id,version:1,reason:'symptoms'})).reason,'appointment_request_conflict');
  assert.ok(m.table('ascendActivity').some(row=>row.action==='clinic_request_book'));
});

test('clinic lifecycle requires service start and structured cancellation reasons',async()=>{
  const {m,tenant,booking,contactId,service}=await setup();
  let row=(await booking('booking_create',{requestId:randomUUID(),contactId,serviceId:service.id,startsAt:m.now()})).value;
  for(const to of ['confirmed','arrived'])row=(await booking('booking_status',{requestId:randomUUID(),bookingId:row.id,version:row.version,to})).value;
  assert.equal((await booking('booking_status',{requestId:randomUUID(),bookingId:row.id,version:row.version,to:'completed'})).reason,'invalid_transition');
  row=(await booking('booking_status',{requestId:randomUUID(),bookingId:row.id,version:row.version,to:'in_service'})).value;
  row=(await booking('booking_status',{requestId:randomUUID(),bookingId:row.id,version:row.version,to:'completed'})).value;
  assert.ok(row.arrivedAt&&row.serviceStartedAt&&row.completedAt);
  const next=(await executeBookings(m.ctx,tenant,{operation:'booking_create',requestId:randomUUID(),contactId,serviceId:service.id,startsAt:m.now()+3600000},m.now())).value;
  assert.equal((await booking('booking_status',{requestId:randomUUID(),bookingId:next.id,version:next.version,to:'cancelled'})).reason,'cancellation_reason_required');
});

test('notifications distinguish queued, blocked, provider-submitted and delivery semantics',async()=>{
  const {clinic,contactId}=await setup();
  const blocked=await clinic('clinic_notification_queue',{requestId:randomUUID(),contactId,notificationKind:'reminder_24h',channel:'whatsapp',idempotencyKey:'reminder/one',outsideServiceWindow:true});
  assert.deepEqual([blocked.value.status,blocked.value.reason],['blocked','preference_missing']);
  const preference=await clinic('clinic_preference_update',{requestId:randomUUID(),contactId,channel:'whatsapp',preferenceStatus:'granted',evidenceSource:'patient_message'});
  assert.equal(preference.ok,true);
  const queued=await clinic('clinic_notification_queue',{requestId:randomUUID(),contactId,notificationKind:'reminder_24h',channel:'whatsapp',idempotencyKey:'reminder/two',outsideServiceWindow:true,templateId:'approved_utility'});
  assert.equal(queued.value.status,'queued');assert.equal(queued.value.providerSubmittedAt,undefined);assert.equal(queued.value.deliveredAt,undefined);
  const replay=await clinic('clinic_notification_queue',{requestId:randomUUID(),contactId,notificationKind:'reminder_24h',channel:'whatsapp',idempotencyKey:'reminder/two',outsideServiceWindow:true,templateId:'approved_utility'});
  assert.equal(replay.value.id,queued.value.id);
});

test('clinic insight denominators exclude cancellations and expose timestamp coverage',async()=>{
  const {m,clinic,booking,contactId,service}=await setup();
  let complete=(await booking('booking_create',{requestId:randomUUID(),contactId,serviceId:service.id,startsAt:m.now()})).value;
  for(const to of ['confirmed','arrived','in_service','completed'])complete=(await booking('booking_status',{requestId:randomUUID(),bookingId:complete.id,version:complete.version,to})).value;
  const report=await clinic('clinic_insights',{fromAt:m.now()-1000,toAt:m.now()+3600000});
  assert.equal(report.value.metrics.noShowRate,0);
  assert.deepEqual(report.value.coverage.arrivalToStart,{numerator:1,denominator:1});
  assert.equal(report.value.metrics.completionRate,1);
});

test('clinic request, preference, governance and patient read paths stay tenant scoped',async()=>{
  const {m,clinic,contactId,service}=await setup();
  const first=await clinic('clinic_request_save',{requestId:randomUUID(),contactId,serviceId:service.id,source:'phone',channel:'phone',preferredFrom:m.now(),preferredTo:m.now()+3600000});
  const assigned=await clinic('clinic_request_assign',{requestId:randomUUID(),appointmentRequestId:first.value.id,version:first.value.version,assignedAccountId:'manager'});
  assert.deepEqual([assigned.value.status,assigned.value.assignedAccountId],['assigned','manager']);
  const second=await clinic('clinic_request_save',{requestId:randomUUID(),contactId,serviceId:service.id,source:'walk_in',channel:'none',preferredFrom:m.now(),preferredTo:m.now()+3600000});
  const withdrawn=await clinic('clinic_request_withdraw',{requestId:randomUUID(),appointmentRequestId:second.value.id,version:second.value.version});
  assert.equal(withdrawn.value.status,'withdrawn');
  const requests=await clinic('clinic_requests');
  assert.equal(requests.value.items.length,2);
  await clinic('clinic_preference_update',{requestId:randomUUID(),contactId,channel:'whatsapp',preferenceStatus:'granted',evidenceSource:'staff_recorded'});
  const preferences=await clinic('clinic_preferences');
  assert.equal(preferences.value.items[0].contactId,contactId);
  const governance=await clinic('clinic_governance');
  assert.deepEqual([governance.value.status,governance.value.approved],['draft',false]);
  const patient=await clinic('clinic_patient_summary',{contactId});
  assert.equal(patient.value.requests.length,2);
  assert.equal(patient.value.bookings.length,0);
});

test('clinic notification recovery and operational tasks remain explicit',async()=>{
  const {clinic,contactId}=await setup();
  const blocked=await clinic('clinic_notification_queue',{requestId:randomUUID(),contactId,notificationKind:'confirmation',channel:'instagram',idempotencyKey:'confirmation/retry',outsideServiceWindow:true});
  assert.equal(blocked.value.status,'blocked');
  await clinic('clinic_preference_update',{requestId:randomUUID(),contactId,channel:'instagram',preferenceStatus:'granted',evidenceSource:'patient_message'});
  const retried=await clinic('clinic_notification_retry',{requestId:randomUUID(),notificationId:blocked.value.id,version:blocked.value.version});
  assert.equal(retried.value.status,'queued');
  const second=await clinic('clinic_notification_queue',{requestId:randomUUID(),contactId,notificationKind:'experience_survey',channel:'instagram',idempotencyKey:'survey/resolve',outsideServiceWindow:true});
  assert.equal(second.value.status,'blocked');
  const resolved=await clinic('clinic_notification_resolve',{requestId:randomUUID(),notificationId:second.value.id,version:second.value.version});
  assert.equal(resolved.value.status,'queued');
  const notifications=await clinic('clinic_notifications');
  assert.equal(notifications.value.items.length,2);
  const tasks=await clinic('clinic_tasks');
  assert.equal(tasks.value.items.length,2);
  const task=await clinic('clinic_task_resolve',{requestId:randomUUID(),taskId:tasks.value.items[0].id});
  assert.equal(task.value.status,'resolved');
});

test('clinic waitlist, experience and weekly snapshot operations execute end to end',async()=>{
  const {m,clinic,booking,contactId,service}=await setup();
  const waitOne=(await booking('waitlist_add',{requestId:randomUUID(),serviceId:service.id,contactId,earliestAt:m.now(),latestAt:m.now()+7200000})).value;
  const offerOne=await clinic('clinic_waitlist_offer',{requestId:randomUUID(),waitlistId:waitOne.id,startsAt:m.now()+3600000,expiresAt:m.now()+1800000});
  const expired=await clinic('clinic_waitlist_expire',{requestId:randomUUID(),waitlistOfferId:offerOne.value.id,version:offerOne.value.version});
  assert.equal(expired.value.status,'expired');
  const waitTwo=(await booking('waitlist_add',{requestId:randomUUID(),serviceId:service.id,contactId,earliestAt:m.now(),latestAt:m.now()+10800000})).value;
  const offerTwo=await clinic('clinic_waitlist_offer',{requestId:randomUUID(),waitlistId:waitTwo.id,startsAt:m.now()+7200000,expiresAt:m.now()+1800000});
  const cancelled=await clinic('clinic_waitlist_cancel',{requestId:randomUUID(),waitlistOfferId:offerTwo.value.id,version:offerTwo.value.version});
  assert.equal(cancelled.value.status,'cancelled');
  let visit=(await booking('booking_create',{requestId:randomUUID(),contactId,serviceId:service.id,startsAt:m.now()})).value;
  for(const to of ['confirmed','arrived','in_service','completed'])visit=(await booking('booking_status',{requestId:randomUUID(),bookingId:visit.id,version:visit.version,to})).value;
  const experience=await clinic('clinic_experience_save',{requestId:randomUUID(),bookingId:visit.id,rating:5,experienceReason:'staff'});
  assert.equal(experience.value.rating,5);
  const snapshot=await clinic('clinic_metric_snapshot',{requestId:randomUUID(),weekStart:'2026-09-28',fromAt:m.now()-1000,toAt:m.now()+3600000});
  assert.equal(snapshot.value.weekStart,'2026-09-28');
});
