import React, { useCallback, useEffect, useState } from 'react';
import { hasib } from '../../lib/dashboard/api';
import { useHasib } from './HasibContext';
import { OrderDetail } from './OrderDetail';
import { Money, OrderStatus } from './Badges';

/**
 * The orders this chat produced — Layla files them herself — shown in the thread
 * header and opened in place. Renders nothing when Hasib is off for the account.
 */
export function ChatOrders({ s, conversationId }) {
  const hb = useHasib();
  const [items, setItems] = useState([]), [openId, setOpenId] = useState(null);
  const enabled = !!hb?.overview.modules.includes('orders');
  const load = useCallback(() => hasib('conversation_orders', { conversationId }).then(r => setItems(r.items)).catch(() => setItems([])), [conversationId]);
  useEffect(() => {
    if (!enabled) return undefined;
    load();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 15000);
    return () => clearInterval(timer);
  }, [enabled, load]);
  if (!enabled || !items.length) return null;
  const { h } = hb;
  return (
    <section className="hb-chat-orders" aria-label={h.t('ordersInChat')}>
      <ul role="list">
        {items.map(o => (
          <li key={o.id}>
            <button type="button" className="hb-chat-order" onClick={() => setOpenId(o.id)}>
              <span className="ld-num">{h.t('orderNumber', { number: o.number })}</span>
              <OrderStatus h={h} status={o.status} />
              {o.source === 'layla' && <span className="ld-chip is-blue">{h.t('fromLayla')}</span>}
              <span className="ld-help">{o.lineCount} · <Money h={h} minor={o.totalMinor} /></span>
            </button>
          </li>
        ))}
      </ul>
      {openId && <OrderDetail s={s} h={h} pack={hb.overview.pack} role={hb.overview.workspaceRole} business={hb.business} orderId={openId} timezone={hb.timezone}
        onClose={() => setOpenId(null)} onChanged={() => { load(); hb.onChanged?.(); }} />}
    </section>
  );
}
