import React, { useCallback, useEffect, useState } from 'react';
import { hasib } from '../../lib/dashboard/api';
import { useDebounced } from '../../hooks/usePolling';
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

/** Search non-IMEI stock for a part; IMEI units are sold on their own order. */
function PartSearch({ h, onPick }) {
  const [text, setText] = useState(''), [results, setResults] = useState([]), [error, setError] = useState('');
  const query = useDebounced(text.trim(), 250);
  useEffect(() => {
    let live = true;
    if (!query) { setResults([]); return undefined; }
    setError('');
    hasib('items', { search: query, limit: 8 })
      .then(r => { if (live) setResults(r.items.filter(i => i.kind === 'product' && !i.serialized).flatMap(i => i.variants.map(v => ({ id: v.id, label: `${h.name(i)}${v.options.length ? ` — ${v.options.map(o => o.value).join(' / ')}` : ''}`, onHand: v.onHand })))); })
      .catch(err => { if (live) { setResults([]); setError(h.reason(err.reason) || h.t('actionFailed')); } });
    return () => { live = false; };
  }, [query, h]);
  return (
    <div className="hb-picker">
      <label className="ld-search"><span className="ld-visually-hidden">{h.t('searchParts')}</span>
        <input type="search" value={text} placeholder={h.t('searchParts')} onChange={e => setText(e.target.value)} /></label>
      {error && <p className="ld-inline-error" role="alert">{error}</p>}
      {query && text.trim() && !error && (
        <ul className="hb-picker-list" role="list">
          {!results.length && <li className="ld-help">{h.t('noItemsFound')}</li>}
          {results.map(o => <li key={o.id}><button type="button" onClick={() => { onPick(o); setText(''); setResults([]); }}><span><bdi>{o.label}</bdi></span><span className="ld-help">{h.t('onHand', { count: o.onHand })}</span></button></li>)}
        </ul>
      )}
    </div>
  );
}

/** Quote and parts, editable until the device is ready. Saving a changed quote asks the customer to approve again. */
function QuoteEditor({ s, h, repair, onSaved }) {
  const nameOf = variantId => repair.order?.lines.find(l => l.variantId === variantId)?.name || '';
  const [labour, setLabour] = useState(formatMinor(repair.labourMinor));
  const [parts, setParts] = useState(repair.parts.map(p => ({ ...p, key: p.variantId, label: nameOf(p.variantId) })));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const labourMinor = parseAmount(labour);
  const save = async () => {
    if (labourMinor === null || busy) return;
    setBusy(true); setError('');
    try { onSaved(await hasib('repair_update', { repairId: repair.id, version: repair.version, labourMinor, parts: parts.filter(p => p.variantId && p.qty > 0).map(({ variantId, qty }) => ({ variantId, qty })) })); }
    catch (err) { setError(h.reason(err.reason) || s.reason(err.reason)); } finally { setBusy(false); }
  };
  const add = option => setParts(ps => ps.some(p => p.variantId === option.id) ? ps.map(p => p.variantId === option.id ? { ...p, qty: p.qty + 1 } : p) : [...ps, { key: option.id, variantId: option.id, qty: 1, label: option.label }]);
  return (
    <fieldset className="ld-fieldset">
      <legend>{h.t('parts')}</legend>
      <label className="ld-field">{h.t('labour')}<input className="hb-money" inputMode="decimal" dir="ltr" value={labour} aria-invalid={labourMinor === null} onChange={e => setLabour(e.target.value)} /></label>
      {parts.map((p, i) => (
        <div key={p.key} className="hb-row">
          <span className="hb-part-name"><bdi>{p.label || '—'}</bdi></span>
          <label className="ld-field">{h.t('qty')}<input className="hb-qty" inputMode="numeric" value={p.qty} onChange={e => setParts(ps => ps.map((x, j) => j === i ? { ...x, qty: Number(e.target.value.replace(/\D/g, '').slice(0, 3)) || 0 } : x))} /></label>
          <button type="button" className="ld-icon-button" aria-label={h.t('remove')} onClick={() => setParts(ps => ps.filter((_, j) => j !== i))}><span aria-hidden="true">×</span></button>
        </div>
      ))}
      <PartSearch h={h} onPick={add} />
      {repair.approvalStatus === 'approved' && <p className="ld-help">{h.t('quoteResetsApproval')}</p>}
      <div className="ld-actions">
        <button type="button" className="ld-button ld-primary" disabled={busy || labourMinor === null} onClick={save}>{busy ? h.t('saving') : h.t('saveQuote')}</button>
      </div>
      {error && <p className="ld-inline-error" role="alert">{error}</p>}
    </fieldset>
  );
}

function RepairApproval({ s, h, repair, timezone, onSaved, onConflict }) {
  const [approvedBy, setApprovedBy] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const approve = async event => {
    event.preventDefault();
    if (!approvedBy.trim() || busy) return;
    setBusy(true); setError('');
    try { await hasib('repair_approval', { repairId: repair.id, version: repair.version, approvedBy: approvedBy.trim() }); onSaved(); }
    catch (e) { setError(h.reason(e.reason) || s.reason(e.reason)); if (e.reason === 'repair_conflict') onConflict(); }
    finally { setBusy(false); }
  };
  if (repair.approvalStatus === 'approved') return <p role="status"><span className="ld-chip is-green">{h.t('approvedQuote')}</span> <bdi>{repair.approvedBy}</bdi>{repair.approvedAt && <> · {formatDateTime(repair.approvedAt, s.lang, timezone)}</>}</p>;
  if (['collected', 'cancelled'].includes(repair.status)) return <p className="ld-help">{h.t('noApproval')}</p>;
  return <form className="hb-move" onSubmit={approve}>
    <p className="ld-help">{h.t('approvalHelp')}</p>
    <label className="ld-field">{h.t('approvedByLabel')}<input value={approvedBy} onChange={e => setApprovedBy(e.target.value)} dir="auto" maxLength={100} required disabled={busy} /></label>
    <button type="submit" className="ld-button ld-primary" disabled={busy || !approvedBy.trim()}>{busy ? h.t('saving') : h.t('recordApproval')}</button>
    {error && <p className="ld-inline-error" role="alert">{error}</p>}
  </form>;
}

