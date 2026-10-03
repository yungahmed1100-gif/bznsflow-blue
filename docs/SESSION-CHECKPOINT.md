# Resume checkpoint — 2026-09-12 (active repair)

## WhatsApp onboarding help — 2026-10-03

Integrated the bilingual setup helper into the owner flow: Business App choice
and preparation checklist, Meta window guide, local deterministic help chat,
support links, readable error messages, and connected-state guidance. Meta
signup remains on the existing v4 options; the phone-number-first experiment
was removed. Checklist acknowledgements are per-page and do not persist between
people using a shared browser.

Local evidence: `npm run verify` passes (all typechecks/tests/build; lint has 0
errors and 13 hook warnings). `npm run test:whatsapp-browser` passes 62
synthetic checks in EN/AR at 320/768/1440px, with no serious/critical axe
findings. Commit `37eca87` is deployed to Blue production as Vercel deployment
`dpl_CJGy45SYn4geJFUAF8nTNk6pUFXY` (READY); `/en/layla/setup` returned HTTP 200.
No real Meta consent, signup or message was tested.

## WhatsApp Embedded Signup repair — 2026-10-01

Symptom: on Blue, every number option failed in Meta's window with "WhatsApp
feature is invalid for the app". Meta MCP (read-only): app 1388038082832745 live,
compliant, WhatsApp messaging/management Advanced Access, Blue SDK/OAuth domains
present; WABA webhook fields only `messages` + `smb_message_echoes`. The failing
dialog opened Meta's v4 flow with the **Marketing Messages** product
("Send messages with optimizations") in login configuration 2144711899802123.

Cause: our launch sent `extras.version: 'v4'` (invalid; v4 comes from the login
configuration and `extras` should stay empty apart from Coexistence's
`featureType`) plus v2/v3-era keys, against a configuration that also bundles
Marketing Messages.

Implemented locally (not deployed): v4-correct extras and no `auth_type:
rerequest`; `LAYLA_CUSTOMER_CONFIG_ID` read from env (no pinned ID) and checked
against the app before Meta opens; Meta CANCEL/ERROR reasons shown with a
reference; onboarding split into `src/components/onboarding/*` with inline
email sign-in, a requirements checklist, and Meta prepared once the customer
clicks "Connect WhatsApp" (Instagram-only setups never start a WhatsApp
attempt); owner readiness now reports missing WABA webhook fields.
Evidence: `npm run verify` passes (lint 0 errors / 12 existing warnings);
browser: review onboarding 16, guided setup 28, Catalyst 197, new
`test:whatsapp-browser` 30 checks (synthetic; no Meta consent evidence).

Pending (owner): new Embedded Signup configuration with **Cloud API only**;
subscribe `account_update`, `history`, `smb_app_state_sync`; set Blue
`LAYLA_CUSTOMER_CONFIG_ID`; deploy Blue; one real signup per path.
Coexistence history/contact sync ingestion is not built.

## Authorized Blue deployment and Desktop guide — 2026-09-23

Ahmed explicitly authorized deployment and requested a detailed plain-English
PDF. Backend deployment succeeded on isolated `quaint-nightingale-675`; Vercel
release `dpl_5cUFHzN7jkx2iG7rPC6wjBNjYJ84` is READY on
`https://bznsflow-blue.vercel.app`. The live signed-in onboarding was checked.
Green was not deployed. No real messages were sent.

Instagram Login app `bznsflowai-IG`, ID `1674756910890232`, was verified in Meta.
Blue has that ID and graph version v25.0. The owner saved the OAuth secret as
Sensitive for Production. BLUE_INSTAGRAM_ENABLED=true; sending remains false.
OAuth redirect, deauthorization and deletion callbacks are saved. Meta verified
the Instagram webhook and only messages is subscribed, at v26.0; other fields
are off. The existing WhatsApp subscription is unchanged. Connect Instagram is
active on the deployed onboarding. Signature verification uses the parent app
Basic-settings secret by default, with an explicit override supported. The
latest fix passed 26 focused tests; lint has zero errors and 12 existing warnings.
Real consent, inbound DM, reply receipt, legal Basic settings/contact email and
reviewer access remain pending. Owner next connects @bznsflow and sends a test
DM from @yungramsis21. No messages were sent by the agent.

