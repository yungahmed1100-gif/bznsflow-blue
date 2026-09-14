# Meta sample comparison and eligibility — 2026-09-11

Reference: local business-messaging-sample-tech-provider-app-main, especially ClientDashboard, Fbl4bLauncher, token exchange, beUtils, publicConfig and README. Its signup builder separates Embedded Signup v4 from the Graph API version. We retain the current BznsFlow stack and production protections.

Implemented: explicit v4/session-info 3 launcher; Coexistence-only featureType; app/config membership check before issuing a signup attempt; bounded SDK loading; cancellation, duplicate and stale login callback protection; strict token expiry checks; owner-only read-only eligibility endpoint at /api/layla-meta?surface=eligibility and panel on /owner/layla. Existing encrypted credentials, account-derived ownership and registration prohibition for Coexistence remain.

## Actual dashboard evidence

Read through the connected owner browser on 2026-09-11, app 1388038082832745:

- Tech Provider onboarding: Business Verification Approved; App Review In review; 1 of 2 steps complete.
- Embedded Signup Builder: integrity cleared to continue integration; prototype testing allowed with manually added app users. Production requires App Review AND Access Verification completion.
- Selected configuration: Layla Coexistence Pilot, ID 2144711899802123; Embedded Signup v4; session-info 3. Builder feature selector was None; our Coexistence launcher explicitly supplies the required featureType.
- Dashboard requests a real send/receive recording for whatsapp_business_messaging and a separate template-creation recording for whatsapp_business_management. The present Layla UI does not implement template creation.

These are dated manual observations, not an automatic approval API. The runtime panel deliberately leaves dashboard-only checks Not verified until a fresh operator check; it must not infer approval from app configuration membership or owner number readiness.

## Remaining gates

Egyptian +201036755930 Coexistence has not completed actual Meta signup. Separate customer-number onboarding, OAuth/SDK domain verification, Access Verification completion, reviewer access and real recordings are pending. No real messages sent. Customer automatic replies remain hard-disabled; onboarding stays disabled until restricted rollout configuration is complete. The scheduler has recorded worker_unavailable failures; heartbeat freshness alone cannot prove cron recovery.

No migrations or auth changes in this sample alignment. All npm tests (including 106 Layla tests) and production build passed before the final Access Verification label addition; final verification is recorded in the Desktop handoff. Never copy the sample's plaintext credential schema, shared raw webhook stream, generic automatic registration or automatic acknowledgement bot into production.
