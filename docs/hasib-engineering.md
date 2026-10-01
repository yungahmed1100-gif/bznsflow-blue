# Hasib — project engineering pack

## Ascend real estate release boundary

The live Blue `real-estate` pack uses dedicated workspace and domain records instead of the generic jobs UI. Authorization is server-derived: Catalyst has no Hasib access; Ascend/Apex can enter Hasib, employees are denied manager operations, and all IDs are rechecked against the manager workspace and tenant. The additive tables live in `convex/hasib/workflowSchema.ts`; the capability matrix, workspace authorization, domain state and inbound turn live in `convex/hasib/{capabilities,workspaceState,realEstateState,realEstateTurn}.js`; the dedicated UI is `src/components/hasib/RealEstateDashboard.jsx`.

The medical-clinic production slice is documented in [the clinic engineering pack](clinic-engineering.md). Its code and local tests are additive, but the pack is not live or deployed: SEC-04/Oman disposition, provider/scheduler completion, full load/recovery/acceptance evidence and explicit authorization remain release gates.

Real Estate was released to Blue on 2026-09-28 after additive Convex schema/functions were pushed before the application. Deployment and smoke evidence is recorded in `docs/antigravity/industry-optimization-handoff.md`. An authorized owner should still verify the empty tenant-only workspace after email-code sign-in. Rollback removes `real-estate` from `HASIB_LIVE_PACKS` without deleting records and restores the prior READY Vercel deployment recorded in the handoff.

Current local scope and evidence: [15-industry optimization handoff](antigravity/industry-optimization-handoff.md). Its 2026-09-28 scope/status registry supersedes older scope below; historical deployments do not imply these changes are deployed.

Blue-only. Built from the vault template `Operations/Templates/Project-Engineering-Pack`. Decision:
`Decisions/2026-09-26-Redefine-Hasib-As-SME-Operations-Layer`. Nothing below is verified unless it
has a dated result. **Not deployed.** Schema pushes and deploys need Ahmed's explicit authorization.

## 1. Identity, scope and profile — G0

- **Project:** Hasib, the SME operations layer inside the Layla owner dashboard. Repository `bznsflow-blue`, worktree `Desktop/bznsflow-blue-hasib`, branch `feat/hasib` (from `9afcabc`). Owner: Ahmed (delivery, engineering, security).
- **Outcome:** an activated Layla owner records orders (from a chat or manually), stock, payments and expenses, and sees revenue, profit, cash by method, receivables, top products and lost demand.
  - Baseline: owners use WhatsApp plus paper or spreadsheets.
  - Critical journey: open a chat → *Create order* → confirm → record a payment → the order appears in Insights.
- **Non-goals (v1):**
  - staff logins;
  - payment processing (payments are recorded only);
  - e-invoice submission (Fawtara);
  - clinical records;
  - replacing an accounting ledger (we export instead);
  - POS hardware.
- **Profile:** business application. The clinic pack is high-impact and waits on a SEC-04 review.
- **Data:**
  - customer identity (reused from `blueContacts`);
  - order lines, amounts and payment references;
  - expenses, including receipt images later.
  - Tenants are accounts; jurisdiction is Oman first. Money is stored as integer baisa (OMR has 3 minor units).
- **Volume assumption (to verify with the pilot):** ≤ 200 orders/day per tenant, ≤ 2,000 variants, ≤ 50 expenses/day.
- **Open questions:**

  | Question | Owner | Blocks | Due |
  |---|---|---|---|
  | Legal retention period for tax records versus contact deletion | Ahmed + adviser | release to a VAT-registered tenant | before G2 |
  | Ascend vs Apex tier placement | Ahmed | public claims | pricing review 2026-10-07 |

## 2. Layer map and decisions — G1

```
L1  /layla/dashboard?tab=orders|stock|expenses|insights  →  /api/layla-meta?surface=hasib
    (exact Blue host/origin, __Host-blue_account session, CSRF double-submit, per-action body caps)
L2  api/_lib/hasib/hasib-api.js validates → Convex POST /blue-hasib (service bearer)
    → hasib:execute → resolveTenant(sessionHash) → convex/hasib/*State.js
    domain (pure): convex/hasib/{money,totals,orderMachine,stock}.js, config/hasib-packs.js
L3  Convex tables hasib* (accountId-scoped). Customer = blueContacts. Catalog link = blueCatalogEntries.entryKey
L4  (P2+) crons: rollups, reconciliation, digest. (P7) outbound through the campaign engine, gated
```

