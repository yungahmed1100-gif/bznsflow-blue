# Meta App Review readiness

## Current decision and implementation — 2026-09-23

WhatsApp messaging and management **Advanced Access approved**, verified with
Meta's connected tool today. `business_management` was rejected; Ahmed chose to
defer it and remove the optional portfolio lookup/display. The reviewer requested
an ads account flow that does not match that optional feature. This supersedes
only the older instruction to keep requesting `business_management`.

Instagram DM-only client onboarding is implemented **locally, not deployed**,
using Instagram Login and `instagram_business_basic` plus
`instagram_business_manage_messages`. Each business can connect Instagram,
WhatsApp, or both, with shared approved facts/inbox and separate reply controls.
Test account: `@bznsflow`. Instagram settings, real consent/message evidence,
recordings, review submission and Advanced Access remain pending.

Use [Instagram setup and review guide](instagram-app-review-setup.md) for the
current steps and [engineering notes](blue-instagram-engineering.md) for release
order and rollback. Tests: `npm run verify` passes (137 Layla and 177 Blue tests,
plus the legacy suites); Convex TypeScript passes; 32 Instagram and 80 dashboard
synthetic browser assertions pass in English/Arabic. Lint has 12 existing hook
warnings, zero errors. These are not live provider evidence.

Meta's read-only settings check still showed the Green privacy URL, placeholder
terms/deletion URLs and unverified contact email. No Meta settings, deployment,
webhook binding, live message or submission was changed during implementation.
Green stays frozen. The material below records earlier dates and may describe
superseded permission/release state.


## Live implementation update — 2026-09-13

See [Blue live messaging](blue-live-messaging.md). Live tenant message processing,
activation, conversation controls and reviewer access are deployed. The remaining
messaging-review blocker is real end-to-end delivery evidence, not the earlier
discard-only webhook. Meta status is still UNSUBMITTED and required permissions
are not live. Do not submit recordings of mocks or claim public approval.

## Current Blue MVP status — 2026-09-12

The owner-pilot instructions below are historical and are not current Blue
release instructions. Do not apply their production migration or change Green.
Use [Blue onboarding execution](blue-onboarding-execution.md) for current scope,
verified evidence and remaining submission blockers.

Blue now has open Resend email registration, persisted website previews and an
anonymous reviewer route at `/en/layla/review`. Latest browser reconciliation
passed connection checks for the newly selected `+15554886936`. Actual mailbox
verification and live inbound/reply demonstration remain unverified. Blue's
webhook currently discards notifications, so the messaging review MVP is not
yet submission-ready. No App Review submission has been made.

The historical permission list below must be rechecked against actual customer
signup functionality and the current dashboard before submission.

## Historical owner-pilot checklist

Prepared asset binding, 2026-09-10:

- Meta app: `1388038082832745`
- Business portfolio: `4360221360973294`
- Owner WABA: `2213485365896306`
- Owner phone number ID: `1250149564857596`
- Owner sender: `96871134025`
- Customer onboarding configuration: `2144711899802123`

The owner number is a dedicated Cloud API number added directly in Meta. It does
not use QR or WhatsApp Business App Coexistence. The old owner-only Coexistence
endpoint was retired because it pinned the Egyptian WABA and required
`is_on_biz_app=true`, which is false for the new direct Cloud API number.

Production sending remains blocked by all four controls: mock mode, environment
kill switch, persisted pause, and `LIVE_RELEASE_ENABLED=false` in source.

Before App Review:

1. Apply migration `006-layla-meta-binding-keys.sql`. It preserves the old mock
   row and creates a clean state row for the reviewed Omani asset binding.
2. Deploy the owner-only `/api/layla-meta-readiness` check, then use its button to
   verify that the system-user token can read the new WABA and phone without
   printing the token or provider response.
3. The same read-only check verifies app `1388038082832745` is subscribed to WABA
   `2213485365896306`. Then verify a signed `messages` webhook reaches the existing
   callback.
4. Build a separate, allowlisted review environment that can perform one real
   inbound and outbound test without changing the production release locks.
5. Provide a dedicated reviewer account that does not depend on an owner sharing
   an email OTP during review.
6. Record separate, continuous videos for `whatsapp_business_management` and
   `whatsapp_business_messaging`. Never show secrets, terminal output or mocks.
7. Request only `whatsapp_business_management`,
   `whatsapp_business_messaging`, and the login dependency `public_profile`.
   Do not request `whatsapp_business_manage_events` until Conversions API event
   reporting is implemented and independently demonstrable.

Customer Embedded Signup is still a design boundary, not a released capability.
It requires tenant-scoped credential storage, sender ownership uniqueness,
revocation handling, webhook subscription, and two restricted real-tenant tests.
