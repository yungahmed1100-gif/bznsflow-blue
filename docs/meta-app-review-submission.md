# Meta App Review — submission package (updated 2026-09-15)

## Current decision and implementation — 2026-09-23

WhatsApp messaging and management **Advanced Access approved**, verified with
Meta's connected tool today. `business_management` was rejected; Ahmed chose to
defer it and remove the optional portfolio lookup/display. The reviewer requested
an ads account flow that does not match that optional feature. This supersedes
only the older instruction to keep requesting `business_management`.

Instagram DM-only client onboarding is implemented **locally, not deployed**,
using Instagram Login and `instagram_business_basic` plus
`instagram_business_manage_messages`. Each business can connect Instagram,
WhatsApp, or both, with shared approved facts/inbox and separate reply controls.
Test account: `@bznsflow`. Instagram settings, real consent/message evidence,
recordings, review submission and Advanced Access remain pending.

Use [Instagram setup and review guide](instagram-app-review-setup.md) for the
current steps and [engineering notes](blue-instagram-engineering.md) for release
order and rollback. Tests: `npm run verify` passes (137 Layla and 177 Blue tests,
plus the legacy suites); Convex TypeScript passes; 32 Instagram and 80 dashboard
synthetic browser assertions pass in English/Arabic. Lint has 12 existing hook
warnings, zero errors. These are not live provider evidence.

Meta's read-only settings check still showed the Green privacy URL, placeholder
terms/deletion URLs and unverified contact email. No Meta settings, deployment,
webhook binding, live message or submission was changed during implementation.
Green stays frozen. The material below records earlier dates and may describe
superseded permission/release state.


App `1388038082832745` (bznsflowai), Blue review environment
`https://bznsflow-blue.vercel.app`. Nothing has been submitted yet. Re-read Meta's
App Review API (`devtools_app_review requirements`) right before submitting.

Authority for the rules below: Meta's Tech Provider App Review page
(developers.facebook.com/docs/whatsapp/solution-providers/app-review, read
2026-09-15). The rules are:
- one video per permission;
- a written description **and** a video for each permission;
- the management video may use **WhatsApp Manager** to create the template;
- the messaging video must show the app sending a message and the WhatsApp client receiving it;
- unnecessary permissions are a common reason for rejection;
- drafts are never reviewed.

## Decisions (2026-09-15)

- **Reviewers use Blue for everything.** The app's Privacy, Terms and Data Deletion URLs point to Blue.
- **Reviewer link:** valid 365 days, revocable, opening an empty isolated account.
- **business_management stays requested.** It is backed by a real feature: connection checks read the business portfolio that owns the connected WABA (name and verification status) and show it on setup and in the dashboard. This supersedes the 2026-09-14 advice to remove it.

## Current state

| Item | State |
| --- | --- |
| Code | commit `d04ab38` on `layla/blue` |
| Convex | `quaint-nightingale-675`: pushed 2026-09-15 (added index `sessions.by_account`) |
| Blue deployment | `dpl_C8GYrZ7a4CdFm3h7EyQunuF1Hgqj`, READY, aliased to the Blue URL |
| Legal URLs (HTTP 200, no redirect, verified) | `/en/privacy`, `/en/terms`, `/en/data-deletion` (Arabic without `/en`) |
| Reviewer link | rotated 2026-09-15, expires **2027-09-15**, verified to sign in; stored only in ignored `.env.blue-review-access.local` |
| Meta review status (read 2026-09-15) | `UNSUBMITTED`; `can_submit: false` (prior submitted information still under review) |
| Requested permissions | business_management, whatsapp_business_management, whatsapp_business_messaging; all four steps incomplete on each |
| App settings | Privacy URL = Green; Terms and Data Deletion = `https://www.facebook.com/` placeholders; contact email unverified; dev mode |
| Blue connection (read 2026-09-15) | owner number ending 4025, WABA `2213485365896306`, phone ID `1250149564857596`, `existing_cloud`, connected; Layla **active**; 7 inbound / 6 outbound read; 0 templates synced. The API Setup test number (+1 555 195 7837, WABA `2478518916308747`) is **not** connected to Blue and is not used for the videos |

Rotate the link with `node scripts/issue-blue-review-access.mjs --rotate`. The old link and its sessions are revoked, and the new link is never printed.

