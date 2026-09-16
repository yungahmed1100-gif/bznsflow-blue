import React, { useEffect, useState } from 'react';
import LaylaEligibility from './LaylaEligibility';
import { callApi, reasonOf } from '../lib/api-client.js';

export default function LaylaSetup({ csrf, demo = false }) {
  const [activation, setActivation] = useState(null), [challenge, setChallenge] = useState(null), [pin, setPin] = useState('');
  const [test, setTest] = useState(null), [recipient, setRecipient] = useState(''), [text, setText] = useState(''), [allowed, setAllowed] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [clock, setClock] = useState(Date.now());
  async function request(endpoint, body) {
    // callApi throws ApiError; these pages surface `e.message`, which ApiError
    // sets to the reason code, so the existing handling below still applies.
    return callApi(`/api/layla-meta-${endpoint}`, { body, csrf });
  }
  async function run(task) {
    setBusy(true); setError('');
    try { await task(); } catch (e) { setError(reasonOf(e.message)); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    run(async () => { const [a, t] = await Promise.all([request('activation'), request('test')]); setActivation(a); setTest(t); if (t.session) setRecipient(t.session.recipient); });
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => { if (challenge && clock >= challenge.expiresAt) { setPin(''); setChallenge(null); } }, [clock, challenge]);
  const session = test?.session, expired = session && clock >= session.expiresAt;
  const active = session && !expired && ['review', 'active', 'sending'].includes(session.status);
  async function testAction(body) { setTest(await request('test', body)); }
  return <>
    {!demo && <LaylaEligibility />}
    {!demo && <section aria-labelledby="activation-heading">
      <h2 id="activation-heading">Activate the Omani Cloud API number</h2>
      <p>Register +96871134025 · Phone ID 1250149564857596 · WABA 2213485365896306.</p>
      <p>Registration and app subscription only. Messaging remains locked.</p>
      <p role="status">Activation: {activation?.status || 'Loading'}{activation?.code ? ` · ${activation.code}` : ''}{activation?.reason ? ` · ${activation.reason}` : ''}</p>
      <button disabled={busy || !!challenge} onClick={() => run(async () => setActivation(await request('activation')))}>Refresh activation status</button>
      {activation?.recoveryAllowed && <><p>Verify the registered number and repair its app subscription. No PIN is needed.</p><button disabled={busy || !!challenge} onClick={() => run(async () => setActivation(await request('activation', { action: 'recover_subscription' })))}>Check number and recover app subscription</button></>}
      <button disabled={busy || !activation?.allowed || !!challenge} onClick={() => run(async () => { setPin(''); setChallenge(await request('activation', { action: 'prepare' })); })}>Activate Cloud API — enter private PIN</button>
      {challenge && <form autoComplete="off" onSubmit={e => {
        e.preventDefault();
        const body = { action: 'activate', challenge: challenge.challenge, pin };
        setPin(''); setChallenge(null);
        run(async () => { try { setActivation(await request('activation', body)); } finally { delete body.pin; } });
      }}>
        <label>Private six-digit PIN<input aria-label="Private six-digit PIN" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{6}" maxLength={6} required value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} /></label>
        <p>Confirm the target above. The PIN is cleared when submitted or cancelled.</p>
        <button disabled={busy || pin.length !== 6}>Confirm registration and app subscription</button>
        <button type="button" onClick={() => { setPin(''); setChallenge(null); }}>Cancel</button>
      </form>}
      {activation?.readiness && <p>Readiness: {activation.readiness.ready ? 'All checks passed' : Object.entries(activation.readiness.checks).filter(([, ok]) => !ok).map(([key]) => key).join(', ')}</p>}
    </section>}
    <section aria-labelledby="supervised-heading">
      <h2 id="supervised-heading">Supervised test — simulation only</h2>
      <p>This simulator never sends WhatsApp messages. One recipient, one conversation, up to five replies, 15 minutes. Each simulated reply requires review.</p>
      <label>Allowed recipient (country code and digits)<input inputMode="tel" value={recipient} onChange={e => setRecipient(e.target.value)} maxLength={15} disabled={!!session} /></label>
      <label><input type="checkbox" checked={allowed} onChange={e => setAllowed(e.target.checked)} /> I confirm this recipient is allowed for the supervised test.</label>
      <label>Exact test question<textarea value={text} onChange={e => setText(e.target.value)} maxLength={1000} /></label>
      <button disabled={busy || !allowed || !/^\d{7,15}$/.test(recipient) || !text.trim() || (!!session && !active)} onClick={() => run(() => testAction({ action: 'preview', recipient, text, allowed }))}>Review recipient and generated reply — no send</button>
      {session && <p role="status">{expired ? 'expired' : session.status} · {session.replies}/5 replies · {Math.max(0, Math.ceil((session.expiresAt - clock) / 60000))} minutes remaining</p>}
      {session?.review && !expired && <div className="layla-preview">
        <p>Recipient: +{session.review.recipient}</p><p>Inbound question: {session.review.inbound}</p><p dir="auto">Generated reply: {session.review.reply}</p>
        <button disabled={busy || !active} onClick={() => run(() => testAction({ action: 'confirm_mock', reviewId: session.review.id }))}>Confirm simulated reply — no WhatsApp message</button>
        <button disabled>Send reviewed WhatsApp reply — disabled</button>
      </div>}
      {session && <button onClick={() => run(() => testAction({ action: 'stop' }))}>Stop supervised test immediately</button>}
      {session?.events.some(e => e.status === 'accepted') && <button disabled={busy} onClick={() => run(() => testAction({ action: 'receipt_mock' }))}>Simulate delivered receipt</button>}
      {session?.events.map((event, index) => <p key={index}>Inbound: {event.inbound} · Reply: {event.reply} · {event.status} · {event.latencyMs ?? '—'} ms{event.error ? ` · ${event.error}` : ''}</p>)}
    </section>
    {error && <p role="alert">{error}</p>}
  </>;
}
