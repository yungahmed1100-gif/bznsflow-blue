import React, { useState } from 'react';
import { hasib } from '../../lib/dashboard/api';
import { formatDateTime } from '../../lib/dashboard/format';

/** Scan or type an IMEI: who bought it, when, and whether it is still covered. */
export function WarrantyLookup({ s, h, timezone, onOpenRepair }) {
  const [serial, setSerial] = useState(''), [result, setResult] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const date = ms => formatDateTime(ms, s.lang, timezone).split(',')[0];
  const lookup = async e => {
    e.preventDefault();
    if (!serial.trim() || busy) return;
    setBusy(true); setError(''); setResult(null);
    try { setResult(await hasib('serial_lookup', { serial: serial.trim() })); }
    catch (err) { setError(err.reason === 'serial_not_found' ? h.t('notFound') : h.reason(err.reason) || s.reason(err.reason)); } finally { setBusy(false); }
  };
  const w = result?.warranty;
  return (
    <section className="hb-panel hb-lookup" aria-labelledby="hb-lookup-title">
      <h2 id="hb-lookup-title" className="hb-panel-title">{h.t('warrantyLookup')}</h2>
      <form className="hb-serial-scan" onSubmit={lookup}>
        <input aria-label={h.t('lookupPlaceholder')} placeholder={h.t('lookupPlaceholder')} dir="ltr" value={serial} onChange={e => setSerial(e.target.value)} autoComplete="off" spellCheck={false} />
        <button type="submit" className="ld-button ld-primary ld-compact" disabled={busy}>{h.t('lookup')}</button>
      </form>
      {error && <p className="ld-inline-error" role="alert">{error}</p>}
      {result && (
        <div className="hb-lookup-result" role="status">
          {result.item && <p><strong><bdi>{h.name(result.item)}</bdi></strong>{result.options.length ? ` — ${result.options.map(o => o.value).join(' / ')}` : ''}</p>}
          <p><bdi dir="ltr" className="ld-num">{result.serial}</bdi>{result.status && <span className="ld-chip">{h.t(`st_serial_${result.status}`)}</span>}{result.source && <span className="ld-help"> · {h.t(`src_${result.source}`)}</span>}</p>
          {Number.isSafeInteger(result.daysInStock) && <p>{h.t(result.status === 'sold' ? 'daysHeldBeforeSale' : 'daysInStockLabel')}: <bdi className="ld-num">{result.daysInStock}</bdi></p>}
          {result.soldAt && <p>{h.t('soldOn', { date: date(result.soldAt) })}{result.order ? ` · ${h.t('orderNumber', { number: result.order.number })}` : ''}{result.customer ? <> · <bdi>{result.customer}</bdi></> : null}</p>}
          {result.status === 'sold' && (w.until
            ? <p className={`hb-warranty ${w.active ? 'is-active' : 'is-ended'}`}>{w.active ? h.t('warrantyActive', { date: date(w.until), days: w.daysLeft }) : h.t('warrantyExpired', { date: date(w.until) })}{w.by ? ` · ${h.t(`wb_${w.by}`)}` : ''}</p>
            : <p className="ld-help">{h.t('noWarranty')}</p>)}
          {result.repairs.length > 0 && <ul className="ld-list">{result.repairs.map(r => (
            <li key={r.id}><button type="button" className="ld-link" onClick={() => onOpenRepair(r.id)}>{h.t('repairNumber', { number: r.number })}</button> · {h.t(`rs_${r.status}`)} · <bdi>{r.device}</bdi></li>
          ))}</ul>}
        </div>
      )}
    </section>
  );
}
