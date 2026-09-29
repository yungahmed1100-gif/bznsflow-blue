# Catalyst dashboard — hardening record

Catalyst is the plan sold today: Layla on WhatsApp and/or Instagram, with Chats, Customers and Settings. Server capabilities (`convex/hasib/capabilities.js`): chats, customers, customerDelete, humanHandoff, businessDetails, channelsSetup. No Hasib, Today, Money, Team, exports, imports or broadcasts.

Baseline: commit `2a71a4b` (production tree `dpl_FsR7czuKkGvFrHorivQVLc46QCKq`). Branch `hardening/live-dashboards`.

## How it was tested

- **Real-logic journeys:** `tests/catalyst-journeys.test.mjs` and `tests/blue-owner-replies.test.mjs`, which run the production Convex state code on in-memory Convex.
- **Real-logic browser:** `tests/catalyst-browser.mjs` against `scripts/hasib-demo.mjs --plan=catalyst`. Chats, replies, takeover and customer edits all go through the real state code. 197 assertions: English/Arabic, 320/768/1440px, Axe serious/critical, overflow, page errors and refused API calls.
- **Existing suites:** `npm run verify` (lint, typecheck, 167 + 200 + 243 tests, build) and `npm run test:browser` (4 synthetic suites, 294 dashboard assertions).

## Function inventory

| Area | Function | API → state | Plan / role | Result |
|---|---|---|---|---|
| Nav | Sections shown | `dashboardMap` | Catalyst: Chats, Customers, Settings | Pass; gated tabs fall back to Chats |
| Nav | Deep link highlights the right tab | `resolveTab` | all | **Fixed** (was stuck on Chats after hydration) |
| Chats | List, search, channel filter, load more | `dashboard: conversations` | all | Pass |
| Chats | Open thread | `dashboard: thread` | all | Pass |
| Chats | Export all / export chat | `export_account`, `export_chat` | exports (Ascend+ manager) | **Fixed**: hidden for Catalyst; server refuses `plan_required` |
| Thread | Leave this chat for me (takeover) / hand back | `messaging: takeover`, `resume_conversation` | humanHandoff | Pass |
| Thread | Owner reply (double-click safe) | `messaging: manual_reply` | all | Pass; **fixed**: a queued owner reply was cancelled by the owner's next reply, a takeover, a hand-back, a pause or a customer asking for a person. A reply from the owner's phone, an opt-out, an unsend or a disconnect still cancel it. |
| Thread | Window closed | — | Catalyst / Instagram: wait message; Ascend WhatsApp: template | **Fixed**: Catalyst saw a disabled template button; Instagram was told "WhatsApp only allows a template" |
| Customers | List, search, status filter | `dashboard: contacts` | all | Pass |
| Customers | Edit name / lead details / status override | `contact_update` | all | Pass |
| Customers | Delete (confirm) | `contact_delete` with `confirm: true` | customerDelete, manager | Pass; without confirmation → `confirmation_required` |
| Customers | Import / export | `import_contacts`, `export_*` | imports / exports | Hidden for Catalyst; server refuses; gate now unit-tested (`convex/blueDashboardGate.js`) |
| Header | Check connection, Pause/Resume Layla | `messaging: state`, `pause`, `activate` | all | Pass (real logic); provider check verified live |
| Settings | Channels: WhatsApp status/disconnect, Instagram connect | `messaging`, `instagram` surfaces | channelsSetup | **Live check pending** (provider calls not in demo) |
| Settings | Business details | `customer` surface | businessDetails | **Live check pending** |
| Background | Hasib polling | `hasib` | operations only | **Fixed**: Catalyst polled Hasib every 60 s for a 403 |
| Errors | Owner-facing refusal messages | `src/lib/dashboard/strings.js` | — | **Fixed**: 18 codes (plan_required, manager_required, session_expired, …) fell back to a generic "try again" |
| Layla | Intent routing eval | `scripts/eval-intents.mjs` | — | **Fixed**: 99.0% → 100% macro-F1 (Arabic "what dishes are on your menu?") |

## Review

- **Code review:** found one CRITICAL in the first fix. Exempting owner replies from the conversation fence let a dashboard reply go out after the owner had already answered from their phone. Fixed as follows:
  - phone replies and platform takeovers use `native_reply`, which is not owner-safe;
  - the conversation fence is restored;
  - the owner's own dashboard actions and customer handoffs re-stamp only that owner's waiting replies (`restampOwnerReplies`, scoped to the conversation's last 24 hours).
  Re-review closed it.
- **Security review:** no cross-tenant path, and no way to create an owner-authored job except the authenticated `manual_reply`. The gate refactor is behaviour-identical. The MEDIUM (platform opt-out labelled `human_takeover`) is fixed to `contact_opted_out`.
- **Convex typecheck:** now part of `npm run verify` (`typecheck:convex`). It caught a type error the old verify missed.

## Open for the live test (step G)

- Signup: email code, session expiry and sign-in again.
- WhatsApp: connect, check connection, activate, pause, disconnect.
- Instagram: connect and DM.
- Business details: save and approve.
- A real inbound → Layla reply → receipt → takeover → owner reply → receipt, on Ahmed's own numbers and accounts.

## Found for later dashboards

- `api/_lib/layla/blue-messaging.js` resolves the tenant from `account.draftHash`, while the dashboard API uses `account.workspaceDraftHash || account.draftHash`. An invited employee's replies and takeovers may therefore target their own empty draft. To be checked with the team packs (Real Estate, Construction, Automotive).
- A "BLUE · Production is unchanged" banner (`src/layouts/RootLayout.jsx`) is shown to every visitor, including paying customers. Awaiting Ahmed's decision.
