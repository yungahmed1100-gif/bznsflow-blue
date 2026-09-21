import { PilotError, binding } from './config.js';
import { classifyWithGuard } from './guards.js';
import { route } from './route.js';
export const DAY = 86400000;
export const blankProfile = () => ({ sector: '', services: '', prices: '', hours: '', location: '', humanContact: '', reviewed: false });
export function initialState(c) {
  return { schema: 1, binding: binding(c), paused: true, profile: blankProfile(), activatedAt: null,
    incomingAt: null, contacts: {}, jobs: {}, receipts: [], controls: {}, rates: [], audit: [] };
}
export function assertBinding(s, c) {
  if (s.schema === 1 && s.binding !== binding(c) && s.binding.split(':').slice(0,2).join(':') === [c.owner,c.mode].join(':') && !Object.keys(s.jobs).length && !Object.keys(s.contacts).length && !s.activatedAt) s.binding = binding(c);
  if (s.schema !== 1 || s.binding !== binding(c)) throw new PilotError('binding_changed_requires_review', 409);
}
export function reviewProfile(input) {
  if (!input || typeof input !== 'object') throw new PilotError('invalid_profile');
  const profile = blankProfile();
  for (const key of Object.keys(profile).filter(k => k !== 'reviewed')) {
    if (typeof input[key] !== 'string' || input[key].length > 350 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input[key])) throw new PilotError('invalid_profile');
    profile[key] = input[key].trim();
  }
  if (profile.humanContact.length > 120) throw new PilotError('human_contact_too_long');
  if (input.reviewed !== true || !profile.sector || !profile.services || !profile.humanContact) throw new PilotError('review_sector_services_contact');
  profile.reviewed = true;
  return profile;
}
/**
 * Layla's intent router: the regex guards, then the authored lexicon, then the
 * tenant's own approved profile text.
 *
 * `profile` is optional and only the last layer uses it, so every existing
 * caller keeps working and gains whatever the first two layers can give.
 * Passing it is strictly better: it is what lets "what is on your menu?" reach
 * a restaurant's services text, which is vocabulary we never authored.
 *
 * See api/_lib/layla/route.js for the layering and why it cannot regress a
 * question that routes correctly today.
 */
export const classify = (text, profile = null) => route(text, profile).intent;

export { classifyWithGuard };

