# Backend migration state — Supabase and Convex, both live

Written 2026-09-16. Nothing here proposes a change. It exists because the repo
runs **two backends at once**, the split is invisible from any single file, and
the cutover has at least one blocker nobody has written down.

Read this before touching auth, messaging, contacts or the business profile.

## The switch

One predicate decides which backend a request uses:

```js
// api/_lib/convex.js
export function convexConfigured(env = process.env) {
  return env.CONVEX_CLOUD_URL === BLUE_CLOUD
    && (!env.VITE_CONVEX_URL || env.VITE_CONVEX_URL === BLUE_CLOUD)
    && /^[a-f0-9]{64}$/i.test(env.BLUE_REVIEW_SERVICE_SECRET || '')
    && !env.SUPABASE_URL && !env.SUPABASE_SERVICE_ROLE_KEY;
}
```

Note the last clause: Convex is used **only when Supabase is absent**. There is
no both-on mode and no per-feature switch. An environment with both sets of
variables silently runs Supabase for everything.

Route-level forks live at `api/auth-code.js:33` and `api/auth-session.js:51`.

## What exists twice

| Concern | Supabase | Convex |
|---|---|---|
| Accounts, OTP, sessions | `_lib/db.js` RPCs; `web-chatbot/migrations/003-accounts.sql` | `_lib/convex.js` `blueAuthStore` → `convex/blueAuth.ts` + `blueAuthState.js`; tables `blueAuthChallenges`, `blueAuthLimits`, `accounts`, `sessions` |
| **OAuth / social sign-in** | `_lib/oidc.js` + `auth_oauth_login`; `004-oauth-identities.sql` | **nothing — see Blocker 1** |
| Session cookie | `bf_session` (`_lib/cookies.js`) | `__Host-blue_account` (`_lib/blue-auth.js`) |
| Rate limiting | `web_check_rate` RPC, `web_rate_limits` | `blueAuthLimits`, `blueMessageRates`, HMAC'd ip buckets |
| Messaging state | `_lib/layla/store.js` CAS over a JSON blob + `domain.js` | `convex/blueMessaging.ts` + `blueMessagingState.js`; `blueConversations`, `blueMessages` |
| Webhook ingest | `parseEvents` + `accept` | `ingestBlueEnvelope` (`_lib/layla/blue-messaging.js`) |
| Customer onboarding | `customer-store.js` over `layla_tenants` / `layla_integrations` | `convex/review.ts` + `blueReviewSessions` / `whatsappIntegrations` |
| Business profile | `domain.js` `blankProfile` on the Supabase blob | `convex/layla.ts`, **and again** inside `blueReviewSessions.profile` |
| Contacts | a `contacts` map inside the JSON blob | `convex/blueContacts.js`, table `blueContacts` |
| Campaigns / broadcast | none | `convex/blueCampaign.ts`, `blueCampaigns`, `blueCampaignRecipients`, `blueTemplates` |

The business profile is the worst of these: **three representations** of the same
facts, only one of which `reviewProfile()` validates.

---

## Blocker 1 — OAuth has no Convex path at all

`api/auth-oauth.js` and `api/auth-callback.js` contain **no fork**. They call
`_lib/db.js`, which is Supabase-only. And on the Convex path the session
endpoint hardcodes an empty provider list:

```js
// api/_lib/blue-auth.js:39
return send(res, 200, { ok: true, csrfToken: …, account: …, providers: [] }, { vary: 'Cookie' });
```

The sign-in page renders only the providers the server reports. So a full
Convex cutover does not *break* social sign-in with an error — **it silently
removes the buttons**, and every account that exists only as a Google,
Microsoft or LinkedIn identity becomes unreachable. There is no migration path
for `oauth_identities` because there is no Convex table to migrate it into.

This is the blocking item for the cutover. Nothing else on this page is.

## Blocker 2 — two live session cookies

`bf_session` and `__Host-blue_account` are issued by different code, verified by
different code, and neither knows about the other. A visitor can hold both. Any
cutover has to decide which survives and how the other is retired, or sessions
will appear to work while pointing at the wrong account store.

## Sharp edge — one secret does four jobs

`BLUE_REVIEW_SERVICE_SECRET` is simultaneously:

1. the bearer token for all six Convex HTTP routes (`_lib/convex.js`);
2. the HMAC key for auth rate-limit IP buckets (`blue-auth.js:62`);
3. the HMAC key for review CSRF **and** attempt state (`review-api.js:124,134`);
4. the HMAC key for website-import IP buckets (`review-api.js:212`).

Rotating it therefore invalidates every open review session and resets every
rate-limit bucket at the same moment as it re-authenticates the backend. That
may be acceptable, but it should be a decision rather than a discovery during an
incident.

## Sharp edge — three schedulers for one queue

1. `api/layla-meta-worker.js` — bearer-guarded HTTP worker
2. `convex/crons.ts` — four jobs (messaging and campaign recovery every minute, review and auth cleanup every 15)
3. `ops/layla-minute-worker.js` — external minute loop

`vercel.json` has `"crons": []`, so the Vercel route is driven from outside.
Three independent things can advance the same work.

## Dead on arrival

`api/_lib/layla/rag-engine.js` — 121 lines implementing chunking, reciprocal-rank
fusion and kNN intent classification, with a full test file
(`tests/blue-rag.test.mjs`). **Its only importer is that test.** No production
code path reaches it. Either it becomes the answer path or it should go;
carrying it implies a retrieval capability that is not live.

Similarly, `config/layla-qualification.js` is 34.5 KB of which only
`packDescription` is imported by production code (`convex/blueDashboardState.js`).

## Untested

Every Convex `.ts` binding is untested: `schema.ts`, `http.ts`, `crons.ts`,
`migrate.ts` and the nine query/mutation/action modules. The tests cover the pure
`*State.js` modules those delegate to, via the in-memory fake in
`tests/helpers/convex-memory.mjs`. `tests/blue-auth.test.mjs:92` is the one
exception and it asserts on the *source text* of `convex/blueAuth.ts` rather than
executing it.

`tests/convex-store.test.mjs` covers the client side of that boundary.
