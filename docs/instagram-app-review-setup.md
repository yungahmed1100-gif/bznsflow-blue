# Instagram + WhatsApp: setup and App Review

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


Updated 2026-09-23. Owner: Ahmed. Code is implemented locally in Blue; Instagram has not been deployed, connected to Meta, recorded, or submitted.

## Verified live workflow — 2026-09-24

Proven on Blue with @bznsflow (IG `17841430134419283`) and customer @yungramsis21 (IGSID `1089774000208272`): login, subscription, webhook delivery, username lookup, and a Layla reply accepted by Instagram (`submitted` with a message ID).

### Meta rules this code relies on (Meta developer docs, checked 2026-09-24)
| Step | Rule | Where in code |
|---|---|---|
| Login | `redirect_uri` must exactly match a saved **base** URI. Instagram drops any query string on return, so ours has none: `https://bznsflow-blue.vercel.app/api/layla-meta`. The router recognises the return by our 64-hex `state`. | `INSTAGRAM_CALLBACK`, `requestSurface` |
| Code | Valid 1 h, single use, may end in `#_` (stripped). Cancel returns `error=access_denied`. | `exchangeInstagram`, `instagramCallback` |
| Token | Exchange at `api.instagram.com/oauth/access_token` with the identical `redirect_uri`, then `ig_exchange_token` (60 days), refreshed by cron. | `exchangeInstagram`, `refreshInstagram` |
| Subscribe | `POST /{IG_ID}/subscribed_apps?subscribed_fields=messages` (query parameter) → `{success:true}`. Meta lists our app under its Instagram-side ID `18118498949004481`. Called only at connect and at most once a day after (Meta throttles it with code 613); Check/Activate/health read `GET /me`. | `subscribeInstagram`, `inspectInstagram` |
| Access | Standard Access only reaches people with a role on the app: add both accounts as **Instagram Testers** and accept the invites. @bznsflow also needs Instagram → Settings → Messages → Connected tools → **Allow access to messages**. | Dashboard (manual) |
| Webhook | `object:instagram`, `entry[].messaging[]`; `is_echo`, `is_self` and `is_deleted` handled; signed with either of our two app secrets. | `webhook.js`, `layla-meta-webhook.js` |
| Profile | `GET /{IGSID}?fields=username` gives the customer's @username. | `instagramUsernames` |
| Send | `POST /{IG_ID}/messages {recipient:{id:IGSID},message:{text}}` within 24 h of the customer's last message. | worker |

### Send errors shown to the owner
`10/2534022`, `10/2018278` → outside 24 h · `551`, `2018108` → person unavailable · `2534041` → message access off in Instagram · `190` → reconnect (also marks the connection) · `613`, `4`, `2534040` → rate limited · `2534014` → unknown customer ID. A coded Meta error is always `failed` with a plain reason; only a missing or unreadable answer is `ambiguous`.

### Troubleshooting by log line (Vercel runtime logs)
| Log | Meaning | Fix |
|---|---|---|
| `instagram_provider_error … redirect_uri` | Redirect mismatch | Saved base URI must equal `INSTAGRAM_CALLBACK` exactly |
| `instagram_subscription_check {found:[…]}` | Meta lists an app ID we don't know | Add it to `INSTAGRAM_APP_ALIASES` |
| `instagram_webhook_rejected` | Signature matched neither secret | Check `LAYLA_META_APP_SECRET` / `BLUE_INSTAGRAM_APP_SECRET` |
| `webhook_unbound` | A message arrived for an account Blue doesn't serve | Reconnect, or ignore after a reset |
| `instagram_revoke_failed` | Meta refused the permission revoke on disconnect | Owner removes the app in Instagram settings |
| blocked `test_recipient_not_allowed` | Sender not in `BLUE_INSTAGRAM_TEST_SENDERS` | Add its IGSID (Convex `blueContacts.igId`) |
| No `GET /api/layla-meta 303` after Connect; attempt still `used:false` | Instagram left the person on its feed after sign-in and never returned | Back to the setup tab → **Finish connecting** (skips the forced login, goes straight to Allow) |
| `instagram_provider_error … code 613 … Subscribed Apps API called too many times` | Meta throttles `/subscribed_apps` after a handful of calls | Wait ~10–60 min. Since 2026-09-24 Blue calls it only at connect and at most daily (Check/Activate/health use `GET /me`; sends use only the Send API), so this should not recur |
| `instagram_health_unavailable` | Meta did not answer the scheduled health check | Nothing to do; replies stay on and the next check retries |

