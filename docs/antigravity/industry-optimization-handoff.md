# Industry optimization handoff

Authoritative implementation and deployment record, 2026-09-28. Supersedes conflicting scope in older `industries/*.md`, bakery/café handoffs and historical rollout descriptions. The user explicitly authorized deployment. Clinics require the documented SEC-04 data-governance review before real-data release.

## Outcome and boundaries

Today: exactly three configured industry measures, short action list, one main button. Chats: conversations, requests, handoffs. Work: Orders/Bookings/Visits/Lessons/Jobs/Deals. Stock: Products/Menu/Supplies/Properties. Money: received, customers owe you, recorded profit, expandable reports. Customers: history/return/follow-up. Settings: setup/policies. Preserve legacy URLs and electronics Service. AR/EN, RTL, keyboard, 320px. Missing figures say “Not enough records”. No clinical notes, automatic outreach, new staff logins, payment processing, production changes or added infrastructure.

## Baseline and preservation

Worktree `/Users/ramsis21/Desktop/bznsflow-blue`; actual baseline branch `feat/instagram-channel`, HEAD `a34b6d8`. This task preserves that existing branch and index, rather than following the older branch name in AGENTS. Before implementation the following index/worktree state was captured. `M ` and `A ` are pre-existing staged work; `??` were untracked. None is evidence of verification or deployment.

```text
M  api/_lib/hasib/validate.js
M  config/hasib-packs.js
M  convex/hasib/hasibState.js
M  convex/hasib/insightsState.js
M  convex/hasib/ordersState.js
A  convex/hasib/restaurantState.js
M  convex/hasib/shared.js
M  convex/hasib/stock.js
M  convex/hasib/todayState.js
M  convex/schema.ts
A  docs/antigravity/bakery-cakes-handoff.md
A  docs/antigravity/cafe-handoff.md
A  "industries/Bakery and Cakes.md"
A  industries/Cafes.md
A  industries/Restaurants.md
M  package.json
M  src/components/hasib/InsightsView.jsx
A  src/components/hasib/RestaurantControls.jsx
M  src/components/hasib/StockView.jsx
M  src/components/hasib/TodayView.jsx
M  src/lib/hasib/strings.js
M  src/styles/hasib.css
A  tests/hasib-bakery.test.mjs
A  tests/hasib-cafe.test.mjs
M  tests/hasib-packs-gate.test.mjs
A  tests/hasib-restaurant.test.mjs
?? "industries/Dental Clinics.md"
?? "industries/Electronics and Phone Store.md"
?? "industries/Medical Clinics.md"
?? "industries/Salon and Spa.md"
```

Full pre-task staged binary patch, status, untracked list and tree are preserved in ignored `work/industry-optimization/baseline-staged.patch`, `baseline-status.txt`, `baseline-untracked.txt`, and `baseline-tree.txt` (baseline index tree `2610b9e779728ab13141cf3218d781cbac2c5876`). All in-scope modifications and new files were explicitly staged after preserving the original index. `git diff --cached --check` passed. No commit was created.

## Assignment and allowed paths

| Package | Assigned agent | Allowed paths | Dependencies |
|---|---|---|---|
| FND / integration | root | `convex/schema.ts`, `convex/blueHasib.ts`, API Hasib files, existing shared state/food/money modules, new metrics/profit/units, demo/contract tests, documentation | none; integrated first |
| BKG / MEM / FUP | booking_workflows | new `convex/hasib/{bookingsState,membershipsState,followupsState}.js`; matching tests | FND contracts/ledger |
| JOB / PROP / REQ | jobs_property | new `convex/hasib/{jobsState,propertyState,requestsState}.js`; matching tests | FND contracts/ledger |
| UI | owner_ui | Hasib components/lib/styles, dashboard navigation components, `config/hasib-packs.js`, targeted UI tests | all domains; root owns shared entry/schema |

No agent may change another package's allowed files without coordinating with the integration owner. Preserve other agents' edits. Shared schema, entry validators, money calculations and final navigation integration have one owner: root.

## Feature registry and acceptance

