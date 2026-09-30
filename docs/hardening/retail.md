# Retail dashboard — hardening record

Retail is the abaya and fashion boutique pack on Ascend or Apex (`config/hasib-packs.js`, pack `retail`). The manager sees Today, Chats, Orders (with product requests), Stock, Money, Customers (with follow-ups), Team and Settings. An invited employee sees Today, Chats, Orders, Stock and Customers.

Baseline: commit `ea212c3` on branch `hardening/live-dashboards`, the tree after Catalyst (`docs/hardening/catalyst.md`).

## Owner decisions (Ahmed, 2026-09-30)

- **Staff: hide money, keep selling.**
  - Employees create orders at the manager's prices, take payments, move orders along and adjust stock.
  - They never see cost prices, profit, the cash figures on Today, or a customer's lifetime spend.
  - They cannot refund, discount, add free-typed lines, or change a product's price or cost.
- **Every change to money or stock is recorded with who made it:** cancel, return, refund, archive, stock move and expense void, in `ascendActivity`.
- **Team is enabled for Retail.**

## How it was tested

- **Real-logic journeys:** `tests/retail-journeys.test.mjs`, 14 journeys on the production Convex state code with a manager and an invited employee. They were written first; 12 failed before the fixes (RED), and all pass now.
- **Real-logic browser:** `tests/retail-browser.mjs` (`npm run test:retail-browser`) starts two demos, one as the manager and one with `--role=employee`. 441 assertions:
  - every manager section, in English and Arabic, at 1440, 768 and 320px;
  - every employee section, in English and Arabic, at 1440 and 320px;
  - each view checked for Axe serious/critical, overflow, page errors and refused API calls;
  - journeys: a sale (double-click, overpayment refused, cancel confirmation, stock returned), a product request filled by a delivered order, a product with a photo upload then archived, a team invite and revoke, a single expense void, and a follow-up;
  - the employee journey: fixed prices, no custom lines, no refund, no import, no money, no business switches.
- **Demo harness** (`scripts/hasib-demo.mjs`):
  - `--role=employee`;
  - a local photo upload route with the same byte check as `convex/http.ts`;
  - real messaging for Ascend (it was a canned reply before);
  - retail now runs with live pack checks on (no preview flag).
- **Repaired stale suites:**
  - `tests/hasib-demo-browser.mjs`: 87 assertions pass;
  - the retail scenarios in `tests/hasib-industries-browser.mjs`: 6/6;
  - the Money selector in `tests/hasib-tech-browser.mjs`.

  All of these waited for `.hb-hero-value`, `.hb-figures` or `.hb-industry-figures`, which the current screens no longer render.
- **Existing suites:**
  - `npm run verify`: lint, typecheck, Convex typecheck, 168 + 205 + 257 tests, build;
  - `npm run eval:intents`: 100% macro-F1;
  - `npm run test:browser`: 4 suites, 294 dashboard assertions;
  - `test:catalyst-browser`: 197 assertions.

## Function inventory

