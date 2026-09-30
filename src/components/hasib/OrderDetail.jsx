import React, { useCallback, useEffect, useState } from 'react';
import { hasib } from '../../lib/dashboard/api';
import { formatDateTime } from '../../lib/dashboard/format';
import { parseAmount } from '../../../convex/hasib/money.js';
import { nextStatuses } from '../../../convex/hasib/orderMachine.js';
import { receiptText } from '../../lib/hasib/exports';
import { SerialPicker } from './OrderComposer';
import { Dialog } from '../dashboard/Dialog';
import { Money, OrderStatus, PaymentChip } from './Badges';

const METHODS = ['cash', 'bank_transfer', 'cod', 'card', 'payment_link', 'other'];

export function PaymentForm({ h, order, onRecorded, canRefund = true }) {
  const [amount, setAmount] = useState(''), [method, setMethod] = useState(order.fulfilment.type === 'delivery' ? 'cod' : 'cash');
  const [reference, setReference] = useState(''), [refund, setRefund] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const minor = parseAmount(amount);
  const submit = async e => {
    e.preventDefault();
    if (!minor) { setError(h.t('invalidAmount')); return; }
    setBusy(true); setError('');
    try {
      const r = await hasib('payment_record', { requestId, orderId: order.id, amountMinor: refund ? -minor : minor, method, ...(reference.trim() ? { reference: reference.trim() } : {}) });
      setAmount(''); setReference(''); setRefund(false); setRequestId(crypto.randomUUID());
      onRecorded(r.order);
    } catch (err) { setError(h.reason(err.reason) || h.t('actionFailed')); } finally { setBusy(false); }
  };
  return (
    <form className="hb-payment" onSubmit={submit}>
      <h3>{h.t('recordPayment')}</h3>
      <label className="ld-field">{h.t('amount')}<input className="hb-money" inputMode="decimal" dir="ltr" value={amount} placeholder={order.balanceMinor > 0 ? h.amount(order.balanceMinor) : ''} onChange={e => setAmount(e.target.value)} /></label>
      <label className="ld-field">{h.t('method')}<select value={method} onChange={e => setMethod(e.target.value)}>{METHODS.map(m => <option key={m} value={m}>{h.t(`pm_${m}`)}</option>)}</select></label>
      <label className="ld-field">{h.t('reference')}<input value={reference} maxLength={80} dir="auto" onChange={e => setReference(e.target.value)} /></label>
      {canRefund && order.paidMinor > 0 && <label className="ld-check"><input type="checkbox" checked={refund} onChange={e => setRefund(e.target.checked)} /> {h.t('refund')}</label>}
      {error && <p className="ld-inline-error" role="alert">{error}</p>}
      <button type="submit" className="ld-button ld-primary" disabled={busy}>{h.t('recordPayment')}</button>
    </form>
  );
}

