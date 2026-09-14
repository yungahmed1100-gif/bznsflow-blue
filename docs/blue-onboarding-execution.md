# Blue onboarding MVP — 2026-09-12

Current update, 2026-09-13: [Blue live messaging](blue-live-messaging.md)
supersedes the discard-only webhook and live-implementation blockers below.
The live service and account activation are deployed; a real WhatsApp delivery
rehearsal and Meta permission approval remain unverified/pending.

User priority: a working MVP for Meta App Review. Defer further onboarding
features until the review journey can be demonstrated end to end.

## Implemented and deployed

- Business facts → persisted first website answer → verified account → WhatsApp
  connection. Optional contact details do not block the first preview.
- Any valid email can register; no email or customer WABA allowlist. Blue uses
  its own user-supplied Resend API key and sender
  `BznsFlow <onboarding@bznsflowai.com>`. Secrets remain server-only.
- Single-use six-digit email codes expire in ten minutes. Atomic attempt,
  resend, email/IP and global limits protect signup. Verified sessions last
  thirty days. Account saving rotates anonymous draft authority and rewraps
  existing encrypted credentials; anonymous drafts expire after 24 hours.
- Customer route: https://bznsflow-blue.vercel.app/en/layla/setup
- Separate anonymous reviewer route:
  https://bznsflow-blue.vercel.app/en/layla/review
  Reviewers do not need an owner to forward an email code. Meta authentication
  and provider eligibility still apply to actual WhatsApp setup.
- Existing Cloud API, new number and Business App Coexistence paths; WABA-only
  Coexistence completion supports validated phone selection. Coexistence never
  calls number registration. Ambiguous writes reconcile through provider reads.
- Saved progress, safe connection diagnostics, source-labelled previews,
  approved exact FAQs and optional bounded public-website text import.

## Verified evidence

- Full npm test suite, 34 focused Blue tests, Convex type checking and build
  passed. Tests cover OTP expiry/replay/attempts, session/draft isolation,
  rewrapped credentials, provider failures and website SSRF defenses.
- Actual Blue browser displays the saved first answer for synthetic studio
  facts; the answer survives reload.
- After user PIN entry, a subsequent read-only reconciliation showed
  **Connection checks passed** for `+15554886936`. This is the newly selected
  number, not either original rehearsal number. No real message was sent.
- Live signup displays an unrestricted email field and email-code action.
  Actual mailbox delivery and completed account verification remain unverified.
- Backend is the isolated `quaint-nightingale-675` Convex deployment; frontend
  is only `bznsflow-blue`. Green remains frozen.

## Submission blockers and next execution order

1. Complete one real Resend delivery and account verification, then reload and
   verify recovery of the saved business and connection.
2. Confirm the selected test number's usable messaging capabilities. Original
   Coexistence rehearsal returned Meta 3441034; the existing Green number
   returned 2655122. Do not disconnect or migrate either to bypass these errors.
3. Implement and validate an isolated Blue inbound/outbound test path for the
   messaging permission demonstration. Blue currently authenticates and
   discards webhooks; tenant reply processing is not implemented. Shared-app
   webhook exceptions remain an isolation concern. Do not change Green routing.
4. Rehearse the separate reviewer route from a clean browser, demonstrating
   each requested permission's actual use. Capture a real message and reply
   for messaging, with no secrets or synthetic output presented as real.
5. Reconcile the requested permission set with demonstrated functionality and
   verify dashboard review requirements before preparing final submission.
   The app was last observed unpublished with review unsubmitted.

No App Review submission, general Meta access, completed two-number rehearsal,
or live automated reply is claimed. History sync, campaigns, broader imports
and additional onboarding features are deferred beyond this MVP.