export function RepairDetail({ s, h, repairId, timezone, onClose, onChanged, staff = false }) {
  const [repair, setRepair] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(''), [confirming, setConfirming] = useState('');
  const load = useCallback(() => hasib('repair', { repairId }).then(setRepair).catch(e => setError(h.reason(e.reason) || s.reason(e.reason))), [repairId, h, s]);
  useEffect(() => { load(); }, [load]);
  const o = repair?.order;
  // Work starts once the customer approves; a free warranty repair needs no approval.
  const needsApproval = repair && repair.approvalStatus !== 'approved' && !(repair.underWarranty && o?.totalMinor === 0);
  const move = async (to, confirmed = false) => {
    if (busy) return;
    // Cancelling returns parts and keeps any deposit; collecting with money owed hands the device over unpaid. Both ask first.
    if (!confirmed && (to === 'cancelled' || (to === 'collected' && o?.balanceMinor > 0))) { setConfirming(to); return; }
    setBusy(to); setError('');
    try { await hasib('repair_status', { repairId, to, version: repair.version }); setConfirming(''); await load(); onChanged(); }
    catch (e) { setError(h.reason(e.reason) || s.reason(e.reason)); if (e.reason === 'repair_conflict') load(); } finally { setBusy(''); }
  };
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
          {EDITABLE.includes(repair.status) ? <QuoteEditor key={repair.version} s={s} h={h} repair={repair} onSaved={() => { load(); onChanged(); }} /> : <p className="ld-help">{h.t('repairLocked')}</p>}
          {o && <dl className="hb-totals">
            {o.lines.map((l, i) => <div key={i}><dt><bdi>{l.qty > 1 ? `${l.qty} × ` : ''}{h.lineName(l)}</bdi></dt><dd><Money h={h} minor={l.netMinor} /></dd></div>)}
            <div className="hb-grand"><dt>{h.t('total')}</dt><dd><Money h={h} minor={o.totalMinor} /></dd></div>
            <div><dt>{h.t('paid')}</dt><dd><Money h={h} minor={o.paidMinor} /></dd></div>
            <div className="hb-grand"><dt>{h.t('balance')}</dt><dd><Money h={h} minor={o.balanceMinor} /></dd></div>
          </dl>}
          <RepairApproval key={`approval-${repair.version}`} s={s} h={h} repair={repair} timezone={timezone} onSaved={() => { load(); onChanged(); }} onConflict={load} />
          {repair.next.length > 0 && <div className="ld-actions" role="group" aria-label={h.t('moveTo')}>
            {repair.next.map(to => {
              const blocked = needsApproval && ['repairing', 'ready'].includes(to);
              return <button key={to} type="button" className={`ld-button ${to === 'cancelled' ? 'ld-quiet ld-danger' : 'ld-quiet'}`} disabled={!!busy || blocked} aria-describedby={blocked ? 'hb-approval-hint' : undefined} onClick={() => move(to)}>{h.t('moveTo')}: {h.t(`rs_${to}`)}</button>;
            })}
          </div>}
          {needsApproval && repair.next.some(to => ['repairing', 'ready'].includes(to)) && <p id="hb-approval-hint" className="ld-help">{h.t('approvalFirst')}</p>}
          {confirming && <div className="hb-confirm" role="alertdialog" aria-labelledby="hb-repair-confirm">
            <p id="hb-repair-confirm">{confirming === 'cancelled' ? h.t('repairCancelConfirm', { paid: h.money(o?.paidMinor || 0) }) : h.t('repairCollectConfirm', { balance: h.money(o?.balanceMinor || 0) })}</p>
            <div className="ld-actions">
              <button type="button" className="ld-button ld-quiet" disabled={!!busy} onClick={() => setConfirming('')}>{h.t('keepOrder')}</button>
              <button type="button" className={`ld-button ${confirming === 'cancelled' ? 'ld-danger' : 'ld-primary'}`} disabled={!!busy} onClick={() => move(confirming, true)}>{h.t('moveTo')}: {h.t(`rs_${confirming}`)}</button>
            </div>
          </div>}
          {error && <p className="ld-inline-error" role="alert">{error}</p>}
          {o && <section className="hb-payments" aria-label={h.t('payments')}>
            {o.payments?.length > 0 && <ul className="ld-list">{o.payments.map(p => <li key={p.id}><Money h={h} minor={p.amountMinor} /> · {h.t(`pm_${p.method}`)}</li>)}</ul>}
            {/* Money owed can still be taken after collection; a cancelled ticket only takes a manager's refund. */}
            {(repair.status !== 'cancelled' ? (o.balanceMinor > 0 || !['collected'].includes(repair.status)) : !staff && o.paidMinor > 0) && <PaymentForm h={h} order={o} canRefund={!staff} onRecorded={() => { load(); onChanged(); }} />}
          </section>}
        </div>
      )}
    </Dialog>
  );
}
