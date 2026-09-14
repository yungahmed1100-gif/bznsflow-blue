# Blue Convex backend

This is an isolated backend for the Blue review environment. It is deliberately
additive: the existing Supabase auth/API remains the live adapter until the
Convex deployment has been provisioned and migration checks pass.

## Local agent setup

```sh
npm install
npx convex dev --once
```

Convex agent mode creates a local deployment when no deploy key is configured.
Never copy Green credentials into this project. Set `CONVEX_DEPLOY_KEY` only for
the Blue deployment, and keep it in Vercel's server environment.

## Data boundary

Only these records are eligible for a one-time, reviewed migration from Green:

- the owner/customer account identity needed for review login;
- reviewed Layla business facts;
- non-secret WhatsApp asset identifiers and connection status.

Conversation history, access tokens, PINs, auth codes, cookies, and unrelated
production records are excluded. The migration must use an explicit export file
and be run once with `scripts/convex-migrate-blue.mjs`; it never connects to the
Green database automatically.
