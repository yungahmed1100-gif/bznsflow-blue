# Scripts — what exists, what runs it, when to use it

Every file in `scripts/`. Written because six of them were reachable only by
knowing they existed: no npm script, no doc, no mention anywhere. A tool nobody
can find is indistinguishable from a tool that does not work.

## Run automatically

These need no decision — the build or the test suite invokes them.

| Script | Invoked by | What it does |
|---|---|---|
| `check-blue-environment.mjs` | `prebuild`, `deploy-blue.mjs`, `tests/blue-environment.test.mjs` | Hard-fails the build if a Green secret, the wrong Vercel project, or a half-enabled gate combination is present. The single most important guardrail in the repo. |
| `gen-kb.mjs --check` | `prebuild` | Fails if `api/_lib/kb.generated.js` has drifted from the knowledge-base markdown. |
| `gen-sector-prefill.mjs --check` | `prebuild` | Fails if `src/lib/sector-prefill.generated.js` has drifted from `industries.js`, `layla-suggestions.js` or `layla-sector-packs.js`. |
| `check-onboarding-coverage.mjs` | `prebuild`, `check:onboarding-coverage`, `tests/onboarding-ladder.test.mjs` | Fails if any sector resolves to an archetype without complete bilingual guided-setup copy, or if a ladder rung targets a field the profile contract does not accept. Catches both empty Arabic and Arabic that is secretly English. |
| `check-eval-coverage.mjs` | `prebuild`, `check:eval-coverage`, `tests/eval-harness.test.mjs` | Fails if `config/eval-questions.js` has no labelled questions for a sector in `industries.js`, a required intent, or one of the four language modes. Adding a sector without eval coverage makes its routing quality silently unmeasured. |
| `check-lexicon.mjs` | `prebuild`, `check:lexicon`, `tests/intent-routing.test.mjs` | Fails on a term in `config/intent-lexicon.js` that can never match: one not authored in its folded form (`شكوى` instead of `شكوي`), too short to be safe, duplicated, claimed by two intents where precedence would decide silently, or in the wrong language group and so matched by the wrong rule. All of these compile, run, and never fire — the routing quietly gets worse and one eval row drops with no explanation. |
| `gen-sitemap.mjs` | `prebuild`, `gen:sitemap` | Regenerates `public/sitemap.xml` from the route manifest. |
| `seo/checks.mjs`, `seo/collect.mjs`, `seo/rules.mjs` | imported by `seo-audit.mjs` | Library code, not entry points. |

## Run on demand

| Script | Command | When |
|---|---|---|
| `gen-kb.mjs` | `npm run gen:kb` | After editing the knowledge-base markdown. Commit the result. |
| `gen-sector-prefill.mjs` | `npm run gen:sector-prefill` | After editing any sector source. Commit the result. |
| `eval-intents.mjs` | `npm run eval:intents` | Scores the regexes, the layered `route()` and `classifyIntent()` head to head against `config/eval-questions.js`, each labelled row routed with the fixture tenant profile from `config/eval-profiles.js`. Reports which layer decided, and the **regression count** — rows the regexes get right and `route()` does not, which is zero by construction and a control-flow bug otherwise — accuracy, per-intent macro-F1, the `unknown` fall-through rate and every misroute. **Needs no model and no network.** Report lands in `work/eval/`. `--gate` enforces the macro-F1 floor from [blue-rag-engine.md](blue-rag-engine.md); `--min=` moves it. |
| `calibrate-router.mjs` | `npm run router:calibrate` | Chooses the profile-layer thresholds in `api/_lib/layla/route.js` and checks the lexicon against `config/intent-exemplars.js` — a second corpus, independent of the eval set by rule. **It may never import `config/eval-questions.js`**: picking a threshold by watching the eval score move folds the tuning into the reported number. Needs no model. `--json`. |
| `propose-owner-questions.mjs` | `npm run onboarding:propose` | Drafts sector-specific placeholder examples for the guided-setup ladder with a local Ollama model, into `work/eval/proposals/owner-questions/`. Never writes `src/` — placeholder copy is customer-facing Arabic and a person promotes it. `--sector`, `--field`. |
| `propose-eval-questions.mjs` | `npm run eval:propose` | Drafts candidate eval questions with a local Ollama model into `work/eval/proposals/`. The only script that needs a model. It never writes `config/`: a person promotes the good candidates by hand, because a mislabelled question moves the score silently. `--sector`, `--intent`, `--lang`, `--count`. |
| `seo-audit.mjs` | `npm run seo:audit` | Crawls the sitemap and reports Core Web Vitals. |
| `a11y.mjs` | `npm run test:a11y` | axe-core over both languages at desktop and phone widths. Needs a dev server; set `BASE` if not on :5173. |
| `shoot.mjs` | `npm run shots -- <label>` | Screenshots the homepage across the breakpoint scale in both languages, into `work/shots/<label>/`. Use it to compare a design change against the state before it. |
| `chat-test-stack.sh` | `npm run test:stack up` | Brings up the Postgres container `tests/e2e-chat.mjs` needs. |
| `convex-migrate-blue.mjs` | `npm run convex:migrate:validate` | Validates a Convex migration export before import. |
| `deploy-blue.mjs` | `npm run deploy:blue` | Deploys to Blue **only**, after the isolation check passes. |

## Operational — these write real state

**Each one changes something outside the repo.** They are deliberately not wired
to npm scripts, so that running one is always a decision. Read the file before
running it; none of them prints a secret value.

| Script | Effect |
|---|---|
| `configure-blue-email.mjs` | Reads `.env.local` and installs Blue's Resend email configuration into the Vercel project. Refuses to run against any project id but Blue's. |
| `configure-blue-messaging.mjs` | Mints `BLUE_MESSAGING_WORKER_SECRET`, writes it to `.env.blue-worker.local` (mode 600) and installs it in Vercel. Refuses any project but Blue's. |
| `issue-blue-review-access.mjs` | Creates an isolated reviewer account and saves an expiring sign-in link to `.env.blue-review-access.local`. **The link is a credential** — supply it only in Meta's review access field. `--rotate` revokes the saved link and issues a new one. Referenced by [meta-app-review-submission.md](meta-app-review-submission.md). |
| `generate-agent-avatars.mjs` | Regenerates the 12 agent avatars in `src/assets/agents/` via the Gemini image API. Needs `GEMINI_API_KEY`. Kept as the provenance of committed artwork: without it, nobody can reproduce or restyle those assets. Two-phase — Layla is the style anchor, the other 11 are generated against her image. |

## Deleted, and why

- `tests/layla-https.mjs` — probed `https://www.bznsflowai.com`, i.e. **frozen Green production**, from the Blue worktree. No script ran it. Removed as a Blue-boundary hazard under AGENTS.md, not merely as dead weight.
- `tests/layla-setup-server.mjs` — a Vite fixture server nothing imported. Both browser suites take a `--port` URL from `process.argv[2]` instead.