Statuses are cumulative evidence levels: **planned** → **implemented** → **locally verified** → **release-ready** → **deployed**. Implementation and staging alone never imply a later status. Unless an evidence entry below explicitly upgrades a feature, its status is planned. Source links support industry practices/capabilities, never proven unmet demand in Oman; the selected additions remain product hypotheses.

| Stable ID | Pack and exact scope | Implementation under `convex/hasib/` | Tests under `tests/` | Complete owner acceptance journey | Dependencies | Status |
|---|---|---|---|---|---|---|
| IND-RET | **Retail/fashion**: Exact missing size/colour requests; customers waiting when stock returns; unsold variants; late alterations | requestsState.js; industryMetrics.js | hasib-requests.test.mjs | Record variant request → receive that variant → open waiting customer → fulfill once | FND, UI | deployed (live retail) |
| IND-TEC | **Electronics/phones**: Existing IMEI/warranty/trade-in/repairs; per-device age and profit; repair approval and ready collections | serialsState.js; repairsState.js; industryMetrics.js | hasib-tech.test.mjs | Receive IMEI → sell/pay → warranty lookup; quote repair → approve → ready → collect | FND, UI | deployed (live retail-tech) |
| IND-SAL | **Salon/spa**: Service duration; provider/room capacity; cancellation waitlist; owner next-booking prompt | bookingsState.js; followupsState.js | hasib-bookings.test.mjs | Book provider+room → reject overlap → cancel → refill from waitlist → complete → record next visit | FND, UI | deployed (preview gated) |
| IND-DEN | **Dental**: Reception bookings; cancellation refill; clinic-entered follow-up dates; recorded visit charges; no treatment notes | bookingsState.js; followupsState.js | hasib-bookings.test.mjs; hasib-followups.test.mjs | Book visit → arrive → complete → link unpaid charge → owner records follow-up date | FND, UI | deployed (preview gated) |
| IND-CLI | **Medical clinics**: Confirm/reschedule; arrive/complete; unpaid visits; operational intake only | bookingsState.js | hasib-bookings.test.mjs | Unconfirmed visit → confirm → reschedule → arrive → complete → record payment | FND, UI | deployed (preview gated) |
| IND-RES | **Restaurants**: Dishes+ingredients+packaging; supplier price increases; physical-count consumption; per-order channel fees | restaurantState.js; ordersState.js; profit.js | hasib-restaurant.test.mjs; hasib-food-correctness.test.mjs | Receive → count → recipe sale → waste → count → compare actual with expected → record delivery fee | FND, UI | deployed (preview gated) |
| IND-CAF | **Cafés**: Milk swaps/extra shots change price and ingredient usage; size-linked cup/lid; remakes separate | restaurantState.js; ordersState.js | hasib-cafe.test.mjs; hasib-food-correctness.test.mjs | Sell oat-milk extra-shot drink → correct milk/coffee/cup usage → record remake once | FND, UI | deployed (preview gated) |
| IND-BAK | **Bakery/cakes**: Multi-input batches; baked/sold/unsold; preparation checklist/pickup/deposit; earliest expiry; four matching weekday suggestions | restaurantState.js; industryMetrics.js | hasib-bakery.test.mjs; hasib-food-correctness.test.mjs | Bake from several ingredients → sell earliest lot → record unsold → cake deposit/checklist/pickup | FND, UI | deployed (preview gated) |
| IND-GAR | **Garage/car services**: Vehicle jobs; itemized/versioned approval; parts; promised collection; repeat faults | jobsState.js | hasib-jobs.test.mjs | Register vehicle → estimate → approve exact version → consume parts → complete linked charge | FND, UI | deployed (preview gated) |
| IND-GYM | **Gym/fitness**: Dated memberships; class capacity/attendance; configurable 14-day absence; renewals | membershipsState.js; bookingsState.js | hasib-memberships.test.mjs; hasib-bookings.test.mjs | Membership → class booking at capacity → attendance → absence/renewal follow-up | FND, UI | deployed (preview gated) |
| IND-EDU | **Training/tutoring**: Roster/attendance; prepaid credits; cancellations/replacements; paying guardian | membershipsState.js; bookingsState.js | hasib-memberships.test.mjs | Buy credits with guardian → complete once → reverse restores once → cancel consumes none → replacement | FND, UI | deployed (preview gated) |
| IND-CLE | **Cleaning**: Recurring visits/checklists; actual time/supplies/extras; repeat loss flags | jobsState.js | hasib-jobs.test.mjs | Create recurring visit → checklist → time/supplies/extras → complete → inspect profit | FND, UI | deployed (preview gated) |
| IND-AC | **AC/maintenance**: Equipment register; next owner service date; visits remaining; parts; repeat faults | jobsState.js | hasib-jobs.test.mjs | Register unit and entitlement → service job → parts → complete → decrement once → follow-up | FND, UI | deployed (preview gated) |
| IND-CON | **Construction**: Budgets; milestones; extra-work approval; materials/subcontract costs; withheld separate from overdue | jobsState.js | hasib-jobs.test.mjs | Budget → approved estimate → costs → extra-work approval → milestone → withheld vs due | FND, UI | deployed (preview gated) |
| IND-REA | **Real estate**: Owner availability; buyer budget/location; viewing outcome; follow-up; commission only as agency revenue | propertyState.js | hasib-property.test.mjs | Property → enquiry → viewing/outcome → follow-up → commission charge/payment; property price excluded | FND, UI | deployed (preview gated) |

