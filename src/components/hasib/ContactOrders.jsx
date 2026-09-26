import React, { useEffect, useState } from 'react';
import { hasib } from '../../lib/dashboard/api';
import { useHasib } from './HasibContext';
import { Money, OrderStatus } from './Badges';

/** Order count, lifetime value and what the customer still owes, on the contact panel. */
export function ContactOrders({ contactId }) {
  const hb = useHasib();
  const [summary, setSummary] = useState(null);
  useEffect(() => {
    if (!hb) return undefined;
    let live = true;
    hasib('contact_summary', { contactId }).then(r => { if (live) setSummary(r); }).catch(() => { if (live) setSummary(null); });
    return () => { live = false; };
  }, [contactId, hb]);
  if (!hb || !summary) return null;
  const { h } = hb;
  return (
    <section className="hb-contact-orders" aria-label={h.t('orders')}>
      <h3>{h.t('orders')}</h3>
      {summary.orderCount ? <>
        <p>{h.t('ordersSummary', { count: summary.orderCount, total: h.money(summary.lifetimeMinor), balance: h.money(summary.balanceMinor) })}</p>
        <ul className="ld-list">{summary.recent.map(o => <li key={o.id}><span className="ld-num">#{o.number}</span> <OrderStatus h={h} status={o.status} /> <Money h={h} minor={o.totalMinor} /></li>)}</ul>
      </> : <p className="ld-help">{h.t('noOrdersForContact')}</p>}
    </section>
  );
}
