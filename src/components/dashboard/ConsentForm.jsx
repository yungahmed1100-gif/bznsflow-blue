import React from 'react';

export const consentComplete = c => !!(c.attested && c.source.trim() && c.purpose.trim() && /^\d{4}-\d{2}-\d{2}$/.test(c.date) && c.date <= new Date().toISOString().slice(0, 10));

/** One batch attestation: how, when and for what the customers agreed. */
export function ConsentForm({ s, value, onChange }) {
  const set = patch => onChange({ ...value, ...patch });
  return (
    <fieldset className="ld-fieldset ld-consent">
      <legend>{s.t('consentTitle')}</legend>
      <p className="ld-help">{s.t('consentIntro')}</p>
      <label className="ld-field">{s.t('consentSource')}<input value={value.source} maxLength={120} dir="auto" required placeholder={s.t('consentSourceHint')} onChange={e => set({ source: e.target.value })} /></label>
      <label className="ld-field">{s.t('consentDate')}<input type="date" value={value.date} max={new Date().toISOString().slice(0, 10)} required onChange={e => set({ date: e.target.value })} /></label>
      <label className="ld-field">{s.t('consentPurpose')}<input value={value.purpose} maxLength={200} dir="auto" required placeholder={s.t('consentPurposeHint')} onChange={e => set({ purpose: e.target.value })} /></label>
      <label className="ld-check"><input type="checkbox" checked={value.attested} onChange={e => set({ attested: e.target.checked })} required /> <span>{s.t('consentAttest')}</span></label>
    </fieldset>
  );
}
