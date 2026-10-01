import { ContactOrders } from '../hasib/ContactOrders';
import React, { useState } from 'react';
import { dashboard } from '../../lib/dashboard/api';
import { formatPhone } from '../../lib/dashboard/phone';
import { formatDateTime } from '../../lib/dashboard/format';

export function ContactPanel({ s, contact, pack, timezone, canDelete = true, onSaved, onDeleted, onOpenChat }) {
  const initialFields = Object.fromEntries(pack.fields.map(f => [f.key, contact.fields.find(x => x.key === f.key)?.value || '']));
  const [ownerName, setOwnerName] = useState(contact.ownerName);
  const [fields, setFields] = useState(initialFields);
  const [override, setOverride] = useState(contact.qualificationOverride || '');
  const [busy, setBusy] = useState(''), [message, setMessage] = useState(null), [confirmDelete, setConfirmDelete] = useState(false);
  const run = async (label, task, success) => {
    setBusy(label); setMessage(null);
    try { await task(); setMessage({ ok: true, text: success }); } catch (e) { setMessage({ ok: false, text: s.reason(e.reason) }); } finally { setBusy(''); }
  };
  const save = e => {
    e.preventDefault();
    const changed = pack.fields.filter(f => fields[f.key] !== initialFields[f.key]).map(f => ({ key: f.key, value: fields[f.key] || null }));
    run('save', async () => { await dashboard('contact_update', { contactId: contact.id, patch: { ownerName, fields: changed, qualificationOverride: override || null } }); onSaved(); }, s.t('saved'));
  };
  const displayName = contact.nameSource === 'number' ? formatPhone(contact.number) : contact.name;
  return (
    <form className="ld-contact-panel" onSubmit={save}>
      <p className="ld-contact-summary"><bdi dir="ltr" className="ld-num">{contact.channel==='instagram'?'Instagram':formatPhone(contact.number)}</bdi> · {s.t(`source_${contact.source}`)} · {s.t('lastActivity')}: {formatDateTime(contact.lastActivityAt, s.lang, timezone)}</p>
      <ContactOrders contactId={contact.id} />
      <dl className="ld-names">
        {[['customerName', 'name_customer'], ['profileName', 'name_whatsapp']].map(([key, label]) => contact[key] ? <div key={key}><dt>{s.t(label)}</dt><dd><bdi>{contact[key]}</bdi></dd></div> : null)}
      </dl>
      <label className="ld-field">{s.t('ownerName')}<input value={ownerName} maxLength={80} onChange={e => setOwnerName(e.target.value)} placeholder={displayName} /></label>
      <fieldset className="ld-fieldset">
        <legend>{s.t('fieldsHeading')}</legend>
        {pack.fields.map(f => {
          const captured = contact.fields.find(x => x.key === f.key);
          return (
            <label key={f.key} className="ld-field">{s.ar ? f.ar : f.en}{f.required && <span aria-hidden="true"> *</span>}
              {f.options.length ? (
                <select value={fields[f.key]} onChange={e => setFields({ ...fields, [f.key]: e.target.value })}>
                  <option value="">—</option>
                  {f.options.map(o => <option key={o.id} value={o.id}>{s.ar ? o.ar : o.en}</option>)}
                  {/* A value Layla captured outside the list (an approved catalog name or a known area) stays selectable. */}
                  {initialFields[f.key] && !f.options.some(o => o.id === initialFields[f.key]) && <option value={initialFields[f.key]}>{initialFields[f.key]}</option>}
                </select>
              ) : <input value={fields[f.key]} maxLength={f.kind === 'text' ? 120 : 80} inputMode={f.kind === 'number' ? 'numeric' : undefined} dir="auto" onChange={e => setFields({ ...fields, [f.key]: e.target.value })} />}
              {captured && <small>{captured.source === 'owner' ? s.t('fromOwner') : s.t('captured')}</small>}
            </label>
          );
        })}
      </fieldset>
      <label className="ld-field">{s.t('overrideStatus')}
        <select value={override} onChange={e => setOverride(e.target.value)}>
          <option value="">{s.t('automatic', { status: s.t(`q_${contact.qualificationStatus}`) })}</option>
          {['qualified', 'in_progress', 'not_qualified'].map(v => <option key={v} value={v}>{s.t(`q_${v}`)}</option>)}
        </select>
      </label>
      <p className="ld-help">{contact.optout ? s.t('optedOut') : s.t(`consent_${contact.consent.status}`)}{contact.consent.source ? ` · ${contact.consent.source} · ${contact.consent.date} · ${contact.consent.purpose}` : ''}</p>
      {message && <p className={message.ok ? 'ld-help' : 'ld-inline-error'} role={message.ok ? 'status' : 'alert'}>{message.text}</p>}
      <div className="ld-actions">
        <button type="submit" className="ld-button ld-primary" disabled={!!busy}>{busy === 'save' ? s.t('loading') : s.t('save')}</button>
        {contact.conversationId && <button type="button" className="ld-button ld-quiet" onClick={() => onOpenChat(contact.conversationId)}>{s.t('openChat')}</button>}
        {canDelete && <button type="button" className="ld-button ld-danger" onClick={() => setConfirmDelete(true)}>{s.t('deleteContact')}</button>}
      </div>
      {canDelete && confirmDelete && (
        <div className="ld-confirm" role="alertdialog" aria-labelledby="ld-delete-text">
          <p id="ld-delete-text">{s.t('deleteConfirm', { name: displayName })}</p>
          <button type="button" className="ld-button ld-danger" disabled={!!busy} onClick={() => run('delete', async () => { await dashboard('contact_delete', { contactId: contact.id, confirm: true }); onDeleted(); }, s.t('contactDeleted'))}>{s.t('deleteNow')}</button>
          <button type="button" className="ld-button ld-quiet" onClick={() => setConfirmDelete(false)}>{s.t('cancel')}</button>
        </div>
      )}
    </form>
  );
}
