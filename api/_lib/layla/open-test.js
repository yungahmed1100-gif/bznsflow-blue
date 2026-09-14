import { createHash, randomUUID } from 'node:crypto';
import { APPROVED } from './activation.js';
import { PilotError } from './config.js';
import { answer, classify, DAY, reviewProfile } from './domain.js';
import { providerResult } from './gateway.js';
import { transact } from './store.js';

export const OPEN_LIMIT = 100;
export const RETENTION = 30 * DAY;
const hash = value => createHash('sha256').update(value).digest('hex');
const ranks = { attempting: 0, ambiguous: 0, submitted: 1, sent: 2, failed: 3, delivered: 4, read: 5 };
export const FEEDBACK = ['correct', 'incorrect', 'missing_information', 'poor_clarification', 'handoff'];
export const notice = ar => ar
  ? 'هذه تجربة. نحتفظ بالمحادثة 30 يومًا لمراجعة الجودة. لا ترسل معلومات حساسة. أرسل توقف لإيقاف الردود.'
  : 'This is a test. Chats are kept for 30 days for quality review. Do not send sensitive information. Reply STOP to stop automated replies.';

export function openGate(c, s, env, now) {
  if (env.LAYLA_OPEN_TEST_ENABLED !== 'true') return 'open_test_transport_disabled';
  if (c.missing.length || !env.LAYLA_META_WORKER_SECRET) return 'configuration_missing';
  if (Object.entries(APPROVED).some(([k, v]) => c[k] !== v)) return 'unapproved_binding';
  if (c.mode !== 'mock' || !c.kill || !s.paused) return 'safeguards_required';
  if (!s.activation?.readiness?.ready) return 'readiness_incomplete';
  if (!s.openWorkerAt || now - s.openWorkerAt >= 180000 || s.openWorkerAt > now) return 'scheduler_unverified';
  return null;
}
export function prepareOpen(s, c, env, profile, now, challenge) {
  const reason = openGate(c, s, env, now);
  if (reason) throw new PilotError(reason, 409);
  if (s.openTest) throw new PilotError('open_test_already_started', 409);
  s.openReview = { hash: hash(challenge), expiresAt: now + 300000, profile: reviewProfile(profile) };
}
export function startOpen(s, c, env, challenge, now, id) {
  const reason = openGate(c, s, env, now);
  if (reason) throw new PilotError(reason, 409);
  if (s.openTest) throw new PilotError('open_test_already_started', 409);
  if (typeof challenge !== 'string' || !s.openReview || s.openReview.hash !== hash(challenge) || s.openReview.expiresAt <= now) throw new PilotError('expired_or_used_review', 409);
  s.openTest = { id, status: 'active', startedAt: now, expiresAt: now + DAY, deleteAt: now + RETENTION,
    profile: s.openReview.profile, attempts: 0, rates: [], jobs: {}, contacts: {}, receipts: [] };
  delete s.openReview;
}
export function stopOpen(s, now, reason = 'stopped') {
  const t = s.openTest;
  if (!t) return;
  t.status = reason; t.stoppedAt = now;
  for (const j of Object.values(t.jobs)) if (j.status === 'queued') { j.status = 'blocked'; j.error = reason; }
}
export function maintainOpen(s, now) {
  if (s.openReview?.expiresAt <= now) delete s.openReview;
  const t = s.openTest;
  if (!t || t.status === 'deleted') return;
  if (now >= t.deleteAt) {
    // Retain only aggregate non-personal evidence; never reset the attempt budget.
    s.openTest = { id: t.id, status: 'deleted', startedAt: t.startedAt, expiresAt: t.expiresAt, deleteAt: t.deleteAt,
      attempts: t.attempts, jobs: {}, contacts: {}, receipts: [], rates: [] };
    return;
  }
  if (t.status === 'active' && now >= t.expiresAt) stopOpen(s, now, 'expired');
  t.rates = t.rates.filter(at => now - at < 60000);
  for (const j of Object.values(t.jobs)) {
    if (j.status === 'attempting' && now - j.attemptAt >= 60000) {
      j.status = 'ambiguous'; j.error = 'worker_lost_after_intent'; t.contacts[j.from].blocked = 'ambiguous';
    }
    if (j.status === 'queued' && now - j.at >= DAY) { j.status = 'blocked'; j.error = 'window_closed'; }
  }
}
function reconcileOpen(t, now) {
  for (const r of t.receipts) {
    const j = Object.values(t.jobs).find(j => j.intentId && (j.providerId === r.id || j.intentId === r.intent));
    if (!j || j.from !== r.recipient || (j.providerId && j.providerId !== r.id) ||
      (r.intent && j.intentId !== r.intent) || r.at < j.attemptAt - 300000 || r.at > now + 300000) continue;
    j.providerId = r.id;
    if (ranks[r.status] > (ranks[j.status] ?? -1)) j.status = r.status;
    if (['delivered', 'read'].includes(j.status)) { j.error = null; j.deliveredAt ||= now; }
    if (j.status === 'failed') { j.error = 'provider_delivery_failed'; t.contacts[j.from].blocked = 'delivery_failed'; }
  }
}
export function acceptOpen(s, events, now) {
  maintainOpen(s, now);
  const t = s.openTest;
  if (!t || t.status === 'deleted') return;
  // Controls outrank every queued question in the envelope, regardless of order.
  for (const e of events) {
    const reason = ['optout', 'takeover'].includes(e.kind) ? e.kind : e.kind === 'message' && ['optout', 'human'].includes(classify(e.text)) ? classify(e.text) : null;
    if (reason && (t.status === 'active' || t.contacts[e.from])) {
      t.contacts[e.from] ||= { lastInbound: 0, introduced: false };
      t.contacts[e.from].blocked = reason;
    }
  }
  for (const e of events) {
    if (e.kind === 'receipt') {
      if (!t.receipts.some(r => r.id === e.id && r.status === e.status && r.recipient === e.recipient)) t.receipts.push({ ...e });
      continue;
    }
    if (e.kind !== 'message' || t.status !== 'active' || e.at < t.startedAt || e.at > now || now - e.at >= DAY) continue;
    const key = hash(e.id);
    if (t.jobs[key]) continue;
    const person = t.contacts[e.from] ||= { lastInbound: 0, introduced: false };
    person.lastInbound = Math.max(person.lastInbound, e.at);
    t.jobs[key] = { id: key, from: e.from, at: e.at, receivedAt: now, inbound: e.text,
      status: person.blocked ? 'blocked' : 'queued', error: person.blocked || null, reply: null };
  }
  for (const j of Object.values(t.jobs)) if (j.status === 'queued' && t.contacts[j.from]?.blocked) {
    j.status = 'blocked'; j.error = t.contacts[j.from].blocked;
  }
  if (Object.keys(t.jobs).length > 1000 || Object.keys(t.contacts).length > 1000 || t.receipts.length > 2000) throw new PilotError('open_test_capacity', 503);
  reconcileOpen(t, now);
}
export function openView(s, c, env, now) {
  const t = structuredClone(s); maintainOpen(t, now);
  const run = t.openTest;
  return { enabled: env.LAYLA_OPEN_TEST_ENABLED === 'true', reason: openGate(c, t, env, now),
    review: t.openReview ? { profile: t.openReview.profile, expiresAt: t.openReview.expiresAt } : null,
    session: run ? { id: run.id, status: run.status, attempts: run.attempts, limit: OPEN_LIMIT,
      startedAt: run.startedAt, expiresAt: run.expiresAt, deleteAt: run.deleteAt,
      events: Object.values(run.jobs).slice(-100).map(j => ({ id: j.id, recipient: `…${j.from.slice(-4)}`, inbound: j.inbound,
        reply: j.reply, status: j.status, error: j.error || null, latencyMs: j.latencyMs ?? null, feedback: j.feedback || null })) } : null };
}
export function feedbackOpen(s, body, now) {
  maintainOpen(s, now);
  const j = typeof body.id === 'string' && s.openTest?.jobs[body.id];
  if (!j || !FEEDBACK.includes(body.feedback)) throw new PilotError('invalid_feedback');
  j.feedback = body.feedback;
}

