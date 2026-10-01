import React, { useState } from 'react';
import { hasib } from '../../lib/dashboard/api';
import { parseAmount, formatMinor } from '../../../convex/hasib/money.js';
import { Dialog } from '../dashboard/Dialog';
import { photoProblem, uploadProductPhoto, PHOTO_TYPES } from '../../lib/hasib/photo.js';

const blankVariant = keys => ({ key: crypto.randomUUID(), sku: '', options: Object.fromEntries(keys.map(k => [k, ''])), price: '', cost: '', reorderPoint: '2', openingStock: '0' });
const fromVariant = (v, keys) => ({ key: v.id, variantId: v.id, sku: v.sku, options: Object.fromEntries(keys.map(k => [k, v.options.find(o => o.key === k)?.value || ''])),
  price: formatMinor(v.priceMinor), cost: v.costKnown === false || v.costMinor === undefined ? '' : formatMinor(v.costMinor), reorderPoint: String(v.reorderPoint), onHand: v.onHand });

/** Variant rows as the server reads them, or null while any is invalid. */
function toVariants(rows) {
  const out = [];
  for (const r of rows) {
    const priceMinor = parseAmount(r.price), costMinor = r.cost.trim() ? parseAmount(r.cost) : 0, reorderPoint = Number(r.reorderPoint || 0), opening = Number(r.openingStock || 0);
    if (priceMinor === null || costMinor === null || !Number.isSafeInteger(reorderPoint) || !Number.isSafeInteger(opening)) return null;
    out.push({ ...(r.variantId ? { variantId: r.variantId } : {}), sku: r.sku.trim(), priceMinor, ...(r.cost.trim() ? { costMinor } : {}), reorderPoint,
      options: Object.entries(r.options).filter(([, v]) => v.trim()).map(([key, value]) => ({ key, value: value.trim() })),
      ...(!r.variantId && opening > 0 ? { openingStock: opening } : {}) });
  }
  return out.length ? out : null;
}

