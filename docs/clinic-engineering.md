# Medical Clinic Operating System — engineering and release pack

Status: **review mode; implemented locally; not release-ready; not deployed; live registry closed**. Updated 2026-09-29. Repository `/Users/ramsis21/Desktop/bznsflow-blue`, branch `feat/instagram-channel`, on top of the preserved staged industry/real-estate work. Owner: Ahmed. This pack is the project authority for clinic implementation evidence; `docs/antigravity/industry-optimization-handoff.md` remains authority for the earlier multi-industry release.

## Outcome, scope and exclusions

One Oman private outpatient clinic in `Asia/Muscat` gets a bilingual operational dashboard for appointment requests, resource-safe visits, reception handoff, operational reminders/preferences, waitlist recovery, structured experience ratings, visit charges/payments, supplies, tasks and explicit-denominator trends. It is an operations system, not an EHR.

Never store symptoms, diagnoses, prescriptions, medication lists, treatment requests/records, clinical notes, laboratory results, images, referrals, insurance claims or clinical consent. Providers and rooms are schedule resources, not authenticated users. No EHR/PMS/calendar integration, payment processing, medical inventory, branches, payroll or autonomous clinical/slot decision is included.

## Data and request path

```text
signed Meta webhook → deterministic clinic safety filter
  ├─ possible clinical content → no raw text persistence → medical_content_withheld
  │  → deterministic AR/EN handoff + Oman 9999 → reception task → takeover
  └─ operational-only content → bounded operational fields

verified browser session → exact Blue origin + CSRF → Hasib HTTP allow-list
  → server-resolved tenant/plan/workspace actor → clinicState/booking rules
  → additive Convex records + immutable ascendActivity
```

The safety filter lives in `config/clinic-safety.js` and runs before `liveAnswer`; `convex/blueMessagingState.js` omits restricted message text and creates an operational handoff task. No model is needed for the deterministic safety decision or reply. The existing message parser necessarily receives the provider payload in process memory; restricted text is not written by the application. Provider-side webhook transport/log retention and existing infrastructure logging still require SEC-04 verification before real data.

## Implemented interfaces and invariants

- Additive tables: governance, appointment requests, communication preferences, notifications, waitlist offers, experience ratings, operational tasks and weekly metric snapshots. Existing booking records now optionally snapshot resources and lifecycle timestamps.
- Booking lifecycle for `clinic`: `scheduled → confirmed → arrived → in_service → completed`, plus bounded missed/cancelled paths. Clinic cancellation requires a reason code. Existing non-clinic lifecycle behavior remains compatible.
- Existing Convex transaction/OCC reads enforce resource availability, capacity and conflicting-slot exclusion. Every clinic mutation requires a UUID request ID; mutable records use expected versions; linked IDs are tenant checked.
- Appointment requests accept only source/channel, contact, allow-listed service, preferred window, assignee and structured disposition. No free-text payload is accepted.
- Notifications have stable tenant-scoped idempotency keys and distinct `queued`, `attempting`, `provider_submitted`, `delivered`, `failed`, and `blocked` states. The current release slice persists and exposes queue/block/retry state; it does **not** install a new provider dispatcher or claim submitted/delivered outcomes.
- Outside the service window, Instagram is blocked; WhatsApp requires a template ID. Missing preference, opt-out and missing templates block and create a staff task.
- Experience accepts rating 1–5 and fixed reasons only. KPI reporting exposes denominators/coverage and `null`/“Not enough records” where evidence is absent. Third-next-available is deliberately `null` until the production availability calendar calculation is completed and verified.
- Manager/employee roles reuse the Ascend workspace. Employees cannot access clinic insights, governance, metric snapshots, aggregate Money, expenses, exports, imports, team or settings. Revocation uses the existing session deletion path.
- `ClinicDashboard` owns Today, Visits, Money/Insights and Team presentation; Patients, Services/Supplies and channel/business settings reuse the existing tenant-scoped views. RTL and mobile styles are additive.

## SEC-04 activation gate

