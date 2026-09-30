import React, { useState } from 'react';
import { hasib, dashboard } from '../../lib/dashboard/api';
import { usePolling } from '../../hooks/usePolling';
import { zonedLocalToUtc } from '../../lib/timezone';
import { formatDateTime } from '../../lib/dashboard/format';
import { Dialog } from '../dashboard/Dialog';
import { loadWorkflowPages } from '../../lib/hasib/pagination';

// The records a follow-up can point at, per industry. Every pack can link an order.
const LINKS = {
  retail: ['order'], 'retail-tech': ['order'],
  beauty: ['booking', 'order'], dental: ['booking', 'order'], clinic: ['booking', 'order'],
  fitness: ['membership', 'booking', 'order'], education: ['membership', 'booking', 'order'],
  automotive: ['job', 'order'], cleaning: ['job', 'order'], hvac: ['job', 'order'], construction: ['job', 'order'],
  'real-estate': ['property', 'order'],
};
const LINK_LISTS = { booking: 'bookings', membership: 'memberships', order: 'orders', job: 'jobs', property: 'properties' };
const PICKER_PAGES = 4, LINK_PAGES = 4, REASON_MAX = 160;

function FollowupDialog({ s, h, packId, timezone, busy, error, onClose, onSubmit }) {
  const [form, setForm] = useState({}), [dateError, setDateError] = useState('');
  const set = patch => setForm(f => ({ ...f, ...patch }));
  const types = LINKS[packId] || Object.keys(LINK_LISTS);
  const contacts = usePolling(() => loadWorkflowPages(cursor => dashboard('contacts', { limit: 50, ...(cursor ? { cursor } : {}) }), PICKER_PAGES), [], { interval: 0 });
  const linked = usePolling(async () => ({ ...await loadWorkflowPages(cursor => hasib(LINK_LISTS[form.linkedType], { limit: 50, ...(cursor ? { cursor } : {}) }), LINK_PAGES), type: form.linkedType }),
    [form.linkedType], { interval: 0, enabled: !!form.linkedType });
  const submit = e => {
    e.preventDefault();
    let dueAt;
    try { dueAt = zonedLocalToUtc(form.dueAt, timezone); } catch { setDateError(h.t('fuInvalidDate')); return; }
    setDateError('');
    onSubmit({ contactId: form.contactId, reason: form.reason.trim(), dueAt, ...(form.linkedType && form.linkedId ? { linkedType: form.linkedType, linkedId: form.linkedId } : {}) });
  };
  const linkedRows = form.linkedType && linked.data?.type === form.linkedType ? linked.data.items : [];
  // Only records for the chosen customer can be linked (the server checks this too).
  const ownRows = linkedRows.filter(row => !row.contact?.id || !form.contactId || row.contact.id === form.contactId);
  return (
    <Dialog s={s} title={h.t('fuAdd')} onClose={onClose}>
      <form className="hb-move" onSubmit={submit}>
        {contacts.loading && !contacts.data ? <p className="ld-state" role="status">{h.t('loading')}</p>
          : contacts.error && !contacts.data ? <div className="ld-state" role="alert"><p>{h.reason(contacts.error.reason) || s.reason(contacts.error.reason)}</p><button type="button" className="ld-button" onClick={() => contacts.refresh()}>{h.t('retry')}</button></div>
          : <fieldset disabled={busy} className="hb-action-fields">
            <label className="ld-field">{h.t('customer')}<select required value={form.contactId || ''} onChange={e => set({ contactId: e.target.value, linkedId: '' })}>
              <option value="">—</option>{contacts.data.items.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label className="ld-field">{h.t('fuLinked')}<select value={form.linkedType || ''} onChange={e => set({ linkedType: e.target.value, linkedId: '' })}>
              <option value="">—</option>{types.map(id => <option key={id} value={id}>{h.t(`fuLink_${id}`)}</option>)}</select></label>
            {form.linkedType && <label className="ld-field">{h.t('fuChooseRecord')}<select required value={form.linkedId || ''} onChange={e => set({ linkedId: e.target.value })}>
              <option value="">—</option>{ownRows.map(row => <option key={row.id} value={row.id}>{row.title || row.label || row.name || row.serviceName || `#${row.number || row.id}`}</option>)}</select></label>}
            {linked.error && <p className="ld-inline-error" role="alert">{h.reason(linked.error.reason) || s.reason(linked.error.reason)}</p>}
            <label className="ld-field">{h.t('fuReason')}<input required maxLength={REASON_MAX} dir="auto" value={form.reason || ''} onChange={e => set({ reason: e.target.value })} /></label>
            <label className="ld-field">{h.t('fuDue')} · {timezone}<input required type="datetime-local" value={form.dueAt || ''} onChange={e => set({ dueAt: e.target.value })} /></label>
            {(dateError || error) && <p className="ld-inline-error" role="alert">{dateError || error}</p>}
            <div className="ld-actions"><button type="button" className="ld-button ld-quiet" onClick={onClose}>{h.t('cancel')}</button><button type="submit" className="ld-button ld-primary">{busy ? h.t('saving') : h.t('save')}</button></div>
          </fieldset>}
      </form>
    </Dialog>
  );
}

/** Follow-ups the owner has set: a date, a reason and the customer. This view never sends messages. */
export function FollowupView({ s, h, packId, timezone = 'Asia/Muscat' }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(''), [error, setError] = useState('');
  const [requestIds] = useState(() => new Map());
  const list = usePolling(() => hasib('followups', { status: 'open', limit: 50 }), [], { interval: 30000 });
  const rows = list.data?.items || [];
  const run = async (op, body, key = op) => {
    if (busy) return;
    setBusy(key); setError('');
    // One request id per distinct submission, so a retried or double-clicked save is recorded once.
    const idKey = JSON.stringify([op, body]);
    if (!requestIds.has(idKey)) requestIds.set(idKey, crypto.randomUUID());
    try { await hasib(op, { requestId: requestIds.get(idKey), ...body }); requestIds.delete(idKey); setOpen(false); list.refresh({ quiet: true }); }
    catch (e) { setError(h.reason(e.reason) || s.reason(e.reason)); if (e.reason === 'followup_conflict') list.refresh({ quiet: true }); }
    finally { setBusy(''); }
  };
  return (
    <section className="hb-panel hb-followups" aria-labelledby="hb-followups-title">
      <div className="ld-page-head"><h2 id="hb-followups-title">{h.t('fuTitle')}</h2><button type="button" className="ld-button" onClick={() => { setError(''); setOpen(true); }}>{h.t('fuAdd')}</button></div>
      {list.loading && !list.data ? <p className="ld-state" role="status">{h.t('loading')}</p>
        : list.error && !list.data ? <div className="ld-state" role="alert"><p>{h.reason(list.error.reason) || s.reason(list.error.reason)}</p><button type="button" className="ld-button" onClick={() => list.refresh()}>{h.t('retry')}</button></div>
        : !rows.length ? <p className="ld-help">{h.t('fuEmpty')}</p>
        : <ul className="hb-list">{rows.map(row => (
          <li className="hb-panel hb-row" key={row.id}>
            <div><b><bdi>{row.contactName || '—'}</bdi></b><p><bdi>{row.reason}</bdi> · {formatDateTime(row.dueAt, s.lang, timezone)}</p>{row.dueAt <= Date.now() && <span className="ld-chip is-yellow">{h.t('fuDueNow')}</span>}</div>
            <div className="ld-actions">{row.chatHref && <a className="ld-button" href={row.chatHref}>{h.t('openChats')}</a>}
              <button type="button" className="ld-button" disabled={!!busy} onClick={() => run('followup_complete', { followupId: row.id, version: row.version }, row.id)}>{busy === row.id ? h.t('saving') : h.t('fuDone')}</button></div>
          </li>))}</ul>}
      {error && !open && <p className="ld-inline-error" role="alert">{error}</p>}
      {list.data?.cursor && <p className="ld-help">{h.t('fuMore')}</p>}
      {open && <FollowupDialog s={s} h={h} packId={packId} timezone={timezone} busy={!!busy} error={error} onClose={() => { setOpen(false); setError(''); }} onSubmit={body => run('followup_save', body)} />}
    </section>
  );
}
