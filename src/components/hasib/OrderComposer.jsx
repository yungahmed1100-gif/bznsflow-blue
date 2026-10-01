import React, { useEffect, useState } from 'react';
import { hasib } from '../../lib/dashboard/api';
import { useDebounced, usePolling } from '../../hooks/usePolling';
import { normSerial } from '../../../convex/hasib/serialFormat.js';
import { parseAmount, formatMinor } from '../../../convex/hasib/money.js';
import { zonedLocalToUtc } from '../../lib/timezone';
import { orderTotals } from '../../../convex/hasib/totals.js';
import { Dialog } from '../dashboard/Dialog';
import { Money } from './Badges';

const newId = () => crypto.randomUUID();
const priceText = minor => formatMinor(minor);
const fromPrefill = p => p.lines.map(l => ({ key: newId(), variantId: l.variantId, label: l, qty: String(l.serialized ? 0 : l.qty), price: priceText(l.unitPriceMinor), onHand: l.onHand, serialized: !!l.serialized, serials: [] }));

/** Lines as the server will read them, or null while any field is invalid. */
function toLines(rows) {
  const out = [];
  for (const r of rows) {
    // An IMEI-tracked line sells exactly the units picked.
    const qty = r.serialized ? r.serials.length : Number(r.qty), unitPriceMinor = parseAmount(r.price);
    if (!Number.isSafeInteger(qty) || qty < 1 || unitPriceMinor === null || (!r.variantId && !r.name.trim())) return null;
    out.push(r.variantId ? { variantId: r.variantId, qty, unitPriceMinor, ...(r.modifierKeys?.length ? { modifierKeys: r.modifierKeys } : {}), ...(r.serialized ? { serials: r.serials } : {}) } : { name: r.name.trim(), qty, unitPriceMinor });
  }
  return out.length ? out : null;
}

/** The same arithmetic the server runs; the server's figure is the one that is saved. */
function previewTotals(lines, feeMinor, settings) {
  if (!lines || feeMinor === null) return null;
  try { return orderTotals({ lines, deliveryFeeMinor: feeMinor, vat: { registered: settings.vatRegistered, rateBps: settings.vatRateBps, pricesIncludeVat: settings.pricesIncludeVat } }); } catch { return null; }
}

/** Pick the exact units (IMEIs) sold on a line: tap one in stock, or scan/type it. */
export function SerialPicker({ h, variantId, picked, onChange }) {
  const [unitAges, setUnitAges] = useState({});
  const [units, setUnits] = useState([]), [typed, setTyped] = useState(''), [miss, setMiss] = useState(false), [loadError, setLoadError] = useState(''), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setLoadError('');
    hasib('serials', { variantId }).then(r => { if (live) { setUnits(r.items.map(u => u.serial)); setUnitAges(Object.fromEntries(r.items.map(u => [u.serial, u.daysInStock]))); } })
      .catch(err => { if (live) setLoadError(h.reason(err.reason) || h.t('serialsLoadFailed')); });
    return () => { live = false; };
  }, [variantId, attempt, h]);
  const toggle = serial => onChange(picked.includes(serial) ? picked.filter(x => x !== serial) : [...picked, serial]);
  const addTyped = e => {
    e.preventDefault();
    const serial = normSerial(typed);
    if (units.includes(serial)) { if (!picked.includes(serial)) onChange([...picked, serial]); setTyped(''); setMiss(false); } else setMiss(true);
  };
  return (
    <div className="hb-serial-picker">
      {loadError ? <div className="ld-inline-error" role="alert">{loadError} <button type="button" className="ld-link" onClick={() => setAttempt(n => n + 1)}>{h.t('retry')}</button></div>
        : !units.length ? <p className="ld-help">{h.t('noImeis')}</p> : (
        <ul className="hb-serial-chips" role="list" aria-label={h.t('pickImeis')}>
          {units.map(u => <li key={u}><button type="button" aria-pressed={picked.includes(u)} onClick={() => toggle(u)}><bdi dir="ltr">{u}</bdi>{Number.isInteger(unitAges[u]) && <small> · {h.t('daysInStockShort', { count: unitAges[u] })}</small>}</button></li>)}
        </ul>
      )}
      <div className="hb-serial-scan">
        <input aria-label={h.t('lookupPlaceholder')} placeholder={h.t('lookupPlaceholder')} dir="ltr" value={typed} aria-invalid={miss} onChange={e => { setTyped(e.target.value); setMiss(false); }}
          onKeyDown={e => { if (e.key === 'Enter') addTyped(e); }} />
        <button type="button" className="ld-button ld-quiet ld-compact" onClick={addTyped}>{h.t('lookup')}</button>
      </div>
      {miss && <p className="ld-inline-error" role="alert">{h.reason('serial_unavailable')}</p>}
    </div>
  );
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
              <span>{item.photoUrl && <img className="hb-thumb" src={item.photoUrl} alt="" width="40" height="40" loading="lazy" />}<bdi>{h.name(item)}</bdi>{v.options.length ? ` — ${v.options.map(o => o.value).join(' / ')}` : ''}</span>
              <span className="ld-help"><Money h={h} minor={v.priceMinor} />{item.trackStock ? ` · ${h.t('onHand', { count: v.onHand })}` : ''}</span>
            </button></li>
          )))}
        </ul>
      )}
    </div>
  );
}

