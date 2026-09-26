# Independent Instagram and WhatsApp connections

2026-09-23. Blue-only local implementation; no release or live-message evidence is implied.

## Outcome and interfaces

A signed-in business can use Instagram DMs, WhatsApp, or both. Approved facts/catalog and owner dashboard are shared. Credentials, activation, sender identity, health, and disconnect are independent. Contacts remain channel-specific; no automatic cross-channel person matching. Instagram contacts cannot enter WhatsApp campaigns. Optional WhatsApp portfolio reads/display are removed; approved WhatsApp routing and registration checks remain.

`api/_lib/layla/instagram.js` owns server-only OAuth exchange, health, token refresh, revoke/deletion callbacks and connection API. `api/layla-meta.js` multiplexes its surfaces. `api/layla-meta-webhook.js` authenticates the raw body against our app secrets and routes on the payload's `object` (`instagram` or `whatsapp_business_account`), so the Instagram subscription works with or without `?channel=instagram`; a WhatsApp payload must carry the WhatsApp app's signature. All Instagram Graph calls (exchange, check, subscribe, username lookup, Send API, send-error mapping) live in `instagram.js`. The existing messaging worker chooses `graph.instagram.com` and Instagram's recipient shape for Instagram jobs.

`convex/blueInstagramState.js` owns atomic transitions behind authenticated internal `blue-instagram`. `blueInstagramConnections` is keyed by business, provider account and integration; `blueInstagramAttempts` holds a session-bound, single-use state hash with ten-minute expiry. `blueInstagram.maintain` runs every fifteen minutes for expired attempts, due refresh work, and bounded deletion batches. Conversation/contact channel and IG identifiers are optional schema additions, preserving existing WhatsApp rows. Generated API declarations include the new module.

## Security and lifecycle

OAuth requires signed-in Blue account cookies, exact origin/host and CSRF for initiation. The callback consumes a hashed random state bound to that account's saved draft. Tokens are encrypted with integration/channel/account-specific authenticated context; public UI shapes exclude credentials. Server-side asset ownership prevents another tenant claiming a bound professional account. A business may reconnect the same account; switching identities is deliberately blocked until an explicit migration preserves historical deletion routing.

Connections start paused. Per-channel flags and existing durable messaging gates apply. Instagram additionally requires an explicit test-recipient allowlist. Activation verifies grants indirectly through usable token/identity/subscription, approved facts and fresh health. The worker rechecks durable state immediately before sending. This narrows but cannot eliminate the race where a provider request is already in flight when pause/disconnect occurs.

Standard replies only within 24 hours of inbound contact. Queue maximum 100 per integration, sends 10/minute and 100/day per integration, global 500/day. Duplicate inbound events are deduplicated. Our echoed sends do not cause takeover; external human echoes do. Unsend events clear stored text and block a delayed original from generating a reply. Unsupported media requests human handling. Provider acceptance is recorded as submitted, never fabricated delivery; ambiguous responses are not automatically resent.

Long-lived tokens refresh after a day via the authenticated worker, with one-hour retry scheduling and updatedAt fencing. Expired or revoked credentials require reconnection and stop sends. Deauthorization/deletion callbacks verify signed requests with the Instagram OAuth secret and reject callbacks issued before the current authorization. Revocation clears credentials and stops queued work. Deletion keeps a stable pending receipt across retries and removes Instagram messages/conversations then contacts in bounded batches. Receipt status changes to complete after cleanup. Unknown random receipt codes report complete because no matching pending data exists; they reveal no account information. Minimal connection identity is retained for replay/ownership control. Reconnection is blocked during cleanup.

Instagram disconnect stops locally, then attempts provider permission revocation. Blue always finishes its own disconnect; if Meta refuses the revoke, the owner is told to also remove the app in Instagram's settings. WhatsApp disconnect is local: it clears saved connection credentials and blocks jobs, preserves business facts, and does not unregister the phone number or revoke parent Meta app access. The UI explains this distinction.

