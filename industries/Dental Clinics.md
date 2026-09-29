> Scope update (2026-09-28): [Industry optimization specification](../docs/antigravity/industry-optimization-handoff.md) is authoritative for current Hasib work. This document retains earlier research/history; conflicting scope and completion claims do not override the new acceptance/status registry.

# Dental Clinics Hasib Tabs

## Summary

Dental uses the owner-only Hasib dashboard for operational work: patient contact, reception conversations, services, recorded visits, payments, expenses, and reporting.

Clinical records, diagnoses, symptoms, prescriptions, X-rays, and treatment notes remain excluded.

## Tabs Shown

### Today

- Owner action list
- Layla replies
- Reception handoffs
- Pending service requests
- Today’s recorded revenue
- Outstanding balances
- Setup checklist

### Chats

- WhatsApp conversations
- Layla responses
- Human handoffs
- Service questions
- Price questions
- Preferred date
- Preferred time
- Branch preference
- Consent status

### Visits

- Recorded visits
- Treatment charges
- Payment recording
- Outstanding balances
- Refund recording
- Visit status
- Customer history link

The existing Hasib Orders ledger remains the internal data source and displays as Visits for dental owners.

### Services

- Treatment catalog
- Service prices
- Service categories
- Service descriptions
- Service availability
- Supplies inventory
- Low-stock supplies
- Service archive

### Money

- Revenue
- Cash received
- Receivables
- Expenses
- Net profit
- Revenue by service
- Expense categories
- Accountant export

### Patients

- Patient contact records
- Reception history
- Consent records
- Contact source
- Qualification status
- Last conversation
- Open conversation
- Import and export

Patients stores operational contact data only.

### Settings

- WhatsApp connection
- Instagram connection
- Business profile
- Opening hours
- Business timezone
- Service setup
- Expense categories
- VAT settings
- Hasib industry setting

## Hidden Or Excluded

- Clinical records
- Diagnoses
- Symptoms
- Prescriptions
- X-rays
- Treatment plans
- Medical notes
- Insurance claims
- Payment processing
- Payroll
- External calendar control
- Automatic appointment booking

Appointment requests remain inside Chats until BznsFlow owns scheduling and availability.

## Implementation Rules

- Use existing Hasib modules.
- Display Orders as Visits.
- Display Contacts as Patients.
- Keep appointments planned.
- Store operational booking details.
- Exclude clinical free text.
- Keep dental behind release gates.
- Preserve retail behavior.
- Preserve electronics behavior.

## Acceptance

- Dental shows approved tabs only.
- Existing packs keep current labels.
- Chats capture operational details only.
- No clinical free text persists.
- Hasib financial totals remain accurate.
- Arabic and English remain supported.
- RTL and mobile remain supported.
- Tenant isolation remains enforced.
