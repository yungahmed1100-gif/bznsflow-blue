# Blue review repair — 2026-09-12

Current update: [Blue onboarding execution](blue-onboarding-execution.md)
supersedes the historical pending PIN and frontend deployment statements below.
User entered the PIN; latest browser reconciliation passed connection checks
for `+15554886936`. Preview-first onboarding and open Resend email registration
are deployed. Mailbox verification and live messaging remain unverified.

Implementation target: anonymous business review and actual Meta setup, with Convex as the only review authority. Preserve existing bilingual design and navigation. Green is frozen. No production import or live messaging.

Interfaces: Secure HttpOnly 24-hour review cookie → same-origin/CSRF Vercel API → separate service-authenticated Convex HTTP action → internal atomic mutations. Facts, attempts and encrypted credentials share a session lifecycle. Meta code exchange and asset validation precede connection; single-use claims precede external operations. Ambiguous operations require read-only reconciliation. New-number registration needs separate PIN confirmation; coexistence never registers.

Acceptance: session isolation, CSRF/origin, direct access denial, replay/concurrency, both callback orders, path integrity, exchange/subscription/storage failure, no false success or secret leakage; full npm suite/build and actual Blue rehearsal. Recording checklist remains gated on rehearsal.

Failure/rollback: missing secrets or isolation proof blocks Meta setup. Deploy backend first to quaint-nightingale-675.eu-west-1, then only bznsflow-blue. Disable BLUE_CUSTOMER_SETUP_ENABLED to stop new external work; keep read-only reconciliation and disabled messaging. Preserve uncertain operation records until session retention expires. Cleanup removes expired local review records and ciphertext in bounded batches; it never disconnects Meta assets. No production schema or webhook changes.

Provider reference: https://docs.convex.dev/functions/internal-functions (checked 2026-09-12). Meta implementation documentation returned HTTP 429; local supplied Meta sample and connected dashboard are additional evidence, not proof of a completed signup.

## Resume implementation — 2026-09-12

User clarified that signup must accept other customer-owned numbers, with WABA
2213485365896306 used for standard API rehearsal and WABA 1712714900182074 for
Coexistence. These are rehearsal accounts, not a general customer allowlist.
Meta-granted WABA/phone membership, atomic local ownership, and actual callback
routing remain enforced. The first WABA contains Green's owner number ending
4025; its existing routing must not be silently redirected by Blue.

Verified via Meta MCP and dashboard: the existing app is in development mode,
Blue is an allowed domain, configuration 2144711899802123 uses WhatsApp Embedded
Signup, Cloud API, system-user tokens, and the three selected permissions
business_management, whatsapp_business_management, whatsapp_business_messaging.
The shared app callback still points to Green. No configuration was saved.

Provider reference: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/override/
WABA override is supplied with subscription, then read back along with the
phone's effective override. Existing non-Blue routing for this app is refused.
A WABA that is not yet subscribed to this app may be subscribed with a Blue
override after asset ownership is verified. No bare subscription body is used.
Overrides do not cover every webhook field; the shared app currently subscribes
to messages and smb_message_echoes. This is not a claim of complete isolation
for future app-wide field changes.

The public review stores anonymous facts and encrypted integration state in
Convex for 24 hours. Blue webhook authenticates but intentionally discards test
notifications; it creates no reply jobs and does not retain message contents.
All answer previews are synthetic. There is no working automated reply service
or live-message rehearsal claimed by this change.

Local validation: existing npm suite and frontend build passed; 19 Blue/review
behavioral tests and 83 affected owner/webhook tests passed after follow-ups.
Convex TypeScript check passed. Backend deployed to quaint-nightingale-675;
remote function metadata confirms account/business/review functions internal.
Frontend deployment and actual Meta rehearsal remain in progress.

### Confirmed FedCM failure and deployed correction

The failed real popup had app 1388038082832745, response_type=token, scope=openid,
no config_id and a fedcm_origin parameter. It displayed the supported-permission
error. The saved configuration itself was verified to be Embedded Signup.

Meta's current public SDK bundle permits app configuration to activate FedCM by
default when FB.init omits fedCM. The explicit fedCM:false option prevents that
override. Official docs state that FedCM does not yet support Login for Business
configurations: https://developers.facebook.com/documentation/facebook-login/web/fedcm

After deploying signupInit with fedCM:false and initializing before launch,
actual popup parameters were app 1388038082832745, config 2144711899802123,
response_type=code. It displayed the intended WhatsApp onboarding welcome page.
Deployment dpl_Hi9NCt7826rSxKinWKA3iZnbdTKS is live at the Blue origin.

User approved Continue and the displayed terms; the agent applied approval.
Coexistence number ending 5930 returned Meta error 3441034 (ineligible).
Existing Cloud API number ending 4025 returned 2655122 (already registered).
Neither number was disconnected or migrated.

A subsequent live browser check found the popup closed and Blue awaiting
registration for a different number, +15554886936. A read-only connection refresh
preserved registration_required. This is progress beyond consent and into saved
integration state, but is not a verified completed registration. User PIN entry
and explicit registration confirmation are pending. No live sends or App Review
submission occurred. The two intended rehearsal assets remain unvalidated.
