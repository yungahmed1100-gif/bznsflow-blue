import React, { useState } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { hasib } from '../../lib/dashboard/api';
import { listTimestamp } from '../../lib/dashboard/format';
import { RepairForm, RepairDetail, RepairStatus } from './RepairDialogs';
import { WarrantyLookup } from './WarrantyLookup';
import { TradeInDialog } from './TradeInDialog';
import { Money } from './Badges';

const FILTERS = ['', 'received', 'diagnosing', 'waiting_parts', 'repairing', 'ready', 'collected', 'cancelled'];

/** Tech-store service desk: repair tickets, warranty lookup by IMEI, and trade-ins. */
export function ServiceView({ s, h, timezone, onChanged }) {
  const [status, setStatus] = useState(''), [creating, setCreating] = useState(false), [openId, setOpenId] = useState(null), [tradeIn, setTradeIn] = useState(false), [notice, setNotice] = useState('');
  const list = usePolling(() => hasib('repairs', status ? { status } : {}), [status], { interval: 20000 });
  const items = list.data?.items || [];
  const refresh = () => { list.refresh({ quiet: true }); onChanged(); };
  return (
    <div className="hb-service">
      <div className="ld-page-head">
        <h1>{h.t('service')}</h1>
        <div className="ld-toolbar">
          <button type="button" className="ld-button ld-quiet" onClick={() => setTradeIn(true)}>{h.t('tradeIn')}</button>
          <button type="button" className="ld-button ld-primary" onClick={() => setCreating(true)}>{h.t('newRepair')}</button>
        </div>
      </div>
      {notice && <p className="ld-help" role="status">{notice}</p>}
      <div className="hb-panels">
        <section className="hb-panel" aria-labelledby="hb-repairs-title">
          <div className="hb-panel-head">
            <h2 id="hb-repairs-title" className="hb-panel-title">{h.t('repairs')}</h2>
            <label><span className="ld-visually-hidden">{h.t('status')}</span>
              <select value={status} onChange={e => setStatus(e.target.value)}>{FILTERS.map(v => <option key={v} value={v}>{v ? h.t(`rs_${v}`) : h.t('allRepairs')}</option>)}</select></label>
          </div>
          {list.loading && !list.data ? <p className="ld-state" role="status">{h.t('loading')}</p>
            : list.error && !list.data ? <p className="ld-state" role="alert">{h.reason(list.error.reason) || s.reason(list.error.reason)}</p>
            : !items.length ? <p className="ld-help">{h.t('noRepairs')}</p>
            : (
              <div className="ld-table-wrap"><table className="ld-table">
                <thead><tr><th scope="col">#</th><th scope="col">{h.t('device')}</th><th scope="col">{h.t('status')}</th><th scope="col" className="hb-num-col">{h.t('balance')}</th><th scope="col">{h.t('created')}</th></tr></thead>
                <tbody>{items.map(r => (
                  <tr key={r.id}>
                    <td><button type="button" className="ld-row-open ld-num" onClick={() => setOpenId(r.id)} aria-label={h.t('repairNumber', { number: r.number })}>{r.number}</button></td>
                    <td><bdi>{r.device}</bdi><span className="ld-help"> · <bdi>{r.customer?.name || r.customerName || h.t('walkIn')}</bdi></span>{r.underWarranty && <span className="ld-chip is-green">{h.t('underWarranty')}</span>}</td>
                    <td><RepairStatus h={h} status={r.status} /></td>
                    <td className="hb-num-col">{r.order ? <Money h={h} minor={r.order.balanceMinor} /> : '—'}</td>
                    <td className="ld-help">{listTimestamp(r.createdAt, s.lang, timezone)}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
        </section>
        <WarrantyLookup s={s} h={h} timezone={timezone} onOpenRepair={setOpenId} />
      </div>
      {creating && <RepairForm s={s} h={h} timezone={timezone} onClose={() => setCreating(false)} onSaved={r => { setCreating(false); refresh(); setOpenId(r.id); }} />}
      {openId && <RepairDetail s={s} h={h} repairId={openId} timezone={timezone} onClose={() => setOpenId(null)} onChanged={refresh} />}
      {tradeIn && <TradeInDialog s={s} h={h} onClose={() => setTradeIn(false)} onSaved={t => { setTradeIn(false); setNotice(h.t('tradeInDone', { number: t.number })); onChanged(); }} />}
    </div>
  );
}
