# Cookies and local storage

Every piece of state this site stores on a visitor's device, why it exists, and
whether it may be set before consent.

Scope note: ePrivacy/GDPR govern *storing or accessing information on a user's
terminal equipment*. That covers `localStorage` exactly as it covers cookies, so
this registry lists both. "It's not a cookie" is not an exemption.

## Categories

| Category | Consent needed | Rule |
|---|---|---|
| **Strictly necessary** | No | The service cannot work without it, and the visitor asked for the service |
| **Marketing / analytics** | **Yes, before it is set** | Anything measuring, profiling or attributing |

---

## Strictly necessary — set without consent

| Name | Type | Lifetime | Purpose |
|---|---|---|---|
| `bf_locale` | cookie | 1 year | Remembers the language chosen in the switcher. Written in `src/pages/Home.jsx`. |
| `bf_session` | cookie, **HttpOnly** | 30 days | Identifies a signed-in account. Issued by `POST /api/auth-session` on the sign-in page; cleared on sign-out. Holds a random 32-byte token — the database stores only its SHA-256. |
| `bf_csrf` | cookie, **HttpOnly** | 30 days | CSRF double-submit token, echoed in `x-csrf-token`. Issued by `GET /api/auth-session`, which returns the token in its JSON body — so the page never reads the cookie and it can be HttpOnly, unlike the textbook pattern. |
| `bf_oauth` | cookie, **HttpOnly** | 10 minutes | Holds one in-flight social sign-in: which provider, the `state`, the `nonce` and the PKCE verifier. Set by `GET /api/auth-oauth` when a provider button is clicked, and deleted by `/api/auth-callback` the moment the visitor returns — single use. Never set unless a provider button is clicked. |
| `bznsflow_chat_session` | localStorage | until cleared | Keeps one Layla conversation continuous across page loads (`src/lib/chat.js`). |
| `bf_playbook_seen` | localStorage | until cleared | Stops the exit-intent playbook modal re-appearing (`src/hooks/useExitIntent.js`). |

All three sign-in cookies are strictly necessary and therefore need no consent:
one authenticates a session the visitor explicitly asked for, and the other two
exist only to protect that session — `bf_csrf` from cross-site forgery, and
`bf_oauth` from having a social sign-in hijacked mid-flight. None measures,
profiles or attributes anything, and none is set until the visitor acts on the
sign-in page — `bf_oauth` only when a provider button is actually clicked.

`bf_locale` is deliberately **not** used to redirect. Googlebot sends no cookies
and crawls from the US, so a cookie-driven redirect on `/` or `/en` would serve
the crawler something other than the URL it requested — the standard way a site
loses its hreflang pair from the index. The public routes stay deterministic.

## Marketing — consent required, **currently NOT gated**

> **Green only.** These three are set by the Meta Pixel bootstrap in
> `index.html`, which exists on `master` (Green) and is disabled on `layla/blue`
> — Blue's `index.html` line 66 reads `Marketing instrumentation is disabled in
> Blue.` and initialises no `fbq`. The table describes Green, which is what a
> visitor to www.bznsflowai.com actually gets; it is therefore still the
> accurate disclosure and must not be deleted because Blue happens not to set
> them. `src/content/privacy.js` says the same thing to visitors, for the same
> reason.

| Name | Type | Lifetime | Set by |
|---|---|---|---|
| `_fbp` | cookie | ~90 days | Meta Pixel, loaded in `index.html` |
| `_fbc` | cookie | ~90 days | Meta Pixel, only when the visitor arrives on an `fbclid` link |
| `bf_uid` | localStorage | until cleared | `index.html` — first-party id passed to Meta as `external_id` for advanced matching |

> **Known gap.** `index.html` calls `fbq('init')` and `fbq('track','PageView')`
> unconditionally on load, so these are set for every visitor including in the
> EU/UK, with no prior consent. Meanwhile `src/data/agents.js` markets
> "GDPR (EU) + GCC regional compliance" as a product capability.
>
> Two ways to close it, neither implemented yet:
> 1. **Consent gate** — hold `fbq('init')` until the visitor accepts. Costs some
>    attribution on EU traffic.
> 2. **Geo gate** — fire everywhere except EU/UK. Keeps full attribution on the
>    Oman/GCC/US markets that actually convert.
>
> This is a description of the mechanism, not legal advice. Confirm the
> obligation for your actual markets with someone qualified.

---

## Adding a cookie

1. Decide the category honestly. If it measures anything, it is not necessary.
2. Add it to `COOKIE` in `src/lib/cookies.js` (client) or the constants in
   `api/_lib/cookies.js` (server) — never hardcode the name at a call site.
3. Add a row here. The privacy policy and the consent banner are both generated
   from this table by hand; an unlisted cookie is an undisclosed one.
4. Session-style and auth cookies must be `HttpOnly`. The only cookie that may
   be script-readable is the CSRF token, because double-submit requires it.
