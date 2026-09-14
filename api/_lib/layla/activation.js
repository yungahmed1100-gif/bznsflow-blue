import { createHash, randomUUID } from 'node:crypto';
import { PilotError } from './config.js';
import { transact } from './store.js';
import { checkMetaReadiness } from './readiness.js';

export const APPROVED = Object.freeze({ app: '1388038082832745', waba: '2213485365896306', phone: '1250149564857596', sender: '96871134025', version: 'v25.0' });
const digest = value => createHash('sha256').update(value).digest('hex');
export function activationGate(c, s) {
  if (c.missing.length) return 'configuration_missing';
  if (Object.entries(APPROVED).some(([key, value]) => c[key] !== value)) return 'unapproved_binding';
  if (c.mode !== 'mock' || !c.kill || !s.paused) return 'safeguards_required';
  if (s.activation && !['prepared'].includes(s.activation.status)) return 'activation_already_attempted';
  return null;
}
export function activationView(c, s) {
  const a = s.activation;
  return { allowed: !activationGate(c, s), reason: a?.status === 'ready' ? null : activationGate(c, s), target: APPROVED,
    status: a?.status || 'not_started', code: a?.code || null, updatedAt: a?.updatedAt || null,
    readiness: a?.readiness || null, recoveryAllowed: !recoveryGate(c, s), recoveryCode: a?.recovery?.code || null };
}
function recoveryGate(c, s) {
  const reason = activationGate(c, { ...s, activation: null });
  if (reason) return reason;
  if (!s.activation || s.activation.status === 'prepared') return 'activation_not_attempted';
  return null;
}

// Reconciliation never calls /register. A lease serializes reads and subscription
// effects; after a crash a new owner request must read Meta again before any POST.
export async function recoverSubscription({ store, c, now = Date.now, fetcher = fetch }) {
  const operation = randomUUID();
  await transact(store, c, s => {
    const reason = recoveryGate(c, s);
    if (reason) throw new PilotError(reason, 409);
    const a = s.activation;
    if (['registering', 'subscribing', 'checking'].includes(a.status) && now() - a.updatedAt < 60000) throw new PilotError('activation_in_progress', 409);
    if (a.recovery?.leaseUntil > now()) throw new PilotError('recovery_in_progress', 409);
    a.originalOutcome ||= { status: a.status, code: a.code || null, updatedAt: a.updatedAt };
    a.recovery = { operation, leaseUntil: now() + 60000, code: 'checking', updatedAt: now() };
  });
  const update = values => transact(store, c, s => {
    if (s.activation.recovery?.operation !== operation) throw new PilotError('recovery_superseded', 409);
    Object.assign(s.activation, values, { updatedAt: now() });
    s.activation.recovery = { operation, leaseUntil: 0, code: values.code || 'ready', updatedAt: now() };
  });
  let readiness;
  try { readiness = await checkMetaReadiness(c, fetcher); }
  catch { await update({ status: 'needs_attention', code: 'meta_readiness_unavailable' }); return; }
  const verified = ['waba', 'phone', 'sender', 'cloudApi', 'webhookConfiguration'].every(key => readiness.checks[key] === true);
  if (!verified) { await update({ status: 'needs_attention', code: 'recovery_identity_or_webhook_incomplete', readiness }); return; }
  if (!readiness.checks.webhookApp) {
    // Check lease and safeguards immediately before the single external effect.
    await transact(store, c, s => {
      if (recoveryGate(c, s) || s.activation.recovery?.operation !== operation || s.activation.recovery.leaseUntil <= now()) throw new PilotError('recovery_superseded', 409);
      s.activation.recovery.code = 'subscribing';
    });
    let code = null;
    try {
      const response = await fetcher(`https://graph.facebook.com/${APPROVED.version}/${APPROVED.waba}/subscribed_apps`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' }, body: '{}',
      });
      if (!response.ok) code = 'subscription_rejected';
      else { const raw = await response.text(); if (raw.length > 10000 || JSON.parse(raw)?.success !== true) code = 'subscription_outcome_unknown'; }
    } catch { code = 'subscription_outcome_unknown'; }
    if (code) { await update({ status: 'needs_attention', code, readiness }); return; }
    try { readiness = await checkMetaReadiness(c, fetcher); }
    catch { await update({ status: 'needs_attention', code: 'meta_readiness_unavailable' }); return; }
  }
  await update({ status: readiness.ready ? 'ready' : 'needs_attention', code: readiness.ready ? null : 'readiness_incomplete', readiness });
}
export async function prepareActivation(store, c, now) {
  const challenge = randomUUID();
  await transact(store, c, s => {
    const reason = activationGate(c, s);
    if (reason) throw new PilotError(reason, 409);
    s.activation = { status: 'prepared', challengeHash: digest(challenge), expiresAt: now + 300000, updatedAt: now };
  });
  return { challenge, target: APPROVED, expiresAt: now + 300000 };
}
// Never log request/response data. A claimed operation is never retried, including
// after a timeout or process crash: Meta may have accepted it already.
export async function activate({ store, c, challenge, pin, now = Date.now, fetcher = fetch }) {
  if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) throw new PilotError('invalid_pin');
  if (typeof challenge !== 'string' || !/^[a-f0-9-]{36}$/.test(challenge)) throw new PilotError('invalid_challenge');
  await transact(store, c, s => {
    const reason = activationGate(c, s);
    if (reason) throw new PilotError(reason, 409);
    const a = s.activation;
    if (!a || a.challengeHash !== digest(challenge) || now() >= a.expiresAt) throw new PilotError('expired_or_used_challenge', 409);
    s.activation = { status: 'registering', updatedAt: now(), actor: c.owner };
  });
  const update = async values => transact(store, c, s => Object.assign(s.activation, values, { updatedAt: now() }));
  const post = async (path, body, stage) => {
    try {
      const r = await fetcher(`https://graph.facebook.com/v25.0/${path}`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!r.ok) return `${stage}_rejected`;
      const raw = await r.text();
      if (raw.length > 10000 || JSON.parse(raw)?.success !== true) return `${stage}_outcome_unknown`;
      return null;
    } catch { return `${stage}_outcome_unknown`; }
  };
  const registrationError = await post(`${APPROVED.phone}/register`, { messaging_product: 'whatsapp', pin }, 'registration');
  pin = null;
  if (registrationError) { await update({ status: 'blocked', code: registrationError }); return; }
  await update({ status: 'subscribing', registeredAt: now() });
  const subscriptionError = await post(`${APPROVED.waba}/subscribed_apps`, {}, 'subscription');
  if (subscriptionError) { await update({ status: 'blocked', code: subscriptionError }); return; }
  await update({ status: 'checking', subscribedAt: now() });
  try {
    const readiness = await checkMetaReadiness(c, fetcher);
    await update({ status: readiness.ready ? 'ready' : 'needs_attention', code: readiness.ready ? null : 'readiness_incomplete', readiness });
  } catch { await update({ status: 'needs_attention', code: 'meta_readiness_unavailable' }); }
}
