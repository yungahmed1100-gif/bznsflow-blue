import React, { useState } from 'react';
import { hasib, dashboard } from '../../lib/dashboard/api';
import { usePolling } from '../../hooks/usePolling';
import { zonedLocalToUtc } from '../../lib/timezone';
import { formatDateTime } from '../../lib/dashboard/format';
import { Dialog } from '../dashboard/Dialog';
import { loadWorkflowPages } from '../../lib/hasib/pagination';

export function FollowupView({ s, h, timezone = 'Asia/Muscat' }) {
  const [open, setOpen] = useState(false), [form, setForm] = useState({}), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const text = (en, ar) => h.ar ? ar : en;
  const [pages, setPages] = useState(20), [linkedPages, setLinkedPages] = useState(20);
  const linked = usePolling(async () => ({ ...await loadWorkflowPages(cursor => hasib(({ booking: 'bookings', membership: 'memberships', order: 'orders', job: 'jobs', property: 'properties' })[form.linkedType] || 'orders', { limit: 200, ...(cursor ? { cursor } : {}) }), linkedPages), type: form.linkedType }), [form.linkedType, linkedPages], { enabled: !!form.linkedType });
  const [requestIds] = useState(() => new Map());
  const state = usePolling(async () => {
    const [followups, contacts] = await Promise.all([
      loadWorkflowPages(cursor => hasib('followups', { limit: 200, ...(cursor ? { cursor } : {}) }), pages),
      loadWorkflowPages(cursor => dashboard('contacts', { limit: 50, ...(cursor ? { cursor } : {}) }), pages),
    ]);
    return { items: followups.items, contacts: contacts.items, hasMore: !!followups.cursor || !!contacts.cursor };
  }, [pages], { interval: 30000 });
  const run = async (op, body) => { if (busy) return; setBusy(true); setError(''); const key = JSON.stringify([op, body]); if (!requestIds.has(key)) requestIds.set(key, crypto.randomUUID());
    try { await hasib(op, { requestId: requestIds.get(key), ...body }); requestIds.delete(key); setOpen(false); state.refresh(); } catch (e) { setError(h.reason(e.reason) || s.reason(e.reason)); } finally { setBusy(false); } };
  return <section className="hb-panel"><div className="ld-page-head"><h2>{text('Follow-up', 'المتابعة')}</h2><button className="ld-button" onClick={() => { setForm({}); setOpen(true); }}>{text('Add follow-up', 'إضافة متابعة')}</button></div>
    {error && <p role="alert">{error}</p>}{state.error && <p role="alert">{h.reason(state.error.reason) || s.reason(state.error.reason)}</p>}
    {state.data?.hasMore && <button className="ld-button" disabled={state.loading} onClick={() => setPages(value => value + 20)}>{text('Load more records', 'تحميل المزيد من السجلات')}</button>}
    {(state.data?.items || []).filter(row => row.status !== 'completed').map(row => <div className="hb-panel" key={row.id}><b>{state.data.contacts.find(c => c.id === row.contactId)?.name}</b><p>{row.reason} · {formatDateTime(row.dueAt, s.lang, timezone)}</p><div className="ld-actions">{row.chatHref && <a className="ld-button" href={row.chatHref}>{h.t('openChats')}</a>}<button className="ld-button" disabled={busy} onClick={() => run('followup_complete', { followupId: row.id, version: row.version })}>{text('Mark done', 'تمت المتابعة')}</button></div></div>)}
    {open && <Dialog s={s} title={text('Add follow-up', 'إضافة متابعة')} onClose={() => setOpen(false)}><form onSubmit={e => { e.preventDefault(); try { run('followup_save', { contactId: form.contactId, reason: form.reason, ...(form.linkedType && form.linkedId ? { linkedType: form.linkedType, linkedId: form.linkedId } : {}), dueAt: zonedLocalToUtc(form.dueAt, timezone) }); } catch { setError(text('Enter a valid date and time.', 'أدخل تاريخاً ووقتاً صالحين.')); } }}><fieldset disabled={busy} className="hb-action-fields">{error && <p role="alert">{error}</p>}<label className="ld-field">{h.t('customer')}<select required value={form.contactId || ''} onChange={e => setForm(f => ({ ...f, contactId: e.target.value }))}><option value="">—</option>{state.data?.contacts.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label className="ld-field">{text('Linked record (optional)', 'سجل مرتبط (اختياري)')}<select value={form.linkedType || ''} onChange={e => { setLinkedPages(20); setForm(f => ({ ...f, linkedType: e.target.value, linkedId: '' })); }}><option value="">—</option>{[['booking', 'Booking', 'حجز'], ['membership', 'Membership', 'اشتراك'], ['order', 'Order', 'طلب'], ['job', 'Job', 'عمل'], ['property', 'Property', 'عقار']].map(([id, en, ar]) => <option key={id} value={id}>{text(en, ar)}</option>)}</select></label>{form.linkedType && <label className="ld-field">{text('Choose record', 'اختر السجل')}<select required value={form.linkedId || ''} onChange={e => setForm(f => ({ ...f, linkedId: e.target.value }))}><option value="">—</option>{(linked.data?.type === form.linkedType ? linked.data.items : [])?.map(row => <option key={row.id} value={row.id}>{row.title || row.label || row.name || row.serviceName || `#${row.number || row.id}`}</option>)}</select></label>}{linked.error && <p role="alert">{h.reason(linked.error.reason) || s.reason(linked.error.reason)}</p>}{form.linkedType && linked.data?.cursor && <button type="button" className="ld-button" disabled={linked.loading} onClick={() => setLinkedPages(value => value + 20)}>{text('Load more linked records', 'تحميل المزيد من السجلات المرتبطة')}</button>}<label className="ld-field">{text('Reason', 'السبب')}<input required value={form.reason || ''} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} /></label><label className="ld-field">{text('Due date', 'موعد المتابعة')} · {timezone}<input required type="datetime-local" value={form.dueAt || ''} onChange={e => setForm(f => ({ ...f, dueAt: e.target.value }))} /></label><button className="ld-button ld-primary">{h.t('save')}</button></fieldset></form></Dialog>}
  </section>;
}
