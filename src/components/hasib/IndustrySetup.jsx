import React, { useState } from 'react';
import { hasib } from '../../lib/dashboard/api';

/** First run: pick one of the live Hasib industries. Layla's own sector is untouched. */
export function IndustrySetup({ s, h, livePacks, onChosen }) {
  const [busy, setBusy] = useState(''), [error, setError] = useState('');
  const choose = async id => {
    setBusy(id); setError('');
    try { await hasib('settings_update', { packId: id }); onChosen(); }
    catch (e) { setError(h.reason(e.reason) || s.reason(e.reason)); setBusy(''); }
  };
  return (
    <section className="hb-setup" aria-labelledby="hb-setup-title">
      <h1 id="hb-setup-title">{h.t('industryTitle')}</h1>
      <p>{h.t('industryIntro')}</p>
      <ul className="hb-setup-list">
        {livePacks.map(p => (
          <li key={p.id}>
            <button type="button" className="ld-button ld-primary" disabled={!!busy} onClick={() => choose(p.id)}>
              {busy === p.id ? h.t('choosing') : h.t('chooseIndustry', { name: s.ar ? p.ar : p.en })}
            </button>
          </li>
        ))}
      </ul>
      <p className="ld-help">{h.t('industryLayla')}</p>
      {error && <p className="ld-inline-error" role="alert">{error}</p>}
    </section>
  );
}
