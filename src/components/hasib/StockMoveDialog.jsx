import React, { useState } from 'react';
import { hasib } from '../../lib/dashboard/api';
import { parseAmount } from '../../../convex/hasib/money.js';
import { Dialog } from '../dashboard/Dialog';

const REASONS = { stock_in: 1, return: 1, damage: -1, adjustment: 0 };

/** Receive, return, write off or correct stock for one variant. One request id per dialog. */
export function StockMoveDialog({ s, h, item, variant, onClose, onSaved }) {
  const [reason, setReason] = useState('stock_in'), [qty, setQty] = useState(''), [cost, setCost] = useState(''), [note, setNote] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [requestId] = useState(() => crypto.randomUUID());
  const sign = REASONS[reason];
  const parsed = Number(qty.replace(/[^\d-]/g, ''));
  const delta = sign ? sign * Math.abs(parsed) : parsed;
  const unitCostMinor = reason === 'stock_in' && cost.trim() ? parseAmount(cost) : undefined;
  const valid = Number.isSafeInteger(delta) && delta !== 0 && unitCostMinor !== null;
  const label = `${h.name(item)}${variant.options.length ? ` — ${variant.options.map(o => o.value).join(' / ')}` : ''}`;

  const save = async e => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true); setError('');
    try { onSaved(await hasib('stock_move', { requestId, variantId: variant.id, delta, reason, ...(unitCostMinor !== undefined ? { unitCostMinor } : {}), ...(note.trim() ? { note: note.trim() } : {}) })); }
    catch (err) { setError(h.reason(err.reason) || s.reason(err.reason)); setBusy(false); }
  };
  return (
    <Dialog s={s} title={h.t('adjustStock')} onClose={onClose}>
      <form className="hb-move" onSubmit={save}>
        <p><bdi>{label}</bdi> · {h.t('onHand', { count: variant.onHand })}</p>
        <label className="ld-field">{h.t('reasonLabel')}<select value={reason} onChange={e => setReason(e.target.value)}>{Object.keys(REASONS).map(r => <option key={r} value={r}>{h.t(`move_${r}`)}</option>)}</select></label>
        <label className="ld-field">{h.t('quantity')}<input inputMode={sign ? 'numeric' : 'text'} dir="ltr" value={qty} onChange={e => setQty(e.target.value.slice(0, 7))} /></label>
        {reason === 'stock_in' && <label className="ld-field">{h.t('unitCost')}<input className="hb-money" inputMode="decimal" dir="ltr" value={cost} aria-invalid={unitCostMinor === null} onChange={e => setCost(e.target.value)} /></label>}
        <label className="ld-field">{h.t('notes')}<input value={note} maxLength={200} dir="auto" onChange={e => setNote(e.target.value)} /></label>
        {error && <p className="ld-inline-error" role="alert">{error}</p>}
        <div className="ld-actions">
          <button type="button" className="ld-button ld-quiet" onClick={onClose}>{h.t('cancel')}</button>
          <button type="submit" className="ld-button ld-primary" disabled={busy || !valid}>{busy ? h.t('saving') : h.t('save')}</button>
        </div>
      </form>
    </Dialog>
  );
}