Desktop PDF: `/Users/ramsis21/Desktop/BznsFlow - Meta Review and Screencast Guide.pdf`
(20 pages, includes steps/reasons, exact captions and reviewer instructions).
Source/render artifacts: `work/review-pdf/`. The official Meta recording guide
says reviewers do not listen to audio: use on-screen captions. Earlier dated
notes below describe the state before this authorized release.


## Recording preparation — 2026-09-23

Owner requested end-to-end onboarding for Meta review. Recording pack:
[review-recording-pack.md](review-recording-pack.md). Corrected customer test
account: **@yungramsis21**; professional business account: **@bznsflow**.
Local onboarding wording now covers both channels and places Instagram on the
channel step. A new synthetic EN/AR browser rehearsal passes 14 checks from
preview approval through Instagram-only inbox access. It does not verify Meta
consent or delivery. Existing private reviewer access file was found but not
rotated, exposed or authenticated.

Read-only Vercel check: **no BLUE_INSTAGRAM_* variables configured**. Meta still
has placeholder terms/deletion URLs and unverified email. Deployment approval,
secure Instagram credentials/callback configuration, and authorized live
rehearsal are still needed before recording. No live state was changed.

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


## Current implementation — Layla dashboard after activation (2026-09-14)

**Deployed 2026-09-14 with authorization:** commits `45ed72b`, `5100f51`; Convex
schema pushed to `quaint-nightingale-675` and contact migration complete; Vercel
`BLUE_DASHBOARD_ENABLED=true`, `BLUE_BROADCAST_ENABLED=true` (template sync only);
production `dpl_ESnM3qtXvc8qbaZzRAoeCkQ52A4Q` READY on the Blue alias. Durable
Convex `broadcast` gate still **off**; no live sends yet. Review submission
package, Meta blockers and rehearsal runbook: [meta-app-review-submission.md](meta-app-review-submission.md).
Authority:
[Layla dashboard engineering pack](blue-dashboard.md) (scope, interfaces, data,
qualification, broadcast controls, rollout order, rollback, evidence).

- Activation dialog on setup → `/layla/dashboard` (Broadcast, Chats, Contacts).
  `BlueInbox` removed; setup shows an activation panel.
- Contacts, 22-sector deterministic qualification, profile names, 30-day text
  retention, deletion tombstones, exports, templates sync, consented imports,
  scheduled campaigns with separate worker path, receipts and opt-out blocking.
- Gates: `BLUE_DASHBOARD_ENABLED`, `BLUE_BROADCAST_ENABLED` (both false) plus the
  durable `broadcast` setting (off). Privacy page updated (EN/AR).
- Evidence: npm test (Layla 110, Blue 96), Convex tsc, build, 80 browser
  assertions (320–1440 px, EN/AR, axe). Backup of the pre-change worktree:
  session scratchpad `blue-before-dashboard.tgz`.
- Next: owner signs in and activates → approved marketing template synced → durable
  broadcast gate on → live rehearsal with a non-US test recipient → screencasts.

## Current implementation — services, prices and catalog extraction (2026-09-14)

Implemented and deployed the owner catalog requested for the Meta-review MVP.
The Blue onboarding page now has adjacent **Services** and **Prices** tabs.
Owners can store up to 1,000 tenant-isolated services/products, attach as many as
20 price options to each service, paginate the list, archive entries, and approve
and publish all drafts. Price creation selects an existing service, preventing
duplicate service rows. Published catalog facts participate in Layla's grounded
preview matching across the full catalog; unpublished imports never become
answer facts.