/**
 * New order. `prefill` carries the customer for an exchange; the owner always reviews it.
 * The request id is fixed for the life of the dialog so a double submit makes one order.
 */
export function OrderComposer({ s, h, overview, prefill, timezone, onClose, onSaved }) {
  // Employees sell at the manager's prices: no price edits, custom lines or channel costs.
  const staff = overview.workspaceRole === 'employee';
  // A clinic's visit: always in the clinic, no delivery, no "ready by", no free-text notes.
  const pack = overview.pack, fixedFulfilment = pack.fulfilment?.[0], clinic = !!pack.serviceItems;
  const [rows, setRows] = useState(() => prefill ? fromPrefill(prefill) : []);
  const [type, setType] = useState(fixedFulfilment || prefill?.fulfilment.type || 'pickup'), [area, setArea] = useState(prefill?.fulfilment.area || '');
  const [channelCost, setChannelCost] = useState('');
  const [fee, setFee] = useState(''), [customerName, setCustomerName] = useState(prefill?.customerName || ''), [notes, setNotes] = useState(''), [confirm, setConfirm] = useState(true);
  const [fields, setFields] = useState(() => prefill?.fields || {}), [busy, setBusy] = useState(false), [error, setError] = useState('');
  // Treatments come from Layla's catalog; make sure the latest ones can be charged.
  useEffect(() => { if (clinic) hasib('services_sync').catch(() => {}); }, [clinic]);
  const [readyBy, setReadyBy] = useState(''), [deposit, setDeposit] = useState(''), [depositMethod, setDepositMethod] = useState('cash');
  const [requestId] = useState(newId), [depositRequestId] = useState(newId);
  const depositMinor = deposit.trim() ? parseAmount(deposit) : 0;
  const recipes = usePolling(() => hasib('recipes'), [], { enabled: overview.pack.id === 'cafe', interval: 60000 });
  const settings = overview.settings;
  const linked = !!(prefill?.conversationId || prefill?.contactId);
  const lines = toLines(rows), feeMinor = fee.trim() ? parseAmount(fee) : 0;
  const pricedLines = lines?.map(line => { const recipe = recipes.data?.items?.find(r => r.menuVariantId === line.variantId); const extra = (recipe?.modifiers || []).filter(m => line.modifierKeys?.includes(m.key)).reduce((n, m) => n + m.priceMinor, 0); return { ...line, unitPriceMinor: line.unitPriceMinor + extra }; });
  const totals = previewTotals(pricedLines, feeMinor, settings);
  const set = (key, patch) => setRows(rs => rs.map(r => r.key === key ? { ...r, ...patch } : r));
  const add = (item, v) => setRows(rs => [...rs, { key: newId(), variantId: v.id, label: { nameAr: item.nameAr, nameEn: item.nameEn, options: v.options }, qty: item.serialized ? '0' : '1', price: priceText(v.priceMinor),
    onHand: item.trackStock ? v.onHand : null, serialized: !!item.serialized, serials: [] }]);

  const save = async e => {
    e.preventDefault();
    if (!totals || depositMinor === null) return;
    setBusy(true); setError('');
    try {
      const dueAt = readyBy ? zonedLocalToUtc(readyBy, timezone || 'Asia/Muscat') : undefined;
      const who = prefill?.conversationId ? { conversationId: prefill.conversationId } : prefill?.contactId ? { contactId: prefill.contactId } : {};
      const order = await hasib('order_create', { requestId, channel: prefill?.channel || 'walk_in', confirm, lines, deliveryFeeMinor: feeMinor || undefined, ...(channelCost.trim() ? { channelCostMinor: parseAmount(channelCost) } : {}),
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
                  {!r.serialized && r.onHand !== null && r.onHand !== undefined && Number(r.qty) > r.onHand && <span className="ld-chip is-coral">{h.t('onHand', { count: r.onHand })}</span>}
                  {overview.pack.id === 'cafe' && (recipes.data?.items?.find(recipe => recipe.menuVariantId === r.variantId)?.modifiers || []).map(modifier => <label className="ld-check" key={modifier.key}><input type="checkbox" checked={r.modifierKeys?.includes(modifier.key) || false} onChange={e => set(r.key, { modifierKeys: e.target.checked ? [...(r.modifierKeys || []), modifier.key] : r.modifierKeys.filter(key => key !== modifier.key) })} />{modifier.label} · {h.money(modifier.priceMinor)}</label>)}
                  {r.serialized && <SerialPicker h={h} variantId={r.variantId} picked={r.serials} onChange={serials => set(r.key, { serials })} />}</>
                  : <input aria-label={h.t('lineName')} value={r.name} maxLength={120} dir="auto" onChange={e => set(r.key, { name: e.target.value })} />}</td>
                <td>{r.serialized ? <span className="ld-num" aria-label={h.t('qty')}>{r.serials.length}</span>
                  : <input aria-label={h.t('qty')} className="hb-qty" inputMode="numeric" value={r.qty} onChange={e => set(r.key, { qty: e.target.value.replace(/\D/g, '').slice(0, 5) })} />}</td>
                <td><input aria-label={h.t('unitPrice')} className="hb-money" inputMode="decimal" dir="ltr" value={r.price} readOnly={staff} aria-invalid={parseAmount(r.price) === null} onChange={e => set(r.key, { price: e.target.value })} /></td>
                <td><button type="button" className="ld-icon-button" aria-label={h.t('remove')} onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))}><span aria-hidden="true">×</span></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!staff && <button type="button" className="ld-button ld-quiet" onClick={() => setRows(rs => [...rs, { key: newId(), name: '', qty: '1', price: '' }])}>{h.t('customLine')}</button>}
        {!fixedFulfilment && <fieldset className="ld-fieldset hb-row">
          <legend>{h.t('fulfilment')}</legend>
          <div className="ld-segmented" role="radiogroup" aria-label={h.t('fulfilment')}>
            {['pickup', 'delivery', 'in_store'].map(v => <label key={v}><input type="radio" name="hb-ful" checked={type === v} onChange={() => setType(v)} /><span>{h.t(`ful_${v}`)}</span></label>)}
          </div>
          {type === 'delivery' && <>
            <label className="ld-field">{h.t('area')}<input value={area} maxLength={80} dir="auto" onChange={e => setArea(e.target.value)} /></label>
            <label className="ld-field">{h.t('deliveryFee')}<input className="hb-money" inputMode="decimal" dir="ltr" value={fee} aria-invalid={feeMinor === null} onChange={e => setFee(e.target.value)} /></label>
          </>}
        </fieldset>}
        {['restaurant', 'cafe', 'cakes'].includes(overview.pack.id) && <label className="ld-field">{h.ar ? 'رسوم تطبيق التوصيل أو السائق (ر.ع. بدون ضريبة)' : 'Delivery app or courier cost (OMR, excludes VAT)'}<input inputMode="decimal" value={channelCost} onChange={e => setChannelCost(e.target.value)} /></label>}
        {overview.pack.orderFields.map(f => (
          <label key={f.key} className={f.type === 'boolean' ? 'ld-check' : 'ld-field'}>
            {f.type === 'boolean' ? <><input type="checkbox" checked={fields[f.key] === 'yes'} onChange={e => setFields({ ...fields, [f.key]: e.target.checked ? 'yes' : '' })} /> {s.ar ? f.ar : f.en}</>
              : <>{s.ar ? f.ar : f.en}<input type={f.type === 'date' ? 'date' : f.type === 'datetime' ? 'datetime-local' : 'text'} maxLength={f.max || 120} value={fields[f.key] || ''} dir="auto" onChange={e => setFields({ ...fields, [f.key]: e.target.value })} /></>}
          </label>
        ))}
        <div className="hb-grid-2">
          {!clinic && <label className="ld-field">{h.t('readyBy')}<input type="datetime-local" value={readyBy} onChange={e => setReadyBy(e.target.value)} /></label>}
          <label className="ld-field">{h.t('depositNow')}<input className="hb-money" inputMode="decimal" dir="ltr" value={deposit} aria-invalid={depositMinor === null} onChange={e => setDeposit(e.target.value)} /></label>
          {depositMinor > 0 && <label className="ld-field">{h.t('depositMethod')}<select value={depositMethod} onChange={e => setDepositMethod(e.target.value)}>
            {['cash', 'bank_transfer', 'card', 'payment_link'].map(m => <option key={m} value={m}>{h.t(`pm_${m}`)}</option>)}</select></label>}
        </div>
        {!pack.noOrderNotes && <label className="ld-field">{h.t('notes')}<textarea value={notes} maxLength={500} rows={2} dir="auto" onChange={e => setNotes(e.target.value)} /></label>}
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
