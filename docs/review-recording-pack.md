# Meta review recording pack — Instagram DMs

## Live end-to-end runbook — 2026-09-23 (supersedes "Readiness right now")

Code state: WhatsApp and Instagram are wired end to end. 319 unit tests and
4 synthetic browser suites (156 checks, EN/AR, 320–1440px) pass
(`npm run test:layla`, `npm run test:blue`, `npm run test:browser`). None of that is
live evidence. Every row below needs a real run and recorded proof (time, IDs,
screenshot).

### A. Meta settings found by the read-only Meta MCP check (parent app 1388038082832745)

| | Item | Found | Do |
|---|---|---|---|
| ☐ | Current submission permissions | IG basic + manage_messages **plus** Human Agent, content_publish, manage_insights, manage_comments | Remove the four extras. Code requests only `instagram_business_basic`, `instagram_business_manage_messages` (`api/_lib/layla/instagram.js`). |
| ☐ | Data deletion URL | `https://www.facebook.com/` | `https://bznsflow-blue.vercel.app/en/data-deletion` |
| ☐ | Privacy policy URL | Green `/en/privacy` (frozen, predates Instagram) | `https://bznsflow-blue.vercel.app/en/privacy` |
| ☐ | Contact email | unverified | Verify ahmed@bznsflowai.com |
| ☐ | Embedded Signup config 2144711899802123 | still lists `business_management` (rejected) | Remove it from the config |
| ☐ | Submission lock | `can_submit:false`: "previous submission under review" (draft 1397975051839048) | Clear or finish the pending request in App Review → Requests |
| ☐ | Instagram webhook, OAuth redirect, deauth/delete | Set on the Instagram Login app 1674756910890232 (see below). The MCP cannot read that app. | Confirm in the dashboard: webhook `…/api/layla-meta-webhook?channel=instagram` (the bare `…/api/layla-meta-webhook` also works since 2026-09-24; routing follows the payload), field `messages`; OAuth redirect exactly `https://bznsflow-blue.vercel.app/api/layla-meta` with no query |
| — | WhatsApp app-level webhook | Green callback, `messages` + `smb_message_echoes` | Leave it. Blue routes through per-WABA override. Known gap: coexistence echoes (human takeover from the phone app) may still go to Green. |

Already fine: WhatsApp messaging and management approved (advanced), compliance clean, business verification passes, Graph v26.0 current, Blue domain in app and SDK domains.

### B. Pre-flight (owner)
- ☐ Vercel Blue: `BLUE_CUSTOMER_SETUP_ENABLED`, `BLUE_ACCOUNT_SAVE_ENABLED`, `BLUE_DASHBOARD_ENABLED`, `BLUE_INSTAGRAM_ENABLED` true. `BLUE_LIVE_MESSAGING_ENABLED=true` only for the live run.
- ☐ `BLUE_MESSAGING_WORKER_SECRET` identical in Vercel and Convex (`quaint-nightingale-675`).
- ☐ Convex global send switch on: `npx convex run blueMessaging:setEnabled '{"enabled":true}'` (enables live sending, so run it deliberately).
- ☐ WhatsApp test number is neither the ineligible one ending 5930 nor the already registered one ending 4025.
- ☐ Instagram: a professional account with an accepted tester role, on a BznsFlow account that has never connected a different Instagram account (one Instagram account per BznsFlow account, permanently).

### C. WhatsApp run
1. ☐ Reviewer `#access=` link in a clean browser → lands on setup, signed in.
2. ☐ Your business (3 chapters) → tick "I checked these business facts" → **Save and continue** → save to account. That tick is the only review; there is no preview approval.
3. ☐ Connect your channels → Prepare secure connection → Facebook popup → WABA + number → checklist all ✓.
4. ☐ **Activate replies first.** Inbound messages before activation are dropped by design.
5. ☐ From another phone: "What are your prices?" → message in the dashboard → Layla's reply delivered (receipt).
6. ☐ Take over → manual reply → resume.
7. ☐ Pause → new message → no auto-reply.

### D. Instagram run
1. ☐ Connect Instagram → consent shows only the two scopes → back on setup with a green "Instagram connected". A failure now returns with a specific reason (account already used elsewhere, missing permission, expired link, signed out) instead of a JSON page.
2. ☐ Check connection ✓.
3. ☐ DM from the test customer → appears in the inbox.
4. ☐ Put that sender's scoped ID in `BLUE_INSTAGRAM_TEST_SENDERS`, set `BLUE_INSTAGRAM_SEND_ENABLED=true`, redeploy Blue.
5. ☐ Activate → DM again → Layla replies.
6. ☐ Pause, then Disconnect. **Confirm it ends "disconnected"** (never tested live; a Meta error other than 190/102 leaves it stuck "disconnecting").

### E. Recording
One screencast per requested permission, captions in English, no audio needed. Show only what the two Instagram permissions do (videos 1–2 below).

## Authorized Blue deployment and Desktop guide — 2026-09-23

