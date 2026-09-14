# Layla Meta owner pilot — engineering pack

Current update (2026-09-11): the locked Omani pilot is deployed; the prior handoff records migration 006 as owner-applied. The additive registration and supervised simulation implementation is described in [owner activation](layla-activation.md). Current verification and rollout evidence is recorded separately in Desktop/Layla-Meta-Handoff/ACTIVATION-REPORT.md. See [Meta App Review readiness](meta-app-review-readiness.md). Historical pre-deployment evidence below describes the initial implementation phase.

2026-09-10. Accountable owner and release authority: Ahmed. Scope: the explicit Terminal Codex handoff, copied in Desktop/Layla-Meta-Handoff. G1 implementation; G2 release blocked pending external setup and authorization. Business application profile; one BznsFlow owner, no customer onboarding, CRM/campaign sharing, booking, scheduling, marketing or follow-up.

## Outcome and interfaces
Existing React/Vite SSG + Vercel Node APIs + Supabase PostgREST remain. Existing auth_session resolves the session; a separate server-only owner account UUID grants pilot access. Profile fields are explicitly reviewed, unknown by default. No model, training or answer cache. Deterministic Arabic/English FAQ classification returns approved exact facts or clarification.

Path: Meta raw bytes → signature/account/phone validation → durable revision-CAS state → inbox → atomic guarded outbound intent → Cloud API adapter → matching authentic status → one-time trial activation. Browser → existing session and CSRF → owner API → same durable authority. Mock/live state keys are separate; sender binding cannot change silently. A single JSON state row is adequate for a capped owner pilot, not a general multi-tenant queue. Revision CAS serializes concurrent transitions; no network call inside the database transaction. PostgREST has no application connection pool.

## Acceptance and failure path
Mock webhook/transport plus local PostgreSQL-compatible tests must cover permissions, persistence failure, concurrency, duplicates, sender mismatch, opt-out, takeover, expiry, window, kill switch, rate, ambiguous sends and out-of-order delivery. Existing auth suite and mocked browser registration smoke must still pass. API errors expose safe codes only. Failed durable acceptance returns 503; CAS retries are bounded. Uncertain sends require reconciliation and are never automatically resent. Worker invokes one effect per tick. An external scheduler is a release dependency, not installed by this task.

## Budgets and boundaries
Provisional development limits: 64 KiB webhook, 100 events/envelope, 1,000-character input, 700-character output, 500 queued jobs, 5,000 retained messages, 1,000 contacts. 24-hour useful message age; 30-day dedupe retention. 10 sends/minute and 100/day; one in-flight effect per pilot; 10-second provider timeout; 4 CAS attempts; no automatic provider retries. Mock-only spend is zero provider/model cost. Production spend cap, region/retention acceptance, load target, backup RPO/RTO, operational responder/alert route and scheduler cadence remain Ahmed-owned release prerequisites. No production SLA or capacity claim.

## Control register
APP-01/02, DATA-01/02, NET-03, ASYNC-01/02/03, SEC-01/02/03: implementation and targeted tests below; only local verified evidence may be claimed.
DATA-03: existing PostgREST, no new pool. DATA-04: additive isolated migration, no auth schema edits; local migration/role verification required. NET-01/02: existing Vercel ingress; actual edge/body parsing and rollout behavior pending authorized environment validation. CACHE-01: none justified; CACHE-02: private no-store; CACHE-03 and AI-01/02 model controls not applicable (no model/retrieval/cache). SEC-04/05, REL-01/03 and OPS-01/02/03: release operational evidence remains pending. No ASVS certification/alignment claim; selected access/session/CSRF/webhook boundaries tested, formal requirement mapping pending release review.

## Rollback and operations
Stop with persisted paused=true first; environment kill switch is an additional brake and requires Vercel environment rollout. Code-level live release lock stays off in this artifact. Remove only additive pilot routes/modules to roll back; leave pilot state and receipt reconciliation available while effects are unresolved. Never revert auth files or drop pilot state to reconnect/reset a trial. Preserve dedupe, opt-out and activation evidence through restore; test restore before production. Owner status exposes queue age, failed/ambiguous outcomes and counts without conversations or credentials. Support and real alerts are not yet installed.

## Evidence
See Desktop/Layla-Meta-Handoff for baseline hashes, reports and setup/runbook. Synthetic evaluation is not real-world accuracy. No live successful reply, migration or deployment is claimed.

## 2026-09-10 final local evidence

Customer Coexistence remains the future onboarding decision; see [future onboarding design](layla-embedded-signup-design.md). The owner pilot now targets a dedicated Cloud API number that has no WhatsApp Business app. Source-level live lock remains false. Owner and worker duration budgets are 60 seconds; webhook 30 seconds. Store RPC timeout is 2 seconds, four CAS conflicts maximum; no provider retry. Three known provider failures/hour trip persisted pause; ambiguous outcome blocks all further pilot sends. Human requests receive one truthful contact acknowledgement then pause.

54 pilot tests (50 domain/handler/transport-contract plus four local PGlite database tests) pass. Existing suite and build pass. Existing auth browser: 34 assertions; pilot browser: 20 assertions including serious/critical accessibility scan at 390/1280 pixels. All messaging synthetic. Local migration applies existing 003/004 auth schemas and verifies OTP, registration and sessions with 005 present. No production schema was read or changed. Baseline SHA-256 confirms existing login/account work preserved.

Self-review covered access, CSRF, secrets, raw signatures, durability, concurrency, sender isolation, receipts, trial state, human takeover, UI and rollback. Fixes included CSRF header alignment, readable contrast, deduplicated echoes, one-time human contact acknowledgement and bounded reconciliation indexing. Independent production review, actual Meta event contract, Vercel raw-body behavior, distributed load, operational alert delivery, production backup restore and account-specific Coexistence eligibility remain unverified release gates.
