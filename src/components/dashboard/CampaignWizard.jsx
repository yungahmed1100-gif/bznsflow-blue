import React, { useEffect, useMemo, useState } from 'react';
import { dashboard } from '../../lib/dashboard/api';
import { formatPhone, mayBeUsNumber } from '../../lib/dashboard/phone';
import { browserTimezone, localInputValue, timezoneOptions } from '../../lib/dashboard/format';
import { renderTemplate, resolveParameters, variableId, validMapping } from '../../../config/layla-templates.js';
import { ContactImporter } from './ContactImporter';
import { ConsentForm, consentComplete } from './ConsentForm';
import { useDebounced } from '../../hooks/usePolling';

const STEPS = ['template', 'variables', 'recipients', 'schedule', 'review'];
const MAX = 100;

/** Template → personalise → recipients → when → review. `single` pre-selects one chat contact. */
export function CampaignWizard({ s, overview, templates: given, single, onDone, onTimezone }) {
  const steps = single ? STEPS.filter(x => x !== 'recipients') : STEPS;
  const [step, setStep] = useState(0);
  const [templates, setTemplates] = useState(given || null);
  const [templateId, setTemplateId] = useState('');
  const [mapping, setMapping] = useState([]);
  const [selected, setSelected] = useState(() => new Map(single ? [[single.id, single]] : []));
  const [schedule, setSchedule] = useState({ mode: 'now', local: '', timezone: overview.timezone || browserTimezone() });
  const [preview, setPreview] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [created, setCreated] = useState(null);
  const [requestId] = useState(() => crypto.randomUUID());
  useEffect(() => { if (!templates) dashboard('templates').then(r => setTemplates(r.templates)).catch(e => setError(s.reason(e.reason))); }, []);
  const template = templates?.find(t => t.id === templateId);
  const current = steps[step];
  const pack = overview.qualification;

  const chooseTemplate = id => {
    const t = templates.find(x => x.id === id);
    setTemplateId(id);
    setMapping(t.variables.map(v => ({ key: variableId(v), source: v.component === 'body' && v.key === '1' ? 'contact_name' : 'static', value: v.example || '' })));
  };
  const sample = [...selected.values()][0] || { ownerName: s.ar ? 'سارة' : 'Sara', fields: [] };
  const rendered = template ? renderTemplate(template, resolveParameters(template, mapping, sample).parameters) : '';
  const canContinue = current === 'template' ? !!template?.sendable
    : current === 'variables' ? !!template && validMapping(template, mapping) && mapping.every(m => m.value.trim() || m.source !== 'static')
    : current === 'recipients' ? selected.size > 0 && selected.size <= MAX
    : current === 'schedule' ? schedule.mode === 'now' || !!schedule.local : !!preview?.eligible.length;

  useEffect(() => {
    if (current !== 'review') return;
    setPreview(null); setError('');
    dashboard('campaign_preview', { templateId, mapping, contactIds: [...selected.keys()] }).then(setPreview).catch(e => setError(s.reason(e.reason)));
  }, [current]);

  const create = async () => {
    setBusy(true); setError('');
    try {
      const r = await dashboard('campaign_create', { requestId, templateId, mapping, contactIds: preview.eligible.map(e => e.contactId), confirm: true,
        origin: single ? 'chat' : 'broadcast', name: single ? `${template.name} · ${single.name}` : template.name,
        schedule: schedule.mode === 'now' ? { mode: 'now', timezone: schedule.timezone } : { mode: 'later', local: schedule.local, timezone: schedule.timezone } });
      setCreated(r.campaign);
    } catch (e) { setError(s.reason(e.reason)); }
    finally { setBusy(false); }
  };
  if (created) return <div className="ld-wizard"><p role="status">{s.t('broadcastCreated')}</p><button type="button" className="ld-button ld-primary" onClick={onDone}>{s.t('close')}</button></div>;

  return (
    <div className="ld-wizard">
      <ol className="ld-steps">{steps.map((id, i) => <li key={id} aria-current={i === step ? 'step' : undefined}><span className="ld-num">{i + 1}</span>{s.t(`step_${id}`)}</li>)}</ol>
      {!templates ? <p role="status">{s.t('loading')}</p> : (
        <div className="ld-step">
          {current === 'template' && (
            <fieldset className="ld-fieldset"><legend>{s.t('chooseTemplate')}</legend>
              {!templates.length && <p>{s.t('noTemplates')}</p>}
              {templates.map(t => (
                <label key={t.id} className={`ld-choice ${t.sendable ? '' : 'is-disabled'}`}>
                  <input type="radio" name="template" value={t.id} disabled={!t.sendable} checked={templateId === t.id} onChange={() => chooseTemplate(t.id)} />
                  <span><strong dir="ltr">{t.name}</strong> <span className="ld-chip">{t.language}</span>{!t.sendable && <span className="ld-chip is-muted">{s.t(`unsupported_${t.unsupportedReason}`)}</span>}<small dir="auto">{t.body}</small></span>
                </label>
              ))}
            </fieldset>
          )}
          {current === 'variables' && template && (
            <div className="ld-split">
              <div>
                {!template.variables.length && <p className="ld-help">—</p>}
                {template.variables.map(v => {
                  const id = variableId(v), rule = mapping.find(m => m.key === id);
                  const update = patch => setMapping(list => list.map(m => m.key === id ? { ...m, ...patch } : m));
                  return (
                    <fieldset key={id} className="ld-fieldset">
                      <legend className="ld-num">{`{{${v.key}}}`} · {v.component}</legend>
                      <label className="ld-field">{s.t('variableSource')}
                        <select value={rule.source} onChange={e => update({ source: e.target.value })}>
                          <option value="static">{s.t('source_static')}</option>
                          <option value="contact_name">{s.t('source_contact_name')}</option>
                          {pack.fields.map(f => <option key={f.key} value={`field:${f.key}`}>{s.t('source_field', { field: s.ar ? f.ar : f.en })}</option>)}
                        </select>
                      </label>
                      <label className="ld-field">{rule.source === 'static' ? s.t('value') : s.t('fallback')}<input value={rule.value} maxLength={200} dir="auto" onChange={e => update({ value: e.target.value })} /></label>
                    </fieldset>
                  );
                })}
              </div>
              <figure className="ld-template-preview"><figcaption>{s.t('preview')}</figcaption><p dir="auto">{rendered}</p></figure>
            </div>
          )}
          {current === 'recipients' && <RecipientPicker s={s} pack={pack} selected={selected} setSelected={setSelected} />}
          {current === 'schedule' && (
            <fieldset className="ld-fieldset"><legend>{s.t('step_schedule')}</legend>
              {[['now', s.t('sendNow')], ['later', s.t('sendLater')]].map(([mode, label]) => (
                <label key={mode} className="ld-choice"><input type="radio" name="when" checked={schedule.mode === mode} onChange={() => setSchedule(x => ({ ...x, mode, local: mode === 'later' && !x.local ? localInputValue(Date.now() + 3600000, x.timezone) : x.local }))} /><span>{label}</span></label>
              ))}
              {schedule.mode === 'later' && <label className="ld-field">{s.t('scheduleAt')}<input type="datetime-local" dir="ltr" value={schedule.local} min={localInputValue(Date.now(), schedule.timezone)} onChange={e => setSchedule(x => ({ ...x, local: e.target.value }))} /></label>}
              <label className="ld-field">{s.t('timezone')}
                <select value={schedule.timezone} onChange={e => { const timezone = e.target.value; setSchedule(x => ({ ...x, timezone })); dashboard('set_timezone', { timezone }).then(() => onTimezone?.()).catch(() => {}); }}>
                  {timezoneOptions(schedule.timezone).map(z => <option key={z} value={z}>{z}</option>)}
                </select>
              </label>
            </fieldset>
          )}
          {current === 'review' && (
            <section>
              {!preview && !error && <p role="status">{s.t('loading')}</p>}
              {preview && <>
                <p className="ld-num"><strong>{s.t('reviewEligible', { count: preview.eligible.length })}</strong> · {s.t('reviewExcluded', { count: preview.excluded.length })}</p>
                <p className="ld-help ld-num">{s.t('cap', { cap: preview.cap, allowance: preview.allowance >= 1e9 ? '∞' : preview.allowance })}</p>
                {preview.eligible.some(e => mayBeUsNumber(e.number.replace(/\D/g, ''))) && <p className="ld-help">{s.t('usWarning')}</p>}
                <figure className="ld-template-preview"><figcaption>{s.t('preview')}</figcaption><p dir="auto">{rendered}</p></figure>
                {!!preview.excluded.length && <ul className="ld-issues">{preview.excluded.map(e => <li key={e.contactId}><bdi>{e.name || '—'}</bdi> <bdi dir="ltr">{e.number}</bdi> · {s.t(`reason_${e.reason}`)}</li>)}</ul>}
                {single && preview.excluded.length > 0 && <SingleConsent s={s} contact={single} onRefresh={() => dashboard('campaign_preview', { templateId, mapping, contactIds: [single.id] }).then(setPreview)} />}
              </>}
            </section>
          )}
        </div>
      )}
      {error && <p className="ld-inline-error" role="alert">{error}</p>}
      <div className="ld-actions ld-wizard-nav">
        {step > 0 && <button type="button" className="ld-button ld-quiet" onClick={() => setStep(step - 1)}>{s.t('previous')}</button>}
        {current !== 'review'
          ? <button type="button" className="ld-button ld-primary" disabled={!canContinue} onClick={() => setStep(step + 1)}>{s.t('next')}</button>
          : <button type="button" className="ld-button ld-primary" disabled={busy || !canContinue} onClick={create}>{busy ? s.t('sending') : s.t(schedule.mode === 'now' ? 'confirmSend' : 'confirmSchedule', { count: preview?.eligible.length || 0 })}</button>}
      </div>
    </div>
  );
}

