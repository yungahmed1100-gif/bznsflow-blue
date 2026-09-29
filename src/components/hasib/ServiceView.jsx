import React, { useEffect, useState } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { hasib } from '../../lib/dashboard/api';
import { listTimestamp } from '../../lib/dashboard/format';
import { RepairForm, RepairDetail, RepairStatus } from './RepairDialogs';
import { WarrantyLookup } from './WarrantyLookup';
import { TradeInDialog } from './TradeInDialog';
import { Money } from './Badges';
import { ActionCards, EmptyState, PageHeader } from './DashboardVisuals';

const FILTERS = ['', 'received', 'diagnosing', 'waiting_parts', 'repairing', 'ready', 'collected', 'cancelled'];

/** Tech-store service desk: repair tickets, warranty lookup by IMEI, and trade-ins. */
export function ServiceView({ s, h, timezone, onChanged, initialRepairId, initialAction = '' }) {
  const [status, setStatus] = useState(''), [creating, setCreating] = useState(initialAction === 'repair'), [openId, setOpenId] = useState(initialRepairId || null), [tradeIn, setTradeIn] = useState(initialAction === 'trade-in'), [notice, setNotice] = useState('');
  useEffect(() => { if (initialRepairId) setOpenId(initialRepairId); }, [initialRepairId]);
  const list = usePolling(() => hasib('repairs', status ? { status } : {}), [status], { interval: 20000 });
  const items = list.data?.items || [];
  const refresh = () => { list.refresh({ quiet: true }); onChanged(); };
  return (
    <div className="hb-service">
      <PageHeader title={h.t('service')} description={s.ar ? 'الإصلاحات والضمان والاستبدال بواجهة واحدة.' : 'Repairs, warranty and trade-ins in one service desk.'} icon="wrench" primary={{ label: h.t('newRepair'), icon: 'plus', onClick: () => setCreating(true) }} />
      <ActionCards label={s.ar ? 'إجراءات الخدمة' : 'Service actions'} actions={[{ id: 'repair', label: h.t('newRepair'), icon: 'wrench', onClick: () => setCreating(true) }, { id: 'trade-in', label: h.t('tradeIn'), icon: 'repeat', onClick: () => setTradeIn(true) }, { id: 'warranty', label: s.ar ? 'فحص الضمان أدناه' : 'Check warranty below', icon: 'shield-check', onClick: () => document.querySelector('.hb-warranty')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }]} />
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
            : !items.length ? <EmptyState icon="wrench" title={h.t('noRepairs')} description={s.ar ? 'أنشئ تذكرة إصلاح، أو افحص الضمان، أو سجّل جهاز استبدال.' : 'Create a repair ticket, check warranty, or record a trade-in.'} action={{ label: h.t('newRepair'), onClick: () => setCreating(true) }} />
            : (
              <div className="ld-table-wrap"><table className="ld-table">
                <thead><tr><th scope="col">#</th><th scope="col">{h.t('device')}</th><th scope="col">{h.t('status')}</th><th scope="col" className="hb-num-col">{h.t('balance')}</th><th scope="col">{h.t('created')}</th></tr></thead>
                <tbody>{items.map(r => (
                  <tr key={r.id}>
                    <td><button type="button" className="ld-row-open ld-num" onClick={() => setOpenId(r.id)} aria-label={h.t('repairNumber', { number: r.number })}>{r.number}</button></td>
                    <td><bdi>{r.device}</bdi><span className="ld-help"> · <bdi>{r.customer?.name || r.customerName || h.t('walkIn')}</bdi></span>{r.underWarranty && <span className="ld-chip is-green">{h.t('underWarranty')}</span>}</td>
                    <td><RepairStatus h={h} status={r.status} /><span className={`ld-chip ${r.approvalStatus === 'approved' ? 'is-green' : 'is-yellow'}`}>{r.approvalStatus === 'approved' ? (s.ar ? 'وافق العميل' : 'Customer approved') : (s.ar ? 'بانتظار موافقة العميل' : 'Awaiting customer approval')}</span>{r.status === 'ready' && <span className="ld-help">{s.ar ? 'جاهز للاستلام' : 'Ready for collection'}</span>}</td>
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