Ahmed explicitly authorized deployment and requested a detailed plain-English
PDF. Backend deployment succeeded on isolated `quaint-nightingale-675`; Vercel
release `dpl_5cUFHzN7jkx2iG7rPC6wjBNjYJ84` is READY on
`https://bznsflow-blue.vercel.app`. The live signed-in onboarding was checked.
Green was not deployed. No real messages were sent.

Instagram Login app `bznsflowai-IG`, ID `1674756910890232`, was verified in Meta.
Blue has that ID and graph version v25.0. The owner saved the OAuth secret as
Sensitive for Production. BLUE_INSTAGRAM_ENABLED=true; sending remains false.
OAuth redirect, deauthorization and deletion callbacks are saved. Meta verified
the Instagram webhook and only messages is subscribed, at v26.0; other fields
are off. The existing WhatsApp subscription is unchanged. Connect Instagram is
active on the deployed onboarding. Signature verification uses the parent app
Basic-settings secret by default, with an explicit override supported. The
latest fix passed 26 focused tests; lint has zero errors and 12 existing warnings.
Real consent, inbound DM, reply receipt, legal Basic settings/contact email and
reviewer access remain pending. Owner next connects @bznsflow and sends a test
DM from @yungramsis21. No messages were sent by the agent.

Desktop PDF: `/Users/ramsis21/Desktop/BznsFlow - Meta Review and Screencast Guide.pdf`
(20 pages, includes steps/reasons, exact captions and reviewer instructions).
Source/render artifacts: `work/review-pdf/`. The official Meta recording guide
says reviewers do not listen to audio: use on-screen captions. Earlier dated
notes below describe the state before this authorized release.


Prepared 2026-09-23 for Ahmed. Record the real Blue app in English. Two permissions, two videos. WhatsApp already has the approved messaging/management permissions; this recording is for Instagram. Defer `business_management`.

## Readiness right now (historical — superseded by the runbook at the top)

The local onboarding now says Instagram/WhatsApp consistently, offers Instagram first on the channel step, and allows an Instagram-only business to reach the inbox. The underlying dual-channel implementation and setup guide are ready. **The live recording is blocked until deployment and Instagram configuration are complete.**

Read-only checks on 2026-09-23:

- Blue project is `bznsflow-blue`, ID `prj_TOWvngBTz4mVpI0p0Rrtgk62ZF1Q`. Its current ready deployment predates these changes.
- No `BLUE_INSTAGRAM_*` variables exist in Blue's Vercel configuration. OAuth, webhook verification and sending cannot work until configured.
- Meta app `1388038082832745` is live. Its contact email is unverified, privacy URL points to Green, and terms/deletion URLs are Facebook placeholders.
- An existing private reviewer link file is present at `.env.blue-review-access.local`. Its current login validity still needs a fresh-browser check. It was not rotated or exposed during preparation.
- No real Instagram login, webhook binding or customer reply has been verified. A local browser rehearsal is not permission-review evidence.

## Before pressing Record