Shared IDs: FND-API (HTTP/entry/schema contract), FND-COST (saved cost, ex-VAT profit), FND-LOT (receipts/sales/waste/count/import/reversal), FND-COUNT (physical-count consumption), FND-TIME (business pickup/expiry), FND-UNIT (compatible-unit batches), UI-TODAY, UI-NAV, UI-MONEY, BKG-CAPACITY, MEM-CREDIT, FUP-OWNER, JOB-APPROVAL, PROP-COMMISSION, REQ-VARIANT.

## Sources and evidence strength

Sources re-opened 2026-09-28; no demand claim inferred. Benchmarks are contextual, not targets for an Omani customer.

- IND-RET: [Retail/fashion](https://www.shopify.com/blog/aged-inventory) — Vendor inventory practice.
- IND-TEC: [Electronics/phones](https://help.repairdesk.co/portal/en/kb/articles/manage-serialized-inventory-revamped) — Vendor capability.
- IND-SAL: [Salon/spa](https://www.zenoti.com/blog/2026-beauty-wellness-benchmark-report) — Vendor benchmark, not local demand.
- IND-DEN: [Dental](https://www.ada.org/resources/practice/practice-management/appointment-confirmations) — Professional operational practice.
- IND-CLI: [Medical clinics](https://www.england.nhs.uk/outpatient-transformation-programme/did-not-attends-dnas/) — Professional guidance; URL returned no substantive content during recheck.
- IND-RES: [Restaurants](https://restaurant.org/education-and-resources/resource-library/working-to-reduce-food-waste) — Trade association waste practice.
- IND-CAF: [Cafés](https://squareup.com/help/us/en/article/8629-beta-track-ingredient-costs-with-square-recipes) — Vendor capability/limitation; product hypothesis.
- IND-BAK: [Bakery/cakes](https://www.bakemag.com/articles/21747-cybake-in-store-bakery-software-implemented-across-148-keells-stores) — Trade press implementation report.
- IND-GAR: [Garage/car services](https://autoleap.com/features/estimates/) — Vendor capability.
- IND-GYM: [Gym/fitness](https://www.mindbodyonline.com/en-au/business/reporting) — Vendor capability.
- IND-EDU: [Training/tutoring](https://help.tutorcruncher.com/en/collections/19143565-lessons) — Vendor capability.
- IND-CLE: [Cleaning](https://productupdates.getjobber.com/37315-gain-confidence-in-your-recurring-job-profitability-with-job-costing) — Vendor capability.
- IND-AC: [AC/maintenance](https://help.servicetitan.com/docs/manage-recurring-service-events) — Vendor reference; inaccessible on recheck.
- IND-CON: [Construction](https://support.procore.com/products/online/user-guide/project-level/change-orders) — Vendor capability.
- IND-REA: [Real estate](https://www.nar.realtor/news/real-estate-news/sales-marketing/5-tips-for-converting-online-leads-into-clients) — Professional sales practice.

## Correctness and release acceptance

- HTTP shaping → exported Convex entry validators → real state executors; additive schema validates persisted records.
- Tenant rejection on every linked record; duplicate request replay; stale edits; safe reversal.
- Atomic booking overlap/capacity; lesson consumption once and restore once; recipes and lots reconcile; payments have one authoritative order ledger.
- Costs exclude VAT; explicit zero differs from missing; waste deducted once; completed recorded profit separate from expected open profit.
- Physical consumption requires two owner counts and intervening supply/transfers; no expected-plus-waste shortcut.
- Default aging/absence 60/14 days, owner configurable. Baking suggestions: four previous matching weekdays, less sellable stock plus known preorders; never create batches automatically.
- Clinical follow-up and food expiry use owner-approved records; no inferred rules.
- Each pack journey above, AR/EN/RTL, keyboard, 320px, common actions within three interactions, plain-language task review. Automated readability does not establish usability.
- Existing tests, both typechecks, lint, build, targeted browser tests. Clinic governance and separate deployment authorization remain release gates.

## Validation log and delivery — 2026-09-28

- `npm test`: 195/195 pass, including 15 owner workflows, food correctness, cross-tenant rejection and 12 pagination tests. `npm run lint`: 0 errors, 12 existing React hook dependency warnings. App and Convex TypeScript checks pass. `npm run build` passes.
- Browser matrix: 60/60 English/Arabic layout checks across all 15 packs, 320px and desktop. Transactional owner journeys are additionally covered by 15/15 HTTP/API/validator/state tests; 4 initially failing browser journey fixtures were corrected, but the rerun's final transactional-browser count was not captured before the worker hit its usage limit.
- `git diff --cached --check` passes; all task changes are staged, with the original staged food work preserved. Nothing is committed.
- Convex schema/functions deployed to both Blue project targets: production `valuable-mandrill-296` and the configured runtime `quaint-nightingale-675`. Schema validation and typecheck passed on production; the configured runtime indexes/functions also deployed successfully. The existing Blue API routes to `quaint-nightingale-675`, so both targets now carry the same additive schema/functions.
- Vercel production deployment `dpl_9pFzPoE2JvgvDoQtha5wMHXnVQmb` is READY and aliased to `https://bznsflow-blue.vercel.app`. Dashboard smoke test follows redirect to HTTP 200; unauthenticated Hasib request returns 401.
- Retail/fashion, electronics/phones (`retail-tech`), and dental are live industry packs. Other built packs remain available only through the server-owned read-only preview path until each is explicitly released. Medical clinic real-data release remains blocked on SEC-04; its workflows are deployed as code but are not released for clinical use.

## Rollback

Vercel rollback target immediately before this release: `dpl_9WT8dZM9DS3s7YPmZE31ycs47oAC` (READY production). Roll back the Blue alias to that deployment through the existing Vercel rollback workflow if the UI release needs reversal. Convex changes are additive tables/indexes and optional fields; retain new records and use a corrective Convex deployment rather than deleting financial or stock history. Never `git reset --hard` or discard the preserved staged food work. No commit was created.

## Integration evidence — 2026-09-28

- Declared production validators live in `convex/hasib/entryArgs.js`, imported directly by `convex/blueHasib.ts`. New tables live in `convex/hasib/workflowSchema.ts`, spread into `convex/schema.ts`. `tests/helpers/hasib-contract.mjs` interprets that production metadata using synthetic IDs and validates every saved Hasib row. This is local contract evidence, not an execution of the remote Convex validator/OCC engine.
- `tests/hasib-industry-journeys.test.mjs`: 15/15 owner journeys through **the actual dashboard HTTP handler** (`createHasibApi` with injected authenticated account/store), API argument shaping, declared entry validator, real state logic and persisted-row schema. Verifies live gates remain closed for preview packs, payment linkage, no outbound scheduling, Today exactly three metrics, and job Money reconciliation.
- `tests/hasib-food-correctness.test.mjs`: fractional compatible units, executable milk swaps, snapshots after recipe changes, stale recipe edits, explicit food disposition, physical counts with receipts, missing costs, multi-input batches, oversale reversal dated-lot reconciliation, discarded-food cost once, and rejection of discard on confirmation.
- Final `npm test` passed 195/195; `npm run build`, application/Convex typechecks and lint passed (12 existing warnings). Browser layout matrix passed 60/60. Transactional browser rerun count is unavailable; the 15 journeys pass at the API/validator/state boundary.
- Independent code review feedback on job lifecycle, property linking, null money, pagination and food reversals was addressed. The automated worker hit its usage limit before a final reviewer rerun; deployment proceeded under the user's explicit authorization and the documented release gates.

### Applicable engineering controls

APP-01/02: existing module/API architecture reused, no additional runtime/dependency. DATA-01: authenticated tenant context and linked-ID checks. DATA-02: one Convex mutation for allocation/credits; local serialized-intent race evidence only. DATA-03: bounded reads; large-history report scans still need pilot/load review. DATA-04: additive tables/optional fields; no migration pushed. SEC-01: existing session/origin/CSRF boundary retained. SEC-02: no new secrets, uploads or external fetching. SEC-03 and caching/AI: not applicable, deterministic workflows only. SEC-04: clinic real-data use blocked pending review. REL-02: local test/build/browser evidence required; release authorization separate. REL-03/OPS-03: baseline snapshot plus existing feature gates; the prior READY Vercel deployment is recorded for rollback. Remote backup/restore and live Convex OCC race validation were not performed.

## Unified Business Setup industry — 2026-09-28 addendum

The staged implementation now uses the 22 named Layla Setup sectors, “Something else,” and the retained Electronics and phone store choice as one bilingual catalog. Retail and Electronics remain the only live customer-data packs; the other 13 built packs are founder-only synthetic previews, and nine choices are pending. Regular owners change one industry through Business Setup. Saving it clears any legacy `hasibSettings.packId` override, while that override preselects the form once for accounts that have not yet saved the unified choice.

Founder preview is derived server-side only from the authenticated, normalized `ahmed@bznsflowai.com` account. Preview requests never call the tenant Hasib store, reject pending packs and all writes, and expose an explicit synthetic/read-only state. The old public Hasib `settings_update.packId` path is rejected so a regular user cannot bypass Business Setup.

Local verification for this addendum: the complete `npm test` command passed, including `npm run test:hasib` at 200/200; application typecheck and production build passed; lint reported zero errors and the same 12 pre-existing hook warnings. The full browser suite passed, including 100 dashboard assertions across English/Arabic and 320–1440px plus the founder selector and pending/read-only states. `git diff --cached --check` passed. This addendum is staged and locally verified; it has not been deployed as part of this resumed task.

## Ascend Real Estate operating workspace — 2026-09-28 addendum

Real Estate is live in the Blue live-pack registry with tenant-only production data and no synthetic preview path. Rollback is additive and data-preserving: remove `real-estate` from `HASIB_LIVE_PACKS`; keep workspace, property, opportunity, match, viewing, offer, compliance, task, draft, deal-event, and commission records.

The server derives package, workspace, role, and capabilities from the authenticated account. Catalyst retains chats, customer edits/privacy deletion, explicit handoff, business details, and channel setup; it cannot reach Hasib, team, operational, money, import/export, or broadcast handlers. Ascend adds the real-estate workspace. One manager may invite five employee emails; activation occurs only after verified email-code sign-in, and revocation deletes employee sessions immediately. Material real-estate and team changes append actor-attributed activity records.

Dedicated bilingual views replace the generic real-estate jobs presentation: Today, Customers/Deals with viewings/offers/drafts, Properties, Money/Insights, and manager-only Team. Durable state covers verified/authorized property inventory with up to ten tenant-owned photos, one open opportunity per customer need, deterministic fresh-listing matches, multiple viewings, bounded offer transitions, status-only compliance checkpoints, immutable stage history, manager tasks, and one idempotent commission charge on compliant closure. Property prices, rent, deposits, and transfer values never enter agency revenue.

Inbound Layla processing extends qualification with area, property type, budget, bedrooms, finance readiness, decision-maker readiness, timeline and must-haves. It records reply queue, provider submission and delivery separately, matches only available recently verified authorized listings, and creates a manager task plus handoff when saved facts are missing or no verified match exists. SLA tasks use five-minute first response, two-hour second attempt, configurable listing freshness, missing viewing outcomes, unanswered offers, and failed or ambiguous sends.

Employees may prepare operational records and drafts. Only the manager can manage the team/settings, approve offers or outbound drafts, close, record commission, use money/insights, or import/export/broadcast. An approved draft creates a provider-backed queued job: free-form text only inside the 24-hour service window; outside it, only a synced approved zero-variable utility template is accepted, otherwise the draft remains `template_required`. Queueing is never represented as sent; provider submission and delivery update separate timestamps.

The form-to-API transformation was refactored into `src/lib/hasib/realEstateForms.js`, leaving interaction/rendering in the dashboard and adding direct normalization coverage. Final verification passes: `npm run verify`, `npm run test:hasib` at 212/212, `npm run test:blue` at 192/192, the 20 focused real-estate/photo checks, application and Convex typechecks, production build, and all four browser suites. Browser evidence includes 114 English/Arabic dashboard assertions from 320–1440px plus onboarding, review, and Instagram journeys. Lint reports zero errors and the same 12 pre-existing React hook warnings; the existing intent-evaluation diagnostic still prints its known 99% warning inside a passing harness test.

Authorized Blue release completed 2026-09-28. Additive Convex schema/functions were deployed first to production `valuable-mandrill-296` and the configured Blue runtime `quaint-nightingale-675`; schema validation and typechecks passed, all listed real-estate/workspace indexes were added, and no indexes were removed. Vercel deployment `dpl_5xtkcpFQCnNz1XEhwe51mzKWamU5` is READY and aliased to `https://bznsflow-blue.vercel.app`. Production smoke checks returned HTTP 200 for `/layla/dashboard` and HTTP 401 for unauthenticated `/blue-hasib` and `/blue-dashboard`, proving delivery and the authentication boundary without customer mutation. No live message or invitation was sent. The immediately prior READY rollback deployment is `dpl_46bHYirgjW4rfugcGd6w1CtDQqLi` (`bznsflow-blue-adrbs5htv-yungahmed1100-7330s-projects.vercel.app`). An authenticated Ahmed-account selection check remains a manual owner verification because this release did not request or bypass an email-code session.

## Action-first live dashboard redesign — 2026-09-29 addendum

Retail, Electronics, Dental and Real Estate now share one action-first visual language: bilingual icon action cards, visible primary actions, destination-backed KPI cards, truthful horizontal charts, status indicators and illustrated empty states. URL action state makes the important entry points directly addressable (`create=1` or bounded `action` values). The views never seed or display sample tenant records.

Retail exposes new order, product, stock import and customer follow-up. Electronics exposes repair, trade-in, warranty and sale. Dental exposes visit, charge, service/provider and cancellation-list workflows. Real Estate adds Today quick actions, a seven-stage pipeline, photo-led listing cards with edit/status/freshness details, dedicated empty states for opportunities/viewings/offers/approvals/team, and source/lost-reason charts. The server overview now returns tenant-scoped pipeline, listing, viewing, offer and approval summaries; authorization and manager/employee boundaries are unchanged.

Release evidence: `npm run verify` passed with Hasib 213/213 and Blue 192/192; lint has zero errors and the same 12 pre-existing hook warnings. All four browser suites passed, including 258 dashboard assertions for the four live packs across English/Arabic, 320/768/1440px, RTL, serious/critical Axe checks and overflow checks. Convex production `valuable-mandrill-296` and runtime `quaint-nightingale-675` were updated with no index deletion. Vercel deployment `dpl_4FroRb8TVYoF946eTpiETYurga2v` is READY and aliased to `https://bznsflow-blue.vercel.app`. Smoke checks returned HTTP 200 for `/layla/dashboard` and HTTP 401 for unauthenticated GETs to `/api/layla-meta?surface=hasib` and `surface=dashboard`. The immediate UI rollback target is `dpl_5xtkcpFQCnNz1XEhwe51mzKWamU5`; Convex changes are additive and should be corrected forward. Green was not changed, and no customer data, invitation or live message was created.

## Construction release — 2026-09-29 addendum

Construction is live on Blue as a dedicated Ascend/Apex operating dashboard for Oman/MENA SME general contractors and fit-out firms. The durable domain covers controlled project lifecycle, locked weighted baselines, progress/worker hours, actual and forecast cost, variations, commitments, claims and separately released retention, aggregate site reports, quality/NCR, risks, structured experience, tasks, audit attribution and manager/employee boundaries. BIM, files, payroll, medical/injury narratives, supplier payments, bank/accounting/tender/ERP integrations and autonomous commercial approvals remain excluded.

Full verification passed with Hasib 232/232, production build/typecheck, zero lint errors, 294 browser assertions and 4/4 dedicated construction browser scenarios. The load profile passed with 2,250 projects, 5,000 milestones, 60,000 cost/progress/site rows, 2,000 variations, 10,000 commitments/claims, a 50-write burst and 500 queued tasks. Preflight found no legacy construction jobs on either Blue target. Convex production `valuable-mandrill-296` and runtime `quaint-nightingale-675` received additive schema/functions with no index deletion. Vercel deployment `dpl_4v9qbw53sn8gTfSdSj4aMigYEt9H` is READY at `https://bznsflow-blue.vercel.app`; the legacy Arabic Stock URL and clean English Procurement URL returned 200. The contractor correction adds procurement/site entry and status controls, visible saved project records and forward approvals, plus manager team invitation/resend/revocation, and removes the inherited product/service subtabs. No patient/customer record, invitation or message was created. Immediate UI rollback is `dpl_3ENSivCTsw2CopSt949hBQUmiDF7`, preserving records. Clinic remains preview-only.

## Automotive workshop release candidate — 2026-09-29

Automotive now has a dedicated bilingual dashboard and additive workshop domain: bay/technician appointments, vehicles, work orders, registered inspection photos, immutable estimate revisions and approval evidence, labor clocks, stock-backed part issue/return, quality gates, one linked charge, experience, tasks and explicit-coverage KPIs. Technician accounts are inside the existing five-employee workspace limit and are backend-restricted to assigned vehicles/jobs without customer directories, estimates, aggregate Money, team or settings.

Full `npm run verify` passes, including Hasib 239/239, Blue 192/192, application typecheck, production build and lint with zero errors (12 pre-existing hook warnings). The dedicated browser matrix passes 4/4 across English/Arabic at 1440/320px with RTL, overflow and serious/critical Axe checks. The scale profile passes with 10,000 customers, 15,000 vehicles, 50,000 work orders, 100,000 labor rows, a 500-task backlog and 50 constrained-slot attempts; the bounded overview stayed below the local two-second SLO.

`automotive` is now live in `HASIB_LIVE_PACKS` under the user's explicit release authorization. The final full verify passed with Hasib 243/243, application and Convex typechecks, production build and zero lint errors (12 pre-existing warnings). Additive Convex schema/functions deployed to `valuable-mandrill-296` and `quaint-nightingale-675` with no index deletion. Vercel deployment `dpl_FsR7czuKkGvFrHorivQVLc46QCKq` is READY at `https://bznsflow-blue.vercel.app`; the dashboard returned 200, the unauthenticated Hasib boundary returned 401, and the latest 100 production Convex events showed no failures. No real customer record, invitation or message was created. Immediate UI rollback is `dpl_4v9qbw53sn8gTfSdSj4aMigYEt9H`; records remain additive and are reconciled forward. Notion synchronization remains pending because no connector was available.