- **Authority:**
  - Hasib owns items, variants, stock, orders, payments and expenses.
  - `blueContacts` owns the customer identity.
  - Layla's catalog owns the customer-facing wording.
  - An item may link to one catalog `entryKey`; the link runs one way (Hasib reads it).
- **Tenant identity:** only from the verified session hash. Every client-sent id is checked with `owned()` against the account and its table.
- **New components, and why:**
  - No new Vercel function: the 11/12 quota is used, so a new surface goes on the existing router.
  - One Convex HTTP route and a set of tables. The Convex backend is already the Blue store (`docs/backend-migration-state.md`). Adding a Supabase store was rejected.
- **Invariants and concurrency:**
  - Convex mutations are serializable, so stock and order changes run in one mutation per operation.
  - Order numbers come from a per-account counter incremented in the same mutation.
  - Creates are idempotent by `requestId`.
  - Updates carry `version`.
- **Failure path:** the API reports only the strongest confirmed status. A repeated `requestId` returns the original order instead of creating another.

## 3. Budgets

| Budget | Value / owner |
|---|---|
| API body | 6 KB default; 40 KB for order create / item save |
| Page sizes | lists 25 (max 50); order lines ≤ 50; variants per item ≤ 50 |
| Reads per mutation | bounded `take()` on every query; no unbounded `collect()` on tenant tables |
| Model use | none in P1–P3. Numbers never come from a model |
| Spend | no new paid provider |

## 4. Cache register

None. Convex queries are authoritative; the UI polls through `usePolling`.

## 5. Effects register

No external effects in P1–P4. P7 (receipts, status messages, recalls) reuses the campaign engine's
idempotency, consent, opt-out and retry rules, and needs approved utility templates.

## 6. Control register

| Controls | Status | Evidence |
|---|---|---|
| APP-01 domain/adapters split | implemented-unverified (local tests pass) | `convex/hasib/{money,totals,orderMachine,stock}.js` have no DB/HTTP imports; `tests/hasib-domain.test.mjs` |
| APP-02 contracts | implemented-unverified | `api/_lib/hasib/validate.js` allow-lists; Convex validators in `convex/blueHasib.ts`; `tests/hasib-api.test.mjs` |
| DATA-01 isolation, money as minor units | implemented-unverified | two-tenant, foreign-id and wrong-table tests in `tests/hasib-orders.test.mjs`; integer baisa throughout |
| DATA-02 invariants | implemented-unverified | requestId idempotency, `version` conflict, all-lines precheck before any write, ledger = on-hand tests |
| DATA-04 schema evolution | implemented-unverified | additive tables only; no backfill; old code ignores them |
| SEC-01 authN/Z, CSRF, origin | implemented-unverified | same handler pattern as the dashboard; boundary tests in `tests/hasib-api.test.mjs` |
| SEC-02 uploads | not-applicable until receipt upload (P2) | — |
| SEC-03 AI boundary | not-applicable (no model) | — |
| SEC-04 data governance | planned; retention is an open question | §1 |
| SQLi self-test (`bznsflow-sqli-testing`) | not-applicable | Convex document API; no SQL is built from input |
| REL/OPS | implemented-unverified | flag `BLUE_HASIB_ENABLED` (build guard in `scripts/check-blue-environment.mjs` requires the dashboard) plus durable gate `blueHasib:setEnabled`; rollback = flag off |

## 7. Build and release evidence — G2

**Local only, 2026-09-26, worktree `feat/hasib` on `9afcabc` plus uncommitted changes. Not run against live Convex, Vercel or Meta.**

- `npm test`: existing suites 187/187; `npm run test:hasib` 36/36 (domain 12, orders 16, API 5, strings 3).
- `npx tsc -p convex/tsconfig.json` and `npm run typecheck` pass. `npm run lint` shows 0 errors; the 12 warnings are all in files Hasib did not create. `npm run build` passes, including the Blue isolation and drift gates.
- `node tests/hasib-dashboard-browser.mjs <dev-url>`: 150 assertions at 1440/1280/1024/768/375/320 in English and Arabic, against a synthetic API with all non-local requests aborted. Covered:
  - Stock list and adjustment; Orders list; the composer's product search, totals and a double-click that still creates one order; a payment sent in baisa;
  - chat → prefilled order with the hand-off parameter consumed; the RTL rail;
  - no horizontal overflow, and zero serious/critical axe violations.
  - Screenshots go to the ignored `work/hasib-dashboard-browser/`.
