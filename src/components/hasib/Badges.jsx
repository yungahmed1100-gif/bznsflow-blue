import React from 'react';

const STATUS_TONE = { pending: 'is-yellow', confirmed: 'is-blue', ready: 'is-blue', out_for_delivery: 'is-blue', failed_delivery: 'is-coral', delivered: 'is-green', completed: 'is-green', cancelled: '', returned: 'is-coral' };
const PAY_TONE = { unpaid: 'is-coral', partial: 'is-yellow', paid: 'is-green', overpaid: 'is-yellow' };

export const OrderStatus = ({ h, status }) => <span className={`ld-chip ${STATUS_TONE[status] || ''}`}>{h.t(`st_${status}`)}</span>;
export const PaymentChip = ({ h, status }) => <span className={`ld-chip ${PAY_TONE[status] || ''}`}>{h.t(`pay_${status}`)}</span>;
// The figure is isolated left-to-right; the currency follows it in the page's own direction,
// so Arabic reads "25.000 ر.ع." instead of the bidi-scrambled ".ر.ع 25.000".
export const Money = ({ h, minor, className = '' }) => (
  Number.isFinite(minor)
    ? <span className={`ld-num hb-amount ${className}`}><bdi dir="ltr">{h.amount(minor)}</bdi><span className="hb-currency">{h.t('currency')}</span></span>
    : <span className={className}>{h.t('notEnoughRecords')}</span>
);
