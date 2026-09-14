# Website implementation

Preserve unrelated working-tree edits, especially login and registration. For BznsFlow work read the canonical business Operating-System.md and its relevant routes. For Layla pilot changes read docs/layla-meta-engineering.md. The owner pilot uses the dedicated Omani Meta Cloud API number; future customer onboarding uses official Meta Coexistence and must preserve each customer's WhatsApp Business app. Do not introduce OpenWA, deploy, migrate production, register/disconnect a number or send live messages without explicit user authorization. New customer Embedded Signup is future work. Record verified evidence and remaining release gaps accurately.

# Blue environment boundary
All ongoing Layla implementation happens in this worktree on branch layla/blue. Deploy only to Vercel project bznsflow-blue. Green is bznsflow-main at https://www.bznsflowai.com and is frozen until Ahmed explicitly authorizes a production release. Never copy production database, Meta, email, CRM, OAuth or scheduler secrets into Blue. Blue requires an isolated test database and separately authorized Meta test binding. No production webhook changes or Green deployments. Keep live sending disabled by default.

# Approved customer journey update — 2026-09-11
Blue customer onboarding now targets real Embedded Signup on the existing review app, using Blue-specific signup configuration, isolated test assets and a separate database. This supersedes the synthetic-only restriction for authenticated customer setup, but does not authorize copying Green storage, outbound tokens or changing its callback. Customer activation remains gated until database, authentication delivery and webhook isolation are verified. The public owner demo must never supply identity to customer APIs.

# MCP setup and active repair checkpoint
Project MCP connections are saved in `.codex/config.toml`; read `docs/MCP-CONNECTIONS.md` for connection status, safe tool discovery and exact Blue boundaries. Reuse existing OAuth login; do not recreate credentials on each session. For the interrupted Blue Meta signup repair, resume from `docs/SESSION-CHECKPOINT.md`. That checkpoint records unfinished edits and verification gaps; it is not release approval.
