> Scope update (2026-09-28): [Industry optimization specification](../docs/antigravity/industry-optimization-handoff.md) is authoritative for current Hasib work. This document retains earlier research/history; conflicting scope and completion claims do not override the new acceptance/status registry.

# Café Dashboard — Hasib

## Simple tabs

### Today

- Net sales and orders
- Best-selling café item
- Top contribution item
- Product cost percentage
- Labor cost percentage
- Prime cost percentage
- Waste cost
- Stock variance
- Low-stock items
- Orders waiting for owner

### Chats

- Menu questions
- Availability questions
- Café orders
- Pickup requests
- Delivery requests
- Milk and extra requests
- Lost-demand tracking
- Human handoffs

### Orders

- Walk-in orders
- Pickup orders
- Delivery orders
- Size options
- Hot or iced options
- Milk and extras
- Order status
- Discounts and refunds
- Payment recording
- Delivery and aggregator fees

### Stock

- Coffee beans
- Milk and syrups
- Cups and lids
- Pastries and desserts
- Menu items
- Recipes and portions
- Recipe cost calculation
- Supplier receiving
- Supplier price changes
- Par and reorder alerts
- Waste by reason
- Stock counts
- Prep batches
- Actual versus theoretical usage

### Money

- Net sales
- Product COGS
- Product cost percentage
- Labor cost percentage
- Prime cost
- Gross profit
- Operating expenses
- Waste cost
- Supplier spending
- Delivery commissions
- Item contribution margin
- Best-selling item
- Most profitable item
- Cash received
- Receivables

### Customers

- Customer contacts
- Order history
- Repeat customer activity
- Delivery customer history
- Approved broadcasts

### Settings

- Café menu
- Product sizes
- Hot or iced options
- Recipes
- Ingredient units
- Portion sizes
- Suppliers
- Par levels
- Waste reasons
- Expense categories
- VAT settings

## Cost-control rules

- Standardize recipes and portions.
- Keep menu and ingredient costs current.
- Receive stock against supplier invoices.
- Set reorder points from actual demand.
- Record every waste event.
- Count high-cost ingredients regularly.
- Compare recipe usage with stock usage.
- Review product and labor costs daily.
- Review supplier invoices weekly.
- Review operating costs monthly.

## Core formulas

- COGS = beginning inventory + purchases − ending inventory
- Product cost % = product COGS ÷ net sales
- Labor cost % = salaries ÷ net sales
- Prime cost = product COGS + salaries
- Gross profit = net sales − COGS
- Contribution margin = item revenue − recipe cost
- Usage variance = actual usage − theoretical usage

## BznsFlow boundary

Hasib controls café orders, stock, recipes, supplier receiving, waste, counts, prep batches, expenses, insights, customer records, and Layla conversations.

This release does not include POS integration, payroll processing, payment processing, supplier integrations, accounting-ledger replacement, or full expiry-lot tracking. Payments are recorded only after the owner receives them. Labor is entered manually as an expense.

The café pack remains behind the Hasib rollout gate until validation evidence is complete.

Best-practice references: [National Restaurant Association inventory guidance](https://restaurant.org/education-and-resources/resource-library/restaurateurs-use-tech-to-manage-inventory,-save-money/), [National Restaurant Association waste guidance](https://restaurant.org/education-and-resources/resource-library/working-to-reduce-food-waste), and [Toast restaurant accounting guidance](https://pos.toasttab.com/es-us/blog/on-the-line/restaurant-accounting-guide).