- Fixed during verification: an axe contrast failure on the blue status chip, a bidi-scrambled Arabic currency, the phone toolbar checkbox being stretched by the dashboard's input rule, and an Archive button placed outside the modal (unreachable).
- Security review (read-only, 2026-09-26): no critical or high findings. Two medium findings, both fixed with tests: (1) a rejected `order_create` could still link a chat to a contact because the link ran before validation; it now runs only after every check. (2) Payment references were left on contact deletion; they are now cleared.
- `convex/_generated/api.d.ts` is **not** regenerated. The HTTP route calls `(internal as any).blueHasib.execute`, as `/blue-catalog` already does; `convex deploy` regenerates it.

**Known limits:**
- No Expenses/Insights yet (P2). Their modules are `planned` and hidden.
- Contact search by product uses the Convex search index (prefix tokens), not fuzzy matching.
- The item list refreshes by polling.
- The owner-typed customer name, delivery area, notes and custom fields are removed from orders when the contact is deleted; amounts stay.

## Retail MVP — P2, P3 and retail P4 (2026-09-26, local only)

**What was added.**
- **Expenses:** categories come from the pack; an entry is voided, never deleted; each expense is dated in business time (Muscat midnight).
- **Insights:**
  - figures: sales, revenue without VAT, cost of goods, gross profit, operating costs (stock purchases excluded and shown separately), net profit, cash by method, money owed, best sellers, stock value, low/out-of-stock counts, buyers/returning/walk-in;
  - periods: today, 7 days, 30 days, this month, last month.
- **Demand signals:** Layla's ingest records a PII-free signal when a customer asks about a product, with the stock on hand at that moment. The report shows most wanted, asked while out of stock, asked but didn't buy, and asked for but not in your products.
- **Retail orders:** a ready-by date (pre-orders and made-to-measure), a deposit taken at order time, Copy receipt (AR/EN) and Exchange (return + a new order for the same customer).
- **Exports:** accountant CSVs for orders and expenses (formula-injection-safe).

**Design choices.**
- A demand signal matches a product only by exact or contained name (Arabic-normalised), never one shared word.
- A failure inside the demand hook is caught and logged in Layla's ingest. Hasib cannot stop Layla replying; there is a test that forces the failure.
- `src/lib/timezone.js` now holds the pure timezone helpers (previously `api/_lib/layla/timezone.js`, which re-exports it), so browser code no longer imports from the server folder.

**Evidence (local, 2026-09-26).**
- `npm test`: 187/187 existing; `npm run test:hasib` 46/46.
- Both type-checks pass. Lint has 0 errors; the 12 warnings are all in files Hasib did not create. `npm run build` passes.
- `tests/hasib-dashboard-browser.mjs` (synthetic API): 150 assertions.
- `tests/hasib-demo-browser.mjs` against `scripts/hasib-demo.mjs`, where **the real Convex state code** runs on an in-memory database: 72 assertions.
  - Insights at 5 widths × 2 languages, with no overflow, zero serious/critical axe violations and no page errors.
  - An expense added in the UI moves operating costs and net profit by exactly its amount.
  - A UI sale moves sales by 8.000 and gross profit by 5.000.
  - A live chat becomes a prefilled order.
  - Sold-out sizes are flagged on a phone.

**Demo.** `npm run build && npm run demo:hasib`, then open `http://localhost:5310/layla/dashboard?tab=insights` (English under `/en/...`). It seeds 30 days of a fictional Muscat abaya boutique ("Noor Abayas"), with chats and orders replayed in true time order. It is local only, sends nothing, and the demo data is invented; it is not a client record.

**Known limits.**
- The demand report works at item level, not size level: Layla captures the product, not the size.
- There are no receipt photo uploads yet (SEC-02 applies before adding them).
- COD courier settlement is not built yet; receivables cover unpaid COD.
- Insights reads at most 3,000 orders per period and flags when it hits that cap; daily rollups come only after a measured need.

## Blue rollout — 2026-09-26 (authorized by Ahmed)

**Sectors ship one by one.** Only `retail` is live (`HASIB_LIVE_PACKS`). An owner whose Layla sector isn't live
sees one Hasib entry with an industry picker. Choosing Retail stores `hasibSettings.packId`; Layla's profile sector is
never written (commit `a51d0c2`).

