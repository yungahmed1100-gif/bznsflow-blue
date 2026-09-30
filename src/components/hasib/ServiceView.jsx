import React, { useEffect, useRef, useState } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { hasib } from '../../lib/dashboard/api';
import { listTimestamp } from '../../lib/dashboard/format';
import { RepairForm, RepairDetail, RepairStatus } from './RepairDialogs';
import { WarrantyLookup } from './WarrantyLookup';
import { TradeInDialog } from './TradeInDialog';
import { Money } from './Badges';
import { ActionCards, EmptyState, PageHeader } from './DashboardVisuals';

const FILTERS = ['', 'received', 'diagnosing', 'waiting_parts', 'repairing', 'ready', 'collected', 'cancelled'];

/**
 * Tech-store service desk: repair tickets, warranty lookup by IMEI, and trade-ins.
 * Trade-ins set the stock cost, so they are the manager's.
 */
export function ServiceView({ s, h, timezone, onChanged, initialRepairId, initialAction = '', staff = false, onClearLink }) {
  const [status, setStatus] = useState(''), [creating, setCreating] = useState(initialAction === 'repair'), [openId, setOpenId] = useState(initialRepairId || null);
  const [tradeIn, setTradeIn] = useState(initialAction === 'trade-in' && !staff), [notice, setNotice] = useState('');
  const [more, setMore] = useState({ items: [], cursor: undefined }), [loadingMore, setLoadingMore] = useState(false), [moreError, setMoreError] = useState('');
  const lookupRef = useRef(null);
  useEffect(() => { if (initialRepairId) setOpenId(initialRepairId); }, [initialRepairId]);
  const focusLookup = () => {
    const input = lookupRef.current?.querySelector('input');
    lookupRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    input?.focus({ preventScroll: true });
  };
  useEffect(() => { if (initialAction === 'warranty') focusLookup(); }, [initialAction]);
  // A trade-in link opened by an employee has nothing to show (trade-ins are the manager's); drop it from the URL.
  useEffect(() => { if (staff && initialAction === 'trade-in') onClearLink?.(); }, [staff, initialAction]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = usePolling(() => hasib('repairs', status ? { status } : {}), [status], { interval: 20000 });
  const items = [...(list.data?.items || []), ...more.items.filter(i => !(list.data?.items || []).some(x => x.id === i.id))];
  const cursor = more.cursor === undefined ? list.data?.cursor : more.cursor;
  const refresh = () => { list.refresh({ quiet: true }); onChanged(); };
  // A deep link (?action=…, ?repair=…) opens once; closing clears it so Back or the language switch does not reopen it.
  const closeLinked = setter => () => { setter(); if (initialAction || initialRepairId) onClearLink?.(); };
  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true); setMoreError('');
    try {
      const page = await hasib('repairs', { ...(status ? { status } : {}), cursor });
      setMore(m => ({ items: [...m.items, ...page.items], cursor: page.cursor }));
    } catch (e) { setMoreError(h.reason(e.reason) || s.reason(e.reason)); }
    finally { setLoadingMore(false); }
  };
  const actions = [
    { id: 'trade-in', label: h.t('tradeIn'), icon: 'repeat', onClick: () => { setNotice(''); setTradeIn(true); } },
    { id: 'warranty', label: h.t('checkWarranty'), icon: 'shield-check', onClick: focusLookup },
  ].filter(action => !(staff && action.id === 'trade-in'));
  return (
    <div className="hb-service">
      <PageHeader title={h.t('service')} description={h.t('serviceHelp')} icon="wrench" primary={{ label: h.t('newRepair'), icon: 'plus', onClick: () => setCreating(true) }} />
      <ActionCards label={h.t('serviceActions')} actions={actions} />
      {notice && <p className="ld-help" role="status">{notice}</p>}
      <div className="hb-panels">
        <section className="hb-panel" aria-labelledby="hb-repairs-title">
          <div className="hb-panel-head">
            <h2 id="hb-repairs-title" className="hb-panel-title">{h.t('repairs')}</h2>
            <label><span className="ld-visually-hidden">{h.t('status')}</span>
              <select value={status} onChange={e => { setStatus(e.target.value); setMore({ items: [], cursor: undefined }); }}>{FILTERS.map(v => <option key={v} value={v}>{v ? h.t(`rs_${v}`) : h.t('allRepairs')}</option>)}</select></label>
          </div>
          {list.loading && !list.data ? <p className="ld-state" role="status">{h.t('loading')}</p>
            : list.error && !list.data ? <div className="ld-state" role="alert"><p>{h.reason(list.error.reason) || s.reason(list.error.reason)}</p><button type="button" className="ld-button" onClick={() => list.refresh()}>{h.t('retry')}</button></div>
            : !items.length ? <EmptyState icon="wrench" title={h.t('noRepairs')} description={h.t('noRepairsHelp')} action={{ label: h.t('newRepair'), onClick: () => setCreating(true) }} />
            : (
              <div className="ld-table-wrap"><table className="ld-table">
                <thead><tr><th scope="col">#</th><th scope="col">{h.t('device')}</th><th scope="col">{h.t('status')}</th><th scope="col" className="hb-num-col">{h.t('balance')}</th><th scope="col">{h.t('created')}</th></tr></thead>
                <tbody>{items.map(r => (
                  <tr key={r.id}>
                    <td><button type="button" className="ld-row-open ld-num" onClick={() => setOpenId(r.id)} aria-label={h.t('repairNumber', { number: r.number })}>{r.number}</button></td>
                    <td><bdi>{r.device}</bdi><span className="ld-help"> · <bdi>{r.customer?.name || r.customerName || h.t('walkIn')}</bdi></span>{r.underWarranty && <span className="ld-chip is-green">{h.t('underWarranty')}</span>}</td>
                    <td><RepairStatus h={h} status={r.status} />{!['collected', 'cancelled'].includes(r.status) && <span className={`ld-chip ${r.approvalStatus === 'approved' ? 'is-green' : 'is-yellow'}`}>{h.t(r.approvalStatus === 'approved' ? 'approvedChip' : 'awaitingApprovalChip')}</span>}</td>
                    <td className="hb-num-col">{r.order ? <Money h={h} minor={r.order.balanceMinor} /> : '—'}</td>
                    <td className="ld-help">{listTimestamp(r.createdAt, s.lang, timezone)}</td>
                  </tr>
                ))}</tbody>
              </table>
              {moreError && <p className="ld-inline-error" role="alert">{moreError}</p>}
              {cursor && <button type="button" className="ld-button ld-quiet ld-more" disabled={loadingMore} onClick={loadMore}>{loadingMore ? h.t('loading') : h.t('loadMore')}</button>}
              </div>
            )}
        </section>
        <div ref={lookupRef} className="hb-lookup-anchor"><WarrantyLookup s={s} h={h} timezone={timezone} onOpenRepair={setOpenId} /></div>
      </div>
      {creating && <RepairForm s={s} h={h} timezone={timezone} onClose={closeLinked(() => setCreating(false))} onSaved={r => { setCreating(false); if (initialAction) onClearLink?.(); refresh(); setOpenId(r.id); }} />}
      {openId && <RepairDetail s={s} h={h} repairId={openId} timezone={timezone} staff={staff} onClose={closeLinked(() => setOpenId(null))} onChanged={refresh} />}
      {tradeIn && <TradeInDialog s={s} h={h} onClose={closeLinked(() => setTradeIn(false))} onSaved={t => { setTradeIn(false); if (initialAction) onClearLink?.(); setNotice(h.t('tradeInDone', { number: t.number })); onChanged(); }} />}
    </div>
  );
}
