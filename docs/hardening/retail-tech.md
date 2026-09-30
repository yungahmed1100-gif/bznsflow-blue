# Retail-tech dashboard — hardening record

Retail-tech is the phone and electronics store pack on Ascend or Apex (`config/hasib-packs.js`, pack `retail-tech`). It shares Retail's orders, stock, money, product and follow-up code (see `docs/hardening/retail.md`). It adds IMEI (serial) stock, warranty lookup, trade-ins, and repair tickets in a Service section.
- **Manager sections:** Today, Chats, Orders, Stock, Service, Money, Customers, Team and Settings.
- **Employee sections:** Today, Chats, Orders, Stock, Service and Customers.

Baseline: commit `71daf56` (Retail) on branch `hardening/live-dashboards`.

## Owner decisions (Ahmed, 2026-09-30)

- **Employees quote repairs:** labour and part prices, recorded with their name.
- **Trade-ins are manager-only**, because what a trade-in pays becomes the stock cost.
- **Employees cannot change warranty terms**, which decide whether a repair is free.
- **Approval first:** a repair needs the customer's recorded approval before it moves to Repairing or Ready. A free store-warranty repair skips this.
- **Team is enabled for retail-tech.**

## How it was tested

- **Real-logic journeys:** `tests/retail-tech-journeys.test.mjs`, 14 journeys on the production Convex state code with a manager and an employee. They were written first; 11 failed before the fixes (RED), and all pass now.
- **Real-logic browser:** `tests/retail-tech-browser.mjs` (`npm run test:retail-tech-browser`) starts two demos, one as the manager and one as an employee. 490 assertions:
  - every manager section, in English and Arabic, at 1440, 768 and 320px;
  - every employee section, in English and Arabic, at 1440 and 320px;
  - each view checked for Axe serious/critical, overflow, page errors and refused API calls;
  - journeys: an IMEI sale (double-click, overpayment, cancel confirmation, unit back in stock), warranty lookup from `?action=warranty`, an explicit trade-in, a repair (quote with a part, Ready waiting for approval, collecting with money owed, taking the balance afterwards), a deep link cleared on close, a cancel confirmation, and a team invite and revoke;
  - the employee journey: no trade-in, no profit card, no unit costs, can quote a repair, no refund, warranty locked.
- **Repaired stale suites:**
  - `tests/hasib-tech-browser.mjs`: 50 assertions pass. It read the IMEI together with its age, clicked an ambiguous "New repair", and used a removed "Change industry" dialog.
  - `tests/hasib-industries-browser.mjs` retail-tech: 8/8. It assumed the primary quick action opens Orders, and it used old approval labels.
- **Existing suites, unchanged and green:**
  - `npm test`: 168 + 205 + 269;
  - `npm run test:browser`: 4 suites, 294 dashboard assertions;
  - `test:retail-browser`: 441;
  - `test:catalyst-browser`: 197;
  - `hasib-demo-browser`: 87;
  - Retail industries: 6/6;
  - `eval:intents`: 100%.
- **Two old tech tests** moved a repair to Ready without approval. Each now records approval first, as decided.

## Function inventory

