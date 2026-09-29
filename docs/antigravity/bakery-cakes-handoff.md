> Scope update (2026-09-28): [Industry optimization specification](industry-optimization-handoff.md) is authoritative for current Hasib work. This document retains earlier research/history; conflicting scope and completion claims do not override the new acceptance/status registry.

# Bakery and Cakes — Claude / Antigravity handoff

## Scope

Implement and review the bakery and cakes Hasib pack in `/Users/ramsis21/Desktop/bznsflow-blue`. Keep the existing simple dashboard tabs and place bakery controls inside Stock, Today, Money, Orders, and Customers.

## Allowed change surface

- `config/hasib-packs.js`
- `convex/schema.ts`
- `convex/hasib/`
- `api/_lib/hasib/validate.js`
- `src/components/hasib/`
- `src/lib/hasib/strings.js`
- `src/styles/hasib.css`
- `industries/Bakery and Cakes.md`
- `docs/antigravity/bakery-cakes-handoff.md`
- bakery-specific tests and the Hasib test script

Preserve unrelated working-tree changes. Stage explicit bakery/shared paths only; never use `git add -A` or a wildcard.

## Required behavior

- Bakery pack id is `cakes` and remains release gated until the owner approves release.
- Keep Today, Chats, Orders, Stock, Money, Customers, and Settings.
- Add cake order fields: inscription, filling, design notes, allergen request, and pickup time.
- Track recipes, yields, ingredient cost, supplier prices, production batches, waste, counts, and actual versus theoretical usage.
- Track dated supplier and production lots, consume lots FEFO, and show the next seven days of expiring stock.
- Include unsold and failed-batch waste reasons.
- Keep all stock and money in integer baisa.
- Enforce account ownership and request idempotency.
- Use the existing Hasib API and Convex state patterns.

## Product boundary

Hasib is the owner's operating dashboard. Do not add staff accounts, POS replacement, payment processing, payroll, accounting replacement, supplier integrations, or food-safety certification workflows. Do not add a new top-level tab.

## Validation

Run:

```bash
npm run test:hasib
npm test
npm run lint
npm run typecheck
npm run build
```

Do not deploy, migrate production, modify Green, or push to Vercel. Report any pre-existing warnings separately from bakery failures.