/** One order: lines, totals, the statuses it may move to, and its payments. */
export function OrderDetail({ s, h, pack, business, orderId, timezone, onClose, onChanged, onExchange, role = 'manager' }) {
  const fieldLabel = key => { const f = pack.orderFields.find(x => x.key === key); return f ? (s.ar ? f.ar : f.en) : key; };
  const [order, setOrder] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(''), [copied, setCopied] = useState(false);
  const [newTask, setNewTask] = useState('');
  const [picking, setPicking] = useState(null), [returnTo, setReturnTo] = useState(''), [disposition, setDisposition] = useState('');
  // Cancelling or returning puts stock back and closes the order, so it asks once before it happens.
  const [confirming, setConfirming] = useState('');
  const food = ['restaurant', 'cafe', 'cakes'].includes(pack.id);
  const load = useCallback(() => hasib('order', { orderId }).then(setOrder).catch(e => setError(h.reason(e.reason) || s.reason(e.reason))), [orderId, h, s]);
  useEffect(() => { load(); }, [load]);

  // IMEI lines Layla filed without units: the owner picks them before confirming.
  const unitsNeeded = o => o.lines.filter(l => l.serialized && (l.serials?.length || 0) < l.qty);
  const move = async (to, lineSerials, chosenDisposition, confirmed = false) => {
    if (busy) return;
    if (food && ['cancelled', 'returned'].includes(to) && !chosenDisposition) { setReturnTo(to); setDisposition(''); return; }
    if (!food && ['cancelled', 'returned'].includes(to) && !confirmed) { setConfirming(to); return; }
    if (to === 'confirmed' && !lineSerials && unitsNeeded(order).length) { setPicking(Object.fromEntries(unitsNeeded(order).map(l => [l.variantId, []]))); return; }
    setBusy(to); setError('');
    try { setOrder({ ...(await hasib('order_status', { orderId, to, version: order.version, ...(chosenDisposition ? { disposition: chosenDisposition } : {}), ...(lineSerials ? { lineSerials } : {}) })), payments: order.payments }); setPicking(null); setReturnTo(''); setConfirming(''); onChanged(); }
    catch (e) { setError(h.reason(e.reason) || s.reason(e.reason)); if (e.reason === 'order_conflict') load(); } finally { setBusy(''); }
  };

  const savePreparation = async checklist => {
    setBusy('preparation'); setError('');
    try { const next = await hasib('order_preparation', { orderId, version: order.version, checklist }); setOrder(current => ({ ...current, ...next })); setNewTask(''); onChanged(); }
    catch (e) { setError(h.reason(e.reason) || s.reason(e.reason)); } finally { setBusy(''); }
  };

  const copyReceipt = async () => {
    try { await navigator.clipboard.writeText(receiptText(order, h, business)); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setError(s.reason('copy_failed')); }
  };
  // The replacement order is created first; the original is marked returned only once it exists.
  const exchange = () => {
    if (food) { setReturnTo('returned'); setDisposition(''); return; }
    onExchange(order);
  };
  return (
    <Dialog s={s} title={order ? h.t('orderNumber', { number: order.number }) : h.t('loading')} onClose={onClose} wide>
      {!order ? <p className="ld-state" role={error ? 'alert' : 'status'}>{error || h.t('loading')}</p> : (
        <div className="hb-detail">
          <p className="hb-detail-meta">
            <OrderStatus h={h} status={order.status} /> <PaymentChip h={h} status={order.paymentStatus} />
            {order.stockShort && <span className="ld-chip is-coral">{h.t('stockShort')}</span>}
            <span>{h.t(`ch_${order.channel}`)} · {h.t(`ful_${order.fulfilment.type}`)}{order.fulfilment.area ? ` · ${order.fulfilment.area}` : ''}</span>
            <span><bdi>{order.contact?.name || order.customerName || h.t('walkIn')}</bdi></span>
            {order.fulfilment.dueAt && <span className="ld-chip is-yellow">{h.t('due', { date: formatDateTime(order.fulfilment.dueAt, s.lang, timezone) })}</span>}
            <button type="button" className="ld-button ld-quiet ld-compact" onClick={copyReceipt} aria-live="polite">{copied ? h.t('copied') : h.t('copyReceipt')}</button>
          </p>
          <table className="ld-table hb-lines">
            <thead><tr><th scope="col">{h.t('items')}</th><th scope="col">{h.t('qty')}</th><th scope="col">{h.t('unitPrice')}</th><th scope="col">{h.t('total')}</th></tr></thead>
            <tbody>{order.lines.map((l, i) => <tr key={i}><td><bdi>{h.lineName(l)}</bdi>{l.serials?.length > 0 && <span className="hb-line-serials">{l.serials.map(x => <bdi key={x} dir="ltr" className="ld-num">{x}</bdi>)}</span>}{l.warrantyUntil && <span className="ld-help"> · {h.t('warrantyActive', { date: formatDateTime(l.warrantyUntil, s.lang, timezone).split(',')[0], days: Math.max(0, Math.ceil((l.warrantyUntil - Date.now()) / 86400000)) })}</span>}</td><td className="ld-num">{l.qty}</td><td><Money h={h} minor={l.unitPriceMinor} /></td><td><Money h={h} minor={l.netMinor} /></td></tr>)}</tbody>
          </table>
          <dl className="hb-totals">
            <div><dt>{h.t('subtotal')}</dt><dd><Money h={h} minor={order.subtotalMinor} /></dd></div>
            {order.discountMinor > 0 && <div><dt>{h.t('discount')}</dt><dd><Money h={h} minor={-order.discountMinor} /></dd></div>}
            {order.deliveryMinor > 0 && <div><dt>{h.t('delivery')}</dt><dd><Money h={h} minor={order.deliveryMinor} /></dd></div>}
            {order.vatMinor > 0 && <div><dt>{h.t('vat')}{order.pricesIncludeVat ? ` · ${h.t('pricesIncludeVat')}` : ''}</dt><dd><Money h={h} minor={order.vatMinor} /></dd></div>}
            <div className="hb-grand"><dt>{h.t('total')}</dt><dd><Money h={h} minor={order.totalMinor} /></dd></div>
            <div><dt>{h.t('paid')}</dt><dd><Money h={h} minor={order.paidMinor} /></dd></div>
            <div className="hb-grand"><dt>{h.t('balance')}</dt><dd><Money h={h} minor={order.balanceMinor} /></dd></div>
          </dl>
          {order.customFields.length > 0 && <dl className="ld-names">{order.customFields.map(f => <div key={f.key}><dt>{fieldLabel(f.key)}</dt><dd><bdi>{f.value}</bdi></dd></div>)}</dl>}
          {pack.id === 'cakes' && <section className="hb-panel"><h3>{h.ar ? 'تحضير الكيك' : 'Cake preparation'}</h3>
            {(order.preparationChecklist || []).map((task, index) => <label className="ld-check" key={index}><input type="checkbox" disabled={!!busy} checked={task.done} onChange={e => savePreparation(order.preparationChecklist.map((row, i) => i === index ? { ...row, done: e.target.checked } : row))} />{task.text}</label>)}
            <label className="ld-field">{h.ar ? 'مهمة تحضير' : 'Preparation task'}<input value={newTask} maxLength="160" onChange={e => setNewTask(e.target.value)} /></label>
            <button type="button" className="ld-button" disabled={!!busy || !newTask.trim()} onClick={() => savePreparation([...(order.preparationChecklist || []), { text: newTask.trim(), done: false }])}>{h.ar ? 'إضافة مهمة' : 'Add task'}</button>
          </section>}
          {order.notes && <p className="ld-help"><bdi>{order.notes}</bdi></p>}
          {order.flags?.map(f => <p key={f} className="hb-flag" role="note">{h.t(`flag_${f}`)}</p>)}
          {order.kind === 'repair' && <p className="ld-help"><a className="ld-link" href="?tab=service">{h.t('repairOrderHelp')}</a></p>}
          {!order.linkedJobId && order.kind !== 'repair' && nextStatuses(order.status).length > 0 && (
            <div className="ld-actions" role="group" aria-label={h.t('moveTo')}>
              {['delivered', 'completed'].includes(order.status) && onExchange && (
                <button type="button" className="ld-button ld-quiet" disabled={!!busy} onClick={exchange} title={h.t('exchangeHelp')} aria-describedby="hb-exchange-help">{h.t('exchange')}</button>
              )}
              {nextStatuses(order.status).map(to => (
                <button key={to} type="button" className={`ld-button ${to === 'cancelled' || to === 'returned' || to === 'failed_delivery' ? 'ld-quiet ld-danger' : 'ld-quiet'}`} disabled={!!busy} onClick={() => move(to)}>
                  {h.t('moveTo')}: {h.t(`st_${to}`)}
                </button>
              ))}
            </div>
          )}
          {!order.linkedJobId && order.kind !== 'repair' && ['delivered', 'completed'].includes(order.status) && onExchange && <p id="hb-exchange-help" className="ld-help">{h.t('exchangeHelp')}</p>}
          {order.linkedJobId && <a className="ld-button" href={`?tab=orders&job=${order.linkedJobId}`}>{h.ar ? 'حدّث الحالة في الأعمال' : 'Update status in Jobs'}</a>}
          {confirming && <div className="hb-confirm" role="alertdialog" aria-labelledby="hb-confirm-text">
            <p id="hb-confirm-text">{h.t(confirming === 'cancelled' ? 'cancelConfirm' : 'returnConfirm', { number: order.number })}</p>
            <div className="ld-actions">
              <button type="button" className="ld-button ld-quiet" disabled={!!busy} onClick={() => setConfirming('')}>{h.t('keepOrder')}</button>
              <button type="button" className="ld-button ld-danger" disabled={!!busy} onClick={() => move(confirming, null, undefined, true)}>{h.t('moveTo')}: {h.t(`st_${confirming}`)}</button>
            </div>
          </div>}
          {returnTo && <fieldset className="ld-fieldset"><legend>{h.ar ? 'ماذا حدث للطعام؟' : 'What happened to the food?'}</legend>
            <label className="ld-field">{h.ar ? 'اختر قبل إعادة المخزون' : 'Choose before adjusting stock'}<select value={disposition} onChange={e => setDisposition(e.target.value)}><option value="">—</option><option value="discard">{h.ar ? 'تخلص منه؛ غير قابل للبيع' : 'Discard; cannot be sold'}</option><option value="restock">{h.ar ? 'أؤكد أنه صالح لإعادته للبيع' : 'I confirm it can be sold again'}</option></select></label>
            <button className="ld-button" disabled={!disposition || !!busy} onClick={() => move(returnTo, null, disposition)}>{h.t('save')}</button>
          </fieldset>}
          {picking && <fieldset className="ld-fieldset"><legend>{h.t('pickToConfirm')}</legend>
            {unitsNeeded(order).map(l => (
              <div key={l.variantId}><p><bdi>{h.lineName(l)}</bdi> · {h.t('imeiNeeded', { count: l.qty - (l.serials?.length || 0), name: '' }).replace(/\s*(for|لـ)\s*$/, '')}</p>
                <SerialPicker h={h} variantId={l.variantId} picked={picking[l.variantId] || []} onChange={list => setPicking(p => ({ ...p, [l.variantId]: list }))} /></div>
            ))}
            <div className="ld-actions">
              <button type="button" className="ld-button ld-quiet" onClick={() => setPicking(null)}>{h.t('cancel')}</button>
              <button type="button" className="ld-button ld-primary" disabled={!!busy || unitsNeeded(order).some(l => (picking[l.variantId] || []).length !== l.qty - (l.serials?.length || 0))}
                onClick={() => move('confirmed', Object.entries(picking).map(([variantId, serials]) => ({ variantId, serials })))}>{h.t('confirmOrder')}</button>
            </div>
          </fieldset>}
          {error && <p className="ld-inline-error" role="alert">{error}</p>}
          <section className="hb-payments" aria-labelledby="hb-payments-title">
            <h3 id="hb-payments-title">{h.t('payments')}</h3>
            {order.payments?.length ? <ul className="ld-list">{order.payments.map(p => (
              <li key={p.id}><Money h={h} minor={p.amountMinor} /> · {h.t(`pm_${p.method}`)}{p.reference ? ` · ${p.reference}` : ''} · <span className="ld-help">{formatDateTime(p.at, s.lang, timezone)}</span></li>
            ))}</ul> : <p className="ld-help">{h.t('noPayments')}</p>}
            <PaymentForm h={h} order={order} canRefund={role !== 'employee'} onRecorded={next => { setOrder(o => ({ ...next, payments: o.payments })); load(); onChanged(); }} />
          </section>
          <details className="hb-history"><summary>{h.t('history')}</summary>
            <ol>{order.history.map((e, i) => <li key={i}>{h.t(`st_${e.status}`)} · {formatDateTime(e.at, s.lang, timezone)}</li>)}</ol>
          </details>
        </div>
      )}
    </Dialog>
  );
}