/** Create or edit a product; variant option names come from the industry pack. */
export function ItemEditor({ s, h, pack, item, onClose, onSaved, onArchive, staff = false }) {
  const keys = pack.variantOptions.map(o => o.key);
  // Internal stock (a clinic's supplies) is never shown to customers, so it has no photo and is always a product.
  const internal = !!pack.internalStock;
  const serialsModule = pack.modules?.serials === 'available';
  const [form, setForm] = useState(() => ({ kind: item?.kind || 'product', nameAr: item?.nameAr || '', nameEn: item?.nameEn || '', category: item?.category || '', unit: item?.unit || 'piece', trackStock: item ? item.trackStock : true,
    serialized: item ? !!item.serialized : serialsModule, warrantyMonths: String(item?.warrantyMonths ?? (serialsModule ? 12 : 0)), warrantyBy: item?.warrantyBy || (serialsModule ? 'store' : 'none') }));
  const [rows, setRows] = useState(() => item ? item.variants.map(v => fromVariant(v, keys)) : [blankVariant(keys)]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirmArchive, setConfirmArchive] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  // Cost, alert level and SKU stay tucked away until the owner wants them (or already uses them).
  const [more, setMore] = useState(() => !!item?.variants.some(v => v.sku || v.costMinor || v.reorderPoint !== 2));
  // photo.id is undefined until the owner changes it; '' means removed.
  const [photo, setPhoto] = useState(() => ({ url: item?.photoUrl || null, id: undefined, uploading: false }));
  const variants = toVariants(rows);
  const setRow = (key, patch) => setRows(rs => rs.map(r => r.key === key ? { ...r, ...patch } : r));
  const valid = variants && (form.nameAr.trim() || form.nameEn.trim());

  const pickPhoto = async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const problem = photoProblem(file);
    if (problem) { setError(h.reason(problem)); return; }
    setError(''); setPhoto(p => ({ ...p, uploading: true }));
    try {
      // The server checks the file's real bytes and ties it to this shop before it can be saved.
      const { photoId: id, preview } = await uploadProductPhoto(hasib, file);
      setPhoto(p => { if (p.url?.startsWith('blob:')) URL.revokeObjectURL(p.url); return { url: URL.createObjectURL(preview), id, uploading: false }; });
    } catch (err) {
      setPhoto(p => ({ ...p, uploading: false }));
      setError(h.reason(err.reason) || h.reason('photo_upload_failed'));
    }
  };
  const removePhoto = () => setPhoto(p => { if (p.url?.startsWith('blob:')) URL.revokeObjectURL(p.url); return { url: null, id: '', uploading: false }; });

  // Archive errors are shown here, in the open dialog, not on the page behind it.
  const archive = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try { await onArchive(item); }
    catch (err) { setError(h.reason(err.reason) || s.reason(err.reason)); setBusy(false); setConfirmArchive(false); }
  };

  const save = async e => {
    e.preventDefault();
    if (!valid) { setError(h.reason('invalid_item')); return; }
    setBusy(true); setError('');
    try {
      const serialized = serialsModule && form.kind === 'product' && form.trackStock && form.serialized;
      const warrantyMonths = Math.min(60, Math.max(0, parseInt(form.warrantyMonths, 10) || 0));
      const itemBody = { kind: form.kind, nameAr: form.nameAr.trim(), nameEn: form.nameEn.trim(), category: form.category.trim(), unit: form.unit, trackStock: form.trackStock,
        ...(serialized ? { serialized: true } : {}), ...(warrantyMonths && form.warrantyBy !== 'none' ? { warrantyMonths, warrantyBy: form.warrantyBy } : {}),
        ...(photo.id !== undefined ? { photoId: photo.id } : {}) };
      const saved = await hasib('item_save', { ...(item ? { itemId: item.id } : { requestId }), item: itemBody, variants: serialized ? variants.map(({ openingStock, ...v }) => v) : variants });
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
          {/* A clinic's stock is supplies only; its treatments are edited in Services → Treatments. */}
          {!internal && <label className="ld-field">{h.t('kind')}<select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value, trackStock: e.target.value === 'product' && form.trackStock })}>
            {['product', 'service'].map(k => <option key={k} value={k}>{h.t(`kind_${k}`)}</option>)}</select></label>}
        </div>
        {form.kind === 'product' && !internal && (
          <div className="hb-photo-field">
            <div className="hb-photo-frame">{photo.url ? <img src={photo.url} alt={h.t('photo')} width="96" height="96" /> : <span className="ld-help">{h.t('noPhoto')}</span>}</div>
            <div className="hb-photo-actions">
              <label className={`ld-button ld-quiet${photo.uploading ? ' is-disabled' : ''}`}>
                {photo.uploading ? h.t('uploadingPhoto') : photo.url ? h.t('changePhoto') : h.t('addPhoto')}
                <input type="file" accept={PHOTO_TYPES.join(',')} className="ld-visually-hidden" disabled={photo.uploading} onChange={pickPhoto} />
              </label>
              {photo.url && !photo.uploading && <button type="button" className="ld-button ld-quiet ld-danger" onClick={removePhoto}>{h.t('removePhoto')}</button>}
              <p className="ld-help">{h.t('photoHelp')}</p>
            </div>
          </div>
        )}
        {form.kind === 'product' && <label className="ld-check"><input type="checkbox" checked={form.trackStock} onChange={e => setForm({ ...form, trackStock: e.target.checked })} /> {h.t('trackStock')}</label>}
        {serialsModule && form.kind === 'product' && form.trackStock && (
          <div className="hb-grid-2">
            <label className="ld-check"><input type="checkbox" checked={form.serialized} disabled={!!item} onChange={e => setForm({ ...form, serialized: e.target.checked })} /> {h.t('serialized')}</label>
            {form.serialized && <p className="ld-help">{h.t('imeiReceiveHint')}</p>}
            <label className="ld-field">{h.t('warrantyBy')}<select value={form.warrantyBy} disabled={staff} onChange={e => setForm({ ...form, warrantyBy: e.target.value })}>
              {['store', 'agent', 'none'].map(w => <option key={w} value={w}>{h.t(`wb_${w}`)}</option>)}</select></label>
            {form.warrantyBy !== 'none' && <label className="ld-field">{h.t('warrantyMonths')}<input className="hb-qty" inputMode="numeric" value={form.warrantyMonths} readOnly={staff} onChange={e => setForm({ ...form, warrantyMonths: e.target.value.replace(/\D/g, '').slice(0, 2) })} /></label>}
          </div>
        )}
        <fieldset className="ld-fieldset">
          <legend>{h.t('variants')}</legend>
          <div className="ld-table-wrap"><table className="ld-table hb-variants">
            <thead><tr>
              {pack.variantOptions.map(o => <th key={o.key} scope="col">{s.ar ? o.ar : o.en}</th>)}
              <th scope="col">{h.t('price')}</th>
              {form.trackStock && <th scope="col">{item ? h.t('stock') : h.t('openingStock')}</th>}
              {more && <>{!staff && <th scope="col">{h.t('cost')}</th>}{form.trackStock && <th scope="col">{h.t('reorderPoint')}</th>}<th scope="col">{h.t('sku')}</th></>}
              <th scope="col"><span className="ld-visually-hidden">{h.t('remove')}</span></th>
            </tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.key}>
                {keys.map(k => <td key={k}><input aria-label={pack.variantOptions.find(o => o.key === k)[s.ar ? 'ar' : 'en']} value={r.options[k]} maxLength={40} dir="auto" onChange={e => setRow(r.key, { options: { ...r.options, [k]: e.target.value } })} /></td>)}
                <td><input aria-label={h.t('price')} className="hb-money" inputMode="decimal" dir="ltr" value={r.price} readOnly={staff && !!r.variantId} aria-invalid={parseAmount(r.price) === null} onChange={e => setRow(r.key, { price: e.target.value })} /></td>
                {form.trackStock && <td>{r.variantId ? <span className="ld-num">{r.onHand}</span> : form.serialized && serialsModule ? <span className="ld-help">—</span> : <input aria-label={h.t('openingStock')} className="hb-qty" inputMode="numeric" value={r.openingStock} onChange={e => setRow(r.key, { openingStock: e.target.value.replace(/\D/g, '').slice(0, 6) })} />}</td>}
                {more && <>
                  {!staff && <td><input aria-label={h.t('cost')} className="hb-money" inputMode="decimal" dir="ltr" value={r.cost} onChange={e => setRow(r.key, { cost: e.target.value })} /></td>}
                  {form.trackStock && <td><input aria-label={h.t('reorderPoint')} className="hb-qty" inputMode="numeric" value={r.reorderPoint} onChange={e => setRow(r.key, { reorderPoint: e.target.value.replace(/\D/g, '').slice(0, 6) })} /></td>}
                  <td><input aria-label={h.t('sku')} value={r.sku} maxLength={40} dir="ltr" onChange={e => setRow(r.key, { sku: e.target.value })} /></td>
                </>}
                <td>{!r.variantId && rows.length > 1 && <button type="button" className="ld-icon-button" aria-label={h.t('remove')} onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))}><span aria-hidden="true">×</span></button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
          <div className="ld-actions hb-variant-actions">
            {!staff && <button type="button" className="ld-button ld-quiet" onClick={() => setRows(rs => [...rs, blankVariant(keys)])}>{h.t('addVariant')}</button>}
            <button type="button" className="ld-button ld-quiet" aria-expanded={more} onClick={() => setMore(m => !m)}>{more ? h.t('fewerDetails') : h.t('moreDetails')}</button>
          </div>
          {!more && <p className="ld-help">{h.t('moreDetailsHelp')}</p>}
        </fieldset>
        {error && <p className="ld-inline-error" role="alert">{error}</p>}
        {confirmArchive && <p className="ld-help" role="alert">{h.t('archiveConfirm', { name: h.name(item) })}</p>}
        <div className="ld-actions">
          {item && onArchive && (confirmArchive
            ? <button type="button" className="ld-button ld-danger" disabled={busy} onClick={archive}>{h.t('archive')}</button>
            : <button type="button" className="ld-button ld-quiet ld-danger" onClick={() => setConfirmArchive(true)}>{h.t('archive')}</button>)}
          <button type="button" className="ld-button ld-quiet" onClick={confirmArchive ? () => setConfirmArchive(false) : onClose}>{h.t('cancel')}</button>
          <button type="submit" className="ld-button ld-primary" disabled={busy || photo.uploading}>{busy ? h.t('saving') : h.t('save')}</button>
        </div>
      </form>
    </Dialog>
  );
}
