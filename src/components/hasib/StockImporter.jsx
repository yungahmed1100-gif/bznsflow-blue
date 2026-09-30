import React, { useMemo, useState } from 'react';
import { hasib } from '../../lib/dashboard/api';
import { download } from '../../lib/dashboard/exports';
import { Dialog } from '../dashboard/Dialog';
import { Money } from './Badges';
import { readStockFile, STOCK_FILE_ACCEPT } from '../../lib/hasib/stockFile.js';
import { buildStockPreview, findHeaderRow, guessStockMapping, importBatches, sampleStockCsv } from '../../lib/hasib/stockImport.js';
import { uploadProductPhoto, PHOTO_TYPES } from '../../lib/hasib/photo.js';

const MAIN_COLUMNS = ['name', 'price', 'quantity'];
const MORE_COLUMNS = ['nameAr', 'nameEn', 'category', 'cost', 'sku', 'reorderPoint'];
const PREVIEW_ROWS = 30, ISSUE_ROWS = 20;
const fileKey = n => String(n || '').replace(/\.[a-z0-9]+$/i, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** One column picker: the file's headers, or "Not in the file". */
function ColumnSelect({ h, label, headers, value, onChange }) {
  return (
    <label className="ld-field">{label}
      <select value={value ?? -1} onChange={e => onChange(Number(e.target.value))}>
        <option value={-1}>{h.t('noColumn')}</option>
        {headers.map((head, i) => <option key={i} value={i}>{head || `#${i + 1}`}</option>)}
      </select>
    </label>
  );
}

function Mapping({ h, s, pack, serials, headers, mapping, setMapping }) {
  const set = key => value => setMapping({ ...mapping, [key]: value });
  const setOption = key => value => setMapping({ ...mapping, options: { ...mapping.options, [key]: value } });
  return (
    <fieldset className="ld-fieldset">
      <legend>{h.t('matchColumns')}</legend>
      <div className="hb-grid-3">
        {MAIN_COLUMNS.map(k => <ColumnSelect key={k} h={h} label={h.t(`col_${k}`)} headers={headers} value={mapping[k]} onChange={set(k)} />)}
        {pack.variantOptions.map(o => <ColumnSelect key={o.key} h={h} label={s.ar ? o.ar : o.en} headers={headers} value={mapping.options[o.key]} onChange={setOption(o.key)} />)}
        {serials && <ColumnSelect h={h} label={h.t('col_serial')} headers={headers} value={mapping.serial} onChange={set('serial')} />}
      </div>
      <details className="hb-more">
        <summary>{h.t('moreColumns')}</summary>
        <div className="hb-grid-3">{MORE_COLUMNS.map(k => <ColumnSelect key={k} h={h} label={h.t(`col_${k}`)} headers={headers} value={mapping[k]} onChange={set(k)} />)}</div>
      </details>
    </fieldset>
  );
}

function Preview({ h, preview, photos }) {
  return (
    <>
      <p role="status" className="hb-import-summary">{h.t('importSummary', preview.counts)}{photos ? ` · ${h.t('photosFromFile', { count: photos })}` : ''}</p>
      <div className="ld-table-wrap"><table className="ld-table hb-import-table">
        <thead><tr><th scope="col">{h.t('products')}</th><th scope="col">{h.t('variants')}</th><th scope="col">{h.t('price')}</th><th scope="col">{h.t('stock')}</th></tr></thead>
        <tbody>{preview.products.slice(0, PREVIEW_ROWS).map(p => (
          <tr key={p.key}>
            <th scope="row">{p.image && <img className="hb-thumb" src={p.image} alt="" width="40" height="40" />}<bdi>{h.name(p)}</bdi>{p.category && <span className="ld-help"> · <bdi>{p.category}</bdi></span>}</th>
            <td>{p.variants.map(v => v.options.map(o => o.value).join(' / ')).filter(Boolean).join(h.ar ? '، ' : ', ') || '—'}</td>
            <td><Money h={h} minor={Math.min(...p.variants.map(v => v.priceMinor))} /></td>
            <td className="ld-num">{p.variants.some(v => v.quantity !== null) ? p.variants.reduce((n, v) => n + (v.quantity || 0), 0) : '—'}</td>
          </tr>
        ))}</tbody>
      </table></div>
      {preview.products.length > PREVIEW_ROWS && <p className="ld-help">{h.t('importShowing', { shown: PREVIEW_ROWS, total: preview.products.length })}</p>}
      {!!preview.invalid.length && (
        <div className="hb-import-issues">
          <p>{h.t('importIssues', { count: preview.invalid.length })}</p>
          <ul>{preview.invalid.slice(0, ISSUE_ROWS).map(i => <li key={i.line}>{h.t('importLine', { line: i.line, reason: h.t(`issue_${i.reason}`) })}{i.value && <> — <bdi>{i.value}</bdi></>}</li>)}</ul>
        </div>
      )}
    </>
  );
}

/**
 * Stock import: pick any file → check the columns and products → save in batches
 * → photos from the file, or pictures named after a SKU or product.
 */
export function StockImporter({ s, h, pack, onClose, onImported }) {
  const serials = pack.modules?.serials === 'available';
  const [step, setStep] = useState('pick'), [error, setError] = useState(''), [slowFile, setSlowFile] = useState(false);
  const [file, setFile] = useState(null), [mapping, setMapping] = useState(null);
  const [progress, setProgress] = useState(null), [result, setResult] = useState(null);

  const preview = useMemo(() => {
    if (!file || !mapping) return null;
    const p = buildStockPreview(file.rows, mapping, pack.variantOptions);
    // A picture on a row of the sheet belongs to the product on that row.
    const byLine = new Map(file.images.map(i => [i.line, i.url]));
    return { ...p, products: p.products.map(x => ({ ...x, image: byLine.get(x.line) || x.variants.map(v => byLine.get(v.line)).find(Boolean) || null })) };
  }, [file, mapping, pack.variantOptions]);

  const pick = async e => {
    const chosen = e.target.files?.[0];
    e.target.value = '';
    if (!chosen) return;
    setError(''); setStep('reading'); setSlowFile(chosen.type.startsWith('image/'));
    try {
      const read = await readStockFile(chosen);
      const rows = findHeaderRow(read.rows, pack.variantOptions) || read.rows;
      const offset = read.rows.length - rows.length;
      // Sheet row index → preview line (line 2 is the first row under the headers).
      const images = read.images.map(i => ({ line: i.row - offset + 1, blob: i.blob, url: URL.createObjectURL(i.blob) }));
      setFile({ name: chosen.name, kind: read.kind, rows, images });
      setMapping(guessStockMapping(rows[0], pack.variantOptions));
      setStep('review');
    } catch (err) { setError(h.reason(err.reason) || h.reason('import_file_type')); setStep('pick'); }
  };

  const attachPhotos = async (pairs, total) => {
    let added = 0;
    for (const [i, { itemId, blob }] of pairs.entries()) {
      setProgress({ label: 'addingPhotos', done: i, total });
      try { const { photoId } = await uploadProductPhoto(hasib, blob); await hasib('item_photo', { itemId, photoId }); added++; }
      catch (err) { if (err.reason === 'photo_limit') { setError(h.reason('photo_limit')); break; } }
    }
    return added;
  };

  const save = async () => {
    setStep('saving'); setError('');
    const batches = importBatches(preview.products);
    const total = preview.products.length, outcome = { created: 0, updated: 0, failed: [], items: [], notSaved: 0, serialNotes: [] };
    let offset = 0;
    try {
      for (const batch of batches) {
        setProgress({ label: 'savingProducts', done: offset, total });
        const r = await hasib('items_import', { products: batch }, { timeout: 60000 });
        outcome.created += r.created; outcome.updated += r.updated;
        for (const x of r.results) {
          const product = preview.products[offset + x.index];
          if (x.status === 'failed') outcome.failed.push({ name: h.name(product), reason: x.reason });
          else outcome.items.push({ itemId: x.itemId, product });
          if (x.warning || x.skippedSerials) outcome.serialNotes.push({ name: h.name(product), reason: x.warning, skipped: x.skippedSerials || 0 });
        }
        offset += batch.length;
      }
      const withImages = outcome.items.filter(x => x.product.image).map(x => ({ itemId: x.itemId, blob: file.images.find(i => i.url === x.product.image).blob }));
      outcome.photos = withImages.length ? await attachPhotos(withImages, withImages.length) : 0;
    } catch (err) {
      // Stop at the first batch that fails and say how many were not saved; importing the file again updates, never duplicates.
      outcome.notSaved = total - offset;
      setError(`${h.reason(err.reason) || s.reason(err.reason)} ${h.t('importStopped', { count: outcome.notSaved })}`);
    }
    setProgress(null); setResult(outcome); setStep('done');
    onImported?.();
  };

  const bulkPhotos = async e => {
    const pictures = [...(e.target.files || [])].filter(f => PHOTO_TYPES.includes(f.type));
    e.target.value = '';
    const keys = new Map();
    for (const { itemId, product } of result.items) for (const k of [product.nameEn, product.nameAr, ...product.variants.map(v => v.sku)]) if (k) keys.set(fileKey(k), itemId);
    const pairs = [], unmatched = [];
    for (const pic of pictures) { const itemId = keys.get(fileKey(pic.name)); if (itemId) pairs.push({ itemId, blob: pic }); else unmatched.push(pic.name); }
    setError('');
    const added = await attachPhotos(pairs, pairs.length);
    setProgress(null);
    setResult(r => ({ ...r, photos: (r.photos || 0) + added, unmatched }));
    onImported?.();
  };

  const busy = step === 'reading' || step === 'saving' || !!progress;
  return (
    <Dialog s={s} title={h.t('importTitle')} onClose={busy ? () => {} : onClose} wide>
      <div className="hb-importer">
        {step === 'pick' && (
          <>
            <p>{h.t('importIntro')}</p>
            <div className="ld-actions hb-import-pick">
              <label className="ld-button ld-primary">{h.t('chooseStockFile')}<input type="file" accept={STOCK_FILE_ACCEPT} className="ld-visually-hidden" onChange={pick} /></label>
              <button type="button" className="ld-link" onClick={() => download('stock-example.csv', sampleStockCsv(pack.variantOptions, { serials }), 'text/csv;charset=utf-8')}>{h.t('downloadExample')}</button>
            </div>
          </>
        )}
        {step === 'reading' && <p role="status" className="ld-state">{h.t('readingFile')}{slowFile && <span className="ld-help"> {h.t('readingPhotoSlow')}</span>}</p>}
        {step === 'review' && preview && (
          <>
            <p className="ld-help"><bdi>{file.name}</bdi></p>
            {file.kind === 'table' && <Mapping h={h} s={s} pack={pack} serials={serials} headers={file.rows[0]} mapping={mapping} setMapping={setMapping} />}
            <Preview h={h} preview={preview} photos={file.images.length} />
            <div className="ld-actions">
              <button type="button" className="ld-button ld-quiet" onClick={() => { setFile(null); setStep('pick'); }}>{h.t('chooseAnother')}</button>
              <button type="button" className="ld-button ld-primary" disabled={!preview.products.length} onClick={save}>{h.t('addProductsNow', { count: preview.products.length })}</button>
            </div>
          </>
        )}
        {progress && (
          <div role="status" className="hb-import-progress">
            <p>{h.t(progress.label, { done: progress.done, total: progress.total })}</p>
            <progress max={progress.total} value={progress.done} aria-label={h.t(progress.label, { done: progress.done, total: progress.total })} />
          </div>
        )}
        {step === 'done' && result && !progress && (
          <>
            <p role="status" className="hb-import-summary">{h.t('importDone', result)}{result.photos ? ` ${h.t('photosAdded', { count: result.photos })}` : ''}</p>
            {!!result.failed.length && (
              <div className="hb-import-issues"><p>{h.t('importFailedList', { count: result.failed.length })}</p>
                <ul>{result.failed.slice(0, ISSUE_ROWS).map((f, i) => <li key={i}><bdi>{f.name}</bdi> — {h.reason(f.reason) || h.t('actionFailed')}</li>)}</ul></div>
            )}
            {!!result.serialNotes?.length && (
              <div className="hb-import-issues"><p>{h.t('importSerialNotes', { count: result.serialNotes.length })}</p>
                <ul>{result.serialNotes.slice(0, ISSUE_ROWS).map((n, i) => <li key={i}><bdi>{n.name}</bdi> — {n.reason ? h.reason(n.reason) || h.t('actionFailed') : h.t('importSerialsSkipped', { count: n.skipped })}</li>)}</ul></div>
            )}
            {!!result.items.length && (
              <div className="hb-photo-actions">
                <label className="ld-button ld-quiet">{h.t('bulkPhotos')}<input type="file" multiple accept={PHOTO_TYPES.join(',')} className="ld-visually-hidden" onChange={bulkPhotos} /></label>
                <p className="ld-help">{h.t('bulkPhotosHelp')}</p>
                {!!result.unmatched?.length && <p className="ld-help">{h.t('photosUnmatched', { names: result.unmatched.slice(0, 10).join(h.ar ? '، ' : ', ') })}</p>}
              </div>
            )}
            <div className="ld-actions"><button type="button" className="ld-button ld-primary" onClick={onClose}>{h.t('done')}</button></div>
          </>
        )}
        {error && <p className="ld-inline-error" role="alert">{error}</p>}
      </div>
    </Dialog>
  );
}