Catalog files are processed locally in the browser (15 MB maximum): PDF and
text-PDF extraction, DOCX, XLSX, CSV/TXT, plus Arabic/English OCR for JPG, PNG
and WebP. Extracted entries remain drafts. Owners can save one item or all items;
bulk persistence is bounded to atomic batches of 25 and preserves the 1,000-item
tenant limit. No raw uploaded file is stored or sent to Blue.

Website import now scans the starting page plus up to 19 relevant same-domain
service/product/menu/pricing/FAQ/booking/contact pages. Every page and redirect
repeats HTTPS, DNS and public-IPv4 SSRF validation. The scan is bounded to 12
seconds, 2 MB per page, 10 MB total and 100,000 normalized characters. Output is
organized around what the business offers, how it helps customers, and how Layla
may use approved facts. Oversized/unavailable secondary pages yield a partial
reviewable result rather than discarding useful facts.

Backend/schema deployed to exact Blue Convex
`quaint-nightingale-675.eu-west-1.convex.cloud`. Frontend/API production
deployment `dpl_7Mjj6u7Rtwr6EeTw3qoqUngDBZso` is READY and aliased to
`https://bznsflow-blue.vercel.app`. Live checks returned HTTP 200 for the English
setup page and customer onboarding API; API reports available=true and
websiteImportAvailable=true. Full suite passes: 110 Layla tests and 62 Blue tests;
Convex TypeScript, production build and `git diff --check` pass. Build emits only
large lazy-chunk warnings for optional PDF/XLSX readers.

## Current update — supersedes historical pending items below

### Live messaging implementation — 2026-09-13

User approved the live MVP plan: all three eligible number paths and replies to
all incoming customers after individual account activation. Implemented and
deployed; see [live messaging evidence/runbook](blue-live-messaging.md) for the
current authority. Frontend `dpl_F6eDhcftqskhZYo36M6cvTNrnKtb`; exact Blue Convex
backend deployed. Vercel live flag and durable global gate are enabled. No
account automatically activated. Blue's webhook now persists bound messages
when the live flag is enabled; historical discard-only statements below are stale.

50 focused tests pass, full suite/build/typecheck pass, authenticated scheduled
worker probe succeeds, unauthenticated worker/webhook/backend return 401/403/401.
Reviewer access is in ignored `.env.blue-review-access.local`; never print it.
Worker secret is in ignored `.env.blue-worker.local`; never print or rotate it.
All new implementation is Blue-only; no agents, commits or Green changes.

Browser activeBlueTab id50925206 verified Activate Layla available for the
existing saved account; then Sign out / Use another account clicked to prepare
the user's fresh-account test. Fresh DOM confirms empty business fields, no
old account identity, and no inherited number. Do not activate the old synthetic studio account
automatically. No real WhatsApp message or delivered reply has been verified.
Meta status freshly UNSUBMITTED and required permission privileges not live;
general customer onboarding is still subject to Meta review/publishing.

Follow-up: user reported Prepare secure connection not working. Actual browser
showed Saved to your account, all three connection checks passed, and a disabled
Prepare button beside editable number choices. Existing integration correctly
blocks another signup; the UI was misleading. Hide signup controls when an
integration or pending phone selection exists, and explain the saved connection
with recovery/preview actions. Built and deployed as
`dpl_6nSBgQrb1k4Ab3GnGiQShNUPvUJs` (READY, Blue alias). Account saving is now
observed live after the user's actions, including recovery on a new browser tab;
mailbox contents were not inspected. Current tab id 50925206, binding
activeBlueTab; old blueTab is closed. Display-name status observed:
AVAILABLE_WITHOUT_REVIEW. Live automatic replies remain disabled.

User now prioritizes a Meta App Review MVP. See
[implemented scope and submission blockers](blue-onboarding-execution.md).
Preview-first flow, open email registration through Blue's Resend key,
permanent verified accounts, separate `/en/layla/review` route, phone selection
and connection recovery are implemented. Email sender is
`BznsFlow <onboarding@bznsflowai.com>`; no recipient allowlist. Vercel Production
email and website-import flags are enabled. No secrets belong in this file.

