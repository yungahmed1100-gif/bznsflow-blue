import React, { useEffect, useState } from 'react';
import { hasib } from '../../lib/dashboard/api';
import { useDebounced } from '../../hooks/usePolling';
import { parseAmount, formatMinor } from '../../../convex/hasib/money.js';
import { dayNoon, validDate } from '../../../convex/hasib/period.js';
import { orderTotals } from '../../../convex/hasib/totals.js';
import { Dialog } from '../dashboard/Dialog';
import { Money } from './Badges';

const newId = () => crypto.randomUUID();
const priceText = minor => formatMinor(minor);
const fromPrefill = p => p.lines.map(l => ({ key: newId(), variantId: l.variantId, label: l, qty: String(l.qty), price: priceText(l.unitPriceMinor), onHand: l.onHand }));

/** Lines as the server will read them, or null while any field is invalid. */
function toLines(rows) {
  const out = [];
  for (const r of rows) {
    const qty = Number(r.qty), unitPriceMinor = parseAmount(r.price);
    if (!Number.isSafeInteger(qty) || qty < 1 || unitPriceMinor === null || (!r.variantId && !r.name.trim())) return null;
    out.push(r.variantId ? { variantId: r.variantId, qty, unitPriceMinor } : { name: r.name.trim(), qty, unitPriceMinor });
  }
  return out.length ? out : null;
}

/** The same arithmetic the server runs; the server's figure is the one that is saved. */
function previewTotals(lines, feeMinor, settings) {
  if (!lines || feeMinor === null) return null;
  try { return orderTotals({ lines, deliveryFeeMinor: feeMinor, vat: { registered: settings.vatRegistered, rateBps: settings.vatRateBps, pricesIncludeVat: settings.pricesIncludeVat } }); } catch { return null; }
}

function ItemPicker({ s, h, onPick }) {
  const [text, setText] = useState(''), [results, setResults] = useState([]);
  const query = useDebounced(text.trim(), 250);
  useEffect(() => {
    let live = true;
    if (!query) { setResults([]); return undefined; }
    hasib('items', { search: query, limit: 8 }).then(r => { if (live) setResults(r.items); }).catch(() => { if (live) setResults([]); });
    return () => { live = false; };
  }, [query]);
  return (
    <div className="hb-picker">
      <label className="ld-search"><span className="ld-visually-hidden">{h.t('searchItems')}</span>
        <input type="search" value={text} placeholder={h.t('searchItems')} onChange={e => setText(e.target.value)} /></label>
      {query && text.trim() && (
        <ul className="hb-picker-list" role="list">
          {!results.length && <li className="ld-help">{h.t('noItemsFound')}</li>}
          {results.flatMap(item => item.variants.map(v => (
            <li key={v.id}><button type="button" onClick={() => { onPick(item, v); setText(''); setResults([]); }}>
              <span><bdi>{h.name(item)}</bdi>{v.options.length ? ` — ${v.options.map(o => o.value).join(' / ')}` : ''}</span>
              <span className="ld-help"><Money h={h} minor={v.priceMinor} />{item.trackStock ? ` · ${h.t('onHand', { count: v.onHand })}` : ''}</span>
            </button></li>
          )))}
        </ul>
      )}
    </div>
  );
}

/**
 * New order. `prefill` comes from `chat_prefill`; the owner always reviews it.
 * The request id is fixed for the life of the dialog so a double submit makes one order.
 */
