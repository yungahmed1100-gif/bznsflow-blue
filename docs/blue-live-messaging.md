# Blue live messaging MVP — 2026-09-13

## Deployed scope

User authorized live incoming-customer replies and all three eligible number
paths. Blue uses the existing Meta app and verified WABA/phone callback routing;
Green, its callback and its owner transport locks remain unchanged.

Frontend deployment `dpl_F6eDhcftqskhZYo36M6cvTNrnKtb` is READY and aliased to
https://bznsflow-blue.vercel.app. Convex is exactly
`quaint-nightingale-675.eu-west-1.convex.cloud`.

`BLUE_LIVE_MESSAGING_ENABLED=true` and the durable global gate are enabled.
Individual accounts remain inactive until their owner clicks Activate Layla.
No account was automatically activated during rollout.

Implemented: Resend OTP for any valid email; account switching; approved facts
and preview; three signup paths; activation with fresh Meta routing checks;
tenant-scoped incoming messages and durable outbound intents; delivery receipts;
conversation view; manual text replies; automatic-reply pause and contact
takeover/resume; Business App echo mirroring and takeover; opt-out protection;
seven-day text retention and thirty-day metadata retention. (Superseded locally
2026-09-14: new message text is retained 30 days — see
[Layla dashboard](blue-dashboard.md); not yet deployed.)

## Interfaces and operational behavior

- `/api/layla-meta?surface=messaging`: account-authenticated GET state and
  CSRF-protected POST activate/pause/takeover/resume_conversation/manual_reply.
  Tenant identity always comes from the verified account's saved draft.
- `/api/layla-meta-webhook`: original-byte signature verification, authoritative
  WABA/phone lookup, bounded parsing, durable acceptance before 200. Unknown
  bindings cannot generate replies. No media downloads or campaigns.
- `/api/layla-meta-worker`: dedicated Blue bearer secret; accepts only internal
  job IDs or internal health checks. Claims an intent atomically, decrypts the
  tenant token, checks actual Meta routing and the latest brakes, then attempts
  one provider POST. Timeouts/uncertain outcomes never automatically resend.
- Convex schedules the worker and sweeps queued work every minute. One send
  attempt per business may be in flight. Active connections are rechecked at
  five-minute intervals and before each send. Provider failures pause automation.
- Product photos (Hasib, Ascend): the only outbound media. When a customer asks
  about a stock product that has a photo, ingest queues one extra image job after
  Layla's text, once per chat and photo per 24h. `claim` resolves the stored
  photo to a public Convex storage URL (blocked `photo_missing` if deleted); the
  worker sends WhatsApp `type:image` with the product name as caption, or an
  Instagram image attachment. Same claim/send_gate/rate/receipt rules as text.
  Owners upload JPG/PNG/WebP ≤5 MB straight to Convex storage (300 upload
  addresses per shop per day). The `/blue-hasib` HTTP route then reads the file's
  real bytes (JPEG/PNG/WebP signature, size) and the shop registers it
  (`photo_register`); a failing file is deleted at once, and only the same shop's
  registered file can be attached to a product. Unregistered uploads are swept
  after an hour, registered-but-unsaved ones after a day.
- Defaults: ten sends/minute and 100/day per business, 500/day globally, 100
  queued replies/business. Manual replies share the limits and require a recent
  incoming message. Opted-out contacts cannot receive manual replies.
- Profile and conversation revisions fence queued/claimed replies after edits
  or human takeover. A provider request already in flight cannot be recalled.
- The UI shows the fifty most recently active conversations and latest 100
  message records. Delivery is shown only when confirmed by a matching receipt.

## Verification evidence

- Full existing npm suite and build passed; final focused Blue suite 50/50;
  Convex TypeScript check passed. Tests cover all signup paths and live message
  state, tenant isolation, deduplication, uncertain outcomes, handoff, opt-out,
  stale windows, limits, reviewer expiry and manual-reply idempotency.
- Deployed worker rejects an unauthenticated request with 401; webhook rejects
  unsigned input with 403; Convex messaging HTTP rejects absent service auth
  with 401.
- Actual Convex action → authenticated Vercel worker → Convex lookup probe
  completed successfully with a nonexistent binding. It could not send a
  message; this proves connectivity, not a WhatsApp delivery.
- Browser verified the global gate initially hid activation, then enabled
  Activate Layla after rollout. Existing saved account and connection survived.
- Sign out / Use another account returned empty business fields without the
  previous account identity or number. Immediate activation reuses a fresh
  signup routing check to avoid hitting the refresh throttle.

## Reviewer access and secrets

Dedicated worker secret is persisted in ignored `.env.blue-worker.local` and
the two Blue environments. Do not rotate one side independently. The provisioning
script suppresses provider output and prints no values.

An isolated customer-role reviewer account and seven-day access link were
created. Link stored only in ignored `.env.blue-review-access.local` (mode 600).
It uses a URL fragment, removed before login; reviewer sessions last at most
one day and never exceed link expiry. Provide it only in Meta's private review
access instructions. This account cannot access an existing customer's setup.
It starts with its own empty business and must connect authorized reviewer assets.

## Remaining external verification

No real incoming WhatsApp message, outbound reply or delivery receipt has yet
been observed through this new service. User will test with a different email
and number. Required evidence: signup → verify email → approve facts/preview →
connect → activate → message from a second WhatsApp number → reply in WhatsApp
and BznsFlow → delivery receipt → pause/takeover and reload recovery.

Meta recheck: app 1388038082832745 is UNSUBMITTED; required
business_management/whatsapp_business_management/whatsapp_business_messaging
privileges are not live. The tool's generic is_approved flag does not establish
approval. General customer access is still blocked by Meta permissions/publishing.
No review submission or app setting change was made.

Coexistence error 3441034 and existing Green-number error 2655122 remain prior
provider results, not resolved by this deployment. All three paths are supported
in code; no universal number-eligibility or completed three-number rehearsal is
claimed. Existing conflicting routing requires assisted transfer.

Account-level callbacks still reach the shared app callback; no complete
webhook isolation is claimed. Blue relies on periodic and send-time credential
checks for lifecycle changes not delivered through overrides.

## Rollback

Use internal `blueMessaging:setEnabled` with `{ "enabled": false }` against
`quaint-nightingale-675` to close the global gate and pause accounts. Then set
`BLUE_LIVE_MESSAGING_ENABLED=false` in Blue Vercel and redeploy if needed.
Keep tables, message IDs and uncertain outcomes; never reset credentials,
disconnect numbers, or retry ambiguous provider sends as rollback.
