# Construction operating dashboard

Released to Blue production on 2026-09-29 for Ascend and Apex construction businesses. The pack targets Oman/MENA SME general contractors and fit-out firms. It is an operating system, not BIM, payroll, accounting revenue recognition, banking, tender-portal, or document-management software.

## Durable controls

- Projects move through `tender → quoted → awarded → active → practical_completion → defects_liability → closed`, with bounded lost/cancelled branches and optimistic versions.
- A manager approves a baseline only when milestone weights equal 100% and milestone budgets equal the original project budget. The approved baseline is locked.
- Progress, worker hours, cost categories, variations, procurement commitments, claims, retention, aggregate site reports, quality/NCR items, risks, experience ratings, tasks, and actor-attributed audit events are separate records.
- Only approved variations change revised contract, revised budget, or contractual time. Claim certification creates one receivable; retention is a separate receivable only after its release date.
- Site reports accept aggregate counts only. They do not contain medical, injury narrative, personnel-file, payroll, or free-text incident details.
- Employees may operate projects and prepare drafts. Managers alone approve baselines, variations and commitments, certify claims, release retention, and access aggregate Money/Insights, expenses, exports, team, and settings.

## Dashboard and measures

Today contains exactly three exceptions: active projects at schedule risk, submitted/unapproved variation exposure, and overdue certified receivables excluding unreleased retention. Projects provides tender/baseline/progress/cost/variation/claim controls. Procurement covers commitments, site reports, quality and risks. Customers uses the shared tenant contact layer. Money & Insights is manager-only. Team is one manager plus five verified-email employees; revocation invalidates sessions.

Reported measures include revised contract and budget, planned and earned value, CPI, SPI, actual and forecast-final cost, forecast variance and margin, variation exposure, procurement on-time rate, rework rate, NCR closure, recordables per 200,000 worker hours, earned value per worker hour, certified billings, cash, collection, open receivables, retention and client rating. Missing denominators remain null and coverage is shown. Targets stay unset until a 30-day baseline exists.

## Release evidence

- `npm run verify`: passed; Hasib 231/231, lint zero errors with 12 pre-existing hook warnings, typecheck and production build green.
- `npm run test:construction-load`: passed a synthetic profile of 2,250 projects (250 active), 5,000 milestones, 60,000 cost/progress/site rows, 2,000 variations, 10,000 commitments/claims, a 50-write burst, idempotent replay and a 500-task backlog. The bounded overview was under the local two-second SLO.
- Full browser suite: 294 assertions across English/Arabic and 320/768/1440px, including RTL, overflow and serious/critical Axe checks. Dedicated construction owner journey: 4/4 English/Arabic desktop/mobile scenarios with a persisted project.
- Preflight found no `hasibJobs` rows on either Blue target. Both new `constructionProjects` tables remained empty after deployment.
- Additive schema/functions deployed to `valuable-mandrill-296` and `quaint-nightingale-675`; Convex reported no index deletion.
- Vercel production deployment `dpl_4v9qbw53sn8gTfSdSj4aMigYEt9H` is READY and aliased to `https://bznsflow-blue.vercel.app`. The 2026-09-29 contractor-controls correction removes generic product/service subtabs from Construction, adds commitment/site-report/NCR/risk entry plus commitment and corrective-action transitions, exposes manager team invitation/resend/revocation through the shared team route, and displays saved milestones, progress, costs, variations and claims with their forward approval actions. Both the legacy Arabic Stock URL and the clean English Procurement URL returned 200 after release. Immediate UI rollback is `dpl_3ENSivCTsw2CopSt949hBQUmiDF7`.

Rollback removes `construction` from `HASIB_LIVE_PACKS` and redeploys the UI, preserving every construction and financial record. Immediate UI rollback target: `dpl_Gb8vzs3u5Z7KCKQfMzAh3KiyoKtx`. Convex changes are additive and should be corrected forward.
