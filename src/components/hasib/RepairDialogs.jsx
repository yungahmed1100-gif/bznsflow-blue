import React, { useCallback, useEffect, useState } from 'react';
import { hasib } from '../../lib/dashboard/api';
import { formatDateTime } from '../../lib/dashboard/format';
import { parseAmount, formatMinor } from '../../../convex/hasib/money.js';
import { dayNoon, validDate } from '../../../convex/hasib/period.js';
import { Dialog } from '../dashboard/Dialog';
import { Money } from './Badges';
import { PaymentForm } from './OrderDetail';

const EDITABLE = ['received', 'diagnosing', 'waiting_parts', 'repairing'];
export const RepairStatus = ({ h, status }) => <span className={`ld-chip ${status === 'ready' ? 'is-green' : status === 'cancelled' ? '' : status === 'collected' ? 'is-green' : 'is-yellow'}`}>{h.t(`rs_${status}`)}</span>;

/** Book a device in: what it is, what's wrong, and the quote. Warranty is checked from the IMEI. */
export function RepairForm({ s, h, timezone, onClose, onSaved }) {
  const [form, setForm] = useState({ device: '', serial: '', fault: '', accessories: '', customerName: '', quote: '', due: '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [requestId] = useState(() => crypto.randomUUID());
  const set = patch => setForm(f => ({ ...f, ...patch }));
  const quoteMinor = form.quote.trim() ? parseAmount(form.quote) : 0;
  const valid = form.device.trim() && form.fault.trim() && quoteMinor !== null;
  const save = async e => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true); setError('');
    try {
      onSaved(await hasib('repair_create', { requestId, device: form.device.trim(), fault: form.fault.trim(), ...(form.serial.trim() ? { serial: form.serial.trim() } : {}),
        ...(form.accessories.trim() ? { accessories: form.accessories.trim() } : {}), ...(form.customerName.trim() ? { customerName: form.customerName.trim() } : {}),
        ...(quoteMinor ? { quoteMinor } : {}), ...(validDate(form.due) ? { dueAt: dayNoon(form.due, timezone || 'Asia/Muscat') } : {}) }));
    } catch (err) { setError(h.reason(err.reason) || s.reason(err.reason)); setBusy(false); }
  };
  return (
    <Dialog s={s} title={h.t('newRepair')} onClose={onClose}>
      <form className="hb-move" onSubmit={save}>
        <label className="ld-field">{h.t('device')}<input value={form.device} maxLength={80} dir="auto" onChange={e => set({ device: e.target.value })} /></label>
        <label className="ld-field">{h.t('imei')}<input value={form.serial} maxLength={40} dir="ltr" onChange={e => set({ serial: e.target.value })} autoComplete="off" spellCheck={false} /></label>
        <label className="ld-field">{h.t('fault')}<textarea value={form.fault} maxLength={500} rows={3} dir="auto" onChange={e => set({ fault: e.target.value })} /></label>
        <label className="ld-field">{h.t('accessoriesLeft')}<input value={form.accessories} maxLength={200} dir="auto" onChange={e => set({ accessories: e.target.value })} /></label>
        <label className="ld-field">{h.t('customerName')}<input value={form.customerName} maxLength={80} dir="auto" onChange={e => set({ customerName: e.target.value })} /></label>
        <div className="hb-grid-2">
          <label className="ld-field">{h.t('quote')}<input className="hb-money" inputMode="decimal" dir="ltr" value={form.quote} aria-invalid={quoteMinor === null} onChange={e => set({ quote: e.target.value })} /></label>
          <label className="ld-field">{h.t('dueDate')}<input type="date" value={form.due} onChange={e => set({ due: e.target.value })} /></label>
        </div>
        {error && <p className="ld-inline-error" role="alert">{error}</p>}
        <div className="ld-actions">
          <button type="button" className="ld-button ld-quiet" onClick={onClose}>{h.t('cancel')}</button>
          <button type="submit" className="ld-button ld-primary" disabled={busy || !valid}>{busy ? h.t('saving') : h.t('save')}</button>
        </div>
      </form>
    </Dialog>
  );
}

