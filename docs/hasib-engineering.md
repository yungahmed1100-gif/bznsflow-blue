# Hasib — project engineering pack

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
| Durable gate `blueHasib:setEnabled {enabled:true}` | **not done** | blocked by the session's permission classifier; Ahmed runs it himself (see below) |
| Vercel env `BLUE_HASIB_ENABLED=true` (production, `bznsflow-blue` only) | done | env id `pfUQyOH5CyhehUhE` |
| `npm run deploy:blue` | done | `dpl_4QdjLrkyw3LG2X8iJcMD3nNvaVAB` READY, current Blue production |
| Checks on https://bznsflow-blue.vercel.app | passed | unsigned `GET ?surface=hasib` → 401 `sign_in_required`; foreign-origin POST → 403 `origin`; `/layla/dashboard` → 200; dashboard API still 401 unsigned |
| Green unchanged | passed | `bznsflow-main` production `dpl_GKSMjpoKhpdZTFHsGqVGVopYK5Nz` before and after |

**Current state:** deployed dark. Until the durable gate is on, the Hasib API answers `hasib_unavailable` to signed-in owners and the tabs stay hidden. Layla is unaffected: the ingest demand hook is a no-op while the gate is off.

**To switch it on:** run `npx convex run blueHasib:setEnabled '{"enabled":true}'` in this repo. **To switch off:** the same command with `false`. For a full rollback, also set `BLUE_HASIB_ENABLED=false` and run `npm run deploy:blue`, or roll back to `dpl_FANGbGk9T9jnbfgTXvp52a7EQwtp`. No data is deleted.

## Rollout order (each step needs authorization)

1. Push the Convex schema/functions to `quaint-nightingale-675`.
2. Run `blueMessagingSettings` `{key:'hasib', enabled:true}` through `hasib:setEnabled`.
3. Set `BLUE_HASIB_ENABLED=true` in Blue Vercel, then run `npm run deploy:blue`.

**Rollback:** turn the flag off and redeploy. Never delete order, payment or stock-move rows as a rollback.