| Step | Result | Evidence |
|---|---|---|
| Pre-flight | passed | `npm test` 187/187; `test:hasib` 51/51; both type-checks pass; lint 0 errors; build passed; browser 158 + real-logic demo 72 assertions |
| Convex push `npx convex dev --once` → `dev:quaint-nightingale-675` | done | added only `hasib*` tables and 21 indexes; no existing table or index changed; types regenerated (`b27d6bb`) |
| Durable gate `blueHasib:setEnabled {enabled:true}` | done | on Ahmed's explicit instruction; `blueMessagingSettings` key `hasib` enabled |
| Vercel env `BLUE_HASIB_ENABLED=true` (production, `bznsflow-blue` only) | done | env id `pfUQyOH5CyhehUhE` |
| `npm run deploy:blue` | done | `dpl_4QdjLrkyw3LG2X8iJcMD3nNvaVAB` READY, current Blue production |
| Checks on https://bznsflow-blue.vercel.app | passed | unsigned `GET ?surface=hasib` → 401 `sign_in_required`; foreign-origin POST → 403 `origin`; `/layla/dashboard` → 200; dashboard API still 401 unsigned |
| Green unchanged | passed | `bznsflow-main` production `dpl_GKSMjpoKhpdZTFHsGqVGVopYK5Nz` before and after |

**Current state:** live on Blue, **per plan**. Hasib opens only for accounts holding an active Ascend or Apex grant in `blueEntitlements` (commit `4c03fe8`); everyone else sees Layla only. Retail is the only live pack.

- **Grants:** `npx convex run blueHasib:grantPlan '{"email":"…","plan":"ascend","packId":"retail"}'`; end one with `blueHasib:revokePlan '{"email":"…"}'`. Revoking keeps the business records.
- **2026-09-26:** on Ahmed's request, `ahmed@bznsflowai.com` was granted **Ascend** with the retail pack. On live Blue, the overview for that account returns plan `ascend`, pack `retail`, no setup step, modules orders/stock/expenses/insights/demand, and variant options size/length/colour. Layla's sector for the account stays "Technology & software".

**To switch it on:** run `npx convex run blueHasib:setEnabled '{"enabled":true}'` in this repo. **To switch off:** the same command with `false`. For a full rollback, also set `BLUE_HASIB_ENABLED=false` and run `npm run deploy:blue`, or roll back to `dpl_FANGbGk9T9jnbfgTXvp52a7EQwtp`. No data is deleted.

## Tech-store pack — 2026-09-26

`retail-tech` ("Electronics and phone store") is the second live pack. It covers:
- IMEI/serial stock: one row per unit, and on-hand always equals the units in stock;
- warranty from the store or the official agent, with lookup by IMEI;
- trade-ins into used stock at their own cost;
- repair tickets, whose quote, parts and deposit live on a linked order;
- a Service tab, and "Change industry" to switch between live packs.

Commits: `4ae4506` (backend), `8e701ed` (UI).

- **Evidence (local):** `npm test` 187/187; `test:hasib` 65/65; browser checks: 158 synthetic, 72 fashion real-logic and 50 tech real-logic (`tests/hasib-tech-browser.mjs` against `node scripts/hasib-demo.mjs 5311 --pack=retail-tech`).
- **Blue Convex:** pushed. It added only the `hasibSerials`, `hasibTradeIns` and `hasibRepairs` tables with their indexes, plus optional fields. `ahmed@bznsflowai.com` still has plan `ascend`, pack `retail`, and live packs `retail` and `retail-tech`.
- **Blue frontend:** the deploy was **blocked by the session's permission classifier**. Ahmed runs `npm run deploy:blue`. Until then, Blue runs the earlier frontend (`dpl_4QdjLrkyw3LG2X8iJcMD3nNvaVAB`), which is compatible with the new backend.

## Rollout order (each step needs authorization)

1. Push the Convex schema/functions to `quaint-nightingale-675`.
2. Run `blueMessagingSettings` `{key:'hasib', enabled:true}` through `hasib:setEnabled`.
3. Set `BLUE_HASIB_ENABLED=true` in Blue Vercel, then run `npm run deploy:blue`.

## Industry release state — 2026-09-28

