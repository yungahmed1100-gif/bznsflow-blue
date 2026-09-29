> Scope update (2026-09-28): [Industry optimization specification](../docs/antigravity/industry-optimization-handoff.md) is authoritative for current Hasib work. This document retains earlier research/history; conflicting scope and completion claims do not override the new acceptance/status registry.

# Restaurant Dashboard — Hasib

## Simple tabs

### Today

- Net sales and orders
- Food cost percentage
- Labor cost percentage
- Prime cost percentage
- Waste cost
- Stock variance
- Low stock and expiry alerts
- Orders waiting for the owner
- Highest cost menu items

### Chats

- Capture orders through Layla
- Answer menu questions
- Confirm item availability
- Send order updates
- Record lost demand
- Escalate customer issues

### Orders

- Dine-in orders
- Takeaway orders
- Delivery orders
- Menu modifiers
- Order status
- Discounts and refunds
- Payment status
- Sales channel
- Delivery and aggregator fees

### Stock

- Ingredient stock
- Menu item stock
- Units and conversions
- Recipes and portions
- Recipe cost calculation
- Supplier receiving
- Invoice number
- Supplier price changes
- Par and reorder alerts
- Stock rotation checks
- Waste recording
- Stock counts
- Stock variance
- Prep batches
- Actual versus theoretical usage

### Money

- Net sales
- Food COGS
- Food cost percentage
- Labor cost percentage
- Prime cost
- Gross profit
- Operating expenses
- Waste cost
- Supplier spending
- Delivery commissions
- Cash received
- Receivables
- Menu contribution margin
- Channel sales and contribution
- Cost trend by supplier

### Customers

- Customer contacts
- Order history
- Repeat customer activity
- Delivery customer history
- Approved broadcasts

### Settings

- Menu categories
- Menu prices
- Recipes
- Ingredient units
- Portion sizes
- Suppliers
- Par levels
- Waste reasons
- Labor expense entries
- VAT settings

## Cost-control rules

- Standardize recipes and portions.
- Use FIFO for perishables.
- Set par levels by demand.
- Receive stock against invoices.
- Track supplier price changes.
- Record every waste event.
- Count high-cost items weekly.
- Compare actual and theoretical usage.
- Review food and labor costs daily.
- Review invoices and inventory weekly.
- Review operating costs monthly.

## Core formulas

- COGS = beginning inventory + purchases − ending inventory
- Food cost % = food COGS ÷ food sales
- Labor cost % = labor cost ÷ net sales
- Prime cost = food COGS + labor cost
- Gross profit = net sales − COGS
- Menu contribution = item revenue − recipe cost

## BznsFlow boundary

Hasib controls orders, stock, recipes, supplier receiving, waste, counts, expenses, insights, customer records, and Layla conversations. The first restaurant release does not include POS integration, payroll, accounting ledger replacement, or supplier integration. Labor is entered manually as an expense.

The restaurant pack remains behind the Hasib rollout gate until its validation evidence is complete.

Restaurant cost guidance: [National Restaurant Association inventory guidance](https://restaurant.org/education-and-resources/resource-library/restaurateurs-use-tech-to-manage-inventory,-save-money/), [National Restaurant Association waste guidance](https://restaurant.org/education-and-resources/resource-library/working-to-reduce-food-waste), and [Toast restaurant accounting guidance](https://pos.toasttab.com/es-us/blog/on-the-line/restaurant-accounting-guide).
