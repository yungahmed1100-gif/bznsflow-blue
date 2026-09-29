> Scope update (2026-09-28): [Industry optimization specification](industry-optimization-handoff.md) is authoritative for current Hasib work. This document retains earlier research/history; conflicting scope and completion claims do not override the new acceptance/status registry.

# Café Hasib — Claude / Antigravity Handoff

## Objective

Implement the café Hasib pack in the Blue repository using the existing simple dashboard tabs. Reuse the current restaurant food-service engine for recipes, ingredient stock, waste, supplier receiving, counts, prep batches, and cost reporting.

## Allowed scope

- `config/hasib-packs.js`
- `src/lib/hasib/strings.js`
- `src/components/hasib/RestaurantControls.jsx`
- `src/components/hasib/StockView.jsx`
- `src/components/hasib/TodayView.jsx`
- `src/components/hasib/InsightsView.jsx`
- Existing shared Hasib food-service backend files when café behavior requires them
- `tests/hasib-cafe.test.mjs`
- `industries/Cafes.md`
- This handoff file

Do not create a second café state engine. Do not add a new top-level dashboard tab.

## Café behavior

The café pack provides size and temperature variants, milk and extras, pickup time, recipes, prep batches, waste recording, supplier receiving, stock counts, and food-service cost metrics.

The existing tabs remain the product surface:

- Today: owner actions, sales, best item, product cost, labor cost, prime cost, waste, and stock variance.
- Chats: menu questions, availability, orders, customizations, lost demand, and handoffs.
- Orders: walk-in, pickup, delivery, status, customizations, refunds, and payment recording.
- Stock: ingredients, packaging, recipes, receiving, par levels, waste, counts, batches, and usage variance.
- Money: sales, COGS, cost percentages, prime cost, expenses, contribution, and supplier spending.
- Customers: contacts, order history, repeat activity, delivery history, and approved broadcasts.
- Settings: menu, variants, recipes, suppliers, par levels, waste reasons, expenses, and VAT.

## Release boundary

Keep `cafe` out of `HASIB_LIVE_PACKS`. Do not deploy, migrate Convex, change Green, register or disconnect numbers, or send live messages. Do not add POS, payroll, payment processing, supplier integrations, accounting replacement, or full expiry-lot tracking.

## Acceptance checks

- Café recipes consume ingredient stock on confirmed orders.
- Reversed orders restore recipe ingredient stock.
- Recipe costs update after supplier receiving.
- Waste is recorded with a reason and cost.
- Stock counts record variance.
- Café metrics show product cost, labor cost, prime cost, waste, stock variance, usage variance, menu performance, and channel performance.
- Café data remains tenant-scoped.
- English and Arabic strings have matching keys.
- Existing retail and electronics behavior remains unchanged.
- Café remains release-gated.
- No new café file remains untracked.

## Verification

Run:

```sh
npm run test:hasib
npm run lint
npm run typecheck
npm run build
git diff --check
```

Before staging, record the existing dirty worktree. Stage only the café manifest and shared files actually changed for café support. Never run `git add .` or stage unrelated restaurant, dental, medical, electronics, or salon work.

After staging, compare:

```sh
git diff --cached --name-only
git ls-files --error-unmatch industries/Cafes.md docs/antigravity/cafe-handoff.md tests/hasib-cafe.test.mjs
git status --short --untracked-files=all
```

The staged paths must match the café scope, and the café files must be Git-tracked before handoff.
