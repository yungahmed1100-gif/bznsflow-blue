# Project MCP connections and tool map

Saved 2026-09-12. Configuration: `../.codex/config.toml`. Start/resume Codex with `/Users/ramsis21/Desktop/bznsflow-blue` as the working directory so trusted project configuration is loaded. These entries also exist globally for sessions started at the home directory. Do not copy OAuth credentials into project files.

| Connection | Purpose / tools | Verified status |
| --- | --- | --- |
| `meta-dev` — `https://mcp.facebook.com/devtools` | Discover current Meta Developer Tools; inspect app 1388038082832745 and signup configuration 2144711899802123, saved login variation/permissions/domains/tester access | Connected and verified 2026-09-12: app identity, settings, webhook subscriptions and review status read successfully. |
| `vercel` — `https://mcp.vercel.com` | Discover project/deployment/configuration tools; restrict work to bznsflow-blue, project prj_TOWvngBTz4mVpI0p0Rrtgk62ZF1Q | Connected and verified 2026-09-12: exact Blue project and deployment read successfully. |
| `convex-blue` — installed project Convex CLI | `status`, `functionSpec`, `tables`, `runOneoffQuery`, `data`, `run`, `envList`, `envSet`, `envRemove`, `insights` (server-advertised availability may vary) | Configured with project directory and deployment quaint-nightingale-675. MCP status/functionSpec/envList connectivity verified 2026-09-12. `envGet` and `logs` disabled. |
| Existing `node_repl` browser connection | `mcp__node_repl__js` + browser-client Chrome runtime for existing logged-in UI and signup rehearsal | Working during prior session. Read Chrome skill and reconnect through documented bootstrap when bindings absent. |

Project directory and deployment flags select defaults; they do not constitute an authorization boundary. Always check the exact Blue target before reading or mutating resources. Never use the preserved Supabase connector for this Convex review flow or inspect Green.

Authentication is held by the existing Codex credential store. Reuse it. Re-login only after a confirmed authentication failure:

```sh
codex mcp login meta-dev
codex mcp login vercel
```

Safe configuration inspection:

```sh
codex mcp get meta-dev
codex mcp get vercel
codex mcp get convex-blue
```

Avoid unfiltered `codex mcp list`: an unrelated existing connector contains sensitive command arguments.

The saved configuration and this inventory persist across sessions. Live tool handles and browser bindings do not. Tool discovery must read the server’s actual advertised tools after startup; documentation cannot manufacture callable tools. The prior running session did not hot-load newly added MCPs, so reload it once. Subsequent sessions started with this configuration should load connections at startup without repeating setup or OAuth, subject to credential expiry and host project-trust settings.

Before resuming implementation, read [the checkpoint](SESSION-CHECKPOINT.md). The review API module is implemented and backend/frontend deployed; real Meta rehearsal and App Review submission remain incomplete.
