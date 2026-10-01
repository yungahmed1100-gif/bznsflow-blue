# Dental dashboard — hardening record

Dental is the clinic pack on Ascend (`config/hasib-packs.js`, pack `dental`).
- **Manager:** Today, Chats, Visits, Services (treatments, then supplies), Money, Patients, Team and Settings.
- **Invited receptionist:** Today, Chats, Visits, Services (supplies only) and Patients.

Baseline: merge `8293408` on `hardening/live-dashboards`. That merge brought the spec dental pack (`feat/hasib-dental`, `e564591`) onto the hardened Blue tree and replaced the earlier bookings-based dental. It went live on Blue as `dpl_59qia4ViCrXdbTfVswXvCw7H9fVR` on 2026-10-01, with the Convex push to `dev:quaint-nightingale-675`.

## Owner decisions (Ahmed, 2026-10-01)

- **The spec dental replaces the bookings dental.** Visits are Hasib orders, so `appointments` and `plans` are off for dental.
- **The front desk follows the Retail staff rule, "hide money, keep selling":**
  - Receptionists book and charge visits at the catalogue prices and take payments.
  - They never see supply costs or the cash figures on Today.
  - They cannot refund, discount, add a free-typed "Other charge", add a supply, or change a price.
- **Every change to money or stock is recorded with who made it:** cancel, return (refunded), refund, supply move and expense void, in `ascendActivity`.
- **Team is enabled for Dental.**

## What changed

| Area | Before | Now |
|---|---|---|
| Staff policy (`convex/hasib/staffPolicy.js`) | Applied to catalog packs only. Dental is a booking-archetype pack, so a receptionist got cash totals and costs, and could set prices, refund and add supplies | Also applies to packs that charge from service items (`pack.serviceItems`), so dental gets the Retail guard, redaction and audit |
| Navigation (`src/lib/dashboard/navigation.js`) | No Team for dental | Team for the manager. Receptionists see supplies only, since treatments and prices are the manager's |
| Service requests (`convex/hasib/todayState.js`) | Any visit after a request cleared it, including a cancelled no-show | Only an open or completed visit clears it. A cancelled visit leaves the patient on Today |
| Clinic Today (`src/components/hasib/TodayView.jsx`) | Assumed cash figures were present, so it would crash once they were redacted; showed setup to staff | The money card shows only when figures are present. The setup checklist is the manager's |
| Merge repairs | The clinic Today `Figure` component was lost in the merge, so the page crashed | Restored; covered by the browser test |

## How it was tested

- **Real-logic journeys:** `tests/dental-journeys.test.mjs` has 7 journeys on the production Convex state code, with a manager and an invited receptionist. They were written first, and 5 failed before the fixes (RED):
  - sections for each role;
  - visits at catalogue prices with no costs or cash for staff;
  - staff refused prices, free charges, discounts, refunds and new supplies;
  - overpayment refused, with cancel, refund, return and stock moves audited by role;
  - a cancelled visit keeps the request open;
  - no notes and no delivery for either role.
- **Real-logic browser:** `tests/hasib-dental-browser.mjs`, run with a manager demo and a `--role=employee` demo. 341 assertions:
  - every manager screen at 1440, 1024, 768, 375 and 320px in English and Arabic;
  - the receptionist at 1440, 768 and 320px in English and Arabic: tabs, no cash card, no setup, no "Other charge", no supply costs, refund refused;
  - Axe serious/critical issues, overflow and page errors throughout.
- **Regressions:** `npm run verify` (Layla 169, Blue 206, Hasib 294). Browser suites: retail 441, retail-tech 490, Catalyst 197, WhatsApp connect 30, review onboarding 16, guided setup 28.

## Open for the live test

- Grant a real clinic Ascend with `packId: 'dental'`. Walk through: a patient asks Layla for a treatment → Today → Record visit → payment → Money.
- Invite a real receptionist email, sign in as them, and check their view and chat replies.
- After choosing Dental, check that chat text older than 24 hours is gone and the captured details stay.

## Rollback

Remove `'dental'` from `HASIB_LIVE_PACKS` and redeploy Blue. Visits, payments, supplies and the audit trail are kept.