Retail/fashion, electronics/phones, and dental are live for real tenant data. Ahmed can switch among live dashboards from the founder-only dashboard selector; the server authorizes that capability from the authenticated normalized email. Regular customers select their industry only in Business Setup. Built industries that have not been released remain read-only previews with empty data, and pending industries cannot be opened.

**Rollback:** turn the flag off and redeploy. Never delete order, payment or stock-move rows as a rollback.

## Live dashboard interaction standard — 2026-09-29

The four live packs use reusable `DashboardVisuals` primitives for page identity, icon actions, metric cards, accessible horizontal charts and strong empty states. Important operations remain ordinary allow-listed Hasib operations; the visual layer does not add a new API or dependency. Query-state actions are bounded (`create=1` and named `action` values), so a dashboard action can be linked and tested without trusting a client-supplied tenant, role or operation name.

Real Estate's overview response is additive and tenant scoped: stage pipeline, listing availability/freshness, viewing status, offer status and approval counts. Existing `counts` and task records remain available. Empty dashboards show guidance and an authorized action, never synthetic records.

Deployment `dpl_4FroRb8TVYoF946eTpiETYurga2v` is READY on Blue. Both Blue Convex targets were updated first, with no index deletion. Final evidence: Hasib 213/213, Blue 192/192, full verification/build green, and 258 dashboard browser assertions across the four live packs, Arabic/English and 320–1440px. Roll back the UI to `dpl_5xtkcpFQCnNz1XEhwe51mzKWamU5`; preserve all tenant data and correct Convex forward.

## Construction operating pack — 2026-09-29

Construction is the fifth live Blue pack and uses a dedicated domain/dashboard rather than the generic jobs presentation. It includes versioned projects and baselines, milestones/progress/worker hours, actual and forecast cost, manager-controlled variations/commitments/claims/retention, aggregate site safety reporting, quality/NCR, risks, experience, tasks, actor audit history, one manager plus five employees, and manager-only aggregate Money/Insights. Today shows exactly schedule risk, submitted variation exposure, and overdue certified receivables.

Release evidence and rollback are owned by [`docs/construction-engineering.md`](/Users/ramsis21/Desktop/bznsflow-blue/docs/construction-engineering.md). Deployment `dpl_4v9qbw53sn8gTfSdSj4aMigYEt9H` is READY at the Blue alias; immediate rollback UI is `dpl_3ENSivCTsw2CopSt949hBQUmiDF7`. Clinic remains outside `HASIB_LIVE_PACKS`.
## Dental pack — 2026-09-28 (merged and live on Blue 2026-10-01)

> **Status 2026-10-01:** merged into `hardening/live-dashboards` (`8293408`), Convex pushed to `dev:quaint-nightingale-675`, deployed to Blue (`dpl_59qia4ViCrXdbTfVswXvCw7H9fVR`). No live account used dental, so no text shortening was needed. Hardening and the front-desk rules: [docs/hardening/dental.md](hardening/dental.md). The rollout steps below are historical.

Built from Ahmed's "Dental Clinics Hasib Tabs" spec. Worktree `Desktop/bznsflow-blue-dental`, branch `feat/hasib-dental` from `a34b6d8`. It was built apart from `feat/instagram-channel` because another session was changing the same Hasib files there (a restaurant pack, uncommitted), so expect merge conflicts in `config/hasib-packs.js`, `convex/hasib/{hasibState,todayState,ordersState}.js`, `api/_lib/hasib/validate.js` and `src/lib/hasib/strings.js`.

**Decisions (Ahmed, 2026-09-28).**
- Dental is live in the industry picker, next to Retail and Electronics.
- Dental chat text is kept for 24 hours, then erased. The captured fields stay.

**What a dental owner sees.** The seven approved tabs, all built from records BznsFlow holds. Section ids don't change; only labels and views do, so retail and electronics are untouched.
- **Today:**
  - service requests: a service Layla captured in the last 14 days with no visit recorded since, each opening its chat;
  - chats handed over, visits with money owed, low supplies;
  - Layla at reception: replies, appointment requests, service questions, price questions and handoffs, counted from a new `blueMessages.topic` field that holds the router intent only, never text;
  - recorded revenue, cash received, owed to you;
  - a clinic setup checklist.
- **Chats:** a "Captured by Layla" strip (service, preferred time, branch, consent). Record visit prefills the patient, the treatment line and the visit date (`src/lib/hasib/visitDate.js`: only clear dates) for the owner to check.
  - Shops don't get this button; Layla files their orders herself (`d1f29e7`).
