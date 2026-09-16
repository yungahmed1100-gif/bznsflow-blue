# Technical debt — found, measured, deliberately not fixed

Recorded 2026-09-16 during the repo sync/refactor. Each item was investigated and
left alone on purpose. Nothing here is a bug; all of it is a cost that will be
paid eventually, and the point of the file is that the cost is known rather than
rediscovered.

The single largest item has its own page:
[backend-migration-state.md](backend-migration-state.md).

## Frontend

**`src/pages/LaylaOnboarding.jsx` is 65 KB in 404 lines** — the largest source
file in the repo by a wide margin (3× `SignIn.jsx` by bytes), with a longest line
of 2,474 characters. It holds the whole customer onboarding journey: four steps,
email OTP, Meta Embedded Signup, catalog editing, website import and the preview
test. Splitting it is the right move and was out of scope for a behaviour-
preserving pass; it is also the file most likely to be edited next, which is
exactly why it should be split before it grows again.

**Four parallel content systems.** `src/i18n/{en,ar}.js` (258 keys each, verified
in sync), `src/lib/dashboard/strings.js` (its own `en`/`ar` objects, 23.6 KB, not
routed through `src/i18n`), `src/content/{privacy,terms,data-deletion}.js`, and
`src/data/{tiers,agents}.js` with parallel `_AR` arrays. Only the first is
covered by the i18n parity check in `tests/contracts.test.mjs`.

`strings.js` exports `STRING_KEYS` and `ARABIC_KEYS` which are referenced
nowhere — they look purpose-built for exactly that parity check.

**A second design-token palette.** `src/styles/base.css:13-93` is the token root.
`src/styles/layla-dashboard.css:5-13` declares a parallel palette with different
names and the same values — `--paper` = `--bg-primary` (`#f6efdf`), `--ink` =
`--text-primary`, `--rule` = `--border`, and so on — plus its own `--x-sign` and
font stack. `motion.css:6-8` adds a third `:root` block.

**Hardcoded colours outside the token files.** `layla-onboarding.css` has 43 hex
literals across 13 distinct values; four are exact `base.css` token values
retyped, and five (`#c9bfac`, `#928b7f`, `#276877`, `#28628f`, `#8c2525`) exist
in no token file. `layla-pilot.css` adds seven more. `RootLayout.jsx:10` renders
the Blue banner with an inline style object carrying its own colour, spacing and
font.

**Two access patterns for the same values.** `Home.jsx:119-147` passes
`CALENDAR_URL`, `WHATSAPP_URL` and `LANGUAGES` down as props while the same child
components import `waLink` directly.

**`components/ui/` mixes levels** — primitives (`Icon`, `BrandMark`) sit beside a
full page chrome (`LegalPage`, which renders nav + footer) and a non-visual head
component (`Seo`).

**Three pages are not pages.** `LaylaEligibility.jsx`, `LaylaOpenTest.jsx` and
`LaylaSetup.jsx` live in `src/pages/` but are never routed; they render inside
`LaylaPilot.jsx`. Worse, `pages/LaylaSetup.jsx` is *not* what `/layla/setup`
renders — `routes.jsx:50` maps that path to `LaylaOnboarding`.

## Backend

**Swallowed causes.** Each of these discards the underlying error with no log, so
"the provider refused" and "the network was down" are indistinguishable in
production:

- `_lib/layla/gateway.js:27` and `open-test.js:136` — `catch { return { status: 'ambiguous' } }`
- `_lib/layla/store.js:22` — `catch { throw new PilotError('storage_unavailable', 503) }`
- `_lib/layla/activation.js:104` — `catch { return \`${stage}_outcome_unknown\` }`
- `convex/http.ts` — every route wraps parse + mutation in one bare catch, so a
  validator rejection and an infrastructure failure both answer 503 with the same
  reason and nothing is logged

`review-api.js:81` (`inspectPortfolio`) was in this list and was fixed, because
it made a *wrong-binding* check unable to tell "lookup failed" from "no
portfolio".

**Uneven boundary validation.** `layla-meta.js:38` caps the body at 10 KB and
`dashboard-api.js:20-22` has per-action coercers, but `api/lead.js:91` accepts
`pageUrl` as any string truncated to 500 chars with no scheme check, and
`dashboard-api.js:88` accepts `patch.qualificationOverride` as any string of any
length.

**Hardcoded identifiers in tracked source.** The Blue Convex URLs appear in three
files; the Vercel project id in five scripts; real Meta identifiers (app
`1388038082832745`, WABA, phone, sender) in `activation.js:6`, with the app id
repeated in `dashboard-api.js:15`.

**Two worker secrets.** `LAYLA_META_WORKER_SECRET` and
`BLUE_MESSAGING_WORKER_SECRET` guard parts of the same pipeline.

## Tooling

**No ESLint, no formatter, no CI.** `npm test` is the only gate and it runs
locally, by hand. There is no `.github/` directory. A root `jsconfig.json` does
not exist; `convex/tsconfig.json` covers only `convex/`.

**Code style is split in two.** `LaylaOnboarding`, `LaylaSetup`, `LaylaOpenTest`,
`LaylaPilot` and two stylesheets are written in a dense, near-minified style;
everything else is conventionally formatted. Any formatter adopted later will
produce an enormous diff on those files.

## Considered and rejected

**Merging the rate-limit preamble.** Five call sites look alike and are not: they
differ in ip limit, global limit (`lead.js` checks none), fail-open vs
fail-closed, and response shape, and each documents why —
`auth-session.js:130-133` records a hole it closed. The shared remainder is two
comparisons. See the Phase 4 commit message.

**Removing "unused" exports.** A survey listed 14. Every one is used inside its
own module; the survey had checked only for imports elsewhere. Removing them
would have broken 14 live call sites.