### Start fresh (operator)
1. `npx convex run blueReset:account '{"email":"<owner email>","dryRun":true}'`: shows per-table counts.
2. `npx convex run blueReset:account '{"email":"<owner email>","confirm":true}'`: deletes that account's connections, answers, chats and contacts, and releases its saved setup. The login stays. Nothing is sent to Meta, and a WhatsApp number stays registered.
3. Owner: Instagram → Settings → Apps and websites → remove **bznsflowai-IG**, then onboard again in a private window.

Switching the same BznsFlow account to a *different* Instagram account is refused on purpose (`different_account`): the old row keeps that account's chats reachable by Meta deletion callbacks. Use the reset instead.

## 1. Keep the two approved permissions

Your existing app is **bznsflowai**, ID `1388038082832745`.
`whatsapp_business_messaging` and `whatsapp_business_management` have Advanced Access approved, verified through Meta's connected tool on 2026-09-23.

Defer `business_management` in the next submission. The optional business portfolio lookup has been removed from Blue. The reviewer asked for an ad account selection and an ads action, while the previous feature read a portfolio name and verification status. Do not build ads or record an unrelated ads flow to answer that feedback. Existing approved WhatsApp access stays in place. No permission settings have been changed by this implementation.

If Meta requires an explanation, use: “We have removed the optional business portfolio lookup from this release and are not requesting business_management in this submission. The app answers inbound customer messages. Our previously approved WhatsApp permissions remain in use.”

## 2. Prepare the test accounts

1. Use `@bznsflow` as the connected business. In Instagram, confirm it is a **professional account** (Business or Creator).
2. Use `@yungramsis21` as the customer account that sends a DM to `@bznsflow` (corrected username confirmed by Ahmed).
3. In Meta's app dashboard, add the required Instagram tester/app role for the test account and accept its invitation. Complete any message-access setting shown in Instagram's connected tools settings.
4. Use an isolated, signed-in BznsFlow Blue account with approved business facts. Start at `https://bznsflow-blue.vercel.app/en/layla/setup`. Save and approve the answers before activation.

