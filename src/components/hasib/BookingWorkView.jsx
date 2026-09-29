import React, { useEffect, useState } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { hasib, dashboard } from '../../lib/dashboard/api';
import { formatLocal, zonedLocalToUtc } from '../../lib/timezone';
import { formatDateTime } from '../../lib/dashboard/format';
import { hasibPack } from '../../../config/hasib-packs';
import { Dialog } from '../dashboard/Dialog';
import { loadWorkflowPages } from '../../lib/hasib/pagination';
import { ActionCards, EmptyState, PageHeader } from './DashboardVisuals';

const STATES = { scheduled: ['confirmed', 'cancelled'], confirmed: ['arrived', 'missed', 'cancelled'], arrived: ['completed', 'cancelled'], completed: ['cancelled'], missed: [], cancelled: [] };
const words = { scheduled: ['Scheduled', 'مجدول'], confirmed: ['Confirmed', 'مؤكد'], arrived: ['Arrived', 'وصل'], completed: ['Completed', 'مكتمل'], missed: ['Missed', 'فائت'], cancelled: ['Cancelled', 'ملغى'] };
const shiftDate = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const defaultDates = timezone => {
  const today = formatLocal(Date.now(), timezone).slice(0, 10);
  return { from: shiftDate(today, -7), to: shiftDate(today, 30) };
};

