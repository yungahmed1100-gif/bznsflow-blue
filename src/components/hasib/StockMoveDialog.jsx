import React, { useEffect, useState } from 'react';
import { hasib } from '../../lib/dashboard/api';
import { parseAmount } from '../../../convex/hasib/money.js';
import { Dialog } from '../dashboard/Dialog';

const REASONS = { stock_in: 1, return: 1, damage: -1, adjustment: 0 };
// Products tracked by IMEI change stock only through named units.
const SERIAL_REASONS = { stock_in: 1, damage: -1 };
const parseSerials = text => [...new Set(text.split(/[\n,;]+/).map(x => x.trim()).filter(Boolean))];

/** Receive, return, write off or correct stock for one variant. One request id per dialog. */
export function StockMoveDialog({ s, h, item, variant, onClose, onSaved }) {
  const serialized = !!item.serialized;
  const reasons = serialized ? SERIAL_REASONS : REASONS;
  const [reason, setReason] = useState('stock_in'), [qty, setQty] = useState(''), [cost, setCost] = useState(''), [note, setNote] = useState('');
  const [serialText, setSerialText] = useState(''), [inStock, setInStock] = useState([]), [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [requestId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    if (!serialized || reason !== 'damage') return undefined;
    let live = true;
    hasib('serials', { variantId: variant.id }).then(r => { if (live) setInStock(r.items); }).catch(() => {});
    return () => { live = false; };
  }, [serialized, reason, variant.id]);
  const serials = serialized ? (reason === 'stock_in' ? parseSerials(serialText) : picked) : [];
  const sign = reasons[reason];
  const parsed = Number(qty.replace(/[^\d-]/g, ''));
  const delta = serialized ? sign * serials.length : sign ? sign * Math.abs(parsed) : parsed;
  const unitCostMinor = reason === 'stock_in' && cost.trim() ? parseAmount(cost) : undefined;
  const valid = Number.isSafeInteger(delta) && delta !== 0 && unitCostMinor !== null;
  const label = `${h.name(item)}${variant.options.length ? ` — ${variant.options.map(o => o.value).join(' / ')}` : ''}`;

  const save = async e => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true); setError('');
    try {
      onSaved(await hasib('stock_move', { requestId, variantId: variant.id, delta, reason, ...(serialized ? { serials } : {}),
        ...(unitCostMinor !== undefined ? { unitCostMinor } : {}), ...(note.trim() ? { note: note.trim() } : {}) }));
    } catch (err) { setError(h.reason(err.reason) || s.reason(err.reason)); setBusy(false); }
  };
  return (
    <Dialog s={s} title={h.t('adjustStock')} onClose={onClose}>
      <form className="hb-move" onSubmit={save}>
        <p><bdi>{label}</bdi> · {h.t('onHand', { count: variant.onHand })}</p>
        <label className="ld-field">{h.t('reasonLabel')}<select value={reason} onChange={e => { setReason(e.target.value); setPicked([]); }}>{Object.keys(reasons).map(r => <option key={r} value={r}>{h.t(`move_${r}`)}</option>)}</select></label>
        {!serialized && <label className="ld-field">{h.t('quantity')}<input inputMode={sign ? 'numeric' : 'text'} dir="ltr" value={qty} onChange={e => setQty(e.target.value.slice(0, 7))} /></label>}
        {serialized && reason === 'stock_in' && (
          <label className="ld-field">{h.t('imeis')}<small>{h.t('imeiHelp')}</small>
            <textarea className="hb-serials" rows={5} dir="ltr" value={serialText} onChange={e => setSerialText(e.target.value)} spellCheck={false} autoComplete="off" />
            <small aria-live="polite">{h.t('imeiCount', { count: serials.length })}</small></label>
        )}
        {serialized && reason === 'damage' && (
          <fieldset className="ld-fieldset"><legend>{h.t('imeis')}</legend>
            {!inStock.length ? <p className="ld-help">{h.t('noImeis')}</p> : inStock.map(u => (
              <label key={u.serial} className="ld-check"><input type="checkbox" checked={picked.includes(u.serial)} onChange={e => setPicked(p => e.target.checked ? [...p, u.serial] : p.filter(x => x !== u.serial))} /> <bdi dir="ltr" className="ld-num">{u.serial}</bdi></label>
            ))}
          </fieldset>
        )}
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