- **Visits:** Hasib orders relabelled (Booked, Done, Refunded). A visit is always in the clinic, has no notes, and its `visit_date`/`branch` fields are type-checked on the server.
- **Services:**
  - Treatments: Layla's catalog, still the one place to edit a treatment and its price. `convex/hasib/serviceSync.js` mirrors approved services into Hasib service items one way, so visits can charge them and Money can rank revenue by service.
  - Supplies: stock-tracked products. They are internal: never published to Layla's catalog, never quoted or ordered from chat. Switching to Dental archives any stock entries a shop had published.
- **Money:** revenue, expenses, net profit, cash by method, owed to you, and revenue by service (no per-service profit, no stock tiles). Expense categories are dental ones (supplies, lab fees, equipment), with no stock purchases or delivery.
- **Patients:** the contact list relabelled, with visits and balance per patient. No mass messaging.
- **Settings:** a new Accounts and VAT view for every Hasib industry. It holds VAT, business time zone, expense categories and change industry. Before this, no UI edited VAT.

**No clinical free text.**
- **24-hour text:** `textRetentionFor` in `convex/blueContacts.js` keeps text 24 hours when Layla's sector or the Hasib industry is dental.
  - Choosing Dental immediately shortens the account's text through `shortenClinicalText`, newest first, up to 2,000 messages in that change. It is bounded and idempotent.
  - `blueHasib:shortenDentalText {email}` does the same for an account from the operator side.
- **Refused inputs:**
  - Owner edits and imports of a sensitive pack's fields must be something Layla could capture: a listed option, an approved catalog name, a known place, or a bounded date or time.
  - Visit notes are refused rather than silently dropped.

**Fixed along the way.**
- A service item could count as "low stock" in the overview and on Today; both now use `trackedLow`.
- `stockSync` no longer overwrites a Layla catalog entry it doesn't own.

**Evidence (local, 2026-09-28).**
- `npm test`: Layla 167/167, Blue 191/191, Hasib 144/144, including the new `tests/hasib-dental.test.mjs` (14 tests).
- Both type-checks pass. Lint has 0 errors and 12 warnings, all pre-existing. `npm run build` passes.
- `tests/hasib-dental-browser.mjs` against `node scripts/hasib-demo.mjs 5312 --pack=dental`, a fictional "Bayan Dental Clinic" with invented data and no clinical text: 267 assertions.
  - Covers every screen at 1440/1024/768/375/320 in English and Arabic: only the seven tabs, no overflow, zero serious/critical axe issues, no page errors.
  - Flow: Today → a request → chat → Record visit (prefilled, no notes, no delivery) → revenue moves by exactly the visit, cash by exactly the payment, and the request clears.
  - Also checks the Accounts and VAT save.
- Regression browsers:
  - retail real-logic 87;
  - electronics real-logic 51;
  - synthetic Hasib dashboard 256 (this caught the chat-button regression above, since fixed);
  - synthetic Layla dashboard 94.

**Independent security review (read-only, 2026-09-28).** No critical or high findings. One medium finding, fixed with a test: switching to Dental shortened the oldest messages first, so on a busy account the newest (still visible) text could outlive 24 hours. It now goes newest first.

**Known limits.**
- The Treatments editor is Layla's existing catalog manager. The local demo doesn't serve its API, so the browser test only checks that the view renders cleanly.
- The captured `location` is the patient's area or "branch visit", not a named branch; it prefills Branch only when it names a place.
- A refund on a visit that isn't marked Refunded leaves the refunded part showing as owed. This is existing Hasib behaviour for every industry.
- Custom visit lines ("Other charge", 120 characters) are the one remaining owner-typed text field. They're kept because the spec lists treatment charges.

**Rollout (each step needs Ahmed's authorization).**
1. Merge with the restaurant work.
2. `npx convex dev --once` to `quaint-nightingale-675`: one optional field (`blueMessages.topic`) plus new functions; no new tables or indexes.
3. `npm run deploy:blue`.
4. For any account that already chats as a dental clinic, or has more than 2,000 messages in 30 days: `npx convex run blueHasib:shortenDentalText '{"email":"…"}'`, repeated with `before` set to the returned `next` until `next` is null.

**Rollback:** remove `'dental'` from `HASIB_LIVE_PACKS` and redeploy. Visits, payments and supplies are kept.
