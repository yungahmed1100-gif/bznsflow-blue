import React, { useMemo, useState } from 'react';
import { dashboard } from '../../lib/dashboard/api';
import { countryOptions } from '../../lib/countries';
import { normalizePhone, mayBeUsNumber, formatPhone } from '../../lib/dashboard/phone';
import { buildImportPreview, guessMapping, readContactsFile, sampleCsv, IMPORT_PAGE } from '../../lib/dashboard/import';
import { download } from '../../lib/dashboard/exports';
import { ConsentForm, consentComplete } from './ConsentForm';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Manual entry and CSV/XLSX import. With `requireConsent`, one attestation is
 * mandatory and copied to every contact; nothing is ever sent from here.
 */
export function ContactImporter({ s, pack, requireConsent, mode: initialMode = 'file', onImported, onClose }) {
  const [mode, setMode] = useState(initialMode);
  const countries = useMemo(() => countryOptions(s.lang), [s.lang]);
  const [defaultCountry, setDefaultCountry] = useState('OM');
  const [rows, setRows] = useState(null), [mapping, setMapping] = useState(null), [fileError, setFileError] = useState('');
  const [manual, setManual] = useState([]), [entry, setEntry] = useState({ country: 'OM', number: '', name: '' }), [entryError, setEntryError] = useState('');
  const [recordConsent, setRecordConsent] = useState(requireConsent);
  const [consent, setConsent] = useState({ source: '', date: today(), purpose: '', attested: false });
  const [busy, setBusy] = useState(false), [result, setResult] = useState(null), [error, setError] = useState('');
  // One attestation per import; pages share it, and the next import starts a new one.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  const preview = useMemo(() => rows && mapping ? buildImportPreview(rows, mapping, defaultCountry, pack.fields) : null, [rows, mapping, defaultCountry, pack.fields]);
  const ready = mode === 'file' ? preview?.valid || [] : manual;
  const consentOk = !recordConsent || consentComplete(consent);

  const onFile = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(''); setResult(null);
    try {
      const parsed = await readContactsFile(file);
      setRows(parsed); setMapping(guessMapping(parsed[0], pack.fields));
    } catch (err) { setFileError(s.reason(err.message)); setRows(null); }
  };
  const addManual = e => {
    e.preventDefault();
    const normalized = normalizePhone(entry.number, entry.country);
    if (normalized.error) { setEntryError(s.t(normalized.error)); return; }
    setEntryError('');
    setManual(list => list.some(r => r.waId === normalized.waId) ? list : [...list, { ...normalized, name: entry.name.trim(), fields: [] }]);
    setEntry(x => ({ ...x, number: '', name: '' }));
  };
  const submit = async () => {
    setBusy(true); setError(''); setResult(null);
    const total = { created: 0, updated: 0, contacts: [] };
    try {
      for (let i = 0; i < ready.length; i += IMPORT_PAGE) {
        const page = ready.slice(i, i + IMPORT_PAGE).map(({ waId, countryIso, name, fields }) => ({ waId, countryIso, ...(name ? { name } : {}), ...(fields?.length ? { fields } : {}) }));
        const r = await dashboard('import_contacts', { requestId, origin: mode === 'file' ? 'import' : 'manual', requireConsent, rows: page, ...(recordConsent ? { consent } : {}) }, { timeout: 60000 });
        total.created += r.created; total.updated += r.updated; total.contacts.push(...r.contacts);
      }
      setResult(total);
      setRequestId(crypto.randomUUID());
      setManual([]);
      onImported?.(total.contacts);
    } catch (err) { setError(s.reason(err.reason)); }
    finally { setBusy(false); }
  };

  return (
    <div className="ld-importer">
      <div className="ld-segmented" role="tablist">
        {[['file', s.t('importFile')], ['manual', s.t('manualEntry')]].map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={mode === id} onClick={() => setMode(id)}>{label}</button>)}
      </div>
      {mode === 'file' ? (
        <section>
          <p className="ld-help">{s.t('importHelp')} <button type="button" className="ld-link" onClick={() => download('contacts-sample.csv', sampleCsv(pack.fields), 'text/csv;charset=utf-8')}>{s.t('downloadSample')}</button></p>
          <label className="ld-field">{s.t('chooseFile')}<input type="file" accept=".csv,.xlsx,.txt" onChange={onFile} /></label>
          {fileError && <p className="ld-inline-error" role="alert">{fileError}</p>}
          {rows && mapping && (
            <fieldset className="ld-fieldset">
              <legend>{s.t('mapColumns')}</legend>
              <div className="ld-grid-3">
                {['phone', 'name', 'country'].map(key => (
                  <label key={key} className="ld-field">{s.t(`column_${key}`)}
                    <select value={mapping[key]} onChange={e => setMapping({ ...mapping, [key]: Number(e.target.value) })}>
                      <option value={-1}>{s.t('noColumn')}</option>
                      {rows[0].map((h, i) => <option key={i} value={i}>{h || `#${i + 1}`}</option>)}
                    </select>
                  </label>
                ))}
                <label className="ld-field">{s.t('defaultCountry')}
                  <select value={defaultCountry} onChange={e => setDefaultCountry(e.target.value)}>{countries.map(c => <option key={c.iso} value={c.iso}>{c.name} +{c.dial}</option>)}</select>
                </label>
                {pack.fields.map(f => (
                  <label key={f.key} className="ld-field">{s.ar ? f.ar : f.en}
                    <select value={mapping.fields[f.key] ?? -1} onChange={e => setMapping({ ...mapping, fields: { ...mapping.fields, [f.key]: Number(e.target.value) } })}>
                      <option value={-1}>{s.t('noColumn')}</option>
                      {rows[0].map((h, i) => <option key={i} value={i}>{h || `#${i + 1}`}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              {preview && <p role="status" className="ld-num">{s.t('importPreview', { valid: preview.valid.length, duplicates: preview.duplicates, invalid: preview.invalid.length })}</p>}
              {preview?.truncated && <p className="ld-help">{s.t('truncated')}</p>}
              {!!preview?.invalid.length && <ul className="ld-issues">{preview.invalid.slice(0, 20).map(i => <li key={i.line}>{s.t('importRowIssue', { line: i.line, reason: s.t(i.reason) })} <bdi dir="ltr">{i.value}</bdi></li>)}</ul>}
            </fieldset>
          )}
        </section>
      ) : (
        <section>
          <form className="ld-manual" onSubmit={addManual}>
            <label className="ld-field">{s.t('country')}<select value={entry.country} onChange={e => setEntry({ ...entry, country: e.target.value })}>{countries.map(c => <option key={c.iso} value={c.iso}>{c.name} +{c.dial}</option>)}</select></label>
            <label className="ld-field">{s.t('nationalNumber')}<input inputMode="tel" dir="ltr" autoComplete="off" value={entry.number} onChange={e => setEntry({ ...entry, number: e.target.value })} required /></label>
            <label className="ld-field">{s.t('contactName')}<input value={entry.name} maxLength={80} dir="auto" onChange={e => setEntry({ ...entry, name: e.target.value })} /></label>
            <button type="submit" className="ld-button">{s.t('addNumber')}</button>
          </form>
          {entryError && <p className="ld-inline-error" role="alert">{entryError}</p>}
          <ul className="ld-chips-list">{manual.map(r => <li key={r.waId} className="ld-chip"><bdi dir="ltr">{formatPhone(r.waId)}</bdi>{r.name ? ` · ${r.name}` : ''}<button type="button" aria-label={s.t('delete')} onClick={() => setManual(list => list.filter(x => x.waId !== r.waId))}>×</button></li>)}</ul>
        </section>
      )}
      {ready.some(r => mayBeUsNumber(r.waId)) && <p className="ld-help">{s.t('usWarning')}</p>}
      {!requireConsent && <label className="ld-check"><input type="checkbox" checked={recordConsent} onChange={e => setRecordConsent(e.target.checked)} /> {s.t('consentOptional')}</label>}
      {recordConsent && <ConsentForm s={s} value={consent} onChange={setConsent} />}
      {error && <p className="ld-inline-error" role="alert">{error}</p>}
      {result && <p role="status" className="ld-help">{s.t('imported', { created: result.created, updated: result.updated })}</p>}
      <div className="ld-actions">
        <button type="button" className="ld-button ld-primary" disabled={busy || !ready.length || !consentOk} onClick={submit}>{busy ? s.t('loading') : s.t('importNow', { count: ready.length })}</button>
        {onClose && <button type="button" className="ld-button ld-quiet" onClick={onClose}>{s.t('close')}</button>}
      </div>
    </div>
  );
}
