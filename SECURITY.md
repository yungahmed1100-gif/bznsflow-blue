# Security headers

Set in `vercel.json` under `headers`, applied to every route. This file exists
because JSON cannot carry comments and every one of these has a reason.

| Header | Value | Why |
|---|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Vercel already serves HTTPS; this stops the first plaintext request a user's typed `bznsflowai.com` would otherwise make. |
| `X-Frame-Options` | `DENY` | Nothing here should ever be framed. This is what actually protects `/signin` from clickjacking — `frame-ancestors` below is report-only and enforces nothing. |
| `X-Content-Type-Options` | `nosniff` | Stops a browser second-guessing a declared content type. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Outbound links to WhatsApp and Google Calendar leak the origin, not the full path. |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), interest-cohort=()` | The site needs none of these; denying them means an injected script cannot ask either. |
| `Content-Security-Policy-Report-Only` | see below | Reports violations without blocking. **Deliberately not enforced — see below.** |
| `X-Robots-Tag` | `noindex, nofollow, noarchive` | **Blue only.** Keeps the review deployment out of search results entirely. Removing it is part of any Green promotion, or the production site goes unindexed. |
| `X-Bznsflow-Environment` | `blue` | **Blue only.** Lets a response be identified as Blue's without reading the body — the quickest way to catch "am I looking at Green or Blue?" during review. |

`/assets/*` additionally gets `Cache-Control: public, max-age=31536000, immutable`,
which is safe because Vite fingerprints those filenames — a changed file gets a
changed name, so a year-long cache can never serve stale code.

## Why the CSP is report-only

Not caution. Enforcing it today would break the site on the next deploy.

The built HTML carries **four executable inline scripts** — on Green:

1. the scroll-reveal gate in `index.html`, which must run before first paint;
2. the Meta Pixel bootstrap in `index.html`;
3. and two that `vite-react-ssg` injects at build time.

> **Blue differs.** On the `layla/blue` branch, `index.html` line 66 reads
> `<!-- Marketing instrumentation is disabled in Blue. -->` and there is no
> `fbq` anywhere in it, so Blue carries **three**, not four. Everything below
> describes Green, which is the environment the policy has to survive.
>
> Blue still needs `script-src https://connect.facebook.net` for a different
> reason: `src/pages/LaylaOnboarding.jsx` loads Meta's Embedded Signup SDK.

A strict policy would have to allow these by hash. The first two are stable, but
**the two vite-react-ssg emits change hash on every build** — so a hash-pinned
policy would start blocking hydration the first time anyone ran `npm run build`,
with no error message beyond a console violation.

`'unsafe-inline'` in `script-src` is therefore doing real work here, and a CSP
carrying it is not buying much against XSS. That is worth saying plainly rather
than dressing up: **this policy is currently a reporting tool, not a defence.**

There are also 28 inline `style=` attributes from React, so `style-src` needs
`'unsafe-inline'` regardless of what happens to the scripts.

## Making it enforceable

In rough order of value:

1. Move the two `index.html` inline scripts into imported modules, so they load
   from `'self'` and need no hash.
2. Replace the Google Fonts `onload="this.media='all'"` attribute — an inline
   event handler needs `'unsafe-hashes'`, which is worse than the trick is worth.
3. Once only vite-react-ssg's own inline scripts remain, either adopt a nonce
   (needs a request-time render, which a static prerender does not have) or
   generate the hashes as a build step that rewrites the policy.

Until step 3, keep it report-only. Flipping it early trades a real outage for a
theoretical protection.

## What is deliberately not here

**No cookie consent gate.** The Meta Pixel initialises unconditionally on first
paint for every visitor, including EU/UK. This is a known, accepted gap — see
`COOKIES.md`, which documents the mechanism and the two available remedies. It
is a business decision, not an oversight.

## Cookies

All first-party cookies are `SameSite=Lax`, `Secure`, same-origin only, and none
is needed cross-site — so Chrome's third-party cookie restrictions do not affect
sign-in. `bf_session`, `bf_csrf` and `bf_oauth` are set by the server via
`Set-Cookie`, which also exempts them from Safari ITP's 7-day cap on
script-written cookies. Full table in `COOKIES.md`.

## Social sign-in

`/api/auth-oauth` → provider → `/api/auth-callback`, standard OIDC
authorization-code flow with PKCE. Setup runbook in `SOCIAL-SIGNIN.md`.

Three things about this flow are deliberate and will look like bugs to a
reviewer applying the rules the other endpoints follow:

- **The callback does not call `isAllowedOrigin`.** Providers send the browser
  back from their own origin, and some attach `Origin: https://accounts.google.com`.
  Running the same-origin check here would reject every real sign-in.
- **The callback does not call `verifyCsrf`.** `bf_csrf` reaches the page in the
  JSON body of `GET /api/auth-session`, and there is no page script on a
  redirect to echo it into a header. The forgery defence is the single-use
  `state` value, compared against the `bf_oauth` cookie in constant time.
- **`/api/auth-oauth` has neither check.** It is reached by a link click, which
  carries no `Origin`, and it only sets a short-lived cookie and redirects.

Both are covered by named tests in `tests/oauth.test.mjs` so a "consistency"
fix cannot land quietly.

Account linking is keyed on `(provider, subject)`, never on the email alone. An
email is used to link to an existing account only when the provider proves it is
verified — the check that closes the nOAuth hijack class, where a personal
Microsoft account can assert any address it likes. See the note in
`api/_lib/oidc.js` and the resolution order in migration 004.
