# Meta App Review — submission package and live rehearsal (2026-09-14)

App `1388038082832745` (bznsflowai), Blue review environment
`https://bznsflow-blue.vercel.app`. Nothing has been submitted. Every statement
below was checked against the deployed Blue code or read from Meta's App Review
API on 2026-09-14; re-read both before submitting.

## Current state (verified 2026-09-14)

| Item | State |
| --- | --- |
| Blue deployment | `dpl_ESnM3qtXvc8qbaZzRAoeCkQ52A4Q`, READY, aliased to the Blue URL; commits `45ed72b`, `5100f51` on `layla/blue` |
| Convex | `quaint-nightingale-675` schema/functions pushed; contact migration complete (0 unlinked) |
| Gates | `BLUE_DASHBOARD_ENABLED=true`, `BLUE_BROADCAST_ENABLED=true` (template sync only); durable Convex `broadcast` gate **off** (no campaign can be created) |
| Blue account | one saved account, connected (`new_number`, sender ending 6936 — a Meta 555 test number), answers approved, connection checks passing, **Layla not activated** |
| Templates / contacts / campaigns | 0 / 0 / 0 |
| Review status | `UNSUBMITTED`; `can_submit: false` — Meta: "cannot submit for app review while previously submitted information is under review" |
| Requested permissions | `business_management`, `whatsapp_business_management`, `whatsapp_business_messaging`; for each: use case, screencast, API precheck and data-use checkup **not completed** |
| Live permissions | none of the three (grant status shows not granted; no reasons listed) |
| App mode | development, not live |
| Business verification / privacy URL present | passes / yes |

## Blockers before submission (in order)

1. **Pending prior review.** Find what Meta still has under review (App Dashboard →
   App Review → Requests, and Business verification / Data Use Checkup notices)
   and let it finish or withdraw it. Submission is impossible until then.
2. **Privacy policy URL** points to Green `https://www.bznsflowai.com/en/privacy`,
   which does not yet describe WhatsApp chats, contacts, qualification, broadcasts,
   consent evidence, exports or retention. Either release the updated privacy page
   to Green (a production release — needs explicit authorization) or point the app
   to `https://bznsflow-blue.vercel.app/en/privacy` (public, noindex).
3. **Terms of Service and Data Deletion URLs** are `https://www.facebook.com/`
   placeholders. Replace with a real terms page and a deletion-instructions URL
   (the privacy page's "Your rights" and contact-deletion sections can serve as
   deletion instructions until a dedicated page exists).
4. **Contact email** `ahmed@bznsflowai.com` is not verified in the app.
5. **`business_management`.** Current Blue code never calls a business-portfolio
   endpoint; onboarding uses the Embedded Signup code exchange, `debug_token`
   granular scopes and WABA/phone endpoints. Recommendation: remove it from the
   submission **and** from Embedded Signup configuration `2144711899802123`, or
   document a real use before requesting it. Do not request a permission the
   screencast cannot show.
6. **API precheck.** Each WhatsApp permission needs successful recent API calls
   from the app. The rehearsal below produces them (WABA/phone/template reads,
   subscription, message sends).
7. **Approved MARKETING template** in the connected WABA (created in WhatsApp
   Manager; category MARKETING, text header or none, body with text variables,
   optional "Stop promotions" quick reply).
8. **Test recipient.** A second WhatsApp number that is not a US +1 number
   (WhatsApp does not deliver marketing templates to US numbers). Because the
   sender is a Meta 555 test number, add the recipient under App Dashboard →
   WhatsApp → API Setup → "To" (up to five numbers) if Meta rejects the send.

## Use-case text (draft — English, as Meta requires)

**whatsapp_business_management**
BznsFlow lets small businesses connect their own WhatsApp Business Account to
Layla, a front-desk assistant. During onboarding the business owner completes
Meta Embedded Signup inside BznsFlow. We use this permission to confirm which
WhatsApp Business Account and phone number the owner granted, read the phone
number's registration status, display name status and messaging limit, subscribe
our app to that account's webhooks, register a new number when the owner chooses
that path, and read the owner's approved message templates so they can choose one
in the BznsFlow dashboard. Templates are created and edited only in WhatsApp
Manager. We never access accounts the owner did not grant.

