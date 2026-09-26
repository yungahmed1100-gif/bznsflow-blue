import React, { useState } from 'react';
import { usePolling, useDebounced } from '../../hooks/usePolling';
import { hasib } from '../../lib/dashboard/api';
import { ItemEditor } from './ItemEditor';
import { StockMoveDialog } from './StockMoveDialog';
import { Money } from './Badges';

/** Products and variants with on-hand, alert level and one-tap adjustments. */
export function StockView({ s, h, overview, onChanged }) {
  const [search, setSearch] = useState(''), [lowOnly, setLowOnly] = useState(false);
  const [editing, setEditing] = useState(null), [moving, setMoving] = useState(null), [notice, setNotice] = useState('');
  const query = useDebounced(search.trim(), 300);
  const list = usePolling(() => lowOnly ? hasib('low_stock') : hasib('items', query ? { search: query } : {}), [query, lowOnly], { interval: 30000 });
  const refresh = () => { list.refresh({ quiet: true }); onChanged(); };
  const archive = async item => {
    try { await hasib('item_archive', { itemId: item.id }); setEditing(null); refresh(); } catch (e) { setNotice(h.reason(e.reason) || s.reason(e.reason)); }
  };
  // The low-stock endpoint returns variants; group them back under their product.
  const items = lowOnly ? Object.values((list.data?.items || []).reduce((acc, v) => {
    acc[v.itemId] ||= { id: v.itemId, nameAr: v.nameAr, nameEn: v.nameEn, trackStock: true, serialized: v.serialized, variants: [], partial: true };
    acc[v.itemId].variants.push(v); return acc;
  }, {})) : list.data?.items || [];

  return (
    <div className="hb-stock">
      <div className="ld-page-head">
        <h1>{h.t('stock')}</h1>
        <div className="ld-toolbar">
          {!lowOnly && <label className="ld-search"><span className="ld-visually-hidden">{h.t('searchItems')}</span>
            <input type="search" value={search} placeholder={h.t('searchItems')} onChange={e => setSearch(e.target.value)} /></label>}
          <label className="ld-check"><input type="checkbox" checked={lowOnly} onChange={e => setLowOnly(e.target.checked)} /> {h.t('lowStockOnly')}{overview.counts.lowStock ? ` (${overview.counts.lowStock})` : ''}</label>
          <button type="button" className="ld-button ld-primary" onClick={() => setEditing({ item: null })}>{h.t('addProduct')}</button>
        </div>
      </div>
      {notice && <p className="ld-inline-error" role="alert">{notice}</p>}
      {list.loading && !list.data ? <p className="ld-state" role="status">{h.t('loading')}</p>
        : list.error && !list.data ? <p className="ld-state" role="alert">{h.reason(list.error.reason) || s.reason(list.error.reason)}</p>
        : !items.length ? <p className="ld-state">{query || lowOnly ? h.t('noItemsFound') : h.t('noProducts')}</p>
        : (
          <div className="ld-table-wrap">
            <table className="ld-table hb-stock-table">
              <thead><tr><th scope="col">{h.t('products')}</th><th scope="col">{h.t('variants')}</th><th scope="col">{h.t('price')}</th><th scope="col">{h.t('stock')}</th><th scope="col"><span className="ld-visually-hidden">{h.t('adjustStock')}</span></th></tr></thead>
              <tbody>
                {items.flatMap(item => item.variants.map((v, i) => (
                  <tr key={v.id} className={i ? 'hb-sub' : ''}>
                    {i === 0 && <th scope="rowgroup" rowSpan={item.variants.length}>
                      {item.photoUrl && <img className="hb-thumb" src={item.photoUrl} alt="" width="40" height="40" loading="lazy" />}
                      {item.partial ? <bdi>{h.name(item)}</bdi> : <button type="button" className="ld-row-open" onClick={() => setEditing({ item })}><bdi>{h.name(item)}</bdi></button>}
                      {item.category && <span className="ld-help"> · <bdi>{item.category}</bdi></span>}{item.serialized && <span className="ld-chip">{h.t('serializedChip')}</span>}
                    </th>}
                    <td>{v.options.map(o => o.value).join(' / ') || '—'}{v.sku && <span className="ld-help"> · <bdi dir="ltr">{v.sku}</bdi></span>}</td>
                    <td><Money h={h} minor={v.priceMinor} /></td>
                    <td>{item.trackStock ? <><span className="ld-num">{v.onHand}</span>{v.onHand <= 0 ? <span className="ld-chip is-coral">{h.t('outOfStock')}</span> : v.low && <span className="ld-chip is-yellow">{h.t('lowStock')}</span>}</> : '—'}</td>
                    <td>{item.trackStock && <button type="button" className="ld-button ld-quiet ld-compact" onClick={() => setMoving({ item, variant: v })}>{h.t('adjustStock')}</button>}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        )}
      {editing && <ItemEditor s={s} h={h} pack={overview.pack} item={editing.item} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} onArchive={archive} />}
      {moving && <StockMoveDialog s={s} h={h} item={moving.item} variant={moving.variant} onClose={() => setMoving(null)} onSaved={() => { setMoving(null); refresh(); }} />}
    </div>
  );
}
