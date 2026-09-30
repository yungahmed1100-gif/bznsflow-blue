import React, { useCallback, useEffect, useState } from 'react';
import { hasib } from '../../lib/dashboard/api';
import { parseAmount } from '../../../convex/hasib/money.js';
import { Dialog } from '../dashboard/Dialog';
import { loadWorkflowPages } from '../../lib/hasib/pagination';
import { normSerial } from '../../../convex/hasib/serialFormat.js';

const PAGES = 10;

/** Buy a used device from a customer straight into IMEI stock, at the price paid. */
export function TradeInDialog({ s, h, onClose, onSaved }) {
  const [products, setProducts] = useState(null), [loadError, setLoadError] = useState(''), [variantId, setVariantId] = useState(''), [serial, setSerial] = useState(''), [cost, setCost] = useState('');
  const [method, setMethod] = useState('cash'), [seller, setSeller] = useState(''), [note, setNote] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [requestId] = useState(() => crypto.randomUUID());
  // IMEI products only, all pages; the owner picks the product (no default, so a new-phone SKU is never chosen by accident).
  const load = useCallback(() => {
    setLoadError(''); setProducts(null);
    loadWorkflowPages(cursor => hasib('items', { limit: 50, ...(cursor ? { cursor } : {}) }), PAGES).then(r => {
      setProducts(r.items.filter(i => i.serialized).flatMap(i => i.variants.map(v => ({ id: v.id, label: `${h.name(i)}${v.options.length ? ` — ${v.options.map(o => o.value).join(' / ')}` : ''}` }))));
    }).catch(err => setLoadError(h.reason(err.reason) || s.reason(err.reason)));
  }, [h, s]);
  useEffect(() => { load(); }, [load]);
  const costMinor = parseAmount(cost);
  const serialOk = !!normSerial(serial);
  const valid = variantId && serialOk && costMinor > 0;
  const save = async e => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true); setError('');
    try { onSaved(await hasib('trade_in', { requestId, variantId, serial: serial.trim(), costMinor, method, ...(seller.trim() ? { customerName: seller.trim() } : {}), ...(note.trim() ? { note: note.trim() } : {}) })); }
    catch (err) { setError(h.reason(err.reason) || s.reason(err.reason)); setBusy(false); }
  };
  return (
    <Dialog s={s} title={h.t('tradeInTitle')} onClose={onClose}>
      {loadError ? <div className="ld-state" role="alert"><p>{loadError}</p><button type="button" className="ld-button" onClick={load}>{h.t('retry')}</button></div>
        : products === null ? <p className="ld-state" role="status">{h.t('loading')}</p> : !products.length ? <p className="ld-help">{h.t('noUsedProducts')}</p> : (
        <form className="hb-move" onSubmit={save}>
          <label className="ld-field">{h.t('tradeInProduct')}<select required value={variantId} onChange={e => setVariantId(e.target.value)}><option value="">—</option>{products.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
          <label className="ld-field">{h.t('imei')}<input dir="ltr" value={serial} aria-invalid={!!serial.trim() && !serialOk} onChange={e => setSerial(e.target.value)} autoComplete="off" spellCheck={false} /></label>
          {!!serial.trim() && !serialOk && <p className="ld-help">{h.reason('invalid_serial')}</p>}
          <label className="ld-field">{h.t('tradeInCost')}<input className="hb-money" inputMode="decimal" dir="ltr" value={cost} aria-invalid={!!cost && costMinor === null} onChange={e => setCost(e.target.value)} /></label>
          <label className="ld-field">{h.t('method')}<select value={method} onChange={e => setMethod(e.target.value)}>{['cash', 'bank_transfer', 'card', 'other'].map(m => <option key={m} value={m}>{h.t(`pm_${m}`)}</option>)}</select></label>
          <label className="ld-field">{h.t('seller')}<input value={seller} maxLength={80} dir="auto" onChange={e => setSeller(e.target.value)} /></label>
          <label className="ld-field">{h.t('condition')}<input value={note} maxLength={200} dir="auto" onChange={e => setNote(e.target.value)} /></label>
          {error && <p className="ld-inline-error" role="alert">{error}</p>}
          <div className="ld-actions">
            <button type="button" className="ld-button ld-quiet" onClick={onClose}>{h.t('cancel')}</button>
            <button type="submit" className="ld-button ld-primary" disabled={busy || !valid}>{busy ? h.t('saving') : h.t('save')}</button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
