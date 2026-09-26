import React, { useState } from 'react';
import { hasib } from '../../lib/dashboard/api';
import { parseAmount, formatMinor } from '../../../convex/hasib/money.js';
import { Dialog } from '../dashboard/Dialog';

const blankVariant = keys => ({ key: crypto.randomUUID(), sku: '', options: Object.fromEntries(keys.map(k => [k, ''])), price: '', cost: '', reorderPoint: '2', openingStock: '0' });
const fromVariant = (v, keys) => ({ key: v.id, variantId: v.id, sku: v.sku, options: Object.fromEntries(keys.map(k => [k, v.options.find(o => o.key === k)?.value || ''])),
  price: formatMinor(v.priceMinor), cost: formatMinor(v.costMinor), reorderPoint: String(v.reorderPoint), onHand: v.onHand });

/** Variant rows as the server reads them, or null while any is invalid. */
function toVariants(rows) {
  const out = [];
  for (const r of rows) {
    const priceMinor = parseAmount(r.price), costMinor = r.cost.trim() ? parseAmount(r.cost) : 0, reorderPoint = Number(r.reorderPoint || 0), opening = Number(r.openingStock || 0);
    if (priceMinor === null || costMinor === null || !Number.isSafeInteger(reorderPoint) || !Number.isSafeInteger(opening)) return null;
    out.push({ ...(r.variantId ? { variantId: r.variantId } : {}), sku: r.sku.trim(), priceMinor, costMinor, reorderPoint,
      options: Object.entries(r.options).filter(([, v]) => v.trim()).map(([key, value]) => ({ key, value: value.trim() })),
      ...(!r.variantId && opening > 0 ? { openingStock: opening } : {}) });
  }
  return out.length ? out : null;
}

