# Later customer Embedded Signup — design boundary, not implemented

Product decision BF-2026-09-10-META-COEXISTENCE: preserve WhatsApp Business app. Current pilot maps only the explicitly allowed owner account to BznsFlow's own sender. Customer registration does not create a messaging entitlement or share this sender. The separately authorized [owner-only Embedded Signup](layla-owner-signup.md) does not implement this later customer flow.

Before implementing customer onboarding, recheck current official Meta documentation, Coexistence eligibility, supported Embedded Signup/Facebook Login for Business configuration version, App Review/advanced-access/Tech Provider obligations, scopes, token exchange, asset permissions and disconnect semantics. On 2026-09-10 the relevant developer pages returned 429; current account requirements are not verified by this artifact.

Proposed boundary:

1. Existing authenticated customer begins onboarding → short-lived server session bound to account, state/nonce and intended Coexistence capability.
2. Official Embedded Signup launches only if current eligibility/permissions are met. SDK callbacks and client-supplied IDs are untrusted evidence, never authority.
3. Server exchanges the code and independently verifies the new token/app, granted scopes, customer WABA, phone ownership and required subscriptions. Never choose a sender from browser input alone.
4. Create a customer integration record: immutable tenant ID, provider, app/WABA/phone IDs, secret reference, granted scopes, configuration version, Coexistence verification state, owner-reviewed business facts and trial ID. Enforce unique active ownership of a sender and tenant-scoped foreign keys. Never put customer credentials in the singleton pilot row.
5. Route authentic webhook account+phone pairs to this registry, then tenant inbox/outbox and the existing deterministic gateway rules. Business-app echoes and owner takeover outrank pending automated replies. Unknown account/phone events cannot reach another tenant. No CRM/campaign coupling.
6. Activation is a trial/business entitlement independent of connection rows: confirmed first matching delivery/read writes it once. Token refresh and reconnect cannot reset it. Duplicate callbacks and reconnect races must be tested at storage constraints.
7. Revocation pauses new sends, preserves ambiguous-send/delivery reconciliation evidence and follows an explicit owner-approved exit/deletion process. Disconnecting the integration must not silently delete or deregister the Business app number.

The current single-row CAS store is intentionally capped for one owner pilot. Replace it with normalized tenant-scoped integration/inbox/outbox tables when this phase is authorized; do not relax the current owner guard or simply accept a tenant ID in API bodies.

Acceptance before release: two real restricted tenants, attempted cross-tenant sender swaps, callback replay, OAuth failures, rejected eligibility, token revocation, duplicate echoes, owner takeover, out-of-order delivery, reconnect preserving activation, private settings/cache isolation, supported app coexistence and human-approved live delivery evidence. None of that customer onboarding is claimed ready today.
