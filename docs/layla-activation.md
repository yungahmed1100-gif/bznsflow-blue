# Owner activation and supervised test

Outcome: the owner can register the approved Omani phone and subscribe the app from `/owner/layla`. The six-digit PIN is submitted once, never stored. Existing auth and general messaging locks remain intact. Customer onboarding is outside scope.

Interfaces: additive activation and supervised-test APIs reuse owner authentication, CSRF and durable state CAS. Activation claims a single expiring challenge before any provider effect. Uncertain/failed effects remain blocked for operator reconciliation; no automatic registration retries. Only fixed status codes and timestamps are retained. Readiness requires the exact identities, sender, Cloud API platform, WABA app subscription and active messages webhook at the approved callback.

The supervised flow is synthetic in this release. A separate source lock prevents live transport even if environment flags change. A single reviewed recipient/conversation expires after 15 minutes, allows at most five owner-confirmed replies, and stops on owner stop, opt-out or takeover. It never enters the ordinary worker or changes the global pause.

Acceptance: mocked provider contracts and failures, durable concurrency/replay, access/CSRF/origin, full readiness gates, test limits, duplicate events/receipts, UI interactions, full npm suite and build. Production rollout requires successful checks, encrypted-variable presence without values, binding migration verification and preservation of the current deployment as rollback. No live registration is performed by the agent and no message is sent.

Rollback: redeploy the previous production artifact; retain the existing JSON state and activation metadata. No auth schema changes or new migration are needed. An activation stuck in progress must be reconciled read-only before any separately reviewed recovery.

Verified locally: full npm suite, 85 Layla tests including crash/replay and database persistence, production build, and connected-Chrome owner/nonowner/anonymous fixture checks. PIN masking/cancellation, synthetic registration, review/accepted/delivered/stop and disabled live send passed. Owner documents exclude marketing and performance scripts; client-side entry reloads a private document before rendering controls. Public HTTPS baseline and unsigned/wrong-token webhook checks passed without redirects. Correct-token production callback verification remains the prior handoff evidence; the token was not read or requested again.

Provider contracts: [Meta registration collection](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api) and [WABA app subscription](https://www.postman.com/meta/whatsapp-business-platform/request/c1ai24q/subscribe-to-your-waba). The additional app webhook check uses the server-side app access token and requires active `whatsapp_business_account`, the exact callback, and a `messages` subscription (independently versioned from registration). A provider error fails closed with a fixed code.

The current supervised API supports only synthetic confirmations. Its live-send action always rejects; enabling actual supervised messaging needs a separately reviewed release, including live ingress wiring. Synthetic events never flow into the ordinary worker or activate the real trial. A stopped/expired/five-reply session cannot be reset through this release's UI.

Deployment packaging: the two public control URLs rewrite to isolated handlers within the existing owner function, preserving the Hobby function limit. Neither public URL redirects. Tests cover path, query and rewritten-query dispatch, including anonymous denial. Vercel getter-only request bodies are covered by a PIN-cleanup regression.

Production read-only observation: the existing Meta messages webhook is subscribed on v26.0 with the expected callback. Readiness preserves that configuration and does not incorrectly require it to match the v25.0 registration API. No Meta setting was changed.
