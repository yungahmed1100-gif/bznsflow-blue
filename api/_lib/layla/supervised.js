import { randomUUID } from 'node:crypto';
import { PilotError } from './config.js';
import { answer, classify } from './domain.js';
import { transact } from './store.js';

export const TEST_TRANSPORT_ENABLED = false;
export const TEST_TIMEOUT = 15 * 60000;
const terminal = new Set(['stopped', 'expired', 'optout', 'takeover', 'limit', 'failed', 'ambiguous']);
export function expireTest(s, now) {
  const t = s.supervised;
  if (t && !terminal.has(t.status) && now >= t.expiresAt) { t.status = 'expired'; t.review = null; }
  return t;
}
export function testView(s, now) {
  const t = expireTest(s, now);
  return { transportEnabled: TEST_TRANSPORT_ENABLED, synthetic: true, session: t ? {
    id: t.id, recipient: t.recipient, status: t.status, expiresAt: t.expiresAt, replies: t.replies,
    review: t.review, events: t.events.map(({ inbound, reply, status, latencyMs, error }) => ({ inbound, reply, status, latencyMs, error })),
  } : null };
}
export function previewTest(s, body, now) {
  if (typeof body.recipient !== 'string' || !/^\d{7,15}$/.test(body.recipient) || body.allowed !== true) throw new PilotError('allowed_recipient_required');
  if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 1000) throw new PilotError('invalid_text');
  if (!s.profile.reviewed) throw new PilotError('profile_unreviewed', 409);
  let t = expireTest(s, now);
  if (!t) t = s.supervised = { id: randomUUID(), recipient: body.recipient, status: 'review', expiresAt: now + TEST_TIMEOUT,
    replies: 0, events: [], seen: [], review: null };
  if (t.recipient !== body.recipient) throw new PilotError('one_recipient_only', 409);
  if (terminal.has(t.status) || t.status === 'sending') throw new PilotError('test_not_active', 409);
  if (s.contacts[t.recipient]?.optout || s.contacts[t.recipient]?.takeover) {
    t.status = s.contacts[t.recipient].optout ? 'optout' : 'takeover'; t.review = null; return;
  }
  acceptTestEvents(s, [{ kind: 'message', id: randomUUID(), from: t.recipient, text: body.text, at: now }], now);
}
// Accept only normalized, authenticated events when a future live release wires
// ingress to this isolated state. Current production ingress never calls this.
export function acceptTestEvents(s, events, now) {
  const t = expireTest(s, now);
  if (!t) return;
  // Stops outrank questions in the same envelope.
  for (const e of events) {
    if (e.from !== t.recipient) continue;
    const intent = e.kind === 'message' ? classify(e.text) : e.kind;
    if (['optout', 'takeover', 'human'].includes(intent)) { t.status = intent === 'human' ? 'takeover' : intent; t.review = null; }
  }
  for (const e of events) {
    if (e.kind === 'receipt') {
      if (e.recipient !== t.recipient || !['sent', 'delivered', 'read', 'failed'].includes(e.status)) continue;
      const job = t.events.find(j => j.providerId === e.id || (e.intent && j.id === e.intent));
      if (!job || (job.providerId && job.providerId !== e.id) || e.at < job.at) continue;
      const key = `receipt:${e.id}:${e.status}`;
      if (t.seen.includes(key)) continue;
      if (t.seen.length >= 100) { t.status = 'limit'; t.review = null; continue; }
      t.seen.push(key); job.providerId = e.id;
      const rank = { sending: 0, ambiguous: 0, accepted: 1, sent: 2, failed: 2, delivered: 3, read: 4 };
      if ((rank[e.status] || 0) > (rank[job.status] || 0)) job.status = e.status;
      if (job.status === 'failed') { job.error = 'delivery_failed'; t.status = 'failed'; t.review = null; }
      continue;
    }
    if (e.kind !== 'message' || e.from !== t.recipient || terminal.has(t.status) || t.status === 'sending') continue;
    if (e.at < t.expiresAt - TEST_TIMEOUT || e.at > now + 60000) continue;
    const key = `message:${e.id}`;
    if (t.seen.includes(key)) continue;
    if (t.seen.length >= 100 || t.replies >= 5) { t.status = 'limit'; t.review = null; continue; }
    t.seen.push(key);
    const generated = answer(e.text, s.profile);
    t.review = { id: randomUUID(), inbound: e.text, reply: generated.text, recipient: t.recipient };
    t.status = 'review';
  }
}
export function stopTest(s) { if (s.supervised) { s.supervised.status = 'stopped'; s.supervised.review = null; } }

export async function confirmTest({ store, c, reviewId, now = Date.now, mockSend }) {
  // This entry point can only simulate. Environment flags cannot enable sending.
  if (c.mode !== 'mock') throw new PilotError('test_transport_disabled', 403);
  const intent = await transact(store, c, s => {
    const t = expireTest(s, now());
    if (!t || t.status !== 'review' || !t.review || t.review.id !== reviewId || t.replies >= 5) throw new PilotError('expired_or_used_review', 409);
    if (s.contacts[t.recipient]?.optout || s.contacts[t.recipient]?.takeover) throw new PilotError('recipient_paused', 409);
    const job = { ...t.review, status: 'sending', at: now(), providerId: null, latencyMs: null, error: null };
    t.events.push(job); t.replies++; t.review = null; t.status = 'sending';
    return structuredClone(job);
  });
  const fresh = (await store.read(c)).state;
  const t = expireTest(fresh, now());
  let result;
  if (t.status !== 'sending' || fresh.contacts[t.recipient]?.optout || fresh.contacts[t.recipient]?.takeover) result = { status: 'blocked', error: 'test_stopped' };
  else {
    try {
      const raw = mockSend ? await mockSend(intent) : { providerId: `mock.test.${intent.id}` };
      result = typeof raw?.providerId === 'string' && /^mock\.[A-Za-z0-9.-]{1,200}$/.test(raw.providerId)
        ? { status: 'accepted', providerId: raw.providerId } : { status: 'ambiguous', error: 'test_outcome_unknown' };
    } catch { result = { status: 'ambiguous', error: 'test_outcome_unknown' }; }
  }
  await transact(store, c, s => {
    const t = expireTest(s, now()), job = t.events.find(j => j.id === intent.id);
    if (!job) throw new PilotError('intent_conflict', 409);
    if (job.status === 'sending') Object.assign(job, result);
    job.latencyMs = Math.max(0, now() - intent.at);
    if (t.status === 'sending') t.status = result.status === 'accepted' ? (t.replies >= 5 ? 'limit' : 'active') : 'ambiguous';
  });
}
