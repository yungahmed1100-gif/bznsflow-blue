# Blue and Green — 2026-09-11

Green is the frozen production website: https://www.bznsflowai.com, Vercel bznsflow-main, deployment dpl_HW5E7HrdmRxPXjXoKyAmjyDiESbT. Its deployment was verified unchanged before and after Blue deployment. No production API, database, Meta asset, webhook or scheduler was changed.

Blue: https://bznsflow-blue.vercel.app/owner/layla. Vercel project bznsflow-blue / prj_TOWvngBTz4mVpI0p0Rrtgk62ZF1Q; deployment dpl_7eKns4zVrzkGfN92JiSHr1YLLBYj. Worktree /Users/ramsis21/Desktop/bznsflow-blue, branch layla/blue. Use npm run deploy:blue; it verifies the project link and supplies the exact Blue project ID. The Green worktree retains its original link.

Ahmed explicitly requested no app login for this test environment. Blue has synthetic per-session memory, no production data or Supabase connection, no outbound credentials, no cron and no marketing tracking. A random HttpOnly demo cookie partitions temporary state; state may reset between server instances or restarts, and expires after an hour. Use example facts only. The URL is accessible without app login, not an owner-authenticated private workspace.

The owner demo opens directly and supports business facts, FAQ previews, queued mock messages, processing, simulated receipts and the existing supervised simulator. Real Meta activation and live-test controls are hidden; provider calls fail closed. Production login and real customer onboarding remain in the final product scope and still need separate verification before App Review. Never promote this demo authentication bypass to Green.

Build rejects the Green project ID, production Supabase URL, live mode, live-test flags and external credentials. No-index metadata, robots.txt, X-Robots-Tag and a visible Blue banner mark the environment. No .env values were copied. Blue Vercel environment listing contained no project credentials before deployment.

Validation: full npm suite including 110 Layla tests and 3 Blue isolation tests passed; build passed. Deployed Blue returned HTTPS 200 with no-index and environment headers. Connected-browser verification loaded the demo without login and exercised a synthetic FAQ preview. Green deployment ID remained unchanged.

Review-readiness deadline: Sunday 2026-09-13 Asia/Muscat. Decision BF-2026-09-11-LAYLA-BLUE-GREEN, canonical note Decisions/2026-09-11-Layla-Blue-Green.md. Notion mirror: https://app.notion.com/p/3d8415cb8dec814aa5eac4a365c8c0f2.