## Connection checks and dropped sign-ins (2026-09-24)

Only a definite answer changes a connection. Check connection and Activate re-subscribe, then inspect: a dead token (190/102) or a token for another account marks it `reconnect_required`; a missing subscription returns `connection_not_ready` and leaves the connection alone (the owner fixes "Allow access to messages" in Instagram); a Meta timeout or error changes nothing and returns `instagram_provider_unavailable`/`_failed`. The scheduled health check follows the same rule and only pauses replies on a definite answer. Instagram reply controls without a live connection answer `instagram_reconnect_required`, never `sign_in_required`.

Instagram sometimes leaves a freshly signed-in person on its own feed and never returns to the redirect URI (Meta's changelog calls it the broken login experience). The `state` operation reports `pendingSignIn` while the latest attempt is unused and unexpired; the card then offers **Finish connecting**, which starts a new attempt without `force_reauth`, so the now-signed-in browser goes straight to Instagram's Allow screen. The first Connect always forces the login.

## Graph call budget (2026-09-24)

Meta throttles `/{ig-id}/subscribed_apps` hard (code 613 after a handful of calls; seen live). The subscription is therefore proven once, at connect (`success:true` from the subscribe POST, recorded as `checkedAt`), and refreshed at most every 24 hours by one idempotent POST. Check connection, Activate and the five-minute health check read only `GET /me` (token and identity); the worker sends without any pre-send Graph read, relying on the durable claim/send_gate state and the Send API's own answer. Codes 4/17/32/613 map to `instagram_rate_limited` and never change a connection; a throttled daily re-subscribe keeps the older proof.

## Verification

`npm run verify` passes (lint, TypeScript, complete test suites and production build). Lint has the existing 12 React hook warnings and zero errors; bundle-size warnings remain. `npx tsc --noEmit -p convex/tsconfig.json` passes. New state/API tests cover session-bound OAuth, missing grants, CSRF, signed callbacks, tenant inbox routing, independent disconnect, send gating, own/external echoes, unsend ordering, stale refresh, repeated deletion receipts and old deauthorization callbacks. WhatsApp review regression tests assert optional portfolio reads are absent.

`tests/instagram-browser.mjs`: 32 synthetic checks pass at 375/1280px in English/Arabic, with serious/critical accessibility violations checked. Screenshots are local in `work/instagram-browser/`. These tests block external traffic and are not App Review screencasts. The existing dashboard browser regression passes all 80 assertions at 320–1440px, including keyboard scrolling of the message list.

Acceptance still requires real provider consent, webhook signatures/identity mapping, token refresh, deletion, actual reply receipt and independent WhatsApp regression on deployed Blue. Operational monitoring should track webhook rejection, refresh failures, queued work age, deletion backlog and provider send outcomes without tokens or message text in logs. Existing Blue daily send caps are a pilot boundary, not a throughput promise.

## Deployment and rollback

After authorization: apply schema/functions to isolated Blue Convex first; deploy Blue Vercel frontend/API second with Instagram send flag false. Configure credentials/callback, verify paused receive path, then separately authorize allowlisted test sends. Preserve the existing WhatsApp callback, flags and approved permissions.

To stop Instagram sending, set `BLUE_INSTAGRAM_SEND_ENABLED=false` and pause its durable controls. For a full Instagram ingress/OAuth stop, set `BLUE_INSTAGRAM_ENABLED=false`; signed revoke/delete/status callbacks remain available while valid credentials/configuration exist. Keep worker and maintenance functions for deletion cleanup. Avoid rolling the backend back to a schema that rejects new rows; prefer forward fixes or a compatible backend. Do not delete tokens or tables as a rollback shortcut. No Green deployment, production migration, Meta submission or actual send occurred in this implementation.

Owner runbook and permission text: [Instagram App Review setup](instagram-app-review-setup.md). Decision: `2026-09-23-Layla-Independent-Instagram-And-WhatsApp` in the canonical Obsidian and Notion ledgers.