User entered the WhatsApp PIN. Latest actual browser reconciliation now shows
**Connection checks passed** for `+15554886936`, with the saved synthetic first
answer visible. Do not re-register this number. The original two rehearsal
numbers still have the provider failures recorded below.

Live browser is on `/en/layla/setup`, email registration panel open with no
recipient entered. Do not infer a test recipient or claim actual OTP delivery.
User wants registration open to any email. A real mailbox verification remains
pending. Full test suite/build/typecheck passed; latest focused run: 34/34.
Final timeout hardening deployed successfully:
`dpl_XU2SA7BLAQDP1PhUkwBhWNE4RiEA`, READY and aliased to Blue. Backend changes
are deployed to exact Blue. Production build passed with thirteen rendered pages.

Remaining review-critical work: actual account verification/recovery, isolated
live inbound/reply implementation and demonstration, clean reviewer rehearsal,
permission-specific evidence and final dashboard checks. Webhook currently
discards authenticated messages; website preview is not live messaging proof.
No submission or live reply occurred. Green remains frozen. Defer further
onboarding feature expansion until review-critical work is complete.

## Historical repair log

Original task: repair Blue's Meta signup and complete the review flow. The user
resumed the prior checkpoint, then clarified that signup should support all
customer-owned numbers. Rehearsal WABAs: 2213485365896306 for standard Cloud API,
1712714900182074 for WhatsApp Business App Coexistence. No App Review submission
has occurred; a successful full rehearsal is still required.

## Boundaries and authorization

- Worktree /Users/ramsis21/Desktop/bznsflow-blue, branch layla/blue.
- Vercel project bznsflow-blue / prj_TOWvngBTz4mVpI0p0Rrtgk62ZF1Q only.
- Convex https://quaint-nightingale-675.eu-west-1.convex.cloud only.
- Green remains frozen. Do not change its app-wide callback, database or sends.
- Standard rehearsal WABA contains Green owner phone 1250149564857596, sender
  ending 4025. User explicitly named this WABA for tests, but existing Green
  routing must not silently be redirected. Coexistence WABA has number ending
  5930 (Egypt), confirmed connected WhatsApp Business App in dashboard; phone ID
  not yet retrieved. Never register the Coexistence number.
- All automated messaging remains disabled. Current Blue webhook verifies and
  discards notifications; no reply jobs or message contents are retained.
- Preserve extensive unrelated pre-existing changes, especially login/account
  work. Nothing committed/reset. No agents used (current developer prohibits
  them unless explicitly requested).

## Completed this resumed session

- Meta, Convex and Vercel MCPs loaded and read-only connectivity confirmed. Do not
  repeat OAuth. Do not print unfiltered codex mcp list (unrelated secret args).
- Created api/_lib/layla/review-api.js (previously missing/broken import): anonymous
  Secure HttpOnly SameSite=Lax 24-hour cookie, hashed authority in Convex,
  session-bound CSRF, exact Blue origin/host mutations, persisted synthetic facts,
  grounded preview, stored attempt path, code exchange/asset checks, encrypted
  credential persistence before subscription, durable subscribe/register claims,
  read-only reconciliation, explicit new-number PIN confirmation and no sends.
- No fixed WABA allowlist after user's clarification. Provider-granted ownership,
  local unique WABA/phone ownership and routing proof apply to every customer.
- Existing non-Blue subscription for this app is refused. A previously
  unsubscribed WABA can subscribe with Blue override in same POST; afterwards
  GET verifies WABA and phone routing. No bare subscribe body (would remove
  override). Registration only for new_number, never repeat uncertain effects.
- Completed convex/schema.ts blueReviewSessions table/indexes, legacy expiry
  indexes, review.ts internal wrapper, reviewState.js validation/state machine,
  stale operation read-only recovery and fencing, internal cleanup/crons.
- Existing Convex account and business functions are now internal. Backend
  deployed successfully via convex dev --once to exact Blue target. Remote
  functionSpec verifies internal visibility. Public HTTP checks: absent/wrong
  service secret => 401; direct account query => status:error (HTTP 200).
