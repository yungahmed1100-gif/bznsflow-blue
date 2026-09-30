import React, { useState } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { hasib } from '../../lib/dashboard/api';
import { listTimestamp } from '../../lib/dashboard/format';
import { OrderComposer } from './OrderComposer';
import { OrderDetail } from './OrderDetail';
import { ProductRequests } from './ProductRequests';
import { Money, OrderStatus, PaymentChip } from './Badges';
import { EmptyState, PageHeader } from './DashboardVisuals';

const FILTERS = ['', 'layla_waiting', 'pending', 'confirmed', 'ready', 'out_for_delivery', 'delivered', 'completed', 'cancelled'];

/** Orders tab. Layla files orders from chats; "Waiting for you" lists the ones to confirm. */
export function OrdersView({ s, h, overview, business, timezone, onChanged, initialCreate = false, initialOrderId = null }) {
  const [status, setStatus] = useState(overview.counts?.laylaWaiting ? 'layla_waiting' : ''), [more, setMore] = useState({ items: [], cursor: undefined });
  const [composer, setComposer] = useState(initialCreate ? { prefill: null } : null), [openId, setOpenId] = useState(initialOrderId), [notice, setNotice] = useState('');
  const list = usePolling(() => hasib('orders', status ? { status } : {}), [status], { interval: 15000 });
  const items = [...(list.data?.items || []), ...more.items.filter(i => !(list.data?.items || []).some(x => x.id === i.id))];
  const cursor = more.cursor === undefined ? list.data?.cursor : more.cursor;
  const reset = () => { setMore({ items: [], cursor: undefined }); list.refresh({ quiet: true }); onChanged?.(); };

  const [loadingMore, setLoadingMore] = useState(false), [moreError, setMoreError] = useState('');
  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true); setMoreError('');
    try {
      const page = await hasib('orders', { ...(status ? { status } : {}), cursor });
      setMore(m => ({ items: [...m.items, ...page.items], cursor: page.cursor }));
    } catch (e) { setMoreError(h.reason(e.reason) || s.reason(e.reason)); }
    finally { setLoadingMore(false); }
  };

  return (
    <div className="hb-orders">
      <PageHeader title={h.t('orders')} description={s.ar ? 'أنشئ الطلبات وتابع الدفع والتنفيذ من مكان واحد.' : 'Create orders and track payment and fulfilment in one place.'} icon="receipt" primary={{ label: h.t('newOrder'), icon: 'plus', onClick: () => setComposer({ prefill: null }) }}>
        <div className="ld-toolbar">
          <label><span className="ld-visually-hidden">{h.t('status')}</span>
            <select value={status} onChange={e => { setStatus(e.target.value); setMore({ items: [], cursor: undefined }); }}>
              {FILTERS.map(v => <option key={v} value={v}>{v === 'layla_waiting' ? h.t('waitingForYou') : v ? h.t(`st_${v}`) : h.t('allOrders')}</option>)}
            </select></label>
        </div>
      </PageHeader>
      {overview.pack.id === 'retail' && <ProductRequests s={s} h={h} />}
      {notice && <p className={notice === h.t('depositFailed') || notice.startsWith(h.t('exchangeReturnFailed')) ? 'ld-inline-error' : 'ld-help'} role="status">{notice}</p>}
      {list.loading && !list.data ? <p className="ld-state" role="status">{h.t('loading')}</p>
        : list.error && !list.data ? <div className="ld-state" role="alert"><p>{h.reason(list.error.reason) || s.reason(list.error.reason)}</p><button className="ld-button" onClick={() => list.refresh()}>{h.t('retry')}</button></div>
        : !items.length ? <EmptyState icon="receipt" title={h.t('noOrders')} description={s.ar ? 'سجّل أول طلب لتظهر حالات التنفيذ والدفع هنا.' : 'Record the first order to see fulfilment and payment status here.'} action={{ label: h.t('newOrder'), onClick: () => setComposer({ prefill: null }) }} />
        : (
          <div className="ld-table-wrap">
            <table className="ld-table hb-order-table">
              <thead><tr>
                <th scope="col">#</th><th scope="col">{h.t('customer')}</th><th scope="col">{h.t('status')}</th><th scope="col">{h.t('payment')}</th>
                <th scope="col">{h.t('total')}</th><th scope="col">{h.t('balance')}</th><th scope="col">{h.t('created')}</th>
              </tr></thead>
              <tbody>
                {items.map(o => (
                  <tr key={o.id}>
                    <td><button type="button" className="ld-row-open ld-num" onClick={() => setOpenId(o.id)} aria-label={h.t('orderNumber', { number: o.number })}>{o.number}</button></td>
                    <td>{o.contact?.name || o.customerName ? <><bdi>{o.contact?.name || o.customerName}</bdi><span className="ld-help"> · {h.t(`ch_${o.channel}`)}</span></> : <span className="ld-help">{h.t(`ch_${o.channel}`)}</span>}</td>
                    <td><OrderStatus h={h} status={o.status} />{o.source === 'layla' && <span className="ld-chip is-blue">{h.t('fromLayla')}</span>}{o.stockShort && <span className="ld-chip is-coral">{h.t('stockShort')}</span>}{o.fulfilment.dueAt && !['delivered', 'completed', 'cancelled', 'returned'].includes(o.status) && <span className="ld-chip is-yellow">{h.t('due', { date: listTimestamp(o.fulfilment.dueAt, s.lang, timezone) })}</span>}</td>
                    <td><PaymentChip h={h} status={o.paymentStatus} /></td>
                    <td><Money h={h} minor={o.totalMinor} /></td>
                    <td><Money h={h} minor={o.balanceMinor} /></td>
                    <td className="ld-help">{listTimestamp(o.createdAt, s.lang, timezone)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {moreError && <p className="ld-inline-error" role="alert">{moreError}</p>}
            {cursor && <button type="button" className="ld-button ld-quiet ld-more" disabled={loadingMore} onClick={loadMore}>{loadingMore ? h.t('loading') : h.t('loadMore')}</button>}
          </div>
        )}
      {composer && <OrderComposer s={s} h={h} overview={overview} prefill={composer.prefill} timezone={timezone} onClose={() => setComposer(null)}
        onSaved={async (order, { depositFailed } = {}) => {
          const exchangeFor = composer.exchangeFor;
          setComposer(null);
          let message = depositFailed ? h.t('depositFailed') : order.stockShort ? h.t('shortWarning') : '';
          // An exchange: the new order exists, so the original can now be marked returned (its stock comes back).
          if (exchangeFor) {
            try { const original = await hasib('order', { orderId: exchangeFor }); await hasib('order_status', { orderId: exchangeFor, to: 'returned', version: original.version }); }
            catch (e) { message = `${h.t('exchangeReturnFailed')} ${h.reason(e.reason) || ''}`.trim(); }
          }
          setNotice(message); reset(); setOpenId(order.id);
        }} />}
      {openId && <OrderDetail s={s} h={h} pack={overview.pack} role={overview.workspaceRole} business={business} orderId={openId} timezone={timezone} onClose={() => setOpenId(null)} onChanged={reset}
        onExchange={order => { setOpenId(null); setComposer({ exchangeFor: order.id, prefill: { customerName: order.contact ? '' : order.customerName, contact: order.contact || { name: order.customerName || h.t('walkIn') }, contactId: order.contact?.id, conversationId: order.conversationId,
          channel: order.channel, lines: [], unmatched: '', fulfilment: { type: order.fulfilment.type, ...(order.fulfilment.area ? { area: order.fulfilment.area } : {}) } } }); }} />}
    </div>
  );
}
