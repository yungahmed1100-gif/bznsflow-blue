import { randomUUID } from 'node:crypto';
import { LIVE_RELEASE_ENABLED, PilotError } from './config.js';
import { answer, guard, maintain, reconcile } from './domain.js';
import { transact } from './store.js';

export function providerResult(status, body) {
  if (status < 200 || status >= 300) return { status: status >= 500 || status === 408 ? 'ambiguous' : 'failed', error: `provider_http_${status}` };
  const providerId = body?.messages?.[0]?.id;
  if (typeof providerId !== 'string' || !/^[A-Za-z0-9_.:=/-]{1,220}$/.test(providerId)) return { status: 'ambiguous', error: 'provider_missing_id' };
  return { status: 'submitted', providerId };
}

// General pilot transport remains source-locked. Never retry this POST.
async function cloudSend(c, intent, fetcher) {
  if (!LIVE_RELEASE_ENABLED) throw new PilotError('live_release_locked', 503);
  if (c.missing.length) throw new PilotError('configuration_missing', 503);
  try {
    const response = await fetcher(`https://graph.facebook.com/${c.version}/${c.phone}/messages`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual',
        to: intent.from, type: 'text', text: { preview_url: false, body: intent.reply },
        biz_opaque_callback_data: intent.intentId }),
    });
    return providerResult(response.status, response.ok ? await response.json() : null);
  } catch { return { status: 'ambiguous', error: 'provider_outcome_unknown' }; }
}
export async function runOne({ store, config, now = Date.now, fetcher = fetch, mockSend }) {
  const c = config();
  if (!c.owner) throw new PilotError('owner_configuration_missing', 503);
  if (c.mode === 'live' && !LIVE_RELEASE_ENABLED) throw new PilotError('live_release_locked', 503);
  const intentId = randomUUID();
  const intent = await transact(store, c, s => {
    const time = now(); maintain(s, time); reconcile(s, time);
    const job = Object.values(s.jobs).filter(j => j.status === 'queued').sort((a,b) => a.at - b.at)[0];
    if (!job) return null;
    const reason = guard(s, c, job, time);
    if (reason) {
      // Pause/rate/reconciliation can recover; terminal gates consume the job.
      if (!['kill_switch','profile_unreviewed','rate_limit','reconciliation_required'].includes(reason)) {
        job.status = 'blocked'; job.text = null;
      }
      job.error = reason; return null;
    }
    const reply = answer(job.text, s.profile, s.contacts[job.from].introduced).text;
    if (!reply) { job.status = 'blocked'; job.error = 'no_reply'; job.text = null; return null; }
    Object.assign(job, { status: 'attempting', intentId, attemptAt: time, reply, text: null, error: null });
    s.rates.push(time);
    return structuredClone(job);
  });
  if (!intent) return { processed: false };
  // Recheck mutable brakes after committing intent, immediately before transport.
  const fresh = config();
  const { state } = await store.read(fresh);
  const person = state.contacts[intent.from];
  let result;
  if (state.paused || fresh.kill || person?.optout || (person?.takeover && person.handoffJobId !== intent.id) ||
      (state.activatedAt && now() >= state.activatedAt + 30 * 86400000) ||
      now() - person.lastInbound >= 86400000 || fresh.mode !== c.mode) result = { status: 'blocked', error: 'send_time_gate' };
  else if (fresh.mode === 'mock') {
    try { result = mockSend ? await mockSend(intent) : { status: 'submitted', providerId: `mock.${intent.intentId}` }; }
    catch { result = { status: 'ambiguous', error: 'provider_outcome_unknown' }; }
  } else result = await cloudSend(fresh, intent, fetcher);
  await transact(store, c, s => {
    const job = s.jobs[intent.id];
    if (!job || job.intentId !== intent.intentId) throw new PilotError('intent_conflict', 409);
    // A receipt can arrive while the provider response is in flight. Never downgrade it.
    if (!['sent','delivered','read','failed'].includes(job.status)) Object.assign(job, result);
    else if (result.providerId && job.providerId !== result.providerId) { s.paused = true; job.error = 'provider_correlation_conflict'; }
    if (result.providerId && !job.providerId) job.providerId = result.providerId;
    if (['submitted','sent','delivered','read'].includes(job.status)) s.contacts[job.from].introduced = true;
    job.reply = null;
    if (s.contacts[job.from].handoffJobId === job.id) s.contacts[job.from].handoffJobId = null;
    if (Object.values(s.jobs).filter(j => j.status === 'failed' && now() - j.attemptAt < 3600000).length >= 3) s.paused = true;
    reconcile(s, now());
  });
  return { processed: true, intentId: intent.intentId, status: result.status };
}