## Owner checklist (in order)

1. **Clear `can_submit`.** App Dashboard → App Review → Requests, plus the Business verification, Tech Provider and Access Verification notices. Find what is still under review, then wait for it or withdraw it.
2. **App Settings → Basic:**
   - Privacy `https://bznsflow-blue.vercel.app/en/privacy`
   - Terms `https://bznsflow-blue.vercel.app/en/terms`
   - Data Deletion Instructions `https://bznsflow-blue.vercel.app/en/data-deletion`
   - Verify the contact email.
3. **Embedded Signup config `2144711899802123`:** confirm it holds all three permissions and the Blue domain.
4. **Template:** in WhatsApp Manager for WABA `2213485365896306` (number …4025), create a template and get it approved (this is recorded as video A).
5. **Test phone:** any second WhatsApp phone that is not the business number. No API Setup allowlist is needed because the connected sender (…4025) is a real number, and the customer messages first.
6. **Live rehearsal:** follow the runbook below. It makes the recent successful API calls every permission needs for **api_precheck**:
   - business_management: portfolio read, triggered by Check connection
   - whatsapp_business_management: templates sync, `subscribed_apps`
   - whatsapp_business_messaging: `messages`
7. **Record** videos A, B and C (below). Then, for each permission: paste its description, upload its video, complete the Data Use Checkup, and **Submit**.

## Permission descriptions (English, paste per permission)

**business_management**
When a business connects WhatsApp through Meta Embedded Signup inside BznsFlow, we read the business portfolio that owns the WhatsApp Business Account the owner granted. We read its ID, name and verification status. We use this to confirm which portfolio BznsFlow is acting for and to show the owner "Connected business portfolio: NAME · Verified" on the setup page and in the dashboard. The check repeats whenever the owner checks the connection. We do not create, edit or manage portfolios, users or other assets.

**whatsapp_business_management**
BznsFlow lets small businesses connect their own WhatsApp Business Account to Layla, a front-desk assistant. During onboarding the owner completes Meta Embedded Signup inside BznsFlow. We use this permission to:
- confirm which WhatsApp Business Account and phone number the owner granted;
- read the number's registration status, display-name status and messaging limit;
- subscribe our app to that account's webhooks;
- register a new number when the owner chooses that option;
- read the owner's approved message templates so they can pick one in the BznsFlow dashboard.

Templates are created in WhatsApp Manager. We never access accounts the owner did not grant.

**whatsapp_business_messaging**
After the owner reviews Layla's answers and activates her, BznsFlow receives messages sent to the business's WhatsApp number and replies only from facts the owner approved, then asks short qualification questions. The owner sees every conversation in the dashboard and can:
- take a chat over;
- reply manually within the 24-hour window;
- send an approved template only to customers whose consent the business recorded.

Opt-outs are honoured immediately. Delivery and read statuses are shown to the owner.

## Videos (one per permission, English UI, no secrets/terminal/mocks)

- **A · whatsapp_business_management:** create a template in WhatsApp Manager and show it approved. Then BznsFlow Dashboard → Broadcast → Sync approved templates, and show it listed.
- **B · whatsapp_business_messaging:** a second phone messages the business number. Show Layla's reply arriving on the phone and the chat in Dashboard → Chats with ticks. Then send a manual dashboard reply and show it arriving in WhatsApp.
- **C · business_management:** `/en/layla/review` → Prepare secure connection → Connect with Facebook, and select or confirm the portfolio, WABA and number in Meta's window. Back in BznsFlow, show "Connected business portfolio: NAME · Verified". In the dashboard, press Check connection and show the portfolio line.

## App Review form answers

**web-2 — access and testing instructions**

