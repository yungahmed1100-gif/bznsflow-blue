import React, { useEffect, useState } from 'react';
import { hasib } from '../../lib/dashboard/api';

/** First run: pick one of the live Hasib industries. Layla's own sector is untouched. */
export function IndustrySetup({ s, h, livePacks, industries, current, settings, onChosen, heading = true, selection = true }) {
  const list = industries || livePacks.map(p => ({ ...p, live: true }));
  const live = list.filter(i => i.live), soon = list.filter(i => !i.live);
  const [busy, setBusy] = useState(''), [error, setError] = useState('');
  const [thresholds, setThresholds] = useState({ unsoldDays: String(settings?.unsoldDays ?? 60), absenceDays: String(settings?.absenceDays ?? 14) });
  const [settingsReady, setSettingsReady] = useState(!!settings), [saved, setSaved] = useState(false);
  const showStockDays = ['retail', 'retail-tech'].includes(current), showAbsenceDays = current === 'fitness';
  useEffect(() => {
    let active = true;
    if (!showStockDays && !showAbsenceDays) return;
    const apply = value => { if (active) { setThresholds({ unsoldDays: String(value.unsoldDays ?? 60), absenceDays: String(value.absenceDays ?? 14) }); setSettingsReady(true); } };
    if (settings) apply(settings);
    else {
      setSettingsReady(false);
      hasib('overview').then(value => apply(value.settings)).catch(e => { if (active) setError(h.reason(e.reason) || s.reason(e.reason)); });
    }
    return () => { active = false; };
  }, [current, settings, showStockDays, showAbsenceDays, h, s]);
  const thresholdValid = value => /^\d{1,4}$/.test(value) && Number(value) >= 1 && Number(value) <= 3650;
  const saveThresholds = async event => {
    event.preventDefault();
    if (!settingsReady || busy || !thresholdValid(showStockDays ? thresholds.unsoldDays : thresholds.absenceDays)) return;
    setBusy('thresholds'); setError(''); setSaved(false);
    try {
      await hasib('settings_update', showStockDays ? { unsoldDays: Number(thresholds.unsoldDays) } : { absenceDays: Number(thresholds.absenceDays) });
      setSaved(true); onChosen();
    } catch (e) { setError(h.reason(e.reason) || s.reason(e.reason)); }
    finally { setBusy(''); }
  };
  const choose = async id => {
    setBusy(id); setError(''); setSaved(false);
    try { await hasib('settings_update', { packId: id }); onChosen(); }
    catch (e) { setError(h.reason(e.reason) || s.reason(e.reason)); }
    finally { setBusy(''); }
  };
  if (!selection && !showStockDays && !showAbsenceDays) return null;
  return (
    <section className="hb-setup" aria-labelledby={heading ? 'hb-setup-title' : undefined} aria-label={heading ? undefined : selection ? h.t('changeIndustry') : (s.ar ? 'إعدادات التشغيل' : 'Operations settings')}>
      {selection && <>
      {heading && <h1 id="hb-setup-title">{h.t('industryTitle')}</h1>}
      <p>{h.t('industryIntro')}</p>
      <ul className="hb-setup-list">
        {live.map(p => (
          <li key={p.id}>
            <button type="button" className={`ld-button ${p.id === current ? 'ld-quiet' : 'ld-primary'}`} disabled={!!busy || p.id === current} aria-current={p.id === current ? 'true' : undefined} onClick={() => choose(p.id)}>
              {busy === p.id ? h.t('choosing') : p.id === current ? `${s.ar ? p.ar : p.en} · ${h.t('currentIndustry')}` : h.t('chooseIndustry', { name: s.ar ? p.ar : p.en })}
            </button>
          </li>
        ))}
      </ul>
      {soon.length > 0 && <>
        <h2 className="hb-soon-title">{h.t('nextIndustries')}</h2>
        <ul className="hb-soon-list">
          {soon.map(p => <li key={p.id}><span>{s.ar ? p.ar : p.en}</span> <span className="ld-chip">{h.t('comingSoon')}</span></li>)}
        </ul>
      </>}
      </>}
      {(showStockDays || showAbsenceDays) && <form className="hb-move" onSubmit={saveThresholds}>
        <h2 className="hb-panel-title">{s.ar ? 'متى يظهر التنبيه؟' : 'When should an alert appear?'}</h2>
        <label className="ld-field">{showStockDays ? (s.ar ? 'عدد أيام بقاء البضاعة دون بيع' : 'Days stock remains unsold') : (s.ar ? 'عدد أيام غياب العضو' : 'Days a member is absent')}
          <input type="number" inputMode="numeric" min={1} max={3650} step={1} required dir="ltr" disabled={!settingsReady || !!busy} value={showStockDays ? thresholds.unsoldDays : thresholds.absenceDays}
            onChange={e => { setThresholds(value => ({ ...value, [showStockDays ? 'unsoldDays' : 'absenceDays']: e.target.value })); setSaved(false); }} />
        </label>
        <p className="ld-help">{showStockDays ? (s.ar ? 'القيمة الافتراضية ٦٠ يوماً. أدخل من ١ إلى ٣٦٥٠ يوماً.' : 'The default is 60 days. Enter 1 to 3650 days.') : (s.ar ? 'القيمة الافتراضية ١٤ يوماً. أدخل من ١ إلى ٣٦٥٠ يوماً.' : 'The default is 14 days. Enter 1 to 3650 days.')}</p>
        <button type="submit" className="ld-button ld-primary" disabled={!settingsReady || !!busy || !thresholdValid(showStockDays ? thresholds.unsoldDays : thresholds.absenceDays)}>{busy === 'thresholds' ? h.t('saving') : h.t('save')}</button>
        {saved && <p role="status">{s.ar ? 'تم حفظ إعداد التنبيه' : 'Alert setting saved'}</p>}
      </form>}
      {selection && <p className="ld-help">{h.t('industryLayla')}</p>}
      {error && <p className="ld-inline-error" role="alert">{error}</p>}
    </section>
  );
}