/** Quote and parts, editable until the device is ready. Parts come from non-IMEI stock. */
function QuoteEditor({ s, h, repair, onSaved }) {
  const [labour, setLabour] = useState(formatMinor(repair.labourMinor));
  const [parts, setParts] = useState(repair.parts.map(p => ({ ...p, key: p.variantId })));
  const [options, setOptions] = useState([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    hasib('items', { limit: 50 }).then(r => setOptions(r.items.filter(i => i.kind === 'product' && !i.serialized).flatMap(i => i.variants.map(v => ({ id: v.id, label: `${h.name(i)}${v.options.length ? ` — ${v.options.map(o => o.value).join(' / ')}` : ''}`, onHand: v.onHand })))))
      .catch(() => setOptions([]));
  }, [h]);
  const labourMinor = parseAmount(labour);
  const save = async () => {
    if (labourMinor === null) return;
    setBusy(true); setError('');
    try { onSaved(await hasib('repair_update', { repairId: repair.id, version: repair.version, labourMinor, parts: parts.filter(p => p.variantId && p.qty > 0).map(({ variantId, qty }) => ({ variantId, qty })) })); }
    catch (err) { setError(h.reason(err.reason) || s.reason(err.reason)); } finally { setBusy(false); }
  };
  return (
    <fieldset className="ld-fieldset">
      <legend>{h.t('parts')}</legend>
      <label className="ld-field">{h.t('labour')}<input className="hb-money" inputMode="decimal" dir="ltr" value={labour} aria-invalid={labourMinor === null} onChange={e => setLabour(e.target.value)} /></label>
      {parts.map((p, i) => (
        <div key={p.key} className="hb-row">
          <label className="ld-field">{h.t('items')}<select value={p.variantId} onChange={e => setParts(ps => ps.map((x, j) => j === i ? { ...x, variantId: e.target.value } : x))}>
            <option value="">—</option>{options.map(o => <option key={o.id} value={o.id}>{o.label} ({h.t('onHand', { count: o.onHand })})</option>)}</select></label>
          <label className="ld-field">{h.t('qty')}<input className="hb-qty" inputMode="numeric" value={p.qty} onChange={e => setParts(ps => ps.map((x, j) => j === i ? { ...x, qty: Number(e.target.value.replace(/\D/g, '').slice(0, 3)) || 0 } : x))} /></label>
          <button type="button" className="ld-icon-button" aria-label={h.t('remove')} onClick={() => setParts(ps => ps.filter((_, j) => j !== i))}><span aria-hidden="true">×</span></button>
        </div>
      ))}
      <div className="ld-actions">
        <button type="button" className="ld-button ld-quiet" onClick={() => setParts(ps => [...ps, { key: crypto.randomUUID(), variantId: '', qty: 1 }])}>{h.t('addPart')}</button>
        <button type="button" className="ld-button ld-primary" disabled={busy || labourMinor === null} onClick={save}>{busy ? h.t('saving') : h.t('saveQuote')}</button>
      </div>
      {error && <p className="ld-inline-error" role="alert">{error}</p>}
    </fieldset>
  );
}

export function RepairDetail({ s, h, repairId, timezone, onClose, onChanged }) {
  const [repair, setRepair] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState('');
  const load = useCallback(() => hasib('repair', { repairId }).then(setRepair).catch(e => setError(h.reason(e.reason) || s.reason(e.reason))), [repairId, h, s]);
  useEffect(() => { load(); }, [load]);
  const move = async to => {
    setBusy(to); setError('');
    try { await hasib('repair_status', { repairId, to, version: repair.version }); await load(); onChanged(); }
    catch (e) { setError(h.reason(e.reason) || s.reason(e.reason)); if (e.reason === 'repair_conflict') load(); } finally { setBusy(''); }
  };
  const o = repair?.order;
  return (
    <Dialog s={s} title={repair ? h.t('repairNumber', { number: repair.number }) : h.t('loading')} onClose={onClose} wide>
      {!repair ? <p className="ld-state" role={error ? 'alert' : 'status'}>{error || h.t('loading')}</p> : (
        <div className="hb-detail">
          <p className="hb-detail-meta"><RepairStatus h={h} status={repair.status} />
            {repair.underWarranty && <span className="ld-chip is-green">{repair.warrantyBy === 'store' ? h.t('warrantyByStore') : repair.warrantyBy === 'agent' ? h.t('warrantyByAgent') : h.t('underWarranty')}</span>}
            <span><bdi>{repair.device}</bdi>{repair.serial && <> · <bdi dir="ltr" className="ld-num">{repair.serial}</bdi></>}</span>
            <span><bdi>{repair.customer?.name || repair.customerName || h.t('walkIn')}</bdi></span>
            {repair.dueAt && <span className="ld-chip is-yellow">{h.t('due', { date: formatDateTime(repair.dueAt, s.lang, timezone).split(',')[0] })}</span>}</p>
          <p><strong>{h.t('fault')}:</strong> <bdi>{repair.fault}</bdi>{repair.accessories && <> · {h.t('accessoriesLeft')}: <bdi>{repair.accessories}</bdi></>}</p>
          {EDITABLE.includes(repair.status) ? <QuoteEditor s={s} h={h} repair={repair} onSaved={() => { load(); onChanged(); }} /> : <p className="ld-help">{h.t('repairLocked')}</p>}
          {o && <dl className="hb-totals">
            {o.lines.map((l, i) => <div key={i}><dt><bdi>{l.qty > 1 ? `${l.qty} × ` : ''}{h.lineName(l)}</bdi></dt><dd><Money h={h} minor={l.netMinor} /></dd></div>)}
            <div className="hb-grand"><dt>{h.t('total')}</dt><dd><Money h={h} minor={o.totalMinor} /></dd></div>
            <div><dt>{h.t('paid')}</dt><dd><Money h={h} minor={o.paidMinor} /></dd></div>
            <div className="hb-grand"><dt>{h.t('balance')}</dt><dd><Money h={h} minor={o.balanceMinor} /></dd></div>
          </dl>}
          {repair.next.length > 0 && <div className="ld-actions" role="group" aria-label={h.t('moveTo')}>
            {repair.next.map(to => <button key={to} type="button" className={`ld-button ${to === 'cancelled' ? 'ld-quiet ld-danger' : 'ld-quiet'}`} disabled={!!busy} onClick={() => move(to)}>{h.t('moveTo')}: {h.t(`rs_${to}`)}</button>)}
          </div>}
          {error && <p className="ld-inline-error" role="alert">{error}</p>}
          {o && !['collected', 'cancelled'].includes(repair.status) && <section className="hb-payments" aria-label={h.t('payments')}>
            {o.payments?.length > 0 && <ul className="ld-list">{o.payments.map(p => <li key={p.id}><Money h={h} minor={p.amountMinor} /> · {h.t(`pm_${p.method}`)}</li>)}</ul>}
            <PaymentForm h={h} order={o} onRecorded={() => { load(); onChanged(); }} />
          </section>}
        </div>
      )}
    </Dialog>
  );
}