- Added convex/tsconfig.json; installed TypeScript and @types/node for actual
  backend type-check. Type-check passes. npm reported 9 audit findings; no broad
  dependency remediation attempted.
- Revised LaylaOnboarding.jsx to single anonymous API path, no auth-session or
  browser draft dependency, persisted facts/reload, current-attempt coordinator,
  popup-source binding, both callback orders, truthful status/registration and
  synthetic preview. Preserved bilingual design, avatar, suggestions, contact/nav.
- Added createSignupAttempt and signupInit in src/lib/layla-signup.js. Prepared
  attempts can resume on reload using deterministic HMAC state reconstructed by
  API (hash only in database). Cancellation releases durable unclaimed attempt.
- check-blue-environment now requires exact Convex, rejects Supabase runtime and
  live transports. .vercelignore excludes .codex/.agents to avoid uploading MCP
  configuration. .env.example updated with Blue server variable names only.
- Blue webhook branch added to existing api/layla-meta-webhook.js, preserving
  owner factory for tests. It authenticates signature/challenge and discards
  notifications with ignored:true/messagingEnabled:false.
- Tests: existing npm test passed; follow-up 20 Blue/review tests and 83 affected
  owner/webhook tests pass; frontend builds and Convex tsc pass. New behavioral
  suite in tests/layla-review.test.mjs included in npm test:blue.

## Secrets / deployment

- Initial Blue Vercel env listing had only VITE_CONVEX_URL.
- Generated fresh service/encryption/webhook verify secrets and provisioned via
  stdin to CLI without printing values. Same service secret in exact Convex +
  Vercel. Values are NOT in repo/checkpoint. Temporary provisioning script
  /private/tmp/provision-blue-review.mjs contains no stored secret values; DO NOT
  rerun it, since it generates fresh secrets and would rotate inconsistently.
- User manually saved LAYLA_META_APP_SECRET to Blue Production and redeployed;
  variable presence confirmed, value never read. Blue .env missing and .env.local
  had no Meta secret; no Green .env inspected/copied.
- Vercel now has CONVEX_CLOUD_URL, BLUE_REVIEW_SERVICE_SECRET,
  LAYLA_CREDENTIAL_ENCRYPTION_KEY, BLUE_REVIEW_VERIFY_TOKEN, LAYLA_META_APP_ID,
  LAYLA_CUSTOMER_CONFIG_ID, BLUE_CUSTOMER_SETUP_ENABLED=true,
  LAYLA_META_KILL_SWITCH=true, LAYLA_META_MODE=mock, user-provided app secret.
- Backend deployed before frontend. First repaired frontend deployment:
  dpl_4DHekmqiwVnq5cvcdnhSjjTTmyq9, aliased to bznsflow-blue.vercel.app.
- Second deployment completed: dpl_Hi9NCt7826rSxKinWKA3iZnbdTKS, aliased
  to Blue. FedCM fix verified in the actual popup.

## Confirmed signup root-cause evidence and active work

- Meta app 1388038082832745 admin access; app is dev_mode/unpublished. Blue domain
  and SDK allowed domain configured. Config 2144711899802123 named Layla
  Coexistence Pilot actually uses WhatsApp Embedded Signup, Cloud API and
  Marketing Messages products, system-user token (never expires). Selected
  permissions: business_management, whatsapp_business_management,
  whatsapp_business_messaging. No app configuration was changed/saved.
- Meta MCP review status is UNSUBMITTED (the same response misleadingly includes
  is_approved:true; do NOT interpret that as review approval). Privileges tool
  reports no live access for requested permissions. General customer access
  remains dependent on Meta review and publishing.
- Real Blue browser test: anonymous profile saved to Convex and restored on reload;
  prepare/cancel/retry UI works. Synthetic name Blue Review Studio, studio facts,
  review@example.com human contact. No BznsFlow login required.
- Initially browser tool showed no popup; user said a Facebook popup WAS open.
  Later openTabs showed it. Do not equate immediate tab absence with popup failure.
