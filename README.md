# BznsFlow — bznsflowai.com

> Bilingual (AR/EN) marketing site with an AI chat assistant, email sign-in, and
> a lead pipeline into a Google Sheet CRM. By Ahmed Darwish, Cairo.

---

## 🗂 Project Structure

```
├── src/
│   ├── pages/            Home.jsx, SignIn.jsx
│   ├── components/       layout/ · sections/ · ui/
│   ├── lib/              constants, analytics, chat, cookies, countries, industries
│   ├── styles/           imported in a load-bearing order by src/index.css
│   ├── i18n/             en.js · ar.js — flat key→string maps
│   └── routes.jsx        route table, prerendered by vite-react-ssg
├── api/                  Vercel serverless functions
│   ├── chat.js           Layla's chat backend  → OpenAI + Supabase
│   ├── auth-code.js      send a sign-in code   → Apps Script
│   ├── auth-session.js   verify / profile / sign out
│   ├── lead.js           playbook capture      → Apps Script
│   ├── keepalive.js      daily cron, stops Supabase pausing
│   └── _lib/             shared: db, auth, cookies, guard, http, fetch, llm
├── apps-script/          Code.gs — the Sheet-bound web app (deploys separately)
├── web-chatbot/          SETUP.md runbook + SQL migrations
└── public/               static assets, sitemap, robots.txt
```

Arabic is the primary language at `/`; English mirrors under `/en`. Both are
prerendered to static HTML at build time.

---

## 🖥 Local Development

```bash
npm install
npm run dev        # Vite only — the UI, no API routes
npx vercel dev     # the whole thing, including /api/* (needs env vars)
```

Use `vercel dev` for anything touching chat, sign-in or the playbook form. Plain
`npm run dev` cannot serve the functions, so those flows will fail.

Environment: copy `.env.example` to `.env` and fill it in. `VITE_*` vars are
**baked into the public bundle** — never give a secret that prefix.

---

## ✅ Tests

```bash
npm test                  # unit — no infrastructure needed
npm run test:auth-browser  # sign-in flow in a real browser (needs npm run dev)
npm run seo:audit          # crawls the sitemap, reports Core Web Vitals
npm run test:stack up && npm run test:e2e   # chat against real Postgres (Docker)
```

---

## 🚀 Deployment

This project is **not** Git-connected on Vercel, so pushing a branch deploys
nothing. Production changes only through the CLI:

```bash
npm test && npm run build     # build runs the KB drift gate
npx vercel deploy             # preview first
npx vercel deploy --prod
```

Use the logged-in CLI session, not `--token`. Rollback: `npx vercel rollback`.

**`apps-script/Code.gs` deploys separately** — paste it into the Sheet's Apps
Script editor and use *Deploy → Manage deployments → New version*, so the `/exec`
URL stays the same. Changing it there is what makes OTP email and playbook
delivery work; a Vercel deploy alone does not touch it.

Full runbook: [web-chatbot/SETUP.md](web-chatbot/SETUP.md) ·
Headers and CSP: [SECURITY.md](SECURITY.md) ·
Cookies: [COOKIES.md](COOKIES.md)

---

## 👤 About

**Ahmed Darwish** — Founder of BznsFlow. Cairo, Egypt.
AI-powered automation for agencies, sales teams, and real estate professionals.

Booking and WhatsApp links live in `src/lib/constants.js` — the single source of
truth. They are deliberately not repeated here, because the copy in this file
went stale and pointed at a dead calendar.

---

## 📄 License

All rights reserved © BznsFlow

## Layla official Meta Cloud API pilot

Owner-only mock pilot: `/owner/layla`. The dedicated BznsFlow number is configured directly in Meta Cloud API; customer Coexistence through Embedded Signup remains a separate post-App-Review phase. Read [engineering pack](docs/layla-meta-engineering.md) before changing it. Setup, tests and release blockers are saved at `Desktop/Layla-Meta-Handoff`. Live sending remains source-locked. Existing login and registration remain the identity authority.
## Layla owner dashboard (Blue)

`/layla/dashboard` (Chats, Contacts, Broadcast) opens after activation. Read the
[dashboard engineering pack](docs/blue-dashboard.md) before changing it; it is
gated by `BLUE_DASHBOARD_ENABLED` and `BLUE_BROADCAST_ENABLED`. Browser checks:
`npm run dev -- --port 5199` then `npm run test:dashboard-browser -- http://127.0.0.1:5199`.

## Blue Convex backend

Blue now contains a Convex-ready, isolated backend under [`convex/`](convex/).
Run `npm run convex:setup` for a local deployment. The existing Supabase auth
adapter remains active until a separate Blue Convex cloud deployment is
provisioned and the reviewed export is imported; this keeps the review build
available while the migration is verified.
