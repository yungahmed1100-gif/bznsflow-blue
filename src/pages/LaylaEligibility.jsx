import React, { useState } from 'react';

const labels = { signupConfiguration: 'Signup configuration belongs to our app', businessVerification: 'Meta business verification', techProvider: 'Tech Provider requirements', appPermissions: 'Advanced access to WhatsApp permissions', publication: 'App publication', oauthAndSdkDomains: 'Facebook login URLs and domains', signupProducts: 'v4 WhatsApp signup products', ownerNumber: 'Omani number — saved connection check', egyptianCoexistence: 'Egyptian number — Coexistence', customerNewNumber: 'Separate customer number', scheduler: 'Recent worker heartbeat', customerMessaging: 'Customer automatic replies' };
const statuses = { passed: 'Passed', needs_action: 'Needs action', not_verified: 'Not verified' };
export default function LaylaEligibility() {
  const [data, setData] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function check() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/layla-meta?surface=eligibility', { credentials: 'same-origin', cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !result.ok) throw Error('unavailable');
      setData(result);
    } catch { setError('Eligibility checks are unavailable. No setup changes were made.'); }
    finally { setBusy(false); }
  }
  return <section aria-labelledby="eligibility-heading">
    <h2 id="eligibility-heading">Customer onboarding eligibility</h2>
    <p>The Omani number’s connection does not prove customer onboarding approval. Meta must also approve the app and confirm each number.</p>
    <button disabled={busy} onClick={check}>{busy ? 'Checking…' : 'Check onboarding eligibility — read only'}</button>
    {data && <><p>Checked: {new Date(data.checkedAt).toLocaleString()}. Customer access approval remains unverified.</p>
      <ul>{Object.entries(data.checks).map(([key, value]) => <li key={key}>{key === 'accessVerification' ? 'Meta Access Verification' : labels[key] || key}: <strong>{statuses[value.status]}</strong></li>)}</ul>
      <p>A recent heartbeat shows worker contact; scheduled delivery still needs operational verification.</p>
      <a href="https://developers.facebook.com/apps/1388038082832745/" target="_blank" rel="noreferrer">Open Meta app dashboard to verify pending requirements</a>
    </>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
