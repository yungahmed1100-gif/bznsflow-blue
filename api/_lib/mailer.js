// Apps Script transport: OTP delivery, and the CRM sheet row.
//
// Both go to the same deployed web app (apps-script/Code.gs), which is bound to
// the Lead Pipeline CRM spreadsheet and sends mail as ahmed@bznsflowai.com
// natively — the sender-identity problem was solved by hosting the sheet on that
// account, so there is no alias, app password or SMTP credential anywhere here.
//
// WHY THIS WORKS SERVER-SIDE, WHEN IT DOES NOT IN THE BROWSER
// PlaybookModal.jsx has to use `mode: 'no-cors'` and gets an opaque response it
// cannot read, because the Apps Script /exec URL 302s to a googleusercontent
// origin that sends no CORS headers. That is a browser restriction, not an
// Apps Script one. Here there is no origin and no CORS layer: fetch follows the
// redirect and hands back the real JSON, so delivery is actually confirmable —
// which is the difference between "good enough for a lead magnet" and "good
// enough for a login".
//
// The OTP email TEMPLATE deliberately lives in Code.gs, not here. This endpoint
// takes an address and a code, never a subject or a body, so a leaked shared
// secret buys an attacker the ability to send BznsFlow login codes — irritating —
// rather than arbitrary mail from Ahmed's address, which would be an open relay.

import { fetchWithTimeout, httpError } from './fetch.js';

// Apps Script latency is bimodal: usually 2-3s, but it spikes past 10s when its
// container is cold. Measured against the live deployment: 1.9s, 2.6s, 3.2s,
// 9.9s, 10.5s across five consecutive sends. A 10s ceiling turned that last one
// into a visitor-facing "we couldn't send the email" for a code that may well
// have gone out — and left them throttled for 60s before they could retry.
//
// Two ceilings, because the two calls do different amounts of work. Sending a
// code is one GmailApp call. Pushing a lead may additionally download the teaser
// and the PDF before Apps Script replies, which is why the playbook path is
// slower and gets more room.
const OTP_TIMEOUT_MS = 20000;
const LEAD_TIMEOUT_MS = 25000;

function endpoint() {
  const url = process.env.LEAD_ENDPOINT;
  if (!url) throw new Error('LEAD_ENDPOINT is not configured');
  return url;
}

/**
 * POST JSON to the Apps Script web app and read its reply.
 *
 * `Content-Type: application/json` is correct here. The browser has to send
 * text/plain to dodge a CORS preflight Apps Script cannot answer; server-side
 * there is no preflight, so the honest content type is fine.
 */
async function post(payload, timeoutMs) {
  const res = await fetchWithTimeout(endpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    redirect: 'follow', // the 302 to googleusercontent carries the JSON body
  }, { label: 'Apps Script', timeoutMs });

  if (!res.ok) throw await httpError('Apps Script', res);

  const text = await res.text().catch(() => '');

  // A misconfigured deployment ("Who has access" set to anything but "Anyone")
  // answers 200 with a Google sign-in PAGE rather than JSON. Parsing rather than
  // trusting the status is what catches that, and it is a real failure mode this
  // pipeline has hit before.
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Apps Script returned non-JSON: ${text.slice(0, 300)}`);
  }

  if (!body?.ok) {
    throw new Error(`Apps Script refused: ${String(body?.error || '').slice(0, 300)}`);
  }
  return body;
}

/**
 * Email a one-time code. Throws on any failure — the caller must not tell the
 * visitor to check their inbox for a message that was never sent.
 */
export function sendOtpEmail({ email, code, lang }) {
  const secret = process.env.OTP_SHARED_SECRET;
  if (!secret) throw new Error('OTP_SHARED_SECRET is not configured');

  return post({
    action: 'sendOtp',
    secret,
    email,
    code,
    language: lang === 'ar' ? 'ar' : 'en',
  }, OTP_TIMEOUT_MS);
}

/**
 * Append a lead to the CRM sheet, and optionally trigger the playbook email.
 *
 * The keys are camelCase because Code.gs matches them to the sheet's header row
 * by normalised name — `phoneWhatsapp` lands in "Phone / WhatsApp",
 * `marketRegion` in "Market / Region", `segment` in "Segment". Unmatched keys are
 * ignored, so this needs no sheet schema change.
 *
 * No `action`, so Code.gs takes its normal append path.
 *
 * `playbook: true` additionally emails the lead magnet. A sign-in must never set
 * it — the sign-in flow calls this with the flag absent. `playbookUrl` is passed
 * so the attachment's filename has one source of truth on this side rather than
 * a second hardcoded copy inside Apps Script; that copy is exactly what drifted
 * and silently stopped the emails.
 *
 * The email's body is no longer passed with it. It used to be fetched from a
 * public URL on this site; Apps Script now builds it, so there is nothing left
 * to fetch and nothing left to 404.
 *
 * @returns {Promise<{ ok: true, emailed?: boolean, emailError?: string }>}
 */
export function pushLead({
  name, email, phone, country, industry, lang, pageUrl,
  sourceCta, playbook, playbookUrl,
}) {
  return post({
    name,
    email,
    phoneWhatsapp: phone,
    sourceCta: sourceCta || 'Sign-in',
    language: lang,
    pageUrl: pageUrl || '',
    marketRegion: country,
    segment: industry,
    ...(playbook ? { playbook: true, playbookUrl } : {}),
  }, LEAD_TIMEOUT_MS);
}
