import React, { useEffect, useState } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { hasib } from '../../lib/dashboard/api';
import { listTimestamp } from '../../lib/dashboard/format';
import { OrderComposer } from './OrderComposer';
import { OrderDetail } from './OrderDetail';
import { Money, OrderStatus, PaymentChip } from './Badges';

const FILTERS = ['', 'pending', 'confirmed', 'ready', 'out_for_delivery', 'delivered', 'completed', 'cancelled'];

/**
 * Orders tab. `fromChat` is a conversation id handed over from a chat thread:
 * the composer opens prefilled with what Layla captured there.
 */
export function OrdersView({ s, h, overview, business, timezone, fromChat, onConsumedChat }) {
  const [status, setStatus] = useState(''), [more, setMore] = useState({ items: [], cursor: undefined });
  const [composer, setComposer] = useState(null), [openId, setOpenId] = useState(null), [notice, setNotice] = useState('');
  const list = usePolling(() => hasib('orders', status ? { status } : {}), [status], { interval: 15000 });
  const items = [...(list.data?.items || []), ...more.items.filter(i => !(list.data?.items || []).some(x => x.id === i.id))];
  const cursor = more.cursor === undefined ? list.data?.cursor : more.cursor;
  const reset = () => { setMore({ items: [], cursor: undefined }); list.refresh({ quiet: true }); };

  useEffect(() => {
    if (!fromChat) return;
    hasib('chat_prefill', { conversationId: fromChat }).then(prefill => setComposer({ prefill })).catch(e => setNotice(h.reason(e.reason) || s.reason(e.reason))).finally(onConsumedChat);
  }, [fromChat]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = async () => {
    const page = await hasib('orders', { ...(status ? { status } : {}), cursor });
    setMore(m => ({ items: [...m.items, ...page.items], cursor: page.cursor }));
  };

  return (
    <div className="hb-orders">
      <div className="ld-page-head">
        <h1>{h.t('orders')}</h1>
        <div className="ld-toolbar">
          <label><span className="ld-visually-hidden">{h.t('status')}</span>
            <select value={status} onChange={e => { setStatus(e.target.value); setMore({ items: [], cursor: undefined }); }}>
              {FILTERS.map(v => <option key={v} value={v}>{v ? h.t(`st_${v}`) : h.t('allOrders')}</option>)}
            </select></label>
          <button type="button" className="ld-button ld-primary" onClick={() => setComposer({ prefill: null })}>{h.t('newOrder')}</button>
        </div>
      </div>
      {notice && <p className={notice === h.t('depositFailed') ? 'ld-inline-error' : 'ld-help'} role="status">{notice}</p>}
      {list.loading && !list.data ? <p className="ld-state" role="status">{h.t('loading')}</p>
        : list.error && !list.data ? <div className="ld-state" role="alert"><p>{h.reason(list.error.reason) || s.reason(list.error.reason)}</p><button className="ld-button" onClick={() => list.refresh()}>{h.t('retry')}</button></div>
        : !items.length ? <p className="ld-state">{h.t('noOrders')}</p>
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
                    <td><OrderStatus h={h} status={o.status} />{o.stockShort && <span className="ld-chip is-coral">{h.t('stockShort')}</span>}{o.fulfilment.dueAt && !['delivered', 'completed', 'cancelled', 'returned'].includes(o.status) && <span className="ld-chip is-yellow">{h.t('due', { date: listTimestamp(o.fulfilment.dueAt, s.lang, timezone) })}</span>}</td>
                    <td><PaymentChip h={h} status={o.paymentStatus} /></td>
                    <td><Money h={h} minor={o.totalMinor} /></td>
                    <td><Money h={h} minor={o.balanceMinor} /></td>
                    <td className="ld-help">{listTimestamp(o.createdAt, s.lang, timezone)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {cursor && <button type="button" className="ld-button ld-quiet ld-more" onClick={loadMore}>{h.t('loadMore')}</button>}
          </div>
        )}
      {composer && <OrderComposer s={s} h={h} overview={overview} prefill={composer.prefill} timezone={timezone} onClose={() => setComposer(null)}
        onSaved={(order, { depositFailed } = {}) => { setComposer(null); setNotice(depositFailed ? h.t('depositFailed') : order.stockShort ? h.t('shortWarning') : ''); reset(); setOpenId(order.id); }} />}
      {openId && <OrderDetail s={s} h={h} pack={overview.pack} business={business} orderId={openId} timezone={timezone} onClose={() => setOpenId(null)} onChanged={reset}
        onExchange={order => { setOpenId(null); setComposer({ prefill: { customerName: order.contact ? '' : order.customerName, contact: order.contact || { name: order.customerName || h.t('walkIn') }, contactId: order.contact?.id, conversationId: order.conversationId,
          channel: order.channel, lines: [], unmatched: '', fulfilment: { type: order.fulfilment.type, ...(order.fulfilment.area ? { area: order.fulfilment.area } : {}) } } }); }} />}
    </div>
  );
}
