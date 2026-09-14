# Retired owner-only Meta Embedded Signup

This flow was retired on 2026-09-10 when the owner selected a dedicated Omani
Cloud API number (`96871134025`) instead of the Egyptian WhatsApp Business App
Coexistence asset. The endpoint, browser launcher and tests were removed so the
website cannot accidentally reopen or authorize the retired WABA.

The current owner asset preparation and App Review gates are recorded in
[meta-app-review-readiness.md](meta-app-review-readiness.md). The historical
description below is retained only as implementation evidence and is not a
current runbook.

Authorized 2026-09-10. Adds one owner-only connection step to the deployed locked
pilot, not general customer onboarding. Existing authentication and registration
are unchanged. No new schema or credential table is needed.

## Boundary and acceptance

Owner page → existing session/CSRF → `/api/layla-meta-connect` → signed ten-minute
ticket bound to that session → official Facebook SDK code callback plus the
Coexistence completion event → atomic replay claim → server-to-server token
exchange and Graph verification → non-secret verified metadata. The SDK is loaded
only after the existing owner API authorizes the page. The code remains in memory
only until POST; no SDK payload or code is logged or written to browser storage.

The server pins app 1388038082832745, configuration 2144711899802123, existing
Bznsflow portfolio 4360221360973294, approved Business-app WABA asset
1712714900182074, and sender 201036755930. The Cloud API phone ID is discovered
from that WABA and the exact number, then checked again directly. A different
WABA—even if the browser says success—requires explicit review, not silent
substitution. Optional browser phone/business IDs are untrusted hints.

Verification checks token validity, app ID, expiration, WhatsApp scopes and WABA
grant, WABA owning business, phone membership/number, `is_on_biz_app=true` and
`platform_type=CLOUD_API`. Missing evidence fails closed. There is no normal
registration, subscription, disconnect, history-sync or messaging operation in
this step. Actual Meta asset eligibility/consent can only be checked after the
owner chooses to complete Meta's flow; mock tests do not prove that eligibility.

## Credentials and limits

Uses the App Secret already stored server-side in Vercel. The exchanged business
token exists only in server memory during verification and is discarded. Only
explicit verified asset fields are persisted; no exchanged token is stored in
the pilot JSON row. Existing runtime token and WABA/phone environment settings
are not overwritten. This step alone does not make webhook routing or sending
ready. A later authorized phase must configure those bindings/credentials and
complete webhook/sync prerequisites before connecting production traffic.

No application log contains provider responses, request bodies, Graph URLs,
authorization codes or tokens. The documented OAuth/debug GET calls carry
credentials in their server-only query strings: do not enable outbound HTTP URL
tracing or request-body logging on this endpoint. Each Graph request has a
six-second timeout and no redirect/retry. Five Graph reads/exchange calls maximum;
phone pagination beyond the first 100 fails for review. Five consumed attempts
per hour, at most 100 claim hashes retained for 24 hours. A claim is durably
consumed before exchange; ambiguous failures require a fresh Meta flow, not an
automatic replay. Concurrent completions serialize through the existing CAS.

Every connection completion/failure keeps `paused=true`; trial activation,
receipts and messaging binding remain unchanged. All four release locks remain:
mock mode, kill switch true, persisted pause, source live release false.

## Verification and rollback

`npm test`, `npm run build`, and `tests/layla-signup.test.mjs` cover access control,
CSRF/origin, session-bound tickets, expiration, replay/concurrency, storage and
provider failure, code/event order, cancellation, field mismatches and secret
exclusion. `tests/layla-signup-ui-server.mjs` is a localhost-only synthetic UI
harness with external browser requests blocked by test CSP; it does not enter a
real Meta flow. The final real-browser check stops before QR/connection-code
entry or real-number approval. Results live in Desktop/Layla-Meta-Handoff/owner-signup.

Rollback by promoting the prior locked deployment, retaining the additive state
and claim hashes. Reverting this UI cannot undo a user-approved Meta connection;
never automatically deregister a number to compensate. No independent security
audit or completed real-number onboarding is claimed.

## Official references checked in signed-in Meta documentation

- [SDK, session events and response callback](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation)
- [Coexistence: special finish event, skip registration, verify phone flags](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users)
- [Server-to-server code exchange](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-customers-as-a-tech-provider)

Launch uses Embedded Signup v4, session info 3, feature type
`whatsapp_business_app_onboarding`, response type `code`, and
`override_default_response_type=true`. Graph v25.0 is retained from the approved
pilot configuration; current examples may show newer versions. Meta's dashboard
JS SDK allowlist is restricted to the canonical HTTPS website; existing web OAuth
settings are preserved.
