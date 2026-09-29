# Automotive operating dashboard

Automotive is an additive, live Ascend/Apex operating domain for Oman independent multi-brand workshops. It was released on 2026-09-29 without creating production customer data.

## Durable controls

- Tenant-scoped vehicles, bays, services, appointment requests, appointments, work orders, inspections, immutable estimate versions, approval evidence, labor entries, part allocations, quality checks, experience and operational tasks.
- Atomic bay/technician overlap checks and optimistic versions on material edits.
- Every estimate revision supersedes earlier active estimates and invalidates prior approval. Work cannot become ready until labor is stopped, requested/reserved parts are resolved, approval exists and the final checklist passes.
- Issuing and returning a part writes the shared stock ledger once. Marking approved work ready creates one linked financial charge; payment remains in the existing order ledger.
- Inspection photos must be registered, MIME/size checked and owned by the same tenant before attachment. Attachment rows protect saved files from orphan cleanup.
- Mutations use request IDs, tenant-owned links, server-resolved actors and actor-attributed activity records. Original creation request IDs are never overwritten by later lifecycle mutations.

## Roles and privacy

The manager may invite up to five verified-email service advisors or technicians. Revocation deletes active employee sessions. Technicians receive only assigned work and assigned vehicle identity; contact directories, unrelated jobs, estimates, aggregate Money, team and settings are blocked at the backend, not only hidden in the UI.

## Dashboard and measures

Dedicated bilingual/RTL views are Today, Workshop, Parts & supplies, manager-only Money & Insights, manager-only Team, and Settings. The legacy `/layla/dashboard?tab=stock&view=products` URL opens Parts & supplies for contractors and workshop owners without exposing generic industry tabs.

Today contains exactly three measures: approval queue, past-promised vehicles and ready-for-collection vehicles. Insights keep missing denominators null and expose coverage. Technician productivity/proficiency remain unset until an explicit available-hours schedule exists; the system does not invent a denominator.

## Verification and release gate

- Full `npm run verify` passes, including Hasib 243/243, application and Convex typechecks, production build and lint with zero errors (12 pre-existing hook warnings).
- Domain tests cover overlap, immutable estimates, stale approval, stock issue/return replay, technician authorization, completion gates, one linked charge and the exact Today measures.
- Synthetic owner journeys pass the public HTTP shaping, exported Convex validator, state executor and persisted-schema contract for all 15 packs.
- The dedicated English/Arabic desktop/mobile browser suite passes 4/4 with RTL, no overflow, serious/critical Axe checks, persisted vehicle creation, Parts at the legacy URL, Money and Settings.
- The automotive load profile covers 10,000 customers, 15,000 vehicles, 50,000 work orders, 100,000 labor rows, 500 tasks and 50 constrained-slot attempts. The bounded overview remains under the local two-second SLO and only one slot is accepted in Convex commit order.

Release evidence: `automotive` is in `HASIB_LIVE_PACKS`; additive schema/functions are deployed to production `valuable-mandrill-296` and Blue runtime `quaint-nightingale-675` with no deleted indexes. Vercel deployment `dpl_FsR7czuKkGvFrHorivQVLc46QCKq` is READY and aliased to `https://bznsflow-blue.vercel.app`. The dashboard URL returned 200, the unauthenticated Hasib boundary returned 401, and the latest 100 production Convex log events contained no failures. No real customer record, invitation or message was created.

Immediate UI rollback is `dpl_4v9qbw53sn8gTfSdSj4aMigYEt9H`. Pack rollback removes `automotive` from `HASIB_LIVE_PACKS` and redeploys; additive records are retained and Convex is corrected forward.

Notion synchronization is pending because no Notion connector was available in this implementation session.