| Area | Function | Op | Manager / employee | Result |
|---|---|---|---|---|
| Nav | Sections | `dashboardMap` | M: 9, E: 6 | **Fixed**: Team was missing for retail-tech |
| Orders | IMEI sale | `order_create`, `order_status` | both | **Fixed**: a failed confirmation (archived item, stock rule) left the picked IMEIs reserved to a pending order. One product on two lines could sell fewer units than the stock deducted, so it is now refused (`duplicate_line`) |
| Orders | Return of a phone | `order_status` → returned | both, audited | Pass (now tested): the unit goes back in stock, and on-hand equals the IMEIs in stock |
| Orders | A repair's order | `order_status` | — | **Fixed**: confirming or cancelling it from Orders got the ticket out of sync; after that the repair could not even be cancelled. It is now refused (`use_repair_status`), and Orders shows a link to Service instead of status buttons |
| Stock | Receive IMEIs | `stock_move` | both, cost manager-only | **Fixed**: an IMEI already sold could be received again, erasing its sale and warranty (`serial_sold`). IMEIs are checked in the browser as on the server. Load errors showed "No units in stock" |
| Stock | Write off IMEIs | `stock_move` damage | both, audited | **Fixed**: now asks first |
| Stock | Warranty terms | `item_save` | manager | **Fixed**: a warranty could never be cleared; "No warranty" with months showed as covered, and the repair was marked under warranty. Employees could change the terms |
| Stock | Import with IMEIs | `items_import` | manager | **Fixed**: IMEIs already on record, or for a missing option, were dropped silently. A saved product was reported as failed. Both now appear as notes |
| Service | Repairs list | `repairs` | both | **Fixed**: only the newest 25 were shown, with no Retry on error; copy was not in the strings table |
| Service | New repair / quote | `repair_create`, `repair_update` | both, audited | **Fixed**: the parts list showed only the first 50 products (now a search); there was no warning that saving a new quote resets approval; no busy guard |
| Service | Approval | `repair_approval` | both, audited | **Fixed**: recorded but never enforced; Ready could come with no approval |
| Service | Status | `repair_status` | both, audited | **Fixed**: Cancel was one click; collecting with money owed gave no warning |
| Service | Payments | `payment_record` | refund manager-only | **Fixed**: the form disappeared after collection, so money owed could not be taken in Service. Employees saw Refund |
| Service | Trade-in | `trade_in` | manager, audited | **Fixed**: employees could set the price paid (the stock cost). Load errors showed as "add a product first". Only 50 products were listed, and a new-phone SKU was preselected |
| Service | Warranty lookup | `serial_lookup` | both | **Fixed**: "Check warranty" (the card and `?action=warranty`) did nothing. Errors were not announced. Days used Arabic-Indic digits, unlike the rest of the dashboard |
| Service | Deep links | `?repair=`, `?action=` | both | **Fixed**: the link stayed in the URL, so Back or the language switch reopened the dialog |
| Today | Profit per device | `today` | manager only | **Fixed**: counted only completed or delivered sales, so walk-in sales were missed. It is hidden for employees instead of showing "Not enough records" |
| Today | Stock unsold N days | `today` | both | **Fixed**: counted stock lots, not phones (lots are used oldest-first whichever phone sold), and dropped the oldest lots |
| Today | Overdue repairs, ready | `today` | both | **Fixed**: ready repairs counted as overdue and appeared twice in Needs you, with a wrong Arabic plural |
| Errors | Refusals | strings | — | **Fixed**: `repair_not_found` and the new codes had no message |

## Review

- **Code review:** one HIGH, one MEDIUM and one LOW. All are fixed, and the HIGH has a test.
  - HIGH: an order created through the API with `kind: "repair"` but no ticket could never be moved or cancelled, because of the new repair-order guard. Only server code (`createRepair`) can now set the repair kind.
  - MEDIUM: the dashboard imported the IMEI check from `serialsState.js`, which pulled a large backend module graph into the browser bundle. It now lives in the dependency-free `convex/hasib/serialFormat.js`.
  - LOW: an employee's `?action=trade-in` link stayed in the URL with nothing shown; it is now cleared.
- **Code review, verified sound:**
  - the warranty write for every item;
  - the IMEI reservation order (it fixes a real pre-existing bug);
  - `duplicate_line` has no effect on Layla or repairs;
  - Retail's `unsold_stock` is unchanged;
  - the approval gate covers every path to Repairing and Ready;
  - the staff policy holds end to end.
- **Security review:** one MEDIUM-HIGH, fixed with a test. The audit duplicate check matched a request id against free text, so an approver name like `x|marker` plus a crafted request id could hide a later approval from the log. The duplicate check now runs only on server-built entries for request-idempotent operations with a valid UUID, and `|` is removed from approver names.
- **Security review, verified sound:**
  - no cross-tenant path (including the new IMEI ageing);
  - staff cannot set trade-in cost or warranty, see costs, or refund through the repair payment form;
  - the repair and approval guards hold;
  - no XSS;
  - nothing sensitive in the client imports.

## Live readiness checklist (Ahmed)

- Grant a real account Ascend with `packId: 'retail-tech'`.
- Receive two IMEIs with a cost. Sell one, look it up, then return it.
- Take one repair from quote to approval, ready and collection with a part.
- Record one trade-in as the manager, and check an employee can't.
- Invite a real employee email. Sign in as the employee and quote a repair.

## Found for later dashboards

- Trade-ins pay cash out but create no payment or expense row, so cash on Today and Money doesn't include them (by design today; Insights counts them). Worth an owner decision.
- A cancelled repair keeps its deposit on the cancelled order; the manager refunds it from the ticket.
