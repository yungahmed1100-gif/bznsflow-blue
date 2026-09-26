import React, { useEffect, useState } from 'react';
import { hasib } from '../../lib/dashboard/api';
import { parseAmount } from '../../../convex/hasib/money.js';
import { Dialog } from '../dashboard/Dialog';

/** Buy a used device from a customer straight into IMEI stock, at the price paid. */
export function TradeInDialog({ s, h, onClose, onSaved }) {
  const [products, setProducts] = useState(null), [variantId, setVariantId] = useState(''), [serial, setSerial] = useState(''), [cost, setCost] = useState('');
  const [method, setMethod] = useState('cash'), [seller, setSeller] = useState(''), [note, setNote] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [requestId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    hasib('items', { limit: 50 }).then(r => {
      const options = r.items.filter(i => i.serialized).flatMap(i => i.variants.map(v => ({ id: v.id, label: `${h.name(i)}${v.options.length ? ` — ${v.options.map(o => o.value).join(' / ')}` : ''}` })));
      setProducts(options); setVariantId(options[0]?.id || '');
    }).catch(() => setProducts([]));
  }, [h]);
  const costMinor = parseAmount(cost);
  const valid = variantId && serial.trim() && costMinor > 0;
  const save = async e => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true); setError('');
    try { onSaved(await hasib('trade_in', { requestId, variantId, serial: serial.trim(), costMinor, method, ...(seller.trim() ? { customerName: seller.trim() } : {}), ...(note.trim() ? { note: note.trim() } : {}) })); }
    catch (err) { setError(h.reason(err.reason) || s.reason(err.reason)); setBusy(false); }
  };
  return (
    <Dialog s={s} title={h.t('tradeInTitle')} onClose={onClose}>
      {products === null ? <p className="ld-state" role="status">{h.t('loading')}</p> : !products.length ? <p className="ld-help">{h.t('noUsedProducts')}</p> : (
        <form className="hb-move" onSubmit={save}>
          <label className="ld-field">{h.t('tradeInProduct')}<select value={variantId} onChange={e => setVariantId(e.target.value)}>{products.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
          <label className="ld-field">{h.t('imei')}<input dir="ltr" value={serial} onChange={e => setSerial(e.target.value)} autoComplete="off" spellCheck={false} /></label>
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
