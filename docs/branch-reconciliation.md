# Branch reconciliation — `layla/blue` vs `master`

Written 2026-09-16, while `layla/blue` was 2 behind / 17 ahead of `master`
(merge-base `ca542fd`).

This file exists so that the eventual promotion merge is resolved by a decision
that was recorded at the time, rather than rediscovered under conflict markers by
whoever runs the merge months later.

## Why `git merge master` was not run

`master` carries two commits blue never took:

| Commit | Subject |
|---|---|
| `d8e84aa` | `feat(playbook): give the lead magnet a page, and retire the email teaser` |
| `a03c79d` | `feat(playbook): a way back to the site from the landing page` |

Blue built the same feature independently, in `45ed72b`. A dry-run merge
(`git merge-tree $(git merge-base master layla/blue) layla/blue master`) produces
**14 conflict hunks across 9 files**:

```
changed in both : package.json, public/sitemap.xml, src/routes.jsx,
                  src/routes-manifest.js, src/components/ui/PlaybookModal.jsx,
                  src/styles/playbook.css, tests/contracts.test.mjs
added in both   : src/pages/Playbook.jsx, tests/lead.test.mjs
merged cleanly  : scripts/a11y.mjs, src/lib/analytics.js, src/styles/utilities.css
```

"Added in both" is the tell: neither side inherited the file from the other, so a
merge has no basis on which to combine them and hands the whole file to a human.
Blue's versions are newer and carry Blue-specific work, so resolving all nine
would mean re-landing work blue already has, at the cost of nine chances to lose
something.

## The decision

**Blue's versions supersede master's** for every file above **except one**.
`d8e84aa` is already present in blue in substance via `45ed72b`.

### The exception: `tests/lead.test.mjs` — master's version won

Blue's copy was a rewrite that never ran (no npm script referenced it), and it
does not work. It fails 3 of 7 checks with `sent is not defined`, and the
approach cannot be repaired as written: it tries to stub the mailer with

```js
Object.defineProperty(mailer, 'pushLead', { value: … })
```

on the strength of a comment claiming "api/lead.js calls it through the module
object". It does not — `api/lead.js:29` does `import { pushLead } from
'./_lib/mailer.js'`, a named binding, and an ESM module namespace object is
sealed, so the redefinition can never intercept that call.

Master's version passes 8/8 because it tests the exported pure helpers
(`cleanPhone`, `cleanIndustry`) directly instead of trying to intercept a
network call. Master's file was therefore restored over blue's, and wired into
the `test` script — it had never been run by anything on either branch.

The only thing blue genuinely lacked was the **"back to the site" playbook nav**
from `a03c79d`. That has now been ported by hand onto blue's files rather than
checked out from master:

- `src/pages/Playbook.jsx` — the `.pb-nav-end` wrapper and the `.pb-services` link
- `src/styles/playbook.css` — `.pb-nav-end`, `.pb-services`, `.pb-services-arrow`,
  the RTL letter-spacing reset, and the `max-width: 640px` adjustments

No new copy was invented: the link reuses the existing `nav_solution` i18n key,
present in both `src/i18n/en.js` and `src/i18n/ar.js`.

## When blue is promoted

`master` is expected to be **fast-forwarded to, or reset onto, blue** — not
merged with it. If a merge is run anyway, resolve every conflict in the nine
files above **in favour of blue, except `tests/lead.test.mjs`** (see the
exception above), and check that the ported nav is still present afterwards.

The two `master` commits can then be considered absorbed. Nothing else in
`master` is missing from blue.

## Not covered here

This file is only about the branch divergence. The larger structural debt — the
Supabase↔Convex dual stack — is documented in
[backend-migration-state.md](backend-migration-state.md).
