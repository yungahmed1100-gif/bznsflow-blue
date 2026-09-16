# Layla dashboard after activation — engineering pack (2026-09-14)

Blue-only. **Deployed 2026-09-14 with authorization** — commits `45ed72b` and
`5100f51`, Convex schema pushed to `quaint-nightingale-675`, deployment
`dpl_ESnM3qtXvc8qbaZzRAoeCkQ52A4Q` READY on the Blue alias. The durable Convex
`broadcast` gate remains **off** and no live send has happened.

> This line read "not deployed" until 2026-09-16. It was written in `45ed72b`,
> the very commit that was then deployed, and never updated — while
> [SESSION-CHECKPOINT.md](SESSION-CHECKPOINT.md) recorded the deployment in a
> later commit. Two docs in the repo disagreed about whether this shipped.

Further gate changes, another Convex schema push and the Meta review rehearsal
(which sends one real marketing template) each still need Ahmed's explicit
authorization.

## Scope

After activation the setup page shows "Layla is active" / "تم تفعيل ليلى" and
opens `/layla/dashboard` or `/en/layla/dashboard`. The dashboard has a fixed
start-side navigation (Broadcast, Chats, Contacts; Chats is the default), a
header with business identity, connection health, Check connection and global
Pause/Activate. The embedded setup inbox (`BlueInbox`) is removed; the setup page
keeps a small activation panel.

Out of scope for this release: team roles, saved segments, CRM sync, analytics,
creating templates in BznsFlow, media messages, one owner per account only.

## Interfaces

| Surface | Path | Authority |
| --- | --- | --- |
| Dashboard API | `GET/POST /api/layla-meta?surface=dashboard` (`api/_lib/layla/dashboard-api.js`) | `__Host-blue_account` session → account draft hash; CSRF double-submit; exact Blue host/origin |
| Conversational controls | existing `surface=messaging` (+ `check_connection`) | unchanged, reused by the dashboard |
| Convex dashboard | `POST /blue-dashboard` → `blueDashboard:execute` | service bearer; tenant resolved from `sessionHash` inside Convex (`convex/blueTenant.js`) |
| Convex campaign worker ops | `POST /blue-campaign` → `blueCampaign:execute` | service bearer; worker only |
| Worker | existing `/api/layla-meta-worker` with `campaignStartId` / `campaignJobId` | `BLUE_MESSAGING_WORKER_SECRET` |
| Cron | `start and recover Blue campaigns` every minute | `blueCampaign:maintain` |

No new Vercel function was added (quota). A client never supplies an account,
integration or tenant id; ids it sends (conversation, contact, campaign) are
re-checked against the resolved account and their Convex table.

## Data

New tables: `blueContacts`, `blueConsentBatches`, `blueBusinessSettings`,
`blueTemplates`, `blueCampaigns`, `blueCampaignRecipients`. Additive fields:
`blueConversations.contactId` (optional, lazily linked), `blueMessages.errorCode`
and indexes `by_contact`, `by_conversation_at`.

- **Contacts** are per account, keyed by wa_id. Name priority: owner edit →
  customer-provided name → WhatsApp profile name → formatted number.
- **Deletion** removes names, number, fields, chat text and conversations and
  strips campaign snapshots. It keeps a PII-free tombstone: an account-scoped
  HMAC-SHA256 of the number (`convex/hash.js`, keyed by
  `BLUE_REVIEW_SERVICE_SECRET`) and the opt-out flag. In-flight/ambiguous send
  rows keep status without text so they stay reconcilable. **Rotating the service
  secret breaks opt-out matching for deleted contacts; rotate only with a
  re-keying plan.**
- **Retention:** new message text 30 days (was 7), message rows 30 days,
  campaign recipient snapshots 30 days, contacts until owner deletion. Expired
  text is never restored.
- **Migration:** safe and lazy. Conversations are linked on first dashboard read;
  `blueDashboard:migrateContacts` links the rest in batches of 50 and
  `blueDashboard:migrationStatus` reports completion.

## Qualification

`config/layla-qualification.js` defines required bilingual fields and grouped
prompts for all 22 sectors (plus "other"), exposed on each sector pack as
`qualification`. Deterministic only: closed vocabularies, approved catalog names,
bounded date/budget/timeline/area/quantity patterns. Layla answers first, then
appends up to three questions from the first group with missing required fields.
Short replies fill a single outstanding asked field only if the question is under
a day old and the reply is not filler. Unanswered questions are not repeated for
30 minutes; each field is asked at most twice. Qualified = all required fields
present; owners can override. Medical, legal and finance packs have no free-text
fields and never capture contextual text. Owner-entered values are never
overwritten by messages. Questions are not added to handoff acknowledgements,
except the booking-request ("disabled") acknowledgement.

## Broadcast controls

- Sync reads `GET /{waba}/message_templates?status=APPROVED` and keeps
  MARKETING only. Media headers, dynamic URL/copy-code buttons and carousel-style
  components are shown but not sendable. Header `{{1}}` and body `{{1}}` are
  distinct variables (`header:1`, `body:1`).