/** Operational reception and lesson roster; all writes use the shared API contract. */
export function BookingWorkView({ s, h, overview, timezone = 'Asia/Muscat', onChanged, initialCreate, initialAction = '' }) {
  const pack = hasibPack(overview.pack.id), entitlements = ['memberships', 'lessons'].includes(pack.ownerUi.workflow);
  const text = (en, ar) => h.ar ? ar : en;
  const [form, setForm] = useState(initialAction === 'setup' ? 'provider' : initialCreate ? 'booking' : ''), [values, setValues] = useState({}), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [requestIds] = useState(() => new Map());
  const [pickerPages, setPickerPages] = useState(20);
  const [dates, setDates] = useState(() => defaultDates(timezone)), [allHistory, setAllHistory] = useState(false);
  const [pages, setPages] = useState(1), [revision, setRevision] = useState(0);
  const [bookings, setBookings] = useState({ key: '', items: [], cursor: null, loading: true, error: null });
  const rangeKey = JSON.stringify([overview.pack.id, timezone, dates.from, dates.to, allHistory, revision]);
  const validDates = allHistory || (!!dates.from && !!dates.to && dates.from <= dates.to);
  useEffect(() => {
    if (!validDates) return;
    let active = true, inFlight = false;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      setBookings(previous => ({ ...(previous.key === rangeKey ? previous : { key: rangeKey, items: [], cursor: null }), loading: true, error: null }));
      try {
        const range = allHistory ? {} : { fromAt: zonedLocalToUtc(`${dates.from}T00:00`, timezone), toAt: zonedLocalToUtc(`${shiftDate(dates.to, 1)}T00:00`, timezone) };
        const items = [], ids = new Set();
        let cursor;
        // Refresh the pages already visible together so status changes never leave stale rows.
        for (let page = 0; page < pages; page++) {
          const result = await hasib('bookings', { ...range, limit: 50, ...(cursor ? { cursor } : {}) });
          if (!active) return;
          for (const row of result.items || []) if (!ids.has(row.id)) { ids.add(row.id); items.push(row); }
          cursor = result.cursor;
          if (!cursor) break;
        }
        if (active) setBookings({ key: rangeKey, items, cursor, loading: false, error: null });
      } catch (error) {
        if (active) setBookings(previous => ({ ...previous, key: rangeKey, loading: false, error }));
      } finally { inFlight = false; }
    };
    load();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 30000);
    return () => { active = false; clearInterval(timer); };
  }, [overview.pack.id, timezone, dates.from, dates.to, allHistory, pages, revision, rangeKey, validDates]);
  const state = usePolling(async () => {
    const ops = ['services', 'resources', 'waitlist', 'orders', ...(entitlements ? ['memberships'] : [])];
    const result = await Promise.all(ops.map(op => loadWorkflowPages(cursor => hasib(op, { limit: 200, ...(cursor ? { cursor } : {}) }), pickerPages)));
    const contacts = await loadWorkflowPages(cursor => dashboard('contacts', { limit: 50, ...(cursor ? { cursor } : {}) }), pickerPages);
    return { ...Object.fromEntries(ops.map((op, i) => [op, result[i].items])), contacts: contacts.items, hasMore: !!contacts.cursor || result.some(page => page.cursor) };
  }, [overview.pack.id, pickerPages], { interval: 30000 });
  const data = state.data || {}, rows = validDates && bookings.key === rangeKey ? bookings.items : [];
  const bookingLoading = validDates && (bookings.key !== rangeKey || bookings.loading);
  const setDate = (key, value) => { setDates(current => ({ ...current, [key]: value })); setPages(1); };
  const open = name => { setError(''); setValues({}); setForm(name); };
  const change = (key, value) => setValues(v => ({ ...v, [key]: value }));
  const run = async (op, body) => {
    if (busy) return;
    setBusy(true); setError('');
    const key = JSON.stringify([op, body]); if (!requestIds.has(key)) requestIds.set(key, crypto.randomUUID());
    try { await hasib(op, { requestId: requestIds.get(key), ...body }); requestIds.delete(key); setForm(''); setPages(1); setRevision(value => value + 1); state.refresh(); onChanged?.(); }
    catch (e) { setError(h.reason(e.reason) || s.reason(e.reason)); }
    finally { setBusy(false); }
  };
  const stamp = key => zonedLocalToUtc(values[key], timezone);
  const submit = e => {
    e.preventDefault();
    try {
      if (form === 'provider') return run('resource_save', { name: values.name, kind: values.kind || 'provider', capacity: Number(values.capacity || 1) });
      if (form === 'service') return run('service_save', { name: values.name, durationMinutes: Number(values.duration || 30), resourceIds: values.resourceIds || [] });
      if (form === 'membership') return run('membership_create', { contactId: values.contactId, ...(values.guardianId ? { guardianId: values.guardianId } : {}), name: values.name, ...(values.orderId ? { orderId: values.orderId } : {}), kind: pack.ownerUi.workflow === 'lessons' ? 'lessons' : 'membership', startsAt: stamp('startsAt'), endsAt: stamp('endsAt'), ...(values.credits ? { credits: Number(values.credits) } : {}) });
      if (form === 'waitlist') return run('waitlist_add', { contactId: values.contactId, serviceId: values.serviceId, earliestAt: stamp('startsAt'), latestAt: stamp('endsAt') });
      if (form === 'refill') return run('waitlist_book', { waitlistId: values.id, version: values.version, startsAt: stamp('startsAt') });
      if (form === 'reschedule') return run('booking_update', { bookingId: values.id, version: values.version, startsAt: stamp('startsAt') });
      if (form === 'renew') return run('membership_update', { membershipId: values.id, version: values.version, endsAt: stamp('endsAt') });
      return run('booking_create', { contactId: values.contactId, serviceId: values.serviceId, startsAt: stamp('startsAt'), ...(values.orderId ? { orderId: values.orderId } : {}), ...(values.membershipId ? { membershipId: values.membershipId } : {}) });
    } catch { setError(text('Enter a valid business date and time.', 'أدخل تاريخاً ووقتاً صالحين بتوقيت العمل.')); }
  };
  const field = (key, en, ar, type = 'text', required = true) => <label className="ld-field">{text(en, ar)}<input required={required} type={type} min={type === 'number' ? '1' : undefined} value={values[key] || ''} onChange={e => change(key, e.target.value)} /></label>;
  const select = (key, en, ar, list, required = true) => <label className="ld-field">{text(en, ar)}<select required={required} value={values[key] || ''} onChange={e => change(key, e.target.value)}><option value="">—</option>{(list || []).map(row => <option key={row.id} value={row.id}>{row.name || row.nameEn || row.id}</option>)}</select></label>;
  const contactName = id => data.contacts?.find(c => c.id === id)?.name || text('Customer', 'عميل');
  return <div className="hb-work">
    <PageHeader title={pack.ownerUi.work[h.ar ? 'ar' : 'en']} description={text('A clear daily agenda with visit status and next actions.', 'جدول يومي واضح مع حالة الزيارة والإجراء التالي.')} icon={pack.dashboard.icon} primary={{ label: text('Add booking', 'إضافة حجز'), icon: 'plus', onClick: () => open('booking') }} />
    <ActionCards label={text('Visit actions', 'إجراءات الزيارات')} actions={[{ id: 'visit', label: text('Add visit', 'إضافة زيارة'), icon: 'calendar', onClick: () => open('booking') }, { id: 'provider', label: text('Add provider or room', 'إضافة مقدم خدمة أو غرفة'), icon: 'users', onClick: () => open('provider') }, { id: 'service', label: text('Add service', 'إضافة خدمة'), icon: 'tooth', onClick: () => open('service') }, { id: 'waitlist', label: text('Cancellation list', 'قائمة الإلغاءات'), icon: 'repeat', onClick: () => open('waitlist') }]} />
    <p className="ld-help">{text('Times use your business timezone:', 'الأوقات حسب توقيت عملك:')} <bdi>{timezone}</bdi></p>
    <div className="ld-actions">
      <label className="ld-field">{text('From date', 'من تاريخ')}<input type="date" value={dates.from} disabled={allHistory} onChange={e => setDate('from', e.target.value)} /></label>
      <label className="ld-field">{text('Through date', 'حتى تاريخ')}<input type="date" value={dates.to} min={dates.from} disabled={allHistory} onChange={e => setDate('to', e.target.value)} /></label>
      <label className="ld-check"><input type="checkbox" checked={allHistory} onChange={e => { setAllHistory(e.target.checked); setPages(1); }} />{text('Show all history', 'عرض السجل كاملاً')}</label>
    </div>
    {!validDates && <p role="alert">{text('Choose a start date and an end date on or after it.', 'اختر تاريخ بداية وتاريخ نهاية في اليوم نفسه أو بعده.')}</p>}
    {bookings.error && <p role="alert">{h.reason(bookings.error.reason) || s.reason(bookings.error.reason)} <button className="ld-button" onClick={() => setRevision(value => value + 1)}>{h.t('retry')}</button></p>}
    <div className="ld-actions"><button className="ld-button" onClick={() => open('waitlist')}>{text('Add to cancellation list', 'إضافة لقائمة ملء الإلغاءات')}</button>{entitlements && <button className="ld-button" onClick={() => open('membership')}>{text('Add membership or lessons', 'إضافة اشتراك أو دروس')}</button>}</div>
    {error && <p role="alert" className="ld-inline-error">{error}</p>}
    {state.error && <p role="alert">{h.reason(state.error.reason) || s.reason(state.error.reason)}</p>}
    {data.hasMore && <button className="ld-button" disabled={state.loading} onClick={() => setPickerPages(value => value + 20)}>{text('Load more customers and setup records', 'تحميل المزيد من العملاء وسجلات الإعداد')}</button>}
    {bookingLoading && !rows.length ? <p role="status">{h.t('loading')}</p> : !rows.length ? <EmptyState icon="calendar" title={text('No visits in these dates', 'لا توجد زيارات في هذه الفترة')} description={text('Change the dates or add the first visit to build the agenda.', 'غيّر التواريخ أو أضف أول زيارة لبناء الجدول.')} action={{ label: text('Add visit', 'إضافة زيارة'), onClick: () => open('booking') }} /> : <ul className="hb-work-list">{rows.map(row => <li key={row.id} className="hb-panel"><h2>{contactName(row.contactId)}</h2><p>{data.services?.find(service => service.id === row.serviceId)?.name} · {formatDateTime(row.startsAt, s.lang, timezone)}</p><p>{text(...(words[row.status] || [row.status, row.status]))}</p><div className="ld-actions">{(STATES[row.status] || []).map(to => <button className="ld-button" disabled={busy} key={to} onClick={() => run('booking_status', { bookingId: row.id, version: row.version, to })}>{text(...words[to])}</button>)}{['scheduled', 'confirmed'].includes(row.status) && <button className="ld-button" onClick={() => { setValues({ id: row.id, version: row.version }); setForm('reschedule'); }}>{text('Reschedule', 'تغيير الموعد')}</button>}{row.orderId && <a className="ld-button" href={`?tab=orders&order=${row.orderId}`}>{text('Open charge and payments', 'فتح الرسوم والدفعات')}</a>}</div>{row.status === 'completed' && <button className="ld-button" onClick={() => { setValues({ contactId: row.contactId, serviceId: row.serviceId, membershipId: row.membershipId }); setForm('booking'); }}>{text('Book their next visit', 'حجز الزيارة القادمة')}</button>}</li>)}</ul>}
    {bookings.key === rangeKey && bookings.cursor && <button className="ld-button" disabled={bookingLoading} onClick={() => setPages(value => value + 1)}>{bookingLoading ? h.t('loading') : text('Load more', 'تحميل المزيد')}</button>}
    {!!data.waitlist?.length && <section><h2>{text('Fill a cancelled slot', 'ملء موعد ملغى')}</h2>{data.waitlist.filter(row => row.status === 'waiting').map(row => <div className="hb-panel" key={row.id}>{contactName(row.contactId)} <button className="ld-button" onClick={() => { setValues({ id: row.id, version: row.version }); setForm('refill'); }}>{text('Book this customer', 'حجز لهذا العميل')}</button></div>)}</section>}
    {entitlements && <section><h2>{text('Memberships and prepaid lessons', 'الاشتراكات والدروس المدفوعة')}</h2>{data.memberships?.map(row => <div key={row.id} className="hb-panel"><b>{contactName(row.contactId)} · {row.name}</b><p>{text('Ends', 'ينتهي')} {formatDateTime(row.endsAt, s.lang, timezone)} · {text('Lessons remaining', 'الدروس المتبقية')}: {row.remainingCredits ?? row.creditsRemaining ?? h.t('notEnoughRecords')}</p><div className="ld-actions"><button className="ld-button" onClick={() => { setValues({ id: row.id, version: row.version }); setForm('renew'); }}>{text('Renew', 'تجديد')}</button>{row.orderId && <a className="ld-button" href={`?tab=orders&order=${row.orderId}`}>{text('Open charge and payments', 'فتح الرسوم والدفعات')}</a>}{row.kind === 'membership' && <button className="ld-button" disabled={busy} onClick={() => run('membership_attendance', { membershipId: row.id, attendedAt: Date.now() })}>{text('Record attendance', 'تسجيل الحضور')}</button>}</div></div>)}</section>}
    <details className="hb-report-details"><summary>{text('Providers, rooms and services', 'مقدمو الخدمة والغرف والخدمات')}</summary><div className="ld-actions"><button className="ld-button" onClick={() => open('provider')}>{text('Add provider or room', 'إضافة مقدم خدمة أو غرفة')}</button><button className="ld-button" onClick={() => open('service')}>{text('Add service', 'إضافة خدمة')}</button></div>{data.resources?.map(row => <p key={row.id}>{row.name} · {text('Capacity', 'السعة')}: {row.capacity}</p>)}{data.services?.map(row => <p key={row.id}>{row.name} · {row.durationMinutes} {text('minutes', 'دقيقة')}</p>)}</details>
    {form && <Dialog s={s} title={text('Save details', 'حفظ التفاصيل')} onClose={() => setForm('')}><form onSubmit={submit}><fieldset disabled={busy} className="hb-action-fields">{error && <p role="alert">{error}</p>}
      {['provider', 'service', 'membership'].includes(form) && field('name', 'Name', 'الاسم')}
      {form === 'provider' && <>{select('kind', 'Type', 'النوع', [{ id: 'provider', name: text('Provider', 'مقدم الخدمة') }, { id: 'room', name: text('Room', 'غرفة') }], false)}{field('capacity', 'Capacity (default 1)', 'السعة (الافتراضي ١)', 'number', false)}</>}
      {form === 'service' && <><fieldset className="ld-fieldset"><legend>{text('Providers and rooms', 'مقدمو الخدمة والغرف')}</legend>{data.resources?.map(row => <label key={row.id} className="ld-check"><input type="checkbox" checked={values.resourceIds?.includes(row.id) || false} onChange={e => change('resourceIds', e.target.checked ? [...(values.resourceIds || []), row.id] : values.resourceIds.filter(id => id !== row.id))} />{row.name}</label>)}</fieldset>{field('duration', 'Duration in minutes (default 30)', 'المدة بالدقائق (الافتراضي ٣٠)', 'number', false)}</>}
      {['booking', 'membership', 'waitlist'].includes(form) && select('contactId', 'Customer', 'العميل', data.contacts)}
      {['booking', 'membership'].includes(form) && <>{select('orderId', 'Link existing charge (optional)', 'ربط رسوم مسجلة (اختياري)', data.orders?.map(row => ({ ...row, name: `#${row.number} · ${h.money(row.totalMinor)}` })), false)}<a className="ld-button" href="?tab=orders&ledger=1&create=1">{text('Create a charge', 'إنشاء رسوم')}</a></>}
      {['booking', 'waitlist'].includes(form) && select('serviceId', 'Service', 'الخدمة', data.services)}
      {form === 'booking' && entitlements && select('membershipId', 'Prepaid membership or lessons', 'اشتراك أو دروس مدفوعة', data.memberships?.filter(row => row.contactId === values.contactId), false)}
      {form === 'membership' && <>{select('guardianId', 'Paying guardian (optional)', 'ولي الأمر الدافع (اختياري)', data.contacts, false)}{field('credits', 'Prepaid lessons (optional)', 'دروس مدفوعة (اختياري)', 'number', false)}</>}
      {['booking', 'membership', 'waitlist', 'reschedule', 'refill'].includes(form) && field('startsAt', 'Date and time', 'التاريخ والوقت', 'datetime-local')}
      {['membership', 'waitlist', 'renew'].includes(form) && field('endsAt', 'Until', 'حتى', 'datetime-local')}
      <button className="ld-button ld-primary">{busy ? h.t('saving') : h.t('save')}</button>
    </fieldset></form></Dialog>}
  </div>;
}