/** Create or edit a product; variant option names come from the industry pack. */
export function ItemEditor({ s, h, pack, item, onClose, onSaved, onArchive }) {
  const keys = pack.variantOptions.map(o => o.key);
  const [form, setForm] = useState(() => ({ kind: item?.kind || 'product', nameAr: item?.nameAr || '', nameEn: item?.nameEn || '', category: item?.category || '', unit: item?.unit || 'piece', trackStock: item ? item.trackStock : true }));
  const [rows, setRows] = useState(() => item ? item.variants.map(v => fromVariant(v, keys)) : [blankVariant(keys)]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirmArchive, setConfirmArchive] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const variants = toVariants(rows);
  const setRow = (key, patch) => setRows(rs => rs.map(r => r.key === key ? { ...r, ...patch } : r));
  const valid = variants && (form.nameAr.trim() || form.nameEn.trim());

  const save = async e => {
    e.preventDefault();
    if (!valid) { setError(h.reason('invalid_item')); return; }
    setBusy(true); setError('');
    try {
      const saved = await hasib('item_save', { ...(item ? { itemId: item.id } : { requestId }), item: { ...form, nameAr: form.nameAr.trim(), nameEn: form.nameEn.trim(), category: form.category.trim() }, variants });
      onSaved(saved);
    } catch (err) { setError(h.reason(err.reason) || s.reason(err.reason)); setBusy(false); }
  };

  return (
    <Dialog s={s} title={item ? h.t('editProduct') : h.t('addProduct')} onClose={onClose} wide>
      <form className="hb-editor" onSubmit={save}>
        <div className="hb-grid-2">
          <label className="ld-field">{h.t('nameAr')}<input value={form.nameAr} maxLength={120} dir="rtl" lang="ar" onChange={e => setForm({ ...form, nameAr: e.target.value })} /></label>
          <label className="ld-field">{h.t('nameEn')}<input value={form.nameEn} maxLength={120} dir="ltr" lang="en" onChange={e => setForm({ ...form, nameEn: e.target.value })} /></label>
          <label className="ld-field">{h.t('category')}<input value={form.category} maxLength={60} dir="auto" onChange={e => setForm({ ...form, category: e.target.value })} /></label>
          <label className="ld-field">{h.t('kind')}<select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value, trackStock: e.target.value === 'product' && form.trackStock })}>
            {['product', 'service'].map(k => <option key={k} value={k}>{h.t(`kind_${k}`)}</option>)}</select></label>
        </div>
        {form.kind === 'product' && <label className="ld-check"><input type="checkbox" checked={form.trackStock} onChange={e => setForm({ ...form, trackStock: e.target.checked })} /> {h.t('trackStock')}</label>}
        <fieldset className="ld-fieldset">
          <legend>{h.t('variants')}</legend>
          <div className="ld-table-wrap"><table className="ld-table hb-variants">
            <thead><tr>
              {pack.variantOptions.map(o => <th key={o.key} scope="col">{s.ar ? o.ar : o.en}</th>)}
              <th scope="col">{h.t('price')}</th><th scope="col">{h.t('cost')}</th>
              {form.trackStock && <><th scope="col">{item ? h.t('stock') : h.t('openingStock')}</th><th scope="col">{h.t('reorderPoint')}</th></>}
              <th scope="col">{h.t('sku')}</th><th scope="col"><span className="ld-visually-hidden">{h.t('remove')}</span></th>
            </tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.key}>
                {keys.map(k => <td key={k}><input aria-label={pack.variantOptions.find(o => o.key === k)[s.ar ? 'ar' : 'en']} value={r.options[k]} maxLength={40} dir="auto" onChange={e => setRow(r.key, { options: { ...r.options, [k]: e.target.value } })} /></td>)}
                <td><input aria-label={h.t('price')} className="hb-money" inputMode="decimal" dir="ltr" value={r.price} aria-invalid={parseAmount(r.price) === null} onChange={e => setRow(r.key, { price: e.target.value })} /></td>
                <td><input aria-label={h.t('cost')} className="hb-money" inputMode="decimal" dir="ltr" value={r.cost} onChange={e => setRow(r.key, { cost: e.target.value })} /></td>
                {form.trackStock && <>
                  <td>{r.variantId ? <span className="ld-num">{r.onHand}</span> : <input aria-label={h.t('openingStock')} className="hb-qty" inputMode="numeric" value={r.openingStock} onChange={e => setRow(r.key, { openingStock: e.target.value.replace(/\D/g, '').slice(0, 6) })} />}</td>
                  <td><input aria-label={h.t('reorderPoint')} className="hb-qty" inputMode="numeric" value={r.reorderPoint} onChange={e => setRow(r.key, { reorderPoint: e.target.value.replace(/\D/g, '').slice(0, 6) })} /></td>
                </>}
                <td><input aria-label={h.t('sku')} value={r.sku} maxLength={40} dir="ltr" onChange={e => setRow(r.key, { sku: e.target.value })} /></td>
                <td>{!r.variantId && rows.length > 1 && <button type="button" className="ld-icon-button" aria-label={h.t('remove')} onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))}><span aria-hidden="true">×</span></button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
          <button type="button" className="ld-button ld-quiet" onClick={() => setRows(rs => [...rs, blankVariant(keys)])}>{h.t('addVariant')}</button>
        </fieldset>
        {error && <p className="ld-inline-error" role="alert">{error}</p>}
        {confirmArchive && <p className="ld-help" role="alert">{h.t('archiveConfirm', { name: h.name(item) })}</p>}
        <div className="ld-actions">
          {item && onArchive && (confirmArchive
            ? <button type="button" className="ld-button ld-danger" disabled={busy} onClick={() => onArchive(item)}>{h.t('archive')}</button>
            : <button type="button" className="ld-button ld-quiet ld-danger" onClick={() => setConfirmArchive(true)}>{h.t('archive')}</button>)}
          <button type="button" className="ld-button ld-quiet" onClick={confirmArchive ? () => setConfirmArchive(false) : onClose}>{h.t('cancel')}</button>
          <button type="submit" className="ld-button ld-primary" disabled={busy}>{busy ? h.t('saving') : h.t('save')}</button>
        </div>
      </form>
    </Dialog>
  );
}