export function OrderComposer({ s, h, overview, prefill, timezone, onClose, onSaved }) {
  const [rows, setRows] = useState(() => prefill ? fromPrefill(prefill) : []);
  const [type, setType] = useState(prefill?.fulfilment.type || 'pickup'), [area, setArea] = useState(prefill?.fulfilment.area || '');
  const [fee, setFee] = useState(''), [customerName, setCustomerName] = useState(prefill?.customerName || ''), [notes, setNotes] = useState(''), [confirm, setConfirm] = useState(true);
  const [fields, setFields] = useState({}), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [readyBy, setReadyBy] = useState(''), [deposit, setDeposit] = useState(''), [depositMethod, setDepositMethod] = useState('cash');
  const [requestId] = useState(newId), [depositRequestId] = useState(newId);
  const depositMinor = deposit.trim() ? parseAmount(deposit) : 0;
  const settings = overview.settings;
  const linked = !!(prefill?.conversationId || prefill?.contactId);
  const lines = toLines(rows), feeMinor = fee.trim() ? parseAmount(fee) : 0;
  const totals = previewTotals(lines, feeMinor, settings);
  const set = (key, patch) => setRows(rs => rs.map(r => r.key === key ? { ...r, ...patch } : r));
  const add = (item, v) => setRows(rs => [...rs, { key: newId(), variantId: v.id, label: { nameAr: item.nameAr, nameEn: item.nameEn, options: v.options }, qty: '1', price: priceText(v.priceMinor), onHand: item.trackStock ? v.onHand : null }]);

  const save = async e => {
    e.preventDefault();
    if (!totals || depositMinor === null) return;
    setBusy(true); setError('');
    try {
      const dueAt = validDate(readyBy) ? dayNoon(readyBy, timezone || 'Asia/Muscat') : undefined;
      const who = prefill?.conversationId ? { conversationId: prefill.conversationId } : prefill?.contactId ? { contactId: prefill.contactId } : {};
      const order = await hasib('order_create', { requestId, channel: prefill?.channel || 'walk_in', confirm, lines, deliveryFeeMinor: feeMinor || undefined,
        fulfilment: { type, ...(type === 'delivery' && area.trim() ? { area: area.trim() } : {}), ...(dueAt ? { dueAt } : {}) }, ...who,
        ...(!linked && customerName.trim() ? { customerName: customerName.trim() } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}),
        customFields: Object.entries(fields).filter(([, v]) => String(v).trim()).map(([key, value]) => ({ key, value: String(value).trim() })) });
      // A deposit is a separate payment record; if it fails the order still exists and says so.
      let depositFailed = false;
      if (depositMinor > 0) {
        try { await hasib('payment_record', { requestId: depositRequestId, orderId: order.id, amountMinor: depositMinor, method: depositMethod }); } catch { depositFailed = true; }
      }
      onSaved(order, { depositFailed });
    } catch (err) { setError(h.reason(err.reason) || s.reason(err.reason)); setBusy(false); }
  };

  return (
    <Dialog s={s} title={h.t('newOrder')} onClose={onClose} wide>
      <form className="hb-composer" onSubmit={save}>
        {linked && <p className="ld-help" role="status">{prefill.conversationId ? `${h.t('fromChat')} · ` : ''}<bdi>{prefill.contact.name}</bdi></p>}
        {prefill?.unmatched && <p className="ld-help">{h.t('unmatched', { text: prefill.unmatched })}</p>}
        {!linked && <label className="ld-field">{h.t('customerName')}<input value={customerName} maxLength={80} onChange={e => setCustomerName(e.target.value)} dir="auto" /></label>}
        <ItemPicker s={s} h={h} onPick={add} />
        <table className="ld-table hb-lines">
          <thead><tr><th scope="col">{h.t('items')}</th><th scope="col">{h.t('qty')}</th><th scope="col">{h.t('unitPrice')}</th><th scope="col"><span className="ld-visually-hidden">{h.t('remove')}</span></th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key}>
                <td>{r.variantId ? <><bdi>{h.name(r.label)}</bdi>{r.label.options?.length ? ` — ${r.label.options.map(o => o.value).join(' / ')}` : ''}
                  {r.onHand !== null && r.onHand !== undefined && Number(r.qty) > r.onHand && <span className="ld-chip is-coral">{h.t('onHand', { count: r.onHand })}</span>}</>
                  : <input aria-label={h.t('lineName')} value={r.name} maxLength={120} dir="auto" onChange={e => set(r.key, { name: e.target.value })} />}</td>
                <td><input aria-label={h.t('qty')} className="hb-qty" inputMode="numeric" value={r.qty} onChange={e => set(r.key, { qty: e.target.value.replace(/\D/g, '').slice(0, 5) })} /></td>
                <td><input aria-label={h.t('unitPrice')} className="hb-money" inputMode="decimal" dir="ltr" value={r.price} aria-invalid={parseAmount(r.price) === null} onChange={e => set(r.key, { price: e.target.value })} /></td>
                <td><button type="button" className="ld-icon-button" aria-label={h.t('remove')} onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))}><span aria-hidden="true">×</span></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="ld-button ld-quiet" onClick={() => setRows(rs => [...rs, { key: newId(), name: '', qty: '1', price: '' }])}>{h.t('customLine')}</button>
        <fieldset className="ld-fieldset hb-row">
          <legend>{h.t('fulfilment')}</legend>
          <div className="ld-segmented" role="radiogroup" aria-label={h.t('fulfilment')}>
            {['pickup', 'delivery', 'in_store'].map(v => <label key={v}><input type="radio" name="hb-ful" checked={type === v} onChange={() => setType(v)} /><span>{h.t(`ful_${v}`)}</span></label>)}
          </div>
          {type === 'delivery' && <>
            <label className="ld-field">{h.t('area')}<input value={area} maxLength={80} dir="auto" onChange={e => setArea(e.target.value)} /></label>
            <label className="ld-field">{h.t('deliveryFee')}<input className="hb-money" inputMode="decimal" dir="ltr" value={fee} aria-invalid={feeMinor === null} onChange={e => setFee(e.target.value)} /></label>
          </>}
        </fieldset>
        {overview.pack.orderFields.map(f => (
          <label key={f.key} className={f.type === 'boolean' ? 'ld-check' : 'ld-field'}>
            {f.type === 'boolean' ? <><input type="checkbox" checked={fields[f.key] === 'yes'} onChange={e => setFields({ ...fields, [f.key]: e.target.checked ? 'yes' : '' })} /> {s.ar ? f.ar : f.en}</>
              : <>{s.ar ? f.ar : f.en}<input type={f.type === 'date' ? 'date' : f.type === 'datetime' ? 'datetime-local' : 'text'} maxLength={f.max || 120} value={fields[f.key] || ''} dir="auto" onChange={e => setFields({ ...fields, [f.key]: e.target.value })} /></>}
          </label>
        ))}
        <div className="hb-grid-2">
          <label className="ld-field">{h.t('readyBy')}<input type="date" value={readyBy} onChange={e => setReadyBy(e.target.value)} /></label>
          <label className="ld-field">{h.t('depositNow')}<input className="hb-money" inputMode="decimal" dir="ltr" value={deposit} aria-invalid={depositMinor === null} onChange={e => setDeposit(e.target.value)} /></label>
          {depositMinor > 0 && <label className="ld-field">{h.t('depositMethod')}<select value={depositMethod} onChange={e => setDepositMethod(e.target.value)}>
            {['cash', 'bank_transfer', 'card', 'payment_link'].map(m => <option key={m} value={m}>{h.t(`pm_${m}`)}</option>)}</select></label>}
        </div>
        <label className="ld-field">{h.t('notes')}<textarea value={notes} maxLength={500} rows={2} dir="auto" onChange={e => setNotes(e.target.value)} /></label>
        <label className="ld-check"><input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)} /> {h.t('confirmNow')}</label>
        {totals && <dl className="hb-totals">
          <div><dt>{h.t('subtotal')}</dt><dd><Money h={h} minor={totals.subtotalMinor} /></dd></div>
          {totals.deliveryMinor > 0 && <div><dt>{h.t('delivery')}</dt><dd><Money h={h} minor={totals.deliveryMinor} /></dd></div>}
          {settings.vatRegistered && <div><dt>{h.t('vat')}{settings.pricesIncludeVat ? ` · ${h.t('pricesIncludeVat')}` : ''}</dt><dd><Money h={h} minor={totals.vatMinor} /></dd></div>}
          <div className="hb-grand"><dt>{h.t('total')}</dt><dd><Money h={h} minor={totals.totalMinor} /></dd></div>
        </dl>}
        {error && <p className="ld-inline-error" role="alert">{error}</p>}
        <div className="ld-actions">
          <button type="button" className="ld-button ld-quiet" onClick={onClose}>{h.t('cancel')}</button>
          <button type="submit" className="ld-button ld-primary" disabled={busy || !totals || depositMinor === null}>{busy ? h.t('saving') : h.t('saveOrder')}</button>
        </div>
      </form>
    </Dialog>
  );
}