`clinicGovernance.status=approved` is rejected unless the Oman permit is `approved` and cross-border disposition is resolved. The record captures jurisdiction, controller/processor, approved regions, subprocessors, active/backup retention, support access, incident owner and rights owner. This code gate is not legal clearance.

Before any real clinic data, the signed disposition must cover data categories/purposes, controller/processor contract, Ministry permit, approved regions and subprocessors, access roles, active/log/analytics/cache/backup retention, deletion and post-restore deletion, incident handling, cross-border transfer, support access and patient access/correction/deletion procedures. Qualified Oman legal/privacy review owns that determination.

## Reliability objectives

Internal targets, not an SLA: 99.9% eligible webhook acceptance and valid booking mutations monthly; p95 app reads/mutations under 2 seconds excluding provider delivery; 99% of due reminders submitted in five minutes while the provider is healthy; zero accepted over-capacity bookings, duplicate appointment effects or duplicate charges. Initial RPO 15 minutes and RTO four hours remain **unverified targets**.

Redacted telemetry still required before release: request ID, pseudonymous tenant, stage, latency, queue age, provider result, template block, conflict and ambiguous outcome. Never log message text, contact details, clinical terms, credentials or templates containing patient data.

## Evidence and remaining gates

Local evidence on 2026-09-29:

- `tests/hasib-clinic.test.mjs`: safety withholding/no-persistence, bilingual 9999 handoff, governance gate, request linkage/versioning/audit, lifecycle, cancellation reason, notification idempotency/status truth and KPI coverage.
- Targeted clinic/15-industry journey suite passed; messaging and Instagram regressions passed.
- Application and Convex typechecks passed; lint had zero errors and the existing 12 hook warnings.
- Full `npm run verify` passed, including the production build and all 223 Hasib tests. The clinic suite now executes every one of the 24 allow-listed clinic operations directly (10/10 clinic tests).

Not yet complete and therefore release-blocking:

- signed SEC-04/Oman permit and contract disposition;
- production-grade third-next-available and scheduled-capacity calculations;
- provider dispatcher/reconciliation for clinic notifications and scheduler/reminder execution;
- complete clinic browser/a11y AR/EN/RTL matrix at 320/768/1440 and buyer journeys;
- isolated profile with 6 staff, 10,000 patients, 50,000 appointments, 100,000 messages, 50 events/s, 50 constrained-slot competitors and 500 reminder jobs;
- worker-death, rate-limit/outage, out-of-order receipt, revocation-during-session and bounded-backlog recovery tests;
- isolated backup restore/reconciliation/deletion exercise proving RPO/RTO;
- approved WhatsApp utility templates, alert owner/delivery route and actual alert test;
- clinic acceptance in Arabic and English, explicit production deployment authorization, additive schema-first deployment, authorized empty-workspace smoke test.

Ahmed explicitly authorized a production release on 2026-09-29 after function-health testing. That satisfies the authorization gate only; the unresolved SEC-04/Oman permit, recovery, load, provider/scheduler, browser/accessibility and acceptance gates above still prohibit enabling `clinic` for real data.

## Release and rollback

Do not add `clinic` to `HASIB_LIVE_PACKS` until every gate above has evidence and Ahmed explicitly authorizes deployment. Then deploy additive Convex schema/indexes first, functions second, UI third, scheduler last; verify an empty authorized tenant without sending a real patient message.

Rollback removes `clinic` from `HASIB_LIVE_PACKS` and restores the previously recorded READY Blue Vercel deployment. Keep all clinic records, idempotency history, notification reconciliation and activity events. Never drop clinic tables or reset this dirty worktree as rollback.

Notion synchronization is pending; no Notion connector was available in this implementation session.

## Later setup checklist — plain-language owner guide

Keep Medical Clinics in read-only synthetic preview until this checklist is complete. Work through it in order. For each item, record `done`, the date, the evidence link/file and the responsible person. If Ahmed says `skip`, use the safe substitute below; never silently weaken the release standard.

### 1. Oman privacy and health-data approval

