import React, { useState } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { hasib } from '../../lib/dashboard/api';
import { download } from '../../lib/dashboard/exports';
import { expensesCsv } from '../../lib/hasib/exports';
import { parseAmount } from '../../../convex/hasib/money.js';
import { businessDate } from '../../../convex/hasib/period.js';
import { Dialog } from '../dashboard/Dialog';
import { Money } from './Badges';
import { EmptyState, PageHeader } from './DashboardVisuals';

const PERIODS = ['month', 'prev_month', '30d', '7d', 'today'];
const METHODS = ['cash', 'bank_transfer', 'card', 'other'];

function ExpenseForm({ s, h, overview, timezone, onClose, onSaved }) {
  const categories = overview.pack.expenseCategories.filter(c => !(c.key === 'waste' && ['restaurant', 'cafe', 'cakes'].includes(overview.pack.id)));
  const [form, setForm] = useState({ category: categories[0]?.key || 'other', amount: '', vat: '', method: 'cash', paidOn: businessDate(Date.now(), timezone || 'Asia/Muscat'), vendor: '', note: '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [requestId] = useState(() => crypto.randomUUID());
  const amountMinor = parseAmount(form.amount), vatMinor = form.vat.trim() ? parseAmount(form.vat) : 0;
  const valid = amountMinor > 0 && vatMinor !== null && vatMinor <= amountMinor && !!form.paidOn;
  const set = patch => setForm(f => ({ ...f, ...patch }));
  const save = async e => {
    e.preventDefault();
    if (!valid) { setError(h.reason('invalid_expense')); return; }
    setBusy(true); setError('');
    try {
      await hasib('expense_create', { requestId, category: form.category, amountMinor, vatMinor, method: form.method, paidOn: form.paidOn,
        ...(form.vendor.trim() ? { vendor: form.vendor.trim() } : {}), ...(form.note.trim() ? { note: form.note.trim() } : {}) });
      onSaved();
    } catch (err) { setError(h.reason(err.reason) || s.reason(err.reason)); setBusy(false); }
  };
  return (
    <Dialog s={s} title={h.t('addExpense')} onClose={onClose}>
      <form className="hb-move" onSubmit={save}>
        <label className="ld-field">{h.t('category')}<select value={form.category} onChange={e => set({ category: e.target.value })}>
          {categories.map(c => <option key={c.key} value={c.key}>{s.ar ? c.ar : c.en}</option>)}</select></label>
        <label className="ld-field">{h.t('amount')}<input className="hb-money" inputMode="decimal" dir="ltr" value={form.amount} aria-invalid={!!form.amount && amountMinor === null} onChange={e => set({ amount: e.target.value })} /></label>
        {overview.settings.vatRegistered && <label className="ld-field">{h.t('vatIncluded')}<input className="hb-money" inputMode="decimal" dir="ltr" value={form.vat} aria-invalid={vatMinor === null} onChange={e => set({ vat: e.target.value })} /></label>}
        <label className="ld-field">{h.t('method')}<select value={form.method} onChange={e => set({ method: e.target.value })}>{METHODS.map(m => <option key={m} value={m}>{h.t(`pm_${m}`)}</option>)}</select></label>
        <label className="ld-field">{h.t('expenseDate')}<input type="date" value={form.paidOn} onChange={e => set({ paidOn: e.target.value })} /></label>
        <label className="ld-field">{h.t('vendor')}<input value={form.vendor} maxLength={80} dir="auto" onChange={e => set({ vendor: e.target.value })} /></label>
        <label className="ld-field">{h.t('notes')}<input value={form.note} maxLength={200} dir="auto" onChange={e => set({ note: e.target.value })} /></label>
        {error && <p className="ld-inline-error" role="alert">{error}</p>}
        <div className="ld-actions">
          <button type="button" className="ld-button ld-quiet" onClick={onClose}>{h.t('cancel')}</button>
          <button type="submit" className="ld-button ld-primary" disabled={busy || !valid}>{busy ? h.t('saving') : h.t('save')}</button>
        </div>
      </form>
    </Dialog>
  );
}

/** Expenses for a period, with void (never delete) and an accountant CSV. */
export function ExpensesView({ s, h, overview, timezone, initialCreate = false }) {
  const [period, setPeriod] = useState('month'), [adding, setAdding] = useState(initialCreate), [voiding, setVoiding] = useState(null), [notice, setNotice] = useState('');
  const list = usePolling(() => hasib('expenses', { period }), [period], { interval: 60000 });
  const items = list.data?.items || [];
  const label = key => { const c = overview.pack.expenseCategories.find(x => x.key === key); return c ? (s.ar ? c.ar : c.en) : key; };
  const total = items.filter(e => !e.voided).reduce((n, e) => n + e.amountMinor, 0);
  const [voidBusy, setVoidBusy] = useState(false);
  const voidNow = async id => {
    if (voidBusy) return;
    setVoidBusy(true); setNotice('');
    try { await hasib('expense_void', { expenseId: id }); setVoiding(null); list.refresh({ quiet: true }); } catch (e) { setNotice(h.reason(e.reason) || s.reason(e.reason)); }
    finally { setVoidBusy(false); }
  };
  return (
    <div className="hb-expenses">
      <PageHeader title={h.t('expenses')} description={s.ar ? 'سجّل تكاليف النشاط وحافظ على سجل قابل للمراجعة.' : 'Record operating costs and keep an auditable ledger.'} icon="receipt" primary={{ label: h.t('addExpense'), onClick: () => setAdding(true) }}>
        <div className="ld-toolbar">
          <label><span className="ld-visually-hidden">{h.t('period')}</span>
            <select value={period} onChange={e => setPeriod(e.target.value)}>{PERIODS.map(p => <option key={p} value={p}>{h.t(`period_${p}`)}</option>)}</select></label>
          <button type="button" className="ld-button ld-quiet" disabled={!items.length} onClick={() => download(`expenses-${list.data?.range?.fromDate || period}.csv`, expensesCsv(items), 'text/csv;charset=utf-8')}>{h.t('exportCsv')}</button>
        </div>
      </PageHeader>
      {notice && <p className="ld-inline-error" role="alert">{notice}</p>}
      {voiding && <div className="hb-confirm" role="alert"><p>{h.t('voidConfirm')}</p>
        <button type="button" className="ld-button ld-danger" disabled={voidBusy} onClick={() => voidNow(voiding)}>{h.t('voidExpense')}</button>
        <button type="button" className="ld-button ld-quiet" disabled={voidBusy} onClick={() => setVoiding(null)}>{h.t('cancel')}</button></div>}
      {list.loading && !list.data ? <p className="ld-state" role="status">{h.t('loading')}</p>
        : list.error && !list.data ? <div className="ld-state" role="alert"><p>{h.reason(list.error.reason) || s.reason(list.error.reason)}</p><button type="button" className="ld-button" onClick={() => list.refresh()}>{h.t('retry')}</button></div>
        : !items.length ? <EmptyState icon="receipt" title={h.t('noExpenses')} description={s.ar ? 'سجّل أول مصروف ليظهر ضمن الربح والتقارير.' : 'Record the first expense so it appears in profit and reporting.'} action={{ label: h.t('addExpense'), onClick: () => setAdding(true) }} />
        : (
          <div className="ld-table-wrap">
            <table className="ld-table">
              <thead><tr><th scope="col">{h.t('expenseDate')}</th><th scope="col">{h.t('category')}</th><th scope="col">{h.t('paidTo')}</th><th scope="col">{h.t('method')}</th><th scope="col" className="hb-num-col">{h.t('amountCol')}</th><th scope="col"><span className="ld-visually-hidden">{h.t('voidExpense')}</span></th></tr></thead>
              <tbody>{items.map(e => (
                <tr key={e.id} className={e.voided ? 'is-voided' : ''}>
                  <td className="ld-num">{e.paidOn}</td>
                  <td>{label(e.category)}{e.voided && <span className="ld-chip">{h.t('voided')}</span>}</td>
                  <td><bdi>{e.vendor}</bdi>{e.note && <span className="ld-help"> · <bdi>{e.note}</bdi></span>}</td>
                  <td>{h.t(`pm_${e.method}`)}</td>
                  <td className="hb-num-col"><Money h={h} minor={e.amountMinor} /></td>
                  <td>{!e.voided && <button type="button" className="ld-button ld-quiet ld-compact" onClick={() => setVoiding(e.id)}>{h.t('voidExpense')}</button>}</td>
                </tr>
              ))}</tbody>
              <tfoot><tr><th scope="row" colSpan={4}>{h.t('expenseTotal')}</th><td className="hb-num-col"><Money h={h} minor={total} /></td><td /></tr></tfoot>
            </table>
          </div>
        )}
      {adding && <ExpenseForm s={s} h={h} overview={overview} timezone={timezone} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); list.refresh({ quiet: true }); }} />}
    </div>
  );
}
