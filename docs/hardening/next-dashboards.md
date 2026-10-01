# Next dashboards — hardening plan

Prepared 2026-10-01, after Dental (`aece6da`, live on Blue). Six packs are live: retail, retail-tech, dental, real-estate, construction and automotive. Catalyst, Retail, Retail-tech and Dental are hardened; the records are in this folder. The three below are not.

## Baseline (measured 2026-10-01 on `aece6da`)

| Pack | Archetype | Team | Staff money policy | Browser baseline (`tests/hasib-industries-browser.mjs`) | Real-logic tests |
|---|---|---|---|---|---|
| Automotive | booking | on | **not applied** | 4/4 pass | `hasib-automotive.test.mjs`, load test; no role journeys |
| Construction | project | on | **not applied** | 4/4 pass | `hasib-construction.test.mjs`, load test; no role journeys |
| Real estate | project | on | **applied** | **hardened 2026-10-01**: own suite, 202 assertions | 10 role journeys; see [real-estate.md](real-estate.md) |

**The main risk.** Team is enabled for all three, but `convex/hasib/staffPolicy.js` guards only catalog packs and packs with service items. An invited employee in these packs therefore receives:
- the manager's Today money-valued measures (`commission_owed`, `variation_exposure`, `overdue_receivables`);
- cash figures and costs;
- the ability to refund.

The Retail record already flagged this ("job_profit, visit_profit … not hidden for their employees yet").

**Already fixed elsewhere:** employee messaging uses the manager's business (`workspaceDraftHash`, `api/_lib/layla/blue-messaging.js:144`), which closes Catalyst's open item.

## Recommended order

1. **Automotive.** It is closest to what is already hardened (bookings, job cards, parts stock, payments). The front-desk and service-advisor roles map directly onto the Retail and Dental rule.
2. **Construction.** Project money (variations, claims, retention) needs its own staff rule; its tests are already green, so this is mostly the role pass.
3. **Real estate.** Done 2026-10-01 at Ahmed's request, ahead of Automotive and Construction; see [real-estate.md](real-estate.md).

## The same pass for each

Follow `docs/hardening/retail.md`, with commits shaped like `71daf56` and `aece6da`:
1. **Owner decisions first** (below).
2. **`tests/<pack>-journeys.test.mjs`**, with a manager and an invited employee on the real Convex state code, written to fail first.
3. **The fixes:**
   - extend `staffGuarded` / `staffResult` to the pack;
   - add audit entries for its money and status changes;
   - add confirmations, busy guards, and English and Arabic refusal messages.
4. **A dedicated browser test** with manager and `--role=employee` demos, at 1440, 768 and 320px, in English and Arabic, checking Axe, overflow and page errors. Add it to `package.json`.
5. **`docs/hardening/<pack>.md`**, then `npm run verify` plus all the browser suites.
6. **Push Convex to `dev:quaint-nightingale-675`**, run `npm run deploy:blue`, smoke-test, and push to GitHub (`blue` remote).

## Decisions needed from Ahmed

For each pack, what may an invited employee do?
- **Automotive (service advisor / technician):**
  - May they see job prices and parts costs?
  - May they approve estimates, record refunds, or change parts prices?
  - Recommended: the Retail rule. They quote labour and parts at the price list and take payments; costs, refunds and price-list changes stay with the manager.
- **Construction (site or project staff):**
  - May they see contract values, budgets, variations and claims?
  - May they record progress, site reports and quality issues?
  - Recommended: staff record site work (progress, reports, quality, risks); money (contract, budget, variations, claims, retention) stays with the manager.
- **Real estate (agents):**
  - May agents see commission amounts and other agents' deals?
  - May they draft offers and record viewings?
  - Recommended: agents work their own opportunities, viewings and offer drafts; commission ledgers and compliance confirmation stay with the manager.

## Still open from earlier passes

- **The "BLUE · Production is unchanged" banner** shows to every visitor (`src/layouts/RootLayout.jsx`). Ahmed hasn't decided yet.
- **WhatsApp signup:** waiting for the new Cloud-API-only Meta login configuration ID (`LAYLA_CUSTOMER_CONFIG_ID`).
- **Live walkthroughs:** a real clinic (Dental) and a real employee invite on each team pack.