export function answer(text, profile, introduced = false) {
  const ar = /[\u0600-\u06ff]/.test(text), intent = classify(text, profile);
  const contact = profile.humanContact ? (ar ? ` للتواصل مع الفريق: ${profile.humanContact}` : ` You can contact our team: ${profile.humanContact}`) : '';
  let reply;
  if (intent === 'optout') return { intent, text: null };
  if (intent === 'human') reply = ar ? 'أفهمك. يمكنك التواصل مع الفريق مباشرة.' : 'You can speak with our team directly.';
  else if (intent === 'disabled') reply = ar ? 'أستطيع الإجابة عن أسئلة النشاط فقط حالياً، ولا أستطيع إجراء حجوزات أو مواعيد.' : 'I can answer business questions at present. I cannot make bookings or appointments.';
  else if (intent === 'identity' || intent === 'greeting') reply = ar ? 'أنا ليلى، المساعدة الافتراضية لدى BznsFlow. كيف أساعدك في أسئلتك عن خدماتنا؟' : 'I’m Layla, BznsFlow’s virtual assistant. What would you like to know about our services?';
  else if (['services', 'prices', 'hours', 'location'].includes(intent) && profile[intent]) reply = profile[intent];
  else reply = ar ? 'لا تتوفر لدي معلومة مؤكدة عن ذلك. هل يمكنك توضيح سؤالك؟' : 'I don’t have confirmed information about that. Could you clarify your question?';
  if (['human', 'disabled', 'unknown'].includes(intent) || (['prices','hours','location'].includes(intent) && !profile[intent])) reply += contact;
  if (!introduced && !['identity', 'greeting'].includes(intent)) reply = (ar ? 'أنا ليلى، المساعدة الافتراضية لدى BznsFlow. ' : 'I’m Layla, BznsFlow’s virtual assistant. ') + reply;
  return { intent, text: reply.slice(0, 700) };
}
export function guard(s, c, job, now) {
  assertBinding(s, c);
  const person = s.contacts[job.from];
  if (s.paused || c.kill) return 'kill_switch';
  if (!s.profile.reviewed) return 'profile_unreviewed';
  if (job.feature !== 'faq') return 'feature_disabled';
  if (!person || person.optout) return 'optout';
  if (person.takeover && person.handoffJobId !== job.id) return 'human_takeover';
  if (s.activatedAt && now >= s.activatedAt + 30 * DAY) return 'trial_expired';
  if (now - person.lastInbound >= DAY || person.lastInbound > now || now - job.at >= DAY) return 'window_closed';
  if (s.rates.filter(t => now - t < 60000).length >= 10 || s.rates.filter(t => now - t < DAY).length >= 100) return 'rate_limit';
  if (Object.values(s.jobs).some(j => ['attempting', 'ambiguous'].includes(j.status))) return 'reconciliation_required';
  return null;
}
export function reconcile(s, now) {
  const ranks = { submitted: 0, sent: 1, failed: 2, delivered: 3, read: 4 };
  const jobs = Object.values(s.jobs);
  const byProvider = new Map(jobs.filter(j => j.providerId).map(j => [j.providerId, j]));
  const byIntent = new Map(jobs.filter(j => j.intentId).map(j => [j.intentId, j]));
  for (const receipt of s.receipts) {
    const job = byProvider.get(receipt.id) || byIntent.get(receipt.intent);
    if (!job || !job.intentId || receipt.recipient !== job.from || receipt.at < job.attemptAt - 300000 || receipt.at > now + 300000) continue;
    if (job.providerId && job.providerId !== receipt.id) continue;
    if (receipt.intent && receipt.intent !== job.intentId) continue;
    job.providerId = receipt.id;
    byProvider.set(receipt.id, job);
    if ((ranks[receipt.status] ?? -1) > (ranks[job.status] ?? -1)) job.status = receipt.status;
    if (['delivered', 'read'].includes(receipt.status) && !s.activatedAt) s.activatedAt = now;
    if (job.status === 'failed') job.error = 'provider_delivery_failed';
    else if (['delivered','read'].includes(job.status)) job.error = null;
    job.text = null;
    job.reply = null;
  }
}
export function maintain(s, now) {
  for (const [id, job] of Object.entries(s.jobs)) {
    if (job.status === 'attempting' && now - job.attemptAt > 60000) { job.status = 'ambiguous'; job.error = 'worker_lost_after_intent'; }
    if (job.status === 'queued' && now - job.at >= DAY) { job.status = 'blocked'; job.error = 'window_closed'; job.text = null; }
    if (now - job.at > 30 * DAY && !['attempting','ambiguous'].includes(job.status)) delete s.jobs[id];
  }
  s.receipts = s.receipts.filter(r => now - r.receivedAt < 30 * DAY);
  s.rates = s.rates.filter(t => now - t < DAY);
  for (const [id, at] of Object.entries(s.controls)) if (now - at > 30 * DAY) delete s.controls[id];
  s.audit = s.audit.slice(-100);
}
export function accept(s, events, now) {
  maintain(s, now);
  for (const e of events.filter(e => ['optout','takeover'].includes(e.kind))) {
    if (e.id && s.controls[e.id]) continue;
    if (e.id) s.controls[e.id] = now;
    s.contacts[e.from] ||= { lastInbound: 0, introduced: false };
    s.contacts[e.from][e.kind === 'optout' ? 'optout' : 'takeover'] = true;
    s.contacts[e.from].handoffJobId = null;
  }
  for (const e of events) {
    if (e.kind === 'receipt') {
      if (!s.receipts.some(r => r.id === e.id && r.status === e.status && r.recipient === e.recipient)) s.receipts.push({ ...e, receivedAt: now });
    }
    if (e.kind !== 'message' || s.jobs[e.id]) continue;
    if (classify(e.text, s.profile) === 'optout') {
      s.contacts[e.from] ||= { lastInbound: 0, introduced: false };
      s.contacts[e.from].optout = true;
    }
    if (now - e.at >= DAY) continue;
    const person = s.contacts[e.from] ||= { lastInbound: 0, introduced: false };
    person.lastInbound = Math.max(person.lastInbound, e.at);
    const intent = classify(e.text, s.profile);
    if (intent === 'optout') person.optout = true;
    if (intent === 'human' && !person.takeover) { person.takeover = true; person.handoffJobId = e.id; }
    s.jobs[e.id] = { ...e, feature: 'faq', status: intent === 'optout' ? 'blocked' : 'queued', error: intent === 'optout' ? intent : null };
    if (intent === 'optout') s.jobs[e.id].text = null;
    s.incomingAt = now;
  }
  if (Object.keys(s.controls).length > 5000 || Object.keys(s.contacts).length > 1000 || Object.keys(s.jobs).length > 5000 || s.receipts.length > 10000 || Object.values(s.jobs).filter(j => j.status === 'queued').length > 500) throw new PilotError('pilot_capacity', 503);
  reconcile(s, now);
}
export function summary(s, c, now) {
  const jobs = Object.values(s.jobs);
  const counts = {};
  for (const j of jobs) counts[j.status] = (counts[j.status] || 0) + 1;
  let connection = c.missing.length ? 'configuration_missing' : 'configured';
  if (s.incomingAt) connection = 'incoming_message_received';
  if (counts.submitted || counts.sent) connection = 'reply_submitted';
  if (counts.failed || counts.ambiguous) connection = 'failed';
  if (s.activatedAt) connection = 'reply_delivered';
  return { mode: c.mode, connection, missing: c.missing, liveEnabled: false, paused: s.paused,
    channel: { provider: 'meta_cloud_api', sender: c.sender, wabaId: c.waba, phoneNumberId: c.phone },
    profile: s.profile, counts, firstSuccessfulReplyAt: c.mode === 'live' ? s.activatedAt : null,
    simulatedActivationAt: c.mode === 'mock' ? s.activatedAt : null,
    trial: { days: 30, activatedAt: s.activatedAt, expired: !!s.activatedAt && now >= s.activatedAt + 30 * DAY },
    features: { faq: true, booking: false, scheduling: false, followups: false, marketing: false },
    oldestQueuedAt: jobs.some(j => j.status === 'queued') ? Math.min(...jobs.filter(j => j.status === 'queued').map(j => j.at)) : null,
    issues: jobs.filter(j => ['ambiguous','failed','blocked'].includes(j.status)).slice(-20).map(j => ({ id: j.id, status: j.status, error: j.error })),
    contacts: Object.entries(s.contacts).map(([number, p]) => ({ number, optout: !!p.optout, takeover: !!p.takeover })) };
}