async function sendOpen(c, intent, fetcher) {
  try {
    const response = await fetcher(`https://graph.facebook.com/${c.version}/${c.phone}/messages`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: intent.from,
        type: 'text', text: { preview_url: false, body: intent.reply }, biz_opaque_callback_data: intent.intentId }),
    });
    let body = null;
    if (response.ok) { const raw = await response.text(); if (raw.length <= 10000) body = JSON.parse(raw); }
    return providerResult(response.status, body);
  } catch { return { status: 'ambiguous', error: 'provider_outcome_unknown' }; }
}
export async function runOpen({ store, configuration, env = process.env, now = Date.now, fetcher = fetch }) {
  const c = configuration(), intentId = randomUUID();
  const intent = await transact(store, c, s => {
    maintainOpen(s, now());
    const t = s.openTest;
    if (!t || t.status !== 'active' || openGate(c, s, env, now())) return null;
    if (t.attempts >= OPEN_LIMIT) { stopOpen(s, now(), 'limit'); return null; }
    if (t.rates.length >= 10 || Object.values(t.jobs).some(j => j.status === 'attempting')) return null;
    const j = Object.values(t.jobs).filter(j => j.status === 'queued').sort((a, b) => a.at - b.at)[0];
    if (!j) return null;
    const person = t.contacts[j.from];
    if (person.blocked || now() - person.lastInbound >= DAY || now() - j.at >= DAY) { j.status = 'blocked'; j.error = person.blocked || 'window_closed'; return null; }
    const response = answer(j.inbound, t.profile, person.introduced);
    if (!response.text) { j.status = 'blocked'; j.error = 'optout'; person.blocked = 'optout'; return null; }
    j.reply = response.text + (person.introduced ? '' : `\n\n${notice(/[\u0600-\u06ff]/.test(j.inbound))}`);
    Object.assign(j, { status: 'attempting', intentId, attemptAt: now(), intent: response.intent });
    t.attempts++; t.rates.push(now());
    return structuredClone(j);
  });
  if (!intent) return { processed: false };
  const fresh = configuration(), { state } = await store.read(fresh), t = state.openTest;
  const gate = openGate(fresh, state, env, now());
  let result;
  if (gate || t?.status !== 'active' || now() >= t.expiresAt || t.contacts[intent.from]?.blocked ||
    t.jobs[intent.id]?.intentId !== intent.intentId || t.jobs[intent.id]?.status !== 'attempting') result = { status: 'blocked', error: 'send_time_gate' };
  else result = await sendOpen(fresh, intent, fetcher);
  await transact(store, c, s => {
    const t = s.openTest, j = t?.jobs[intent.id];
    if (!j || j.intentId !== intent.intentId) throw new PilotError('intent_conflict', 409);
    if ((ranks[j.status] ?? -1) <= 0) Object.assign(j, result);
    if (result.providerId && j.providerId && result.providerId !== j.providerId) { t.contacts[j.from].blocked = 'ambiguous'; j.error = 'provider_correlation_conflict'; }
    if (['ambiguous', 'failed'].includes(result.status)) t.contacts[j.from].blocked = result.status;
    if (['submitted', 'sent', 'delivered', 'read'].includes(j.status)) t.contacts[j.from].introduced = true;
    j.latencyMs = Math.max(0, now() - j.receivedAt);
    reconcileOpen(t, now());
    if (t.attempts >= OPEN_LIMIT) stopOpen(s, now(), 'limit');
  });
  return { processed: true, status: result.status };
}
