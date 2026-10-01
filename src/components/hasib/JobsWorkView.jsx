import React, { useState } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { hasib, dashboard } from '../../lib/dashboard/api';
import { zonedLocalToUtc } from '../../lib/timezone';
import { formatDateTime } from '../../lib/dashboard/format';
import { hasibPack } from '../../../config/hasib-packs';
import { Dialog } from '../dashboard/Dialog';
import { Money } from './Badges';
import { loadWorkflowPages } from '../../lib/hasib/pagination';

/** Job cards share contacts and the existing charge ledger. Real Estate has its own dashboard (RealEstateDashboard). */
export function JobsWorkView({ s, h, overview, timezone = 'Asia/Muscat', onChanged, initialCreate }) {
  const pack = hasibPack(overview.pack.id);
  const text = (en, ar) => h.ar ? ar : en;
  const [form, setForm] = useState(initialCreate ? 'job' : ''), [values, setValues] = useState({}), [selected, setSelected] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [requestIds] = useState(() => new Map());
  const [pages, setPages] = useState(20);
  const state = usePolling(async () => {
    const ops = ['jobs', 'equipment', 'items', 'orders'];
    const result = await Promise.all(ops.map(op => loadWorkflowPages(cursor => hasib(op, { limit: 200, ...(cursor ? { cursor } : {}) }), pages)));
    const contacts = await loadWorkflowPages(cursor => dashboard('contacts', { limit: 50, ...(cursor ? { cursor } : {}) }), pages);
    return { ...Object.fromEntries(ops.map((op, i) => [op, result[i].items])), contacts: contacts.items, hasMore: !!contacts.cursor || result.some(page => page.cursor) };
  }, [overview.pack.id, pages], { interval: 30000 });
  const data = state.data || {};
  const open = (name, row = null) => { setSelected(row); setValues({}); setError(''); setForm(name); };
  const run = async (op, workflow, idKey, row = selected) => {
    if (busy) return;
    setBusy(true); setError('');
    const body = { ...(row && idKey ? { [idKey]: row.id, version: row.version } : {}), workflow };
    const key = JSON.stringify([op, body]); if (!requestIds.has(key)) requestIds.set(key, crypto.randomUUID());
    try { await hasib(op, { requestId: requestIds.get(key), ...body }); requestIds.delete(key); setForm(''); state.refresh(); onChanged?.(); }
    catch (e) { setError(h.reason(e.reason) || s.reason(e.reason)); } finally { setBusy(false); }
  };
  const minor = key => Math.round(Number(values[key] || 0) * 1000), stamp = key => zonedLocalToUtc(values[key], timezone);
  const submit = e => {
    e.preventDefault();
    try {
      if (form === 'estimate') return run('job_estimate', { lines: values.lines.map(line => ({ name: line.name, qty: Number(line.qty), unitPriceMinor: Math.round(Number(line.price) * 1000), ...(line.variantId ? { variantId: line.variantId } : {}) })) }, 'jobId');
      if (form === 'approval') return run('job_approve', { estimateVersion: selected.estimates.at(-1).version, approvedBy: values.name }, 'jobId');
      if (form === 'cost') return run('job_update', { actualMinutes: Number(values.minutes || selected.actualMinutes), costs: [...selected.costs, { label: values.name, amountMinor: minor('amount') }], costsComplete: values.complete === 'yes' }, 'jobId');
      if (form === 'approve_extra') return run('job_update', { extras: selected.extras.map((extra, index) => index === values.extraIndex ? { ...extra, approved: true, approvedBy: values.name, approvedAt: Date.now() } : extra) }, 'jobId');
      if (form === 'extra') return run('job_update', { extras: [...selected.extras, { label: values.name, amountMinor: minor('amount'), approved: !!values.approvedBy, ...(values.approvedBy ? { approvedBy: values.approvedBy, approvedAt: Date.now() } : {}) }] }, 'jobId');
      if (form === 'milestone') return run('job_update', { milestones: [...selected.milestones, { label: values.name, amountMinor: minor('amount'), dueAt: stamp('dueAt'), withheld: values.withheld === 'yes', ...(values.orderId ? { orderId: values.orderId } : {}) }] }, 'jobId');
      if (form === 'equipment') return run('equipment_save', { contactId: values.contactId, label: values.name, identifier: values.identifier, ...(values.dueAt ? { nextServiceAt: stamp('dueAt') } : {}), ...(values.visits ? { visitsRemaining: Number(values.visits) } : {}) });
      return run('job_create', { title: values.name, kind: ({ automotive: 'garage', cleaning: 'cleaning', hvac: 'maintenance', construction: 'construction' })[pack.id], dueAt: stamp('dueAt'), ...(values.contactId ? { contactId: values.contactId } : {}), ...(values.equipmentId ? { equipmentId: values.equipmentId } : {}), ...(values.repeatOfId ? { repeatOfId: values.repeatOfId } : {}), ...(values.recurringDays ? { recurringDays: Number(values.recurringDays) } : {}), ...(values.amount ? { budgetMinor: minor('amount') } : {}), checklist: (values.checklist || '').split('\n').filter(Boolean).map(line => ({ text: line, done: false })) });
    } catch { setError(text('Check the date, amount and required details.', 'تحقق من التاريخ والمبلغ والتفاصيل المطلوبة.')); }
  };
  const field = (key, en, ar, type = 'text', required = true) => <label className="ld-field">{text(en, ar)}<input required={required} type={type} step={type === 'number' ? 'any' : undefined} value={values[key] || ''} onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))} /></label>;
  const select = (key, en, ar, list, required = true) => <label className="ld-field">{text(en, ar)}<select required={required} value={values[key] || ''} onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))}><option value="">—</option>{(list || []).map(row => <option key={row.id} value={row.id}>{row.name || row.label || row.title}</option>)}</select></label>;
  const contactName = id => data.contacts?.find(c => c.id === id)?.name || text('Customer', 'عميل');
  return <div className="hb-work"><div className="ld-page-head"><h1>{pack.ownerUi.work[h.ar ? 'ar' : 'en']}</h1><button className="ld-button ld-primary" onClick={() => open('job')}>{text('Add record', 'إضافة سجل')}</button></div>
    {(error || state.error) && <p role="alert">{error || h.reason(state.error.reason) || s.reason(state.error.reason)}</p>}
    {data.hasMore && <button className="ld-button" disabled={state.loading} onClick={() => setPages(value => value + 20)}>{text('Load more records', 'تحميل المزيد من السجلات')}</button>}
    <p className="ld-help">{timezone}</p>
    <>
      <div className="ld-actions">{['automotive', 'hvac'].includes(pack.id) && <button className="ld-button" onClick={() => open('equipment')}>{text('Add vehicle or equipment', 'إضافة مركبة أو جهاز')}</button>}</div>
      {(data.jobs || []).map(row => <section className="hb-panel" key={row.id}><h2>{row.title}</h2><p>{contactName(row.contactId)} · {formatDateTime(row.dueAt, s.lang, timezone)}</p><p>{text('Status', 'الحالة')}: {text(({ draft: 'Draft', awaiting_approval: 'Awaiting approval', approved: 'Approved', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled', returned: 'Reversed' })[row.status] || row.status, ({ draft: 'مسودة', awaiting_approval: 'بانتظار الموافقة', approved: 'موافق عليه', in_progress: 'قيد التنفيذ', completed: 'مكتمل', cancelled: 'ملغى', returned: 'معكوس' })[row.status] || row.status)}</p>
        {row.checklist.map((item, index) => <label key={index} className="ld-check"><input type="checkbox" disabled={busy || ['completed', 'cancelled', 'returned'].includes(row.status)} checked={item.done} onChange={e => run('job_update', { checklist: row.checklist.map((x, i) => i === index ? { ...x, done: e.target.checked } : x) }, 'jobId', row)} />{item.text}</label>)}
        <div className="ld-actions">{!['completed', 'cancelled', 'returned'].includes(row.status) && <><button className="ld-button" onClick={() => { open('estimate', row); setValues({ lines: [{ name: '', qty: '1', price: '' }] }); }}>{text('Prepare estimate', 'إعداد عرض سعر')}</button>{row.estimates.length > 0 && <button className="ld-button" onClick={() => open('approval', row)}>{text('Record customer approval', 'تسجيل موافقة العميل')}</button>}<button className="ld-button" onClick={() => open('cost', row)}>{text('Record time and cost', 'تسجيل الوقت والتكلفة')}</button>{pack.id === 'construction' && <><button className="ld-button" onClick={() => open('extra', row)}>{text('Extra work', 'عمل إضافي')}</button><button className="ld-button" onClick={() => open('milestone', row)}>{text('Milestone payment', 'دفعة مرحلة')}</button></>}{row.status === 'approved' && <button className="ld-button" disabled={busy} onClick={() => run('job_status', { status: 'in_progress' }, 'jobId', row)}>{text('Start work', 'بدء العمل')}</button>}{row.status === 'in_progress' && <button className="ld-button" disabled={busy} onClick={() => run('job_status', { status: 'completed' }, 'jobId', row)}>{text('Complete', 'إكمال')}</button>}<button className="ld-button" disabled={busy} onClick={() => run('job_status', { status: 'cancelled' }, 'jobId', row)}>{text('Cancel job', 'إلغاء العمل')}</button></>}</div>
        {row.status === 'completed' && <button className="ld-button" disabled={busy} onClick={() => run('job_status', { status: 'returned' }, 'jobId', row)}>{text('Reverse completed job', 'عكس العمل المكتمل')}</button>}
        {row.status === 'completed' && row.recurringDays > 0 && <button className="ld-button" disabled={busy} onClick={() => run('job_repeat', {}, 'jobId', row)}>{text('Schedule next visit with saved checklist', 'جدولة الزيارة القادمة بقائمة المهام المحفوظة')}</button>}
        {row.repeatLoss && <p role="status">{text('This repeat visit lost money. Review its recorded costs below.', 'هذه الزيارة المتكررة خسرت مالاً. راجع التكاليف المسجلة أدناه.')}</p>}
        {row.orderId && <a className="ld-button" href={`?tab=orders&order=${row.orderId}`}>{text('Open charge and payments', 'فتح الرسوم والدفعات')}</a>}
        <details><summary>{text('Costs and estimate history', 'التكاليف وسجل عروض الأسعار')}</summary>{row.estimates.map(estimate => <div key={estimate.version}>{text('Version', 'الإصدار')} {estimate.version}{estimate.lines.map((line, i) => <p key={i}>{line.name} × {line.qty} · <Money h={h} minor={line.unitPriceMinor} /></p>)}</div>)}{row.costs.map((cost, i) => <p key={i}>{cost.label} · <Money h={h} minor={cost.amountMinor} /></p>)}{row.extras?.map((extra, index) => <p key={index}>{extra.label} · <Money h={h} minor={extra.amountMinor} /> · {extra.approved ? text('Approved', 'موافق عليه') : ['completed', 'cancelled', 'returned'].includes(row.status) ? text('Awaiting approval', 'بانتظار الموافقة') : <button className="ld-button" onClick={() => { open('approve_extra', row); setValues({ extraIndex: index }); }}>{text('Record approval', 'تسجيل الموافقة')}</button>}</p>)}{row.milestones?.map((milestone, i) => <p key={i}>{milestone.label} · <Money h={h} minor={milestone.amountMinor} /> · {milestone.withheld ? text('Withheld', 'محتجز') : text('Due payment', 'دفعة مستحقة')}</p>)}</details>
      </section>)}
    </>
    {form && <Dialog s={s} title={text('Record details', 'تسجيل التفاصيل')} onClose={() => setForm('')}><form onSubmit={submit}><fieldset disabled={busy} className="hb-action-fields">{error && <p role="alert">{error}</p>}
      {form !== 'estimate' && field('name', form === 'approval' ? 'Approved by' : 'Description', form === 'approval' ? 'وافق عليه' : 'الوصف')}
      {['job', 'equipment'].includes(form) && select('contactId', 'Customer', 'العميل', data.contacts, form !== 'job')}
      {['cost', 'extra', 'milestone'].includes(form) && field('amount', 'Amount (OMR)', 'المبلغ (ر.ع.)', 'number')}
      {['job', 'equipment', 'milestone'].includes(form) && field('dueAt', 'Due date and time', 'التاريخ والوقت المستحق', 'datetime-local', form !== 'equipment')}
      {form === 'job' && <>{select('equipmentId', 'Vehicle or equipment', 'المركبة أو الجهاز', data.equipment, false)}{select('repeatOfId', 'Repeat fault from job', 'عطل متكرر من عمل سابق', data.jobs, false)}{field('recurringDays', 'Repeat every (days, optional)', 'يتكرر كل (أيام، اختياري)', 'number', false)}{pack.id === 'construction' && field('amount', 'Budget (OMR)', 'الميزانية (ر.ع.)', 'number', false)}<label className="ld-field">{text('Checklist (one task per line)', 'قائمة المهام (مهمة في كل سطر)')}<textarea value={values.checklist || ''} onChange={e => setValues(v => ({ ...v, checklist: e.target.value }))} /></label></>}
      {form === 'equipment' && <>{field('identifier', 'Plate or serial number', 'رقم اللوحة أو الرقم التسلسلي')}{field('visits', 'Maintenance visits remaining', 'زيارات الصيانة المتبقية', 'number', false)}</>}
      {form === 'cost' && <>{field('minutes', 'Actual minutes', 'الدقائق الفعلية', 'number', false)}{select('complete', 'All costs recorded?', 'هل سُجلت كل التكاليف؟', [{ id: 'yes', name: text('Yes', 'نعم') }, { id: 'no', name: text('No', 'لا') }])}</>}
      {form === 'extra' && field('approvedBy', 'Approved by (leave empty while waiting)', 'وافق عليه (اتركه فارغاً أثناء الانتظار)', 'text', false)}
      {form === 'milestone' && select('orderId', 'Linked milestone charge', 'رسوم المرحلة المرتبطة', data.orders?.map(row => ({ ...row, name: `#${row.number} · ${h.money(row.totalMinor)}` })), false)}
      {form === 'milestone' && select('withheld', 'Payment withheld?', 'هل الدفعة محتجزة؟', [{ id: 'yes', name: text('Yes', 'نعم') }, { id: 'no', name: text('No', 'لا') }])}
      {form === 'estimate' && <>{values.lines?.map((line, index) => <div className="hb-panel" key={index}><label className="ld-field">{text('Part from stock (optional)', 'قطعة من المخزون (اختياري)')}<select value={line.variantId || ''} onChange={e => { const variant = data.items?.flatMap(item => item.variants).find(v => v.id === e.target.value); setValues(v => ({ ...v, lines: v.lines.map((x, i) => i === index ? { ...x, variantId: e.target.value, price: variant ? String(variant.priceMinor / 1000) : x.price, name: variant ? text('Part', 'قطعة') : x.name } : x) })); }}><option value="">—</option>{data.items?.flatMap(item => item.variants.map(variant => <option key={variant.id} value={variant.id}>{h.name(item)} {variant.options.map(o => o.value).join(' / ')}</option>))}</select></label>{[['name', 'Description', 'الوصف'], ['qty', 'Quantity', 'الكمية'], ['price', 'Unit price (OMR)', 'سعر الوحدة (ر.ع.)']].map(([key, en, ar]) => <label className="ld-field" key={key}>{text(en, ar)}<input required type={key === 'name' ? 'text' : 'number'} step="any" min={key === 'qty' ? '1' : '0'} value={line[key]} onChange={e => setValues(v => ({ ...v, lines: v.lines.map((x, i) => i === index ? { ...x, [key]: e.target.value } : x) }))} /></label>)}</div>)}<button type="button" className="ld-button" onClick={() => setValues(v => ({ ...v, lines: [...v.lines, { name: '', qty: '1', price: '' }] }))}>{text('Add line', 'إضافة بند')}</button></>}
      <button className="ld-button ld-primary">{busy ? h.t('saving') : h.t('save')}</button>
    </fieldset></form></Dialog>}
  </div>;
}
