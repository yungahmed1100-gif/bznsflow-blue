# Layla testing and App Review implementation

2026-09-11. Owner-authorized implementation follows the existing pilot. Preserve login, registration, customer data and unrelated working-tree edits.

## Outcome and interfaces

First recover the dedicated Omani number through read-only identity checks and subscription-only reconciliation. Never retry its uncertain registration. Keep the original activation outcome as evidence. All mutations use owner authentication, same-origin HTTPS and CSRF protection.

Build a separate owner-started inbound test: 24 hours, 100 attempted replies including failures, 10 attempts/minute, durable claims, no unsolicited messages. Normal Layla processing remains paused and source-locked. Store normalized test conversations for 30 days, disclose retention, mask recipients in the owner view, and support stop, opt-out, takeover and explicit feedback. Unknown provider outcomes must never cause a resend.

Customer onboarding uses existing account identity with isolated credentials and sender ownership, official Meta Embedded Signup, explicit facts review and readiness before enablement. Coexistence must never use ordinary phone registration. Restricted reviewer demonstration precedes App Review; public access depends on approval. A two-business beta is a target, not a completed release.

## Acceptance and failure path

Verify subscription identity gates, concurrency, crash recovery and redaction before deployment. Verify test expiry, budget, deduplication, STOP priority, durable acceptance, receipts and retention. Customer release additionally requires cross-tenant tests, revocation, verified assets and real authorized onboarding evidence. Provider approval and availability of test assets remain external dependencies.

Persist before acknowledging webhooks. Recover pending work through an authenticated minute scheduler. Do not retry an uncertain send. Production metadata checks expose names/status only; credentials never enter reports.

## Rollback

Current baseline: `dpl_HQYtCWR6XxHJSzq2iGhaNiKPSikz`. Stop any open test before rollback; preserve durable state, deduplication and original activation evidence. Retain general mock mode, kill switch, persisted pause and `LIVE_RELEASE_ENABLED=false`. Deploy a verified candidate to the explicitly linked project before promoting domains. Record actual evidence separately from planned gates in Desktop/Layla-Meta-Handoff.