- Actual popup displayed "It looks like this app isn't available" and "This app
  needs at least one supported permission." Allowlisted URL diagnostics:
  appId correct, config_id absent, response_type=token, scope=openid,
  fedcm_origin and dialog_source parameter names present. Never record full URL.
- Meta official FedCM docs explicitly say Login for Business configs unsupported.
  Public SDK SOURCE shows app config fedcmDefault can activate FedCM even when
  init omits fedCM, despite docs describing opt-in. SDK explicitly supports
  fedCM:false and sets FedCMExplicitlySet to stop app config overriding it.
- Implemented signupInit(prepared) with fedCM:false, initializes during prepare
  before click. Added regression test preserving config_id/code options. Also
  detects null/missing synchronous popup capture and clears attempt with retry
  error; verify this behavior against actual SDK popup after deployment.
- Reference docs: https://developers.facebook.com/documentation/facebook-login/web/fedcm
  Public source downloaded only to /private/tmp/meta-sdk-review.js and
  /private/tmp/meta-sdk-bundle-review.js, not project. Public source isn't secret.
- Second deployment validated: configId/code preserved; initial popup failure resolved.

## Browser bindings in this running session

Chrome skill read from
/Users/ramsis21/.codex/plugins/cache/openai-bundled/chrome/26.903.71938/skills/control-chrome/SKILL.md.
Browser bootstrap via mcp__node_repl__js, browser-client runtime; browser binding
named browser. Session named "🔎 Blue Meta review". On fresh process bootstrap
according to skill; on same session reuse bindings.

Bindings: metaTab (50925128), assetsTab (50925065), blueTab (50925163), signupTab
(50925185, error popup dismissed via Got it, may be closed). Re-discover if stale.
Do not dump popup URLs or raw SDK/provider responses. Restrict diagnostics to
app/config IDs, response type, permissions, code-presence boolean, stage and
correlation id. CDP Page.enable was enabled on blueTab (blueCdp binding), only
read Page.windowOpen events; no page/browser state patched through CDP.

## Remaining required work

- Finish real signup rehearsal after FedCM fix. Capture Meta consent/QR/OTP steps
  with user handoff when required; never register Coexistence or submit App Review
  prematurely. Existing first WABA Green routing must remain protected.
- Test actual exchange, asset relation, token encryption, subscribe + overrides,
  persisted readiness and reload; diagnose provider failures using safe codes.
- Inspect is_on_biz_app / status API behavior against real assets (strict checks
  currently fail closed). Coexistence assets may be assigned a different WABA by
  provider; do not hardcode rehearsal WABA as universal customer requirement.
- Verify final bilingual browser flow including synthetic preview after connection.
- Review/fix any newly evidenced issues, update rollout/recording checklist and
  checkpoint honestly. No successful connection, real send or submission yet.

## Latest verified result / user action pending

- User explicitly approved Meta Continue and its displayed terms. Approval was
  applied on both rehearsal attempts; do not ask again for identical terms.
- FedCM fix verified: intended app/config and response_type=code in real popup.
- Coexistence number ending 5930: Meta rejected with error 3441034, not eligible
  to register or migrate. No QR/OTP reached. Root eligibility cause unresolved.
- Standard Cloud API number ending 4025: Meta rejected with 2655122, already
  registered. No disconnect/migration was performed; Green remains protected.
- IMPORTANT subsequent live state changed: normalSignupTab (50925193) is closed.
  Blue now shows a DIFFERENT number, +15554886936, at registration_required.
  This was discovered by a fresh DOM read, not an agent-entered number.
  Agent clicked Check my connection (read-only provider reconciliation), and
  registration_required persisted. Given server implementation, this indicates
  code exchange, encrypted credential persistence and routing inspection have
  advanced, but registration/full connected status remain unverified.
- User must enter their private six-digit WhatsApp PIN in Blue and explicitly
  confirm registration for that displayed number. Do not invent/read a PIN or
  register either original test number to bypass Meta errors.
