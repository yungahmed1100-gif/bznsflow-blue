import React, { useState } from 'react';
import { usePolling, useDebounced } from '../../hooks/usePolling';
import { hasib } from '../../lib/dashboard/api';
import { ItemEditor } from './ItemEditor';
import { StockMoveDialog } from './StockMoveDialog';
import { StockImporter } from './StockImporter';
import { Money } from './Badges';
import { hasibPack } from '../../../config/hasib-packs';
import { RestaurantControls } from './RestaurantControls';
import { EmptyState, PageHeader } from './DashboardVisuals';

/** Products and variants with on-hand, alert level and one-tap adjustments. */
export function StockView({ s, h, overview, initialLow = false, initialAction = '', timezone, onChanged }) {
  const [search, setSearch] = useState(''), [lowOnly, setLowOnly] = useState(initialLow);
  const [editing, setEditing] = useState(initialAction === 'product' && overview.workspaceRole !== 'employee' ? { item: null } : null), [moving, setMoving] = useState(null), [importing, setImporting] = useState(initialAction === 'import' && overview.workspaceRole !== 'employee');
  const query = useDebounced(search.trim(), 300);
  // A clinic's Stock holds only its supplies; treatments live in Services → Treatments.
  const supplies = !!overview.pack.internalStock;
  const list = usePolling(() => lowOnly ? hasib('low_stock') : hasib('items', { ...(query ? { search: query } : {}), ...(supplies ? { kind: 'product' } : {}) }), [query, lowOnly, supplies], { interval: 30000 });
  const refresh = () => { list.refresh({ quiet: true }); onChanged(); };
  // ItemEditor shows a failure inside its own dialog.
  const archive = async item => { await hasib('item_archive', { itemId: item.id }); setEditing(null); refresh(); };
  const manager = overview.workspaceRole !== 'employee';
  // The low-stock endpoint returns variants; group them back under their product.
  const all = lowOnly ? Object.values((list.data?.items || []).reduce((acc, v) => {
    acc[v.itemId] ||= { id: v.itemId, nameAr: v.nameAr, nameEn: v.nameEn, trackStock: true, serialized: v.serialized, variants: [], partial: true };
    acc[v.itemId].variants.push(v); return acc;
  }, {})) : list.data?.items || [];
  // Search uses the full-text index, which can't filter by kind.
  const items = supplies ? all.filter(i => i.partial || i.kind !== 'service') : all;

  return (
    <div className="hb-stock">
      <PageHeader title={supplies ? h.t('products') : hasibPack(overview.pack.id).ownerUi.stock[h.ar ? 'ar' : 'en']} description={supplies ? (s.ar ? 'المستلزمات التي تستخدمها العيادة. لا تُعرض على المرضى.' : 'Supplies the clinic uses. Never offered to patients.') : s.ar ? 'صور وأسعار ومخزون واضح لكل منتج.' : 'Clear photos, prices and stock for every product.'} icon="box" primary={manager ? { label: h.t('addProduct'), onClick: () => setEditing({ item: null }) } : null}>
        <div className="ld-toolbar">
          {!lowOnly && <label className="ld-search"><span className="ld-visually-hidden">{h.t('searchItems')}</span>
            <input type="search" value={search} placeholder={h.t('searchItems')} onChange={e => setSearch(e.target.value)} /></label>}
          <label className="ld-check"><input type="checkbox" checked={lowOnly} onChange={e => setLowOnly(e.target.checked)} /> {h.t('lowStockOnly')}{overview.counts.lowStock ? ` (${overview.counts.lowStock})` : ''}</label>
          {manager && <button type="button" className="ld-button" onClick={() => setImporting(true)}>{h.t('importStock')}</button>}
        </div>
      </PageHeader>
      {overview.pack.modules.recipes === 'available' && <RestaurantControls timezone={timezone} onChanged={refresh} s={s} h={h} overview={overview} />}
      {list.loading && !list.data ? <p className="ld-state" role="status">{h.t('loading')}</p>
        : list.error && !list.data ? <div className="ld-state" role="alert"><p>{h.reason(list.error.reason) || s.reason(list.error.reason)}</p><button className="ld-button" onClick={() => list.refresh()}>{h.t('retry')}</button></div>
        : !items.length ? <EmptyState icon="box" title={query || lowOnly ? h.t('noItemsFound') : h.t('noProducts')} description={query || lowOnly ? (s.ar ? 'غيّر البحث أو ألغِ فلتر المخزون المنخفض.' : 'Change the search or clear the low-stock filter.') : (s.ar ? 'أضف أول منتج مع صورته وسعره وكمية البداية.' : 'Add the first product with its photo, price and opening quantity.')} action={query || lowOnly || !manager ? undefined : { label: h.t('addProduct'), onClick: () => setEditing({ item: null }) }} secondary={query || lowOnly ? { label: h.t('products'), onClick: () => { setSearch(''); setLowOnly(false); } } : manager ? { label: h.t('importStock'), onClick: () => setImporting(true) } : undefined} />
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
      {editing && <ItemEditor s={s} h={h} pack={overview.pack} item={editing.item} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} onArchive={archive} staff={!manager} />}
      {importing && manager && <StockImporter s={s} h={h} pack={overview.pack} onClose={() => setImporting(false)} onImported={refresh} />}
      {moving && <StockMoveDialog s={s} h={h} staff={!manager} item={moving.item} variant={moving.variant} onClose={() => setMoving(null)} onSaved={() => { setMoving(null); refresh(); }} />}
    </div>
  );
}