| Area | Function | Op → state | Manager / employee | Result |
|---|---|---|---|---|
| Nav | Sections | `dashboardMap` | M: 8 sections, E: 5 | **Fixed**: Team was missing for Retail; Settings flashed for employees until Hasib loaded; Services (the manager's business details) were shown to employees |
| Today | Needs you, 3 measures, quick actions, setup | `today` | both; money manager-only | **Fixed**: measures read the oldest 3,000 orders, so a busy shop showed old sales. Best variant counted only completed orders, while Money counts confirmed ones. No Retry on error. Import and setup were shown to employees; cash was sent to employees |
| Orders | List, filter, Load more | `orders` | both | **Fixed**: Load more had no busy state and failed silently. The "Waiting for you" filter scanned 400 rows, so older waiting orders were missed. A filter change could show the previous filter's rows (polling race) |
| Orders | New order | `order_create` | E: catalogue prices only | **Fixed**: employees could type any price, discount or free line. Double-submit already safe (pass) |
| Orders | Status changes | `order_status` | both, audited | **Fixed**: a pending order could be confirmed after its product was archived, taking stock from the archived variant. Cancel and Return were one click, with no confirmation |
| Orders | Exchange | `order_status` then `order_create` | both | **Fixed**: the original was marked returned before the replacement existed; closing the form left a returned order with no replacement |
| Orders | Payment / refund | `payment_record` | refund manager-only, audited | **Fixed**: payments above the balance were accepted. Unmapped errors showed the raw code |
| Orders | Product requests | `product_request_*` | both | **Fixed**: a delivered or out-for-delivery order could not fill a request (the server checked a nonexistent `preparing` status). The picker listed every order, not the customer's own. There was no Cancel. The screen polled four lists × 20 pages every 30 s. Copy was not in the strings table |
| Stock | List, search, low only | `items`, `low_stock` | E: no costs | **Fixed**: costs were sent to employees. No Retry on error |
| Stock | Add / edit product | `item_save` | E: price and cost of existing variants fixed | **Fixed**: `trackStock` or kind could be switched with stock on hand (stranding it); variants beyond 60 disappeared from reads; the archive error was shown behind the open dialog, with no busy guard |
| Stock | Adjust stock | `stock_move` | both, audited | Pass; now recorded |
| Stock | Import | `items_import` | manager | **Fixed**: shown to employees. A failed batch finished as "done" with partial counts; failed rows showed raw codes |
| Stock | Photo | `photo_upload_url`, `photo_register` | both | Pass (verified end to end with the new demo upload route) |
| Money | Summary, expenses | `insights`, `expense_*` | manager, void audited | **Fixed**: Void could be sent twice; the period select was labelled "Insights" |
| Customers | Follow-ups | `followup_*` | both | **Fixed**: Retail was offered booking, membership, job and property links, which the server refuses; contacts were loaded 20 pages every 30 s; the status filter ran after paging (short pages); API and server reason limits differed (200/160); copy was not in the strings table; a customer's follow-up notes outlived their deletion |
| Customers | Contacts | dashboard ops | delete/export/import manager | Pass (covered by the Catalyst pass) |
| Team | List, invite, resend, revoke | `team_*` | manager | **Added** for Retail (`src/components/hasib/TeamView.jsx`), with revoke confirmation. The invitation email said "your brokerage's … workspace" |
| Chats | Takeover, reply, hand back | `messaging` | both | **Fixed**: an employee's messaging went to their own (empty) draft and got a 401. It now uses the manager's business; pause, activate, check connection and disconnect are manager-only, and hidden for employees |
| Settings | Instagram | `instagram` | manager | **Fixed** the same way: employees read the manager's state; every POST is refused |
| Errors | Owner-facing refusals | `src/lib/hasib/strings.js` | — | **Fixed**: 34 codes a retail user can meet fell back to "try again" or showed the raw code |
| Server | Failures | `convex/http.ts` | — | **Fixed**: every exception became `hasib_unavailable` with no trace; the cause is now logged (never the request body) |

Not changed, verified: currency is fixed to OMR, since no setting can change it, so the hard-coded OMR labels are correct today. Import already matches by SKU before name.

## Review

- **Code review:** found three CRITICAL and one HIGH in the first staff policy. All are fixed and have tests:
  - An employee could create a new product, or add a new size or colour, at any price, then sell it at "catalogue" price. Employees now edit existing products only (`manager_required` otherwise), and Add product and Add variant are hidden for them.
  - The retail-tech Today measure "Profit per device" (revenue minus cost) reached employees. Money-valued Today measures are now empty for staff. The security review found this one too.
  - An employee stock receipt could set a unit cost. The cost is dropped for staff, and the field is hidden.
  - The audit duplicate check read the oldest 200 entries for an item; it now reads the newest.
- **Deferred to retail-tech (dashboard 3):** repair quotes and parts prices, and trade-in costs set by employees. The retail pack has repairs and trade-ins switched off (`module_unavailable`).
- **Not changed:** a filtered list page may return more than `limit` rows, and no caller relies on the limit. Slicing would drop rows between pages.
- **Security review:**
  - No cross-tenant path. `workspaceDraftHash` is derived live from an active membership, and revocation deletes sessions.
  - No employee escalation on messaging, Instagram, payments, pricing or team; the React text is escaped.
  - The demo upload route is loopback-only.
  - The MEDIUM, logging an error message that a validator can fill with arguments (including the session hash), is fixed: only the error class is logged.
  - Informational: the contact-deletion cleanup reads the newest 2,000 requests and follow-ups. An older row keeps only a reference to the already-anonymised contact.

## Open for the live test

- A real retail account on Blue: grant Ascend with `packId: 'retail'`, then walk a sale, a payment and a cancel.
- Invite a real employee email and check the email wording. Sign in as the employee, and check their view and that they can reply in chats.
- A customer asks Layla for a size; the order waits; the owner confirms it.
- A photo upload through real Convex storage.

## Found for later dashboards

- `tests/hasib-industries-browser.mjs` fails the same scenarios on the baseline as it does now, so these predate this pass:
  - real estate and clinic: the generic flow expects Today metric cards those dashboards don't render;
  - retail-tech: expects the first quick action to open Orders, but it is "New repair" (Service);
  - the suite stops at `logistics`, which has no demo journey.
- `tests/hasib-tech-browser.mjs` still expects "N days in stock" beside each IMEI in a flow that no longer shows it. For dashboard 3.
- The staff money policy (redaction, price and refund guard) applies to catalog packs (retail, retail-tech). Booking, project and property packs need the same decision in their own passes; `job_profit`, `visit_profit`, `dish_profit` and similar measures are not hidden for their employees yet.
- Retail-tech: guard `repair_create`, `repair_update` and `trade_in` prices and costs for employees.