- Current browser binding blueTab (50925163) is valid, at /en/layla/setup.
  normalSignupTab is stale; don't reuse it. metaTab/assetsTab still exist.
- Local cancellation UX change recognizing attempt_expired has not yet been
  deployed. Last deployed frontend remains dpl_Hi9NCt7826rSxKinWKA3iZnbdTKS.
- Research only (not implemented): official App-Only Install uses
  extras.features=[{name:'app_only_install'}], emits
  FINISH_GRANT_ONLY_API_ACCESS, and uses business granular tokens; incompatible
  with Business App Coexistence. Docs do not establish it will solve this
  already-registered number's eligibility. Do not add it speculatively.
  https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/app-only-install/
- No real messaging, completed registration, full rehearsal or App Review
  submission verified. General customer access still requires review/publishing.

## RAG implementation checkpoint (2026-09-13)

- Added `api/_lib/layla/rag-engine.js`: tenant/revision-scoped cache keys,
  deterministic Tier 0/1 routing, Convex/Redis-compatible adapter seams,
  BM25+dense reciprocal-rank fusion, 0.72 similarity floor, grounded
  generation fallback, six-turn context compaction, and three-second debounce.
- Added `convex/blueKnowledge.ts` and the `blueKnowledgeChunks` table with
  tenant/revision/locale/approval indexes plus Convex text and 1536-dimension
  vector indexes. Published to `quaint-nightingale-675` successfully.
- Added `config/layla-sectors.json`, `config/layla-prompts.md`, and
  `docs/blue-rag-architecture.md`. Knowledge is limited to reviewed
  website/signup facts and tenant-approved FAQs.
- Validation: full `npm test` passed (110 tests), focused Blue suite passed (54
  tests), Convex TypeScript check passed, and production build passed.
- Deployed Vercel production `dpl_7vwWSwC9y2WWsEp1diowVU4E97Jn`, aliased to
  `https://bznsflow-blue.vercel.app`.
- Generated RAG replies remain feature-gated until a model/embedding adapter
  is configured and evaluated; the existing deterministic live messaging
  safeguards remain the default.

## SME standard alignment update (2026-09-13)

- Added deterministic SME helpers for Arabic lexical normalization, heading
  chunking, closed-vocabulary slot extraction, and tenant kNN probability
  vectors in `api/_lib/layla/rag-engine.js`.
- Added the validated tenant contract at `config/tenant-retrieval.schema.json`.
- Extended `blueKnowledgeChunks` with document type, effective date, section
  path, and optional lexical text; added tenant-scoped `blueIntentUtterances`
  with 1536-dimension vectors.
- RRF now keeps the procedure's top three evidence chunks; qualification is
  the only intended generated-answer seam.
- Added regression coverage; focused Blue suite now passes 58 tests and the
  full suite passes 110 tests.
- Convex schema published and Vercel production redeployed as
  `dpl_utYT7m21cb7gX34FGGKGhy1zMTJU`.
- Remaining operational gates are per-tenant onboarding artifacts: owner
  G0 intent approval, 60–80-query golden set, 3-day shadow review, owner
  acceptance, and weekly/monthly feedback reporting before live enablement.

## Sector readiness update (2026-09-13)

- Added `config/layla-sector-packs.js` with explicit deterministic starter packs
  for all 22 primary sectors. Each pack defines 6–10 intents, closed-vocabulary
  slots, bilingual greeting/service/price/human/missing-fact templates, and the
  SME fallback threshold and one-clarification rule.
- Added `tests/blue-sector-packs.test.mjs`; all primary sectors and both
  languages are covered. “Something else” remains the safe generic fallback.
- Blue suite now passes 60 tests. Vercel production redeployed as
  `dpl_Cpvmn8JoVtLirg9nmMeerGPPJYBR`.
- Sector packs are starter behavior, not tenant facts. Each tenant still needs
  owner-reviewed facts, templates, golden queries, and three-day shadow evidence
  before live activation.