This implementation uses **Instagram API with Instagram Login**. A linked Facebook Page is not required for this login route. Serving client businesses requires Advanced Access and review; successful testing with your own account does not grant that access. [Meta: Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login), [Meta: App Review](https://developers.facebook.com/documentation/instagram-platform/app-review).

## 3. Add Instagram to the existing Meta app

1. Open the app dashboard for app `1388038082832745`.
2. Add/select the Instagram use case/product. Choose **API setup with Instagram login**. Dashboard labels may differ slightly.
3. Find the **Instagram App ID** and **Instagram App Secret** in that setup. These are the OAuth credentials for this integration; do not substitute the parent app ID automatically.
4. Request only `instagram_business_basic` and `instagram_business_manage_messages` for this feature.
5. Set the URLs below exactly. Keep the existing WhatsApp callback intact.

| Setting | Value |
| --- | --- |
| OAuth redirect URI | `https://bznsflow-blue.vercel.app/api/layla-meta` (no query string; see Verified live workflow) |
| Instagram webhook callback | `https://bznsflow-blue.vercel.app/api/layla-meta-webhook?channel=instagram` |
| Deauthorize callback | `https://bznsflow-blue.vercel.app/api/layla-meta?surface=instagram-deauthorize` |
| Instagram data deletion callback | `https://bznsflow-blue.vercel.app/api/layla-meta?surface=instagram-delete` |
| Privacy policy | `https://bznsflow-blue.vercel.app/en/privacy` |
| Terms | `https://bznsflow-blue.vercel.app/en/terms` |
| Data deletion instructions | `https://bznsflow-blue.vercel.app/en/data-deletion` |

The webhook subscribes to `messages`. After login, the backend also subscribes the connected professional account through its `subscribed_apps` endpoint. Both dashboard webhook setup and account subscription must work.

The live Basic settings read on 2026-09-23 still had a Green privacy URL, placeholder terms/deletion URLs, and an unverified contact email. After the new Blue pages are deployed, update the relevant settings and verify the contact email. Where Meta offers a deletion callback rather than an instructions URL, use the callback for the Instagram integration and retain the public instructions page.

## 4. Configure and deploy Blue — approval required

The code and `.env.example` are ready. Enter secrets in the Blue environment's secure settings; do not paste secrets into chat, recordings, or source files.

| Blue server variable | Value/source |
| --- | --- |
| `BLUE_INSTAGRAM_ENABLED` | `true` after credentials and callback are ready; default is `false` |
| `BLUE_INSTAGRAM_APP_ID` | Instagram App ID from the Instagram Login setup |
| `BLUE_INSTAGRAM_APP_SECRET` | Corresponding Instagram OAuth secret |
| `BLUE_INSTAGRAM_GRAPH_VERSION` | `v25.0` |
| `BLUE_INSTAGRAM_WEBHOOK_SECRET` | Secret for the app that signs this webhook subscription; verify its owner in Meta settings, do not assume it equals the Instagram OAuth secret |
| `BLUE_INSTAGRAM_VERIFY_TOKEN` | New random secret shared with the Instagram webhook verification form |
| `BLUE_INSTAGRAM_SEND_ENABLED` | Keep `false` for the initial deployment |
| `BLUE_INSTAGRAM_TEST_SENDERS` | Initially empty; later the comma-separated Instagram-scoped IDs of authorized test customers |

Reuse Blue's existing isolated Convex configuration, service secret, worker secret, and credential encryption key. Never copy Green credentials. The send allowlist uses numeric scoped IDs from inbound Instagram events, **not usernames**. An empty list blocks every send; `*` permits all recipients and is only for a separately approved public rollout.

Deploy the new Convex schema/functions to isolated `quaint-nightingale-675` first, then deploy the frontend/API to Vercel project `bznsflow-blue`. Keep the existing WhatsApp sending configuration unchanged. Deploying, changing Meta settings, and sending real test messages are separate release actions, not completed local implementation steps.

## 5. Connect, then check before sending

1. Open Blue in English and sign in.
2. Open **Channels → Connect Instagram** (also available on setup).
3. Complete the Instagram login and grant both permissions.
4. Confirm Blue shows **@bznsflow**, **Connected**, and **Replies paused**.
5. Click **Check connection**. Verify it succeeds.
6. From the customer test account, send a DM after the live rehearsal is authorized. Confirm it appears under **Chats → Instagram** while replies remain paused.
7. Put that customer's Instagram-scoped ID in `BLUE_INSTAGRAM_TEST_SENDERS`, enable `BLUE_INSTAGRAM_SEND_ENABLED`, and deploy that configuration with authorization.
8. Click **Activate replies**. Send a fresh question covered by your approved facts. Confirm the reply arrives in the real customer's Instagram app and matches the inbox.
9. Click **Pause replies**, send another message, and confirm no automatic reply. Check human takeover and a manual reply during the open window.
10. Confirm WhatsApp still works independently. Either channel alone must also open the dashboard.

Do not use mock screenshots as Meta evidence. Instagram replies are limited to the open 24-hour customer messaging window. This release has no Instagram campaigns, comments, publishing, attachments processing, or Human Agent extension. Unsupported media goes to a human. Each BznsFlow business supports one Instagram account; reconnect the same account. Switching the linked Instagram identity requires a separate account-migration workflow.

## 6. Record two simple videos

Use the English interface, readable account names, slow clicks, and captions explaining each button. Hide passwords and secrets. Keep the consent flow and resulting action visible in the same recording.

**Video A — `instagram_business_basic`:**

1. Caption: “A business owner connects their Instagram professional account to BznsFlow.”
2. Show BznsFlow sign-in, Channels, and **Connect Instagram**.
3. Show the full Instagram login/consent flow, including the requested access.
4. Return to Blue and point to the connected `@bznsflow` identity.
5. Click **Check connection** and show success. Explain that identity is used to route this business's inbox.

**Video B — `instagram_business_manage_messages`:**

1. Show the complete login/consent flow again and the same connected identity.
2. Show the approved business answers, then activate Instagram replies.
3. Show the customer account sending a real DM to `@bznsflow`.
4. Show that DM in BznsFlow's Instagram inbox and the reply in the customer's Instagram app.
5. Turn on human takeover and demonstrate a manual reply.
6. Pause replies and explain the control. Show the disconnect option; only execute it at the end if ready to reconnect afterward.

Meta asks for an end-to-end screencast for each requested permission and reproducible tester access. Follow the current action items shown in your submission. [Meta App Review instructions](https://developers.facebook.com/documentation/instagram-platform/app-review).

## 7. Paste the permission descriptions

**`instagram_business_basic`**

“BznsFlow lets a business owner connect their own Instagram professional account using Instagram Login. We use instagram_business_basic to identify the authorized account and show its username in the Channels screen, so the owner can verify which account is connected and we can route its inbox to the correct business. The recording shows BznsFlow login, Connect Instagram, the complete consent flow, and the connected account identity.”

**`instagram_business_manage_messages`**

“BznsFlow uses instagram_business_manage_messages to receive customer-initiated Instagram DMs and send replies based on business information approved by the owner. Owners can view conversations, pause automatic replies, take over a chat, and reply manually within the allowed messaging window. The recording shows consent, a customer DM, the same conversation in BznsFlow, the reply received in Instagram, and owner controls. We do not initiate unsolicited Instagram conversations.”

These describe the implemented feature. Submit them only after the real rehearsal and matching recordings succeed.

## 8. Give the reviewer a working path

Use **Instagram → API setup with Instagram login → Complete app review**, then edit the request. Ask for Advanced Access to the two Instagram permissions. Leave approved WhatsApp permissions in place and defer `business_management`.

Provide an isolated BznsFlow reviewer login/access link in Meta's private reviewer instructions. Test it in a fresh browser first. The existing reviewer access mechanism is documented in `meta-app-review-submission.md`; never include its secret link in public docs. A anonymous demo is not enough for connecting an Instagram account.

Suggested instructions: “Open the supplied private Blue access link. Select English. Open Channels and Connect Instagram. Complete authorization with the professional test account. Verify the displayed username, check the connection, review/approve the business answers, and activate replies. Send a DM from the supplied customer test account. Open Chats and filter Instagram to view it and its reply. Enable human takeover to reply manually.”

Supply the actual test-account access and any tester-role steps Meta requires. Ensure the review sender's scoped ID is allowed; otherwise the test send will be blocked. Do not provide personal owner credentials. Check all required API-test counters, business/Tech Provider/access-verification items, and reviewer access immediately before submission. Upload both real videos and submit only when the dashboard's required items are complete.

## 9. After the decision

If approved, verify Advanced Access is live for both Instagram permissions. Then test a separately authorized client business from login through receipt. Broad sending and onboarding all customers require a release decision; approval alone does not activate clients. If rejected, keep the exact feedback and correct the matching flow or evidence before resubmitting.

## Evidence still needed

- [ ] Blue backend/frontend deployment with Instagram sending disabled.
- [ ] Instagram app credentials, callback verification, and professional-account subscription.
- [ ] Real `@bznsflow` OAuth consent and customer DM/reply receipt.
- [ ] Real pause, takeover, reconnect, deletion callback, and WhatsApp regression checks.
- [ ] Two screencasts, reproducible private reviewer access, and correct public legal settings.
- [ ] Submission and Advanced Access approval for Instagram.

Technical behavior, automated evidence, and rollback: [engineering notes](blue-instagram-engineering.md).
