# Blue customer onboarding — 2026-09-11

## Delivered to Blue
- Catalyst links to /layla/setup (Arabic) and /en/layla/setup (English).
- Customer page uses the supplied Layla artwork, existing logo and cream/ink theme.
- Business form, account return flow, official Meta connection controls, preview and paused completion screens.
- Drafts contain only business facts, expire after 30 minutes and require review again. PINs and Meta authorization codes are excluded.
- Customer requests no longer receive the public owner demo identity. Availability fails closed.

## Verification
- Complete npm suite and 110 Layla tests passed. Five Blue isolation tests passed.
- Production build passed. Connected-browser English layout and Arabic DOM inspected.
- Impeccable detector ran; advisory custom tones preserve readable input/focus/error contrast and artwork background. No design-system sidecar rewrite.
- Full mobile viewport and real authenticated Meta end-to-end verification remain outstanding.

## External blockers — not App Review ready
Supabase MCP returned Unauthorized. No Blue database was created, no migrations applied and no secrets copied. Blue authentication email delivery also needs isolated configuration; the current email transport shares LEAD_ENDPOINT and must not be pointed at Green.

Existing Meta readiness checks expect the Green app callback. Before enabling customer setup, implement and verify a supported per-WABA Blue callback override (or obtain an explicitly approved routing design); do not redirect the app-wide Green callback. Configure Blue signup settings and authorized test assets only after this routing is established. No Meta settings or subscriptions were changed in this phase.

Required deployment gates remain off: BLUE_CUSTOMER_SETUP_ENABLED, BLUE_WEBHOOK_ISOLATION_VERIFIED, BLUE_AUTH_DELIVERY_VERIFIED, LAYLA_CUSTOMER_ONBOARDING_ENABLED. These are assertions of completed verification, not substitutes for it.

Next operator action: reconnect Supabase. Then create the isolated project, apply the account and additive Layla schema, configure isolated email delivery and provision reviewer access. Keep sending disabled; permission-specific real evidence remains separate.

Green was not edited or deployed. No numbers registered, no WhatsApp messages sent.

## Deployment evidence
Blue deployment dpl_Ttqp3J4ETnP8os6MHibR7NezMaN4 is READY. Customer URL: https://bznsflow-blue.vercel.app/en/layla/setup (Arabic: /layla/setup). HTTPS returned 200 without redirect, X-Bznsflow-Environment: blue and noindex/nofollow/noarchive. Connected browser verified the actual unavailable state and disabled continuation. Prior Blue rollback: dpl_7eKns4zVrzkGfN92JiSHr1YLLBYj.
