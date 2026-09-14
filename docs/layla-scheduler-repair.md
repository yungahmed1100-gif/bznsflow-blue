# Layla scheduler repair — 2026-09-11

Cloudflare workerd rejects Request redirect:error at construction. The previous scheduled worker swallowed that TypeError into worker_unavailable, explaining the one-millisecond failures before any Vercel request. Primary evidence: https://github.com/cloudflare/workerd/blob/main/src/workerd/api/http.c++ (Request constructor and tryParseRedirect).

Changed only the Cloudflare scheduler transport: redirect:manual plus explicit rejection of all 3xx responses; timeout/network failures use fixed redacted categories. No credential is forwarded to a redirected destination. There is no public trigger and no immediate retry. The Vercel worker and all messaging state/limits remain unchanged.

Deployed Cloudflare version fc4c11a1-71c4-459e-b09e-b1280f77cf08. Prior version ff7cffe8-cca7-48e4-84c0-fa5593f4f35d retained as historical evidence, not a working recovery target. Secret binding LAYLA_META_WORKER_SECRET preserved without reading its value. Existing cron remains every minute, unchanged since 16:08 UTC. Observability remains enabled with fixed error codes.

Regression coverage: Cloudflare-compatible request options, one authenticated canonical request, redirect rejection without forwarding/retry, missing secret, public 404, sanitized timeout/network/HTTP failures. Full npm suite passed including 110 Layla tests. Only scheduler code changed; website rebuild/redeployment is unnecessary.

Production cron observations and persisted heartbeat evidence are recorded in Desktop/Layla-Meta-Handoff/SCHEDULER-REPAIR.md. No direct worker probe was used for recovery verification. Owner pause remains true and no open test exists.

Operational stop: keep Layla paused; if scheduler transport must be stopped, remove its cron trigger while retaining the secret and application state. Do not reset budgets or message deduplication state. Review readiness deadline: Sunday 2026-09-13 Asia/Muscat, BF-2026-09-11-LAYLA-REVIEW-SUNDAY.
