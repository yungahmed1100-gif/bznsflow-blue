# Real Estate dashboard — hardening record

Real Estate is the agency pack on Ascend (`config/hasib-packs.js`, pack `real-estate`).
- **Manager:** Today, Chats, Deals, Properties, Money, Customers, Team and Settings.
- **Invited agent:** Today, Chats, Deals, Properties and Customers.

The pipeline is opportunity → match → viewing → offer → compliance → close → commission. It's code in:
- `convex/hasib/realEstateState.js` (deal operations);
- `convex/hasib/realEstateBoard.js` (visibility, readable rows, Today, tasks and insights);
- `convex/hasib/propertyState.js` (listings).

The screens are in `src/components/hasib/realestate/`.

Baseline: `d508584` on `hardening/live-dashboards`. Before this pass, the generic browser suite scored 0/5 on Real Estate.

## Owner decisions (Ahmed, 2026-10-01)

- **Agents:**
  - An agent sees their own deals and unassigned ones, and can assign deals only to themselves.
  - They can add listings, deals, viewings, offer drafts and message drafts.
  - Commission, Money, insights, offer approval, compliance and closing are the manager's.
  - Refunds and costs follow the shared staff policy (`convex/hasib/staffPolicy.js`).
- **The legacy property-enquiry model is retired.** The deal pipeline is the only model. The `hasibPropertyEnquiries` table stays in the schema; it's empty on Blue, and dropping it is a later cleanup.
- **Compliance is confirmed one check at a time:**
  - The five checks are identity, authority to sell or let, financing, signed agreement, and completion and handover.
  - Each check is confirmed or marked not applicable, with who and when.
  - Closing is blocked until all five are done.

## Function inventory

| Area | Before | Now |
|---|---|---|
| Today | **Crashed** once any offer was approved, presented or countered: `offer_unanswered` read an undefined `row`. Tasks were opened but could never close, and every manual deal became "first response overdue" after 5 minutes | Fixed. Automatic tasks close when their cause is gone. A task can be marked done (`real_estate_task_resolve`). Manual deals aren't timed on Layla's reply SLA. Agents see only their own deals' tasks and counts |
| Deals | Every agent saw every deal. Stage could be set to anything through save. Cards showed only `buy`/`new` codes | Agent scoping on every read and write. `opportunity_stage` moves forward one step, or to lost with a reason; won only by closing. Cards and the deal page show the customer, requirements, matches, viewings, offers, compliance, messages and history in EN/AR |
| Matching | "Refresh matches" saved matches but never showed them | Matches list the property, location and price, with Interested / Not interested and "Schedule viewing" from a match. Only listings verified in the last 30 days, with confirmed authority, are matched |
| Viewings | No outcome step; any status could be set | requested → confirmed → completed (outcome required) or missed; requested or confirmed → cancelled. A finished viewing is final |
| Offers | No present, counter or reject steps. An accepted offer could be set back to draft | draft → (manager) approved → presented → countered / accepted / rejected / withdrawn. A counter changes the amount and terms; accepted is final. Final steps ask for confirmation |
| Compliance | One button confirmed all five checks | One check at a time, manager-only, with `confirmedBy` and `confirmedAt`. Each step asks for confirmation; undo returns the check to pending |
| Close and commission | Worked, but a confirm-all compliance step made it meaningless | Gated on an accepted offer plus all five checks. Books only the agency commission, marks the listing unavailable and wins the deal |
| Listings | Every edit set `verificationAt = now`, silently "verifying" a listing | "Mark verified today" is explicit (`property_verify`) and asks for confirmation; edits keep the old date. Agents can take a listing on, but not hand it to someone else |
| Money | Commissions and insights were open to agents. The Expenses sub-tab showed the commission screen | Manager-only. Agency expenses use the shared Expenses view. Lost reasons and status labels are in EN/AR |
| Properties tab | Showed irrelevant Products / Services sub-tabs | One listings screen |
| API | **Two bugs that were already in production:**<br>• The Convex validator didn't declare `workflow.opportunityId`, so every viewing, offer and message draft from the dashboard was refused.<br>• The API required a request id on versioned updates, so status changes were refused too | Both fixed. A save that names an existing record is a versioned update |
| Errors | Refusals fell back to "try again" | 29 Real Estate refusals have EN/AR messages (`src/lib/hasib/strings.js`) |

## How it was tested

- **Real-logic journeys:** `tests/real-estate-journeys.test.mjs` has 10 journeys on the production Convex state code, with a manager and two invited agents. They were written first; 9 failed before the fixes. They cover:
  - sections per role;
  - the Today crash;
  - agent scoping and assignment;
  - stages and lost reasons;
  - viewing transitions;
  - the offer state machine;
  - compliance and close, a commission paid, and a refund refused for an agent;
  - explicit verification and readable matches;
  - task auto-close and manual resolve;
  - the retired enquiries and pipeline-based Today measures.
- **Real-logic browser:** `tests/real-estate-browser.mjs` (`npm run test:real-estate-browser`) starts a manager demo and an agent demo. 202 assertions:
  - every section for each role, in English and Arabic, at 1440, 768 and 320px, with Axe serious/critical, overflow and API errors;
  - a listing saved, then verified;
  - a deal from requirements through match, viewing, outcome, offer, approval, presented, accepted and five compliance checks to close and commission;
  - a lost deal in Arabic;
  - the agent's view: no approvals, no Money, Team or Settings, commissions and insights refused.
- **Updated suites:**
  - `tests/hasib-real-estate-ascend.test.mjs` (explicit verify, compliance one at a time, offer presented before accepted);
  - `tests/hasib-property.test.mjs` (listing only);
  - the real-estate branch of `tests/hasib-industry-journeys.test.mjs` and `scripts/hasib-demo-industries.mjs`, which now seed the pipeline;
  - `tests/hasib-pagination.test.mjs`.
  - `tests/hasib-industries-browser.mjs` no longer runs Real Estate, which has its own suite.
- **Regressions:** `npm run verify` (Layla 169, Blue 206, Hasib 303; lint 0 errors). Browser suites:
  - Retail 441; Electronics 490; Dental with receptionist 341; Catalyst 197;
  - Construction 4/4; Automotive 4/4;
  - WhatsApp connect 30; review onboarding 16; guided setup 28.

## Open for the live test

- **A real agency on Blue:** grant Ascend with `packId: 'real-estate'`, add and verify a real listing, and take one customer from a Layla chat to a closed deal.
- **A real agent:** invite them, confirm they see only their own deals, and that they can schedule viewings and draft offers.
- **Follow-up messages:** check them inside and outside WhatsApp's 24-hour window. Outside it needs an approved utility template ID.

## Rollback

Remove `'real-estate'` from `HASIB_LIVE_PACKS` and redeploy Blue. Listings, deals, offers, compliance and commissions are kept. The schema changes are additive optional fields:
- `realEstateCompliance.confirmedBy`;
- `realEstateTasks.resolvedAt`, `resolvedBy` and `resolution`.