function RecipientPicker({ s, pack, selected, setSelected }) {
  const [tab, setTab] = useState('saved'), [search, setSearch] = useState(''), [data, setData] = useState(null), [error, setError] = useState('');
  const query = useDebounced(search.trim(), 300);
  useEffect(() => { setData(null); dashboard('contacts', query ? { search: query } : { limit: 50 }).then(setData).catch(e => setError(s.reason(e.reason))); }, [query]);
  const eligible = c => !c.optout && c.consent.status === 'granted';
  const toggle = c => setSelected(map => { const next = new Map(map); if (next.has(c.id)) next.delete(c.id); else if (next.size < MAX) next.set(c.id, c); return next; });
  const add = contacts => setSelected(map => { const next = new Map(map); for (const c of contacts) if (eligible(c) && next.size < MAX) next.set(c.id, c); return next; });
  return (
    <div>
      <div className="ld-segmented" role="tablist">
        {[['saved', s.t('savedContacts')], ['add', `${s.t('manualEntry')} / ${s.t('importFile')}`]].map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      <p className="ld-num" role="status">{s.t('selected', { count: selected.size })} / {MAX}</p>
      {tab === 'saved' ? (
        <>
          <p className="ld-help">{s.t('eligibleOnly')}</p>
          <label className="ld-search"><span className="ld-visually-hidden">{s.t('searchContacts')}</span><input type="search" value={search} placeholder={s.t('searchContacts')} onChange={e => setSearch(e.target.value)} /></label>
          {error && <p className="ld-inline-error" role="alert">{error}</p>}
          {!data ? <p role="status">{s.t('loading')}</p> : (
            <ul className="ld-recipients">
              {data.items.map(c => (
                <li key={c.id}>
                  <label className={`ld-choice ${eligible(c) ? '' : 'is-disabled'}`}>
                    <input type="checkbox" disabled={!eligible(c) || (!selected.has(c.id) && selected.size >= MAX)} checked={selected.has(c.id)} onChange={() => toggle(c)} />
                    <span><bdi>{c.name}</bdi> <bdi dir="ltr" className="ld-num">{formatPhone(c.number)}</bdi><small>{c.optout ? s.t('optedOut') : s.t(`consent_${c.consent.status}`)}</small></span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : <ContactImporter s={s} pack={pack} requireConsent mode="manual" onImported={contacts => { add(contacts); setTab('saved'); }} />}
    </div>
  );
}

function SingleConsent({ s, contact, onRefresh }) {
  const [consent, setConsent] = useState({ source: '', date: new Date().toISOString().slice(0, 10), purpose: '', attested: false });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const requestId = useMemo(() => crypto.randomUUID(), []);
  if (contact.optout) return null;
  return (
    <div className="ld-single-consent">
      <ConsentForm s={s} value={consent} onChange={setConsent} />
      {error && <p className="ld-inline-error" role="alert">{error}</p>}
      <button type="button" className="ld-button" disabled={busy || !consentComplete(consent)} onClick={async () => {
        setBusy(true); setError('');
        try { await dashboard('import_contacts', { requestId, origin: 'manual', requireConsent: true, consent, rows: [{ waId: contact.number }] }); await onRefresh(); }
        catch (e) { setError(s.reason(e.reason)); } finally { setBusy(false); }
      }}>{s.t('save')}</button>
    </div>
  );
}