**whatsapp_business_messaging**
After the owner reviews Layla's answers and activates her, BznsFlow receives
messages sent to the business's WhatsApp number and replies with answers taken
only from facts the owner approved, then asks short qualification questions. The
owner sees every conversation in the BznsFlow dashboard, can take a chat over
("Leave this chat for me"), reply manually within the 24-hour customer service
window, and send an approved marketing template only to customers whose consent
the business recorded. Opt-outs ("stop" or "Stop promotions") are honoured
immediately. Delivery and read statuses are shown to the owner.

## Screencasts (one continuous recording per permission)

Record in English UI, at a readable browser zoom, without terminal windows,
secrets, tokens or mocked data. Narrate or caption each step.

**A — whatsapp_business_management**
1. Open `https://bznsflow-blue.vercel.app/en/layla/setup`; enter business facts,
   try an answer, approve it, sign in with the emailed code.
2. Choose a number path → Prepare secure connection → Connect with Facebook; show
   the Meta Embedded Signup window, the business/WABA/number selection and consent.
3. Back in BznsFlow: show the connected number and passing connection checks.
4. Open the dashboard → Broadcast → "Sync approved templates"; show the template
   list (name, language, status, body, variables) and the WhatsApp Manager link.

**B — whatsapp_business_messaging**
1. On setup, click Activate Layla; show "Layla is active" and the automatic move
   to the dashboard.
2. From a second phone, send "What services do you offer?" to the business
   number. Show the phone receiving Layla's answer plus qualification questions,
   and the same chat updating in Dashboard → Chats with delivery/read ticks.
3. Reply on the phone with qualification details; show Contacts marking the lead
   Qualified with captured details.
4. Toggle "Leave this chat for me"; send a manual reply from the dashboard; show
   it arrive on the phone and the delivered status.
5. Broadcast → New broadcast: pick the approved template, map variables, add the
   test number with the consent attestation, review, send now. Show the template
   arriving on the phone and the campaign's delivered/read counts.
6. On the phone tap "Stop promotions" (or reply "stop"); show the contact marked
   Opted out and excluded from a new broadcast preview.

## Reviewer instructions (draft)

- URL: `https://bznsflow-blue.vercel.app/en/layla/review` for the onboarding path.
- A dedicated reviewer access link exists in the ignored local file
  `.env.blue-review-access.local` (seven-day expiry). Paste it only into Meta's
  private "test user credentials" field; reissue with
  `scripts/issue-blue-review-access.mjs` if it has expired. It signs into an
  isolated reviewer account with its own empty business.
- Reviewers must use their own Meta test assets to connect WhatsApp; state that
  our production number is not shared.

## Live rehearsal runbook (Blue, owner-performed with engineering support)

| # | Owner action | Engineering action / check |
| --- | --- | --- |
| 1 | Sign in at `/en/layla/setup` with the account that owns the 6936 connection | — |
| 2 | Activate Layla; confirm the dialog opens the dashboard | Confirm `blueMessagingControls` active |
| 3 | Create/confirm an approved MARKETING template in WhatsApp Manager; Dashboard → Broadcast → Sync | Confirm a sendable template in `blueTemplates` |
| 4 | — | Enable durable gate: `npx convex run blueCampaign:setBroadcastEnabled '{"enabled":true}'` |
| 5 | From the test recipient phone, message the business number | Watch webhook ingest, contact created, reply queued → delivered |
| 6 | Answer qualification questions; toggle takeover; manual reply | Verify contact fields/status, blocked queued replies, manual receipt |
| 7 | Broadcast one template to the recipient via manual entry with consent | Watch campaign start revalidation, one send, receipts |
| 8 | Tap "Stop promotions" / reply stop | Verify opt-out, unclaimed jobs blocked |
| 9 | Record screencasts A and B during steps 1–8 or a clean repeat | Update this file with evidence (IDs, times, statuses — no message text or numbers) |

Rollback at any point: `npx convex run blueCampaign:setBroadcastEnabled '{"enabled":false}'`;
pause Layla from the dashboard; `blueMessaging:setEnabled {"enabled":false}` closes
all conversational sending. See [dashboard pack](blue-dashboard.md).
