import React, { useState } from 'react';
import { hasib, dashboard } from '../../lib/dashboard/api';
import { browserTimezone, timezoneOptions } from '../../lib/dashboard/format';
import { Dialog } from '../dashboard/Dialog';
import { IndustrySetup } from './IndustrySetup';

const RATE = /^\d{1,3}(?:\.\d{1,2})?$/;

/**
 * Settings → Accounts and VAT: how Hasib counts money (VAT), the business's own day
 * (time zone), the expense categories its industry brings, and the industry itself.
 */
export function AccountsSettings({ s, h, overview, timezone, onChanged }) {
  const current = overview.settings;
  const [vat, setVat] = useState({ registered: current.vatRegistered, rate: String(current.vatRateBps / 100), pricesIncludeVat: current.pricesIncludeVat, vatin: current.vatin || '' });
  const [zone, setZone] = useState(timezone || browserTimezone());
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false), [changing, setChanging] = useState(false);
  const rateBps = Math.round(Number(vat.rate) * 100);
  const rateOk = RATE.test(vat.rate.trim()) && rateBps <= 10000;
  const set = patch => { setVat(v => ({ ...v, ...patch })); setSaved(false); };
  const live = overview.livePacks?.find(p => p.id === overview.pack.id);

  const save = async e => {
    e.preventDefault();
    if (busy || !rateOk) return;
    setBusy(true); setError(''); setSaved(false);
    try {
      await hasib('settings_update', { vat: { registered: vat.registered, rateBps, pricesIncludeVat: vat.pricesIncludeVat, vatin: vat.vatin.trim().toUpperCase() } });
      if (zone !== timezone) await dashboard('set_timezone', { timezone: zone });
      setSaved(true);
      onChanged();
    } catch (err) { setError(h.reason(err.reason) || s.reason(err.reason)); } finally { setBusy(false); }
  };

  return (
    <div className="hb-accounts">
      <h1>{h.t('accountsTitle')}</h1>
      <p className="ld-help">{h.t('accountsIntro')}</p>
      <form className="hb-today-card" onSubmit={save} aria-labelledby="hb-vat-title">
        <h2 id="hb-vat-title">{h.t('vat')}</h2>
        <label className="ld-check"><input type="checkbox" checked={vat.registered} onChange={e => set({ registered: e.target.checked })} /> {h.t('vatRegistered')}</label>
        {vat.registered && <div className="hb-grid-2">
          <label className="ld-field">{h.t('vatRate')}<input inputMode="decimal" dir="ltr" value={vat.rate} aria-invalid={!rateOk} onChange={e => set({ rate: e.target.value })} /></label>
          <label className="ld-field">{h.t('vatin')}<input dir="ltr" maxLength={20} value={vat.vatin} onChange={e => set({ vatin: e.target.value })} /></label>
          <label className="ld-check"><input type="checkbox" checked={vat.pricesIncludeVat} onChange={e => set({ pricesIncludeVat: e.target.checked })} /> {h.t('pricesIncludeVat')}</label>
        </div>}
        <label className="ld-field">{h.t('businessTimezone')}
          <select value={zone} onChange={e => { setZone(e.target.value); setSaved(false); }}>{timezoneOptions(zone).map(z => <option key={z} value={z}>{z}</option>)}</select>
          <span className="ld-help">{h.t('timezoneHelp')}</span>
        </label>
        {error && <p className="ld-inline-error" role="alert">{error}</p>}
        {saved && <p className="hb-saved" role="status">{h.t('settingsSaved')}</p>}
        <div><button type="submit" className="ld-button ld-primary" disabled={busy || !rateOk}>{busy ? h.t('saving') : h.t('saveSettings')}</button></div>
      </form>

      <section className="hb-today-card" aria-labelledby="hb-categories-title">
        <h2 id="hb-categories-title">{h.t('expenseCategoriesTitle')}</h2>
        <p className="ld-help">{h.t('expenseCategoriesHelp')}</p>
        <ul className="hb-category-list">{overview.pack.expenseCategories.map(c => <li key={c.key}>{s.ar ? c.ar : c.en}</li>)}</ul>
      </section>

      <section className="hb-today-card" aria-labelledby="hb-industry-title">
        <h2 id="hb-industry-title">{h.t('changeIndustry')}</h2>
        {live && <p>{h.t('industry', { name: s.ar ? live.ar : live.en })}</p>}
        <div><button type="button" className="ld-button" onClick={() => setChanging(true)}>{h.t('changeIndustry')}</button></div>
      </section>
      {changing && <Dialog s={s} title={h.t('changeIndustry')} onClose={() => setChanging(false)}>
        <IndustrySetup s={s} h={h} livePacks={overview.livePacks} industries={overview.industries} current={overview.pack.id} heading={false} onChosen={() => { setChanging(false); onChanged(); }} />
      </Dialog>}
    </div>
  );
}