1. Deploy the prepared backend to isolated Blue Convex and frontend/API to Blue Vercel, initially with Instagram sending disabled. Deployment needs Ahmed's approval under the project rules.
2. In the existing Meta app, configure Instagram API with Instagram Login. Enter its credentials securely in Blue and configure the exact callback URLs in [the setup guide](instagram-app-review-setup.md#3-add-instagram-to-the-existing-meta-app). Do not share secrets in a recording.
3. Confirm `@bznsflow` is professional and has the necessary test role/access. Use **@yungramsis21** as the customer test account (Ahmed confirmed the corrected username). Accept tester invitations/settings Meta requires.
4. Set the public privacy, terms and deletion settings to the deployed Blue pages and verify the contact email. Keep the existing WhatsApp webhook intact.
5. Use your own isolated Blue business account for the recording. Use the separate reviewer link/account to check that a reviewer can repeat the flow. Avoid connecting `@bznsflow` to both Blue accounts: one Instagram identity belongs to one BznsFlow account.
6. Open Blue setup in English: `https://bznsflow-blue.vercel.app/en/layla/setup`.
7. Enter accurate facts you are willing to approve. Suggested service summary, **only if accurate**: “We help businesses answer customer questions on Instagram and WhatsApp using information approved by the business owner.” Use your real team email; leave unknown hours/prices blank. Do not import a whole website during the recording.
8. Click **Save and continue** after ticking "I checked these business facts" (the one review). The optional **Test Layla with a question** on the Go live step is a private preview; label it as such, not a live Instagram message. Later edits go in **Dashboard → Business** and apply from the next message.
9. Save/sign in, connect Instagram, verify the username and check connection. Confirm the customer test DM appears while replies are paused.
10. Allowlist that test customer's Instagram-scoped ID, separately authorize the real test, enable Instagram sending, and activate replies. Rehearse a fresh inbound DM and verify the reply in the customer's real Instagram app.
11. Check manual takeover and pause. Check the reviewer sender is also allowed for their later test. Keep credentials/passwords out of recordings and public documents.

Finish all eleven before recording. If a step fails, fix it before capturing the final take.

## Arrange the screen

- Desktop browser at roughly 1280×900 or larger, English UI, normal readable zoom.
- Have Blue, the business's Instagram login, and the customer account's Instagram inbox ready in clearly separated tabs/browser profiles.
- Close private tabs and notifications. Show account usernames, but hide passwords, access links and API secrets.
- Start before the Connect Instagram click. Show the real consent screens without skipping them. If already connected, use Reconnect Instagram and verify that Meta actually presents the required consent flow; do not edit in a simulated prompt.
- Capture the system as it actually behaves. Leave the Blue test banner visible.

## Video 1 — Instagram account identity

Suggested filename: `instagram-business-basic.mp4`.

| Order | What you do | Caption/narration |
| --- | --- | --- |
| 1 | Show BznsFlow sign-in/setup. If using email login, conceal only the private code/password. | “The business owner signs in to BznsFlow.” |
| 2 | Show the reviewed business facts and choose **Save and connect your channels**. | “The owner approves the information used for customer replies.” |
| 3 | Click **Connect Instagram**. | “This connects the owner's Instagram professional account.” |
| 4 | Complete real Instagram login and grant the requested access. | “The owner chooses and authorizes their account through Instagram.” |
| 5 | Show the return to Blue, `@bznsflow`, and connected status. | “BznsFlow displays the authorized account so the owner can identify their connection.” |
| 6 | Click **Check connection** and show success. | “This confirms the account connection is ready. Automatic replies are controlled separately.” |

The username must refer to the same account throughout. Keep the real login and consent flow visible even if you already demonstrated it in another video.

## Video 2 — Receive and answer a customer DM

Suggested filename: `instagram-business-manage-messages.mp4`.

| Order | What you do | Caption/narration |
| --- | --- | --- |
| 1 | Show sign-in, **Connect/Reconnect Instagram**, real consent, and connected `@bznsflow`. | “The owner grants access to receive and answer their Instagram messages.” |
| 2 | Show approved facts, connection check, and **Activate replies**. | “The owner decides when automatic replies start.” |
| 3 | In @yungramsis21's Instagram, send “What services do you offer?” to `@bznsflow`. | “The customer starts the conversation.” |
| 4 | Open Blue's inbox, filter Instagram, and open that customer's conversation. | “The customer's message appears in the business's inbox.” |
| 5 | Show the reply in Blue and then in the customer's real Instagram app. | “The customer receives an answer based on the owner's approved facts.” |
| 6 | Turn on **Leave this chat for me**. Send a new customer DM, then manually answer it in Blue. Show receipt in Instagram. | “The owner takes over this conversation and replies personally.” |
| 7 | Open Channels and click **Pause replies**. | “The owner can pause automatic Instagram replies at any time.” |

Wait for actual receipt; a queued or submitted badge alone is insufficient evidence of delivery. Manual replies must be within the open customer messaging window. Avoid recording unrelated ads, publishing, comments, or WhatsApp campaign screens.

## Private reviewer instructions to paste

Complete the bracketed details immediately before submission; do not submit placeholders.

“Open [PRIVATE BLUE REVIEWER ACCESS LINK] in a fresh browser. It signs you into an isolated BznsFlow account and redirects to the English setup page. On Your business (step 1 of 3), enter the business facts, tick I checked these business facts and click Save and continue; you land on Connect your channels. Click Connect Instagram and authorize [PROFESSIONAL TEST ACCOUNT / META-APPROVED TEST ACCESS INSTRUCTIONS]. Verify its username, click Check connection, and Activate replies. From [REVIEWER CUSTOMER TEST ACCOUNT], send What services do you offer? Open the inbox, filter Instagram, and view the message and response. Confirm the response in the customer's Instagram app. Use Leave this chat for me for manual takeover. Use Channels → Instagram → Pause replies to stop automation.”

The recording uses @yungramsis21; do not give reviewers the password to a personal account. Provide dedicated reviewer test access or instructions compatible with Meta's review process. Test those exact steps on the reviewer account. The Instagram account used for that test must not already be bound to a different BznsFlow account. Prepare a separate professional reviewer test account or use an agreed recording/reviewer account arrangement; do not erase or switch an established binding just to make the video easier. A public anonymous preview does not provide connected-account review access.

## Final submit checklist

- [ ] Both videos show real login/consent and the same account identity before/after.
- [ ] The messaging video shows a real customer message and the received reply.
- [ ] Descriptions match exactly what is shown; use the permission text in the setup guide.
- [ ] Reviewer login works without your personal email/2FA intervention.
- [ ] Professional-account test access is reproducible, and reviewer sends are allowed.
- [ ] Public legal pages work and contact email is verified.
- [ ] Request `instagram_business_basic` and `instagram_business_manage_messages`; leave approved WhatsApp access in place and defer `business_management`.
- [ ] All required Meta app-review items are complete; upload and submit through the current Instagram review flow.

Do not submit this checklist or synthetic test screenshots as evidence of a working provider integration. See [Meta's review instructions](https://developers.facebook.com/documentation/instagram-platform/app-review) and [the full setup guide](instagram-app-review-setup.md).
