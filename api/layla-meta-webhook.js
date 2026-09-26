import { instagramConfig } from './_lib/layla/instagram.js';
import { settings, PilotError } from './_lib/layla/config.js';
import { ingestBlueEnvelope, ingestInstagramEnvelope, messagingStore } from './_lib/layla/blue-messaging.js';
import { safeEqual } from './_lib/cookies.js';
import { send, sendPilotError } from './_lib/http.js';
import { createStore, transact } from './_lib/layla/store.js';
import { accept } from './_lib/layla/domain.js';
import { rawBody, signatureValid, parseEvents } from './_lib/layla/webhook.js';
import { acceptOpen, runOpen } from './_lib/layla/open-test.js';
import { waitUntil } from '@vercel/functions';
import { customerStore } from './_lib/layla/customer-store.js';
import { routeCustomerEnvelope, persistCustomerEvents } from './_lib/layla/customer-webhook.js';
export const config = { api: { bodyParser: false } };
export function createHandler({ store = createStore(), configuration = settings, now = Date.now, env = process.env, fetcher = fetch, background = waitUntil, registry = customerStore({ env }) } = {}) {
  return async (req, res) => {
    try {
      const c = configuration();
      if (req.method === 'GET') {
        const q = new URL(req.url, 'https://callback.invalid').searchParams;
        if (!c.verify || q.get('hub.mode') !== 'subscribe' || !safeEqual(q.get('hub.verify_token') || '', c.verify) || !q.get('hub.challenge')) throw new PilotError('verification_failed', 403);
        res.status(200); res.setHeader('Content-Type','text/plain'); res.setHeader('Cache-Control','no-store');
        return res.end(q.get('hub.challenge'));
      }
      if (req.method !== 'POST') { res.setHeader('Allow','GET, POST'); throw new PilotError('method', 405); }
      const raw = await rawBody(req);
      if (!c.secret) throw new PilotError('webhook_secret_missing', 503);
      if (!signatureValid(raw, req.headers['x-hub-signature-256'], c.secret)) throw new PilotError('signature', 403);
      if (!c.owner || !c.app) throw new PilotError('owner_or_app_configuration_missing', 503);
      const groups = env.LAYLA_CUSTOMER_ONBOARDING_ENABLED === 'true' ? await routeCustomerEnvelope(raw, c, registry, now()) : [{ integration: null, events: parseEvents(raw, c, now()) }];
      for (const group of groups.filter(g => g.integration)) await persistCustomerEvents(registry, group.integration, group.events);
      const events = groups.filter(g => !g.integration).flatMap(g => g.events);
      const open = await transact(store, c, s => {
        if (s.openTest) { acceptOpen(s, events, now()); return true; }
        accept(s, events, now()); return false;
      });
      send(res, 200, { ok: true, accepted: true });
      // Durable acceptance is complete. A bounded kick reduces latency; the
      // authenticated scheduler recovers pending work if this invocation dies.
      if (open) {
        try { background(runOpen({ store, configuration, env, now, fetcher }).catch(() => { console.warn('layla_open_worker_unavailable'); })); }
        catch { console.warn('layla_open_background_unavailable'); }
      }
      return;
    } catch (error) {
      return sendPilotError(res, error);
    }
  };
}
// Blue uses its own durable tenant queue only when its dedicated live flag is
// enabled; otherwise authenticated notifications are discarded.
//
// One URL serves both channels. The payload's own `object` decides the route, so
// Instagram works whether Meta saved the URL with or without ?channel=instagram;
// the query only narrows which verify token a subscription check may use.
export async function blueReviewWebhook(req, res, env = process.env) {
  try {
    const instagramUrl=new URL(req.url || '/', 'https://local.invalid').searchParams.get('channel')==='instagram';
    // Meta documents webhook signing with the owning app's Basic-settings secret.
    // Blue's parent app owns the WhatsApp subscription. Instagram Login webhooks
    // may be signed by either of our apps' secrets (parent or Instagram app), and
    // BLUE_INSTAGRAM_WEBHOOK_SECRET overrides the parent one for other installs.
    const secrets={
      whatsapp:[env.LAYLA_META_APP_SECRET].filter(Boolean),
      instagram:[env.BLUE_INSTAGRAM_WEBHOOK_SECRET || env.LAYLA_META_APP_SECRET,env.BLUE_INSTAGRAM_APP_SECRET].filter(Boolean),
    };
    if (req.method === 'GET') {
      const q = new URL(req.url, 'https://callback.invalid').searchParams;
      const challenge = q.get('hub.challenge'), given = q.get('hub.verify_token') || '';
      const tokens = (instagramUrl ? [env.BLUE_INSTAGRAM_VERIFY_TOKEN] : [env.BLUE_REVIEW_VERIFY_TOKEN, env.BLUE_INSTAGRAM_VERIFY_TOKEN]).filter(Boolean);
      if (q.get('hub.mode') !== 'subscribe' || !tokens.some(token => safeEqual(given, token)) || !challenge || challenge.length > 200) throw new PilotError('verification_failed',403);
      res.status(200); res.setHeader('Content-Type','text/plain'); res.setHeader('Cache-Control','no-store'); return res.end(challenge);
    }
    if (req.method !== 'POST') throw new PilotError('method',405);
    const raw = await rawBody(req);
    if (!secrets.whatsapp.length && !secrets.instagram.length) throw new PilotError('webhook_secret_missing',503);
    const signedBy = channel => secrets[channel].some(secret => signatureValid(raw, req.headers['x-hub-signature-256'], secret));
    const signedInstagram = signedBy('instagram'), signedWhatsapp = signedBy('whatsapp');
    if (!signedInstagram && !signedWhatsapp) {
      if (instagramUrl) console.error('instagram_webhook_rejected',JSON.stringify({reason:'signature',hasHeader:Boolean(req.headers['x-hub-signature-256'])}));
      throw new PilotError('signature',403);
    }
    const envelope = JSON.parse(raw.toString('utf8'));
    if (envelope?.object === 'instagram') {
      if (!signedInstagram) throw new PilotError('signature',403);
      await ingestInstagramEnvelope(envelope,{store:messagingStore({env}),app:instagramConfig(env).app,env});
      return send(res,200,{ok:true,accepted:true});
    }
    // A WhatsApp payload must carry the WhatsApp app's signature, never only the Instagram app's.
    if (!signedWhatsapp) throw new PilotError('signature',403);
    if (envelope?.object !== 'whatsapp_business_account' || !Array.isArray(envelope.entry)) throw new PilotError('invalid_envelope');
    if (env.BLUE_LIVE_MESSAGING_ENABLED === 'true') {
      await ingestBlueEnvelope(envelope,{store:messagingStore({env})});
      return send(res,200,{ok:true,accepted:true});
    }
    return send(res,200,{ok:true,ignored:true,messagingEnabled:false});
  } catch (error) { return sendPilotError(res, error); }
}
const ownerWebhook = createHandler();
export default function handler(req,res) {
  if (process.env.CONVEX_CLOUD_URL === 'https://quaint-nightingale-675.eu-west-1.convex.cloud') return blueReviewWebhook(req,res);
  return ownerWebhook(req,res);
}