- Identify the first clinic: registered name, commercial registration, MOH licence, responsible manager and privacy contact. Never put patient records in this checklist.
- Confirm in writing that the clinic is the data controller and BznsFlow is the processor, or record the legally approved alternative.
- List the allowed operational data: identity/contact, appointment service and time, resources, attendance timestamps, reminder preference/consent evidence, structured experience rating, and visit charge/payment status.
- Explicitly exclude symptoms, diagnoses, prescriptions, treatment records, clinical notes, laboratory information, images and medical documents.
- Obtain the Ministry health-data permit disposition and record approved processing regions, subprocessors, cross-border decision, retention/deletion, backup retention, support access, incident owner and patient-rights owner.
- Evidence required: dated approval signed by the clinic's authorized representative and, where required, the permit/adviser disposition. Redacted identifiers are acceptable in the engineering record.
- Safe `skip`: remain synthetic-only and read-only. There is no safe route to real patient data without this disposition.

### 2. Finish the clinic calculations

- Implement and verify third-next-available per active provider.
- Implement scheduled-capacity utilization from configured provider availability.
- Show explicit denominators and missing-data coverage.
- Safe `skip`: hide these two measures and do not claim access/capacity reporting. All other displayed metrics must remain accurate.

### 3. Decide how reminders work

- Production option: finish the notification dispatcher, reconciliation worker, reminder scheduler, retry rules and approved WhatsApp utility-template synchronization.
- Reduced-scope option: disable all automatic clinic sends and create manager-visible staff tasks for manual follow-up.
- Safe `skip`: use the reduced-scope option. Never display `sent` or `delivered` without provider evidence.

### 4. Test the screens

- Test Arabic and English, RTL, keyboard navigation and serious/critical accessibility findings.
- Test widths 320, 768 and 1440 pixels.
- Run both journeys: request → confirmation → arrival → service start → completion → charge/payment → rating; and cancellation → waitlist refill.
- Safe `skip`: keep the pack in review mode. Automated unit tests cannot replace the browser and acceptance journey.

### 5. Run isolated stress and failure tests

- Use synthetic data only: 6 concurrent staff, 10,000 patients, 50,000 appointments, 100,000 messages, 50 webhook events/second, 50 competing slot requests and 500 due reminders.
- Verify no overbooking, duplicate appointments/charges/sends, unbounded query or lost backlog.
- Exercise out-of-order receipts, provider outage/rate limiting, worker death after submission and employee revocation during an active session.
- Safe `skip`: reduce the promised launch capacity to the largest profile actually tested and keep automatic messaging off. Double-booking and idempotency races may not be skipped.

### 6. Test backup restoration

- Create a consistent Blue Convex backup/export, including file storage where applicable.
- Restore into an isolated non-production deployment, never over production for the exercise.
- Restore code and environment configuration separately because Convex data backups do not include them or pending scheduled functions.
- Validate row counts, tenant isolation, booking/payment invariants, notification reconciliation and deletion/revocation reapplication.
- Record achieved RPO and RTO against the initial 15-minute/four-hour targets.
- Safe `skip`: no live clinic data. A backup icon or untested export is not recovery evidence.

### 7. Clinic-owner acceptance

- The authorized clinic manager completes the English and Arabic journeys with synthetic patients.
- Confirm employee permissions, deletion/privacy controls, operational wording, service names, hours, resources, templates and alert ownership.
- Record signed acceptance and remaining limitations.
- Safe `skip`: invite-only synthetic pilot; no real patient use.

### 8. Production release

- Record final deployment authorization after steps 1–7.
- Deploy additive Convex schema/indexes first, functions second, UI third and scheduler last.
- Add `clinic` to `HASIB_LIVE_PACKS` only after the previous evidence is attached.
- Smoke-test an authorized empty clinic workspace without sending a real patient message.
- Confirm Today has exactly three measures and that manager/employee permissions behave correctly.
- Safe `skip`: keep the current review-mode registry unchanged.

### 9. Rollback readiness

- Record the current READY Vercel deployment and the corrective Convex path before release.
- Rollback removes `clinic` from the live registry and restores the previous compatible UI while preserving all clinic records and reconciliation history.
- Never delete clinic tables or reset the shared dirty worktree as rollback.