- Recipients need granted, unrevoked consent and no opt-out. Manual entry and
  CSV/XLSX import (column mapping, preview, sample file, 1,000 rows, pages of 100)
  never send; one batch attestation (source, date, purpose) is copied to each
  contact. Opt-outs are preserved and owner names are not overwritten.
- Cap: 100 recipients and the portfolio allowance
  (`whatsapp_business_manager_messaging_limit`, unknown → 0) minus accepted sends
  in the last 24 hours.
- Scheduling converts business-local time with the IANA zone (DST gaps refused),
  up to 30 days ahead. Template, mapping and resolved parameters are frozen per
  recipient. Cancellable while `scheduled`/`starting`.
- Start revalidates connection health, template APPROVED+MARKETING and allowance.
- One recipient job per contact; one in-flight send per campaign; 20 sends/minute
  per number (separate counter keys). Only throttling codes 4, 80007, 130429,
  131056 retry (30s, 2m, 8m, max 3 attempts). 5xx/timeouts/missing ids are
  ambiguous and never retried. Template paused/disabled/missing or token errors
  stop the campaign. Receipts reconcile by callback intent or message id, never
  downgrade, and store failure codes (for example 131049).
- A new opt-out ("stop", `user_preferences`, or the "Stop promotions" button)
  blocks every unclaimed job and closes the send gate for an in-flight one.
- Campaign failures never touch `blueMessagingControls`; chat replies keep their
  own queue, limits and pause state.

## Gates and rollout order (requires authorization)

1. Deploy Convex schema and functions to `quaint-nightingale-675` only.
2. Run `blueDashboard:migrateContacts`; confirm `blueDashboard:migrationStatus`
   reports `complete: true`.
3. Set `BLUE_DASHBOARD_ENABLED=true` in Blue Vercel; deploy frontend/API with
   `npm run deploy:blue`. Build guard refuses the flag without isolated storage.
4. In WhatsApp Manager for the Blue test WABA, confirm at least one APPROVED
   MARKETING template. Sync it from the dashboard.
5. Enable Broadcast: `blueCampaign:setBroadcastEnabled {"enabled": true}` and
   `BLUE_BROADCAST_ENABLED=true` (guard requires dashboard, live messaging and the
   worker secret), then redeploy.
6. Meta App Review rehearsal with Blue test assets: activate → dashboard → real
   inbound → takeover → qualified contact → one approved marketing template to one
   consented test recipient.

## Rollback

- Broadcast: `blueCampaign:setBroadcastEnabled {"enabled": false}` (stops
  scheduled/starting/processing campaigns), then `BLUE_BROADCAST_ENABLED=false`.
- Dashboard: `BLUE_DASHBOARD_ENABLED=false` and redeploy; setup and Layla's
  replies are unaffected.
- Never delete contacts, tombstones, recipient rows or ambiguous records as
  rollback. Additive schema fields stay; older code ignores them.

## Verification evidence (local, 2026-09-14)

- `npm test`: legacy suites pass; Layla 110/110; Blue 96/96, including new
  `blue-qualification`, `blue-dashboard`, `blue-contacts-import`,
  `blue-campaigns` and gate tests (tenant isolation for contacts, messages,
  exports, campaigns and templates; deletion tombstones; retention; takeover and
  no replay; 24-hour blocking; CSV/XLSX normalization, duplicates, consent,
  opt-outs, 100 cap and allowance; template filtering, parameters, scheduling,
  cancellation, start revalidation, retries, ambiguous outcomes and receipt order).
- `npx tsc -p convex/tsconfig.json` passes; `npm run build` passes (15 pages,
  dashboard routes noindex and data-free, absent from the sitemap).
- `node tests/layla-dashboard-browser.mjs <dev-url>`: 80 assertions at 320, 375,
  768, 1024, 1280 and 1440 px in English and Arabic — sign-in and setup redirects,
  three panes vs phone drill-down, RTL rail, optimistic takeover switch, 24-hour
  composer blocking and template action, Broadcast wizard, activation dialog and
  navigation, return from sign-in, no horizontal overflow, zero serious/critical axe violations. Every one of the 22 sector packs reaches Qualified from Arabic and English answers; XLSX import is read through the same mapping.
  Screenshots in ignored `work/layla-dashboard-browser/`. Synthetic API only.
- Meta API shapes (template listing, portfolio messaging limit, 131049, US
  marketing non-delivery) were checked against current Meta developer docs.

## Known limits and residual risks

- Not verified against live Convex, Vercel or Meta. Contact search relies on the
  Convex search index plus a 500-row recent scan for number fragments.
- PDF export uses the browser print dialog (correct Arabic shaping); the ZIP
  contains CSV plus printable HTML transcripts, not PDF files.
- `+1` numbers are warned, not blocked, because US and Canada share the code.
- Five-second polling remains; `usePolling` isolates components so Convex
  subscriptions can replace it.
- Signed-in owners are not separately rate-limited on dashboard reads; bodies,
  pages and import sizes are bounded.
- `convex/_generated/api.d.ts` was updated by hand for local type-checking;
  `convex deploy` regenerates it.
- Link/focus blue is `#2f6ea3` and status green `#22603f` (darker than the brand
  annotation tokens) to meet WCAG AA on paper grounds.
