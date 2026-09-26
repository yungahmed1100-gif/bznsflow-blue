import React, { useState } from 'react';
import { hasib } from '../../lib/dashboard/api';

/** First run: pick one of the live Hasib industries. Layla's own sector is untouched. */
export function IndustrySetup({ s, h, livePacks, current, onChosen, heading = true }) {
  const [busy, setBusy] = useState(''), [error, setError] = useState('');
  const choose = async id => {
    setBusy(id); setError('');
    try { await hasib('settings_update', { packId: id }); onChosen(); }
    catch (e) { setError(h.reason(e.reason) || s.reason(e.reason)); setBusy(''); }
  };
  return (
    <section className="hb-setup" aria-labelledby={heading ? 'hb-setup-title' : undefined} aria-label={heading ? undefined : h.t('changeIndustry')}>
      {heading && <h1 id="hb-setup-title">{h.t('industryTitle')}</h1>}
      <p>{h.t('industryIntro')}</p>
      <ul className="hb-setup-list">
        {livePacks.map(p => (
          <li key={p.id}>
            <button type="button" className={`ld-button ${p.id === current ? 'ld-quiet' : 'ld-primary'}`} disabled={!!busy || p.id === current} aria-current={p.id === current ? 'true' : undefined} onClick={() => choose(p.id)}>
              {busy === p.id ? h.t('choosing') : p.id === current ? `${s.ar ? p.ar : p.en} · ${h.t('currentIndustry')}` : h.t('chooseIndustry', { name: s.ar ? p.ar : p.en })}
            </button>
          </li>
        ))}
      </ul>
      <p className="ld-help">{h.t('industryLayla')}</p>
      {error && <p className="ld-inline-error" role="alert">{error}</p>}
    </section>
  );
}