> BznsFlow is a web app for small businesses. Its assistant, Layla, answers customer messages on the business's own WhatsApp number using only facts the owner has approved. There is nothing to download and nothing to pay.
>
> **Access:** Open https://bznsflow-blue.vercel.app/en/layla/review in desktop Chrome (Arabic version: /layla/review). To sign in, use the reviewer link in the test-credentials field. It opens a dedicated, empty reviewer account. You can also register at the same page with any email address; we email you a 6-digit code.
>
> **Testing:**
> 1. **Business setup.** Enter a business name, sector, services and a human contact. Click "Try an answer" and approve the answer.
> 2. **Connect WhatsApp (Facebook Login for Business / Embedded Signup).** Choose a number option, click "Prepare secure connection", then "Connect with Facebook". Meta's Embedded Signup window opens, where the business selects its business portfolio, WhatsApp Business Account and phone number and grants access. BznsFlow then shows the connected business portfolio name and verification status, the number, and passing connection checks. While the app is in development mode, Meta only lets people with a role on our app finish this window. The attached videos show the full flow with our own business number; we do not share it with reviewers.
> 3. **After connecting.** Click "Activate Layla". In Dashboard → Chats, customer messages and Layla's replies appear with delivery and read status; the owner can take a chat over and reply manually within the 24-hour window. Contacts shows qualified leads and opt-outs. Broadcast → "Sync approved templates" lists the templates created in WhatsApp Manager. "Check connection" re-reads the number and business portfolio.
>
> **Meta APIs and Facebook Login:** We use Facebook Login for Business only to run WhatsApp Embedded Signup (configuration 2144711899802123, response_type=code). The code is exchanged on our server.
> - **business_management:** reads the business portfolio that owns the granted WhatsApp Business Account (ID, name, verification status).
> - **whatsapp_business_management:** reads the granted WhatsApp Business Account, phone numbers and status, registers a new number when the owner chooses that option, subscribes our app to the account's webhooks, and reads approved message templates.
> - **whatsapp_business_messaging:** sends Layla's replies, owner replies and consented template messages, and receives messages and delivery statuses.
>
> We do not request or use email, public_profile, user_friends, user_gender, user_birthday or any other Facebook user data. Facebook Login is not used to sign in to BznsFlow; sign-in uses an emailed one-time code.

**fblogin-web-1:** Yes. Facebook Login for Business is used only for WhatsApp Embedded Signup.

**accesscode-web-1**

> Reviewer sign-in link (valid until 15 September 2027): <paste BLUE_REVIEW_ACCESS_URL from .env.blue-review-access.local>. It opens an isolated reviewer account with an empty business. No payment or membership is required. You can also register at the same page with any email address using the emailed 6-digit code. To complete the Meta Embedded Signup window while the app is in development mode, use a Facebook account with a role on the app or your Meta test assets.

**accesscode-web-2:** Not applicable. BznsFlow is a free-to-access web app, not an app-store download, and has no in-app purchases.

**geo-web-5**

> BznsFlow has no geo-blocking or geo-fencing and can be reached worldwide. The interface opens in Arabic by default, with English under /en/. Our business focus is Oman and the GCC, but access is not restricted. WhatsApp's own policy means marketing template messages are not delivered to US (+1) numbers; that is a Meta rule, not a restriction of our app.

**documents-web-1:** Upload videos A, B and C (.mp4, about 1–3 minutes each) and a short PDF of annotated screenshots covering reviewer sign-in → Embedded Signup → connected portfolio → dashboard. Include no secrets, and do not include the reviewer link in any uploaded file.

## Live rehearsal runbook (Blue, owner-performed with engineering support)

| # | Owner action | Engineering action / check |
| --- | --- | --- |
| 1 | Sign in at `/en/layla/setup` with the account that owns the …4025 connection | — |
| 2 | Dashboard → Check connection; confirm the portfolio line appears | Portfolio stored in `connectionChecks.portfolio` |
| 3 | Activate Layla; confirm the dialog opens the dashboard | Confirm `blueMessagingControls` active |
| 4 | Create/confirm an approved template in WhatsApp Manager; Dashboard → Broadcast → Sync | Confirm a sendable template in `blueTemplates` |
| 5 | From the test recipient phone, message the business number | Watch webhook ingest, contact created, reply queued → delivered |
| 6 | Toggle takeover; send a manual reply | Verify the manual receipt |
| 7 | Record videos A, B and C during steps 2–6 or a clean repeat | Update this file with evidence (IDs, times, statuses; no message text or numbers) |

Rollback at any point:
- Pause Layla from the dashboard.
- Run `blueMessaging:setEnabled {"enabled":false}` to close all conversational sending.
- Run `npx convex run blueCampaign:setBroadcastEnabled '{"enabled":false}'` if broadcast was enabled.

See the [dashboard pack](blue-dashboard.md).
