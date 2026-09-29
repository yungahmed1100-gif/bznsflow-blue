import React, { useState } from 'react';
import { usePolling, useDebounced } from '../../hooks/usePolling';
import { dashboard } from '../../lib/dashboard/api';
import { formatPhone } from '../../lib/dashboard/phone';
import { listTimestamp } from '../../lib/dashboard/format';
import { exportAccount, exportContacts } from '../../lib/dashboard/exports';
import { QualificationChip } from './Badges';
import { ContactPanel } from './ContactPanel';
import { ContactImporter } from './ContactImporter';
import { Dialog } from './Dialog';
import { dashboardPermissions } from '../../lib/dashboard/permissions';

export function ContactsView({ s, overview, onOpenChat }) {
  const [search, setSearch] = useState(''), [status, setStatus] = useState('');
  const query = useDebounced(search.trim(), 300);
  const [more, setMore] = useState({ items: [], cursor: undefined });
  const [openId, setOpenId] = useState(null), [importing, setImporting] = useState(false), [busy, setBusy] = useState(''), [notice, setNotice] = useState('');
  const list = usePolling(() => dashboard('contacts', { ...(query ? { search: query } : {}), ...(status ? { status } : {}) }), [query, status], { interval: 15000 });
  const pack = list.data?.qualification || overview.qualification;
  const items = [...(list.data?.items || []), ...more.items.filter(i => !(list.data?.items || []).some(x => x.id === i.id))];
  const cursor = more.cursor === undefined ? list.data?.cursor : more.cursor;
  const fieldLabel = key => { const f = pack.fields.find(x => x.key === key); return f ? (s.ar ? f.ar : f.en) : key; };
  const valueLabel = (key, value) => { const o = pack.fields.find(x => x.key === key)?.options?.find(x => x.id === value); return o ? (s.ar ? o.ar : o.en) : value; };
  const run = async (label, task) => {
    setBusy(label); setNotice('');
    try { await task(); } catch (e) { setNotice(s.reason(e.reason || e.message)); } finally { setBusy(''); }
  };
  const reset = () => { setMore({ items: [], cursor: undefined }); list.refresh({ quiet: true }); };
  const open = items.find(i => i.id === openId);
  const { canExport, canImport, canDeleteCustomer } = dashboardPermissions(overview);

  return (
    <div className="ld-contacts">
      <div className="ld-page-head">
        <h1>{s.t('contacts')}</h1>
        <div className="ld-toolbar">
          <label className="ld-search"><span className="ld-visually-hidden">{s.t('searchContacts')}</span>
            <input type="search" value={search} placeholder={s.t('searchContacts')} onChange={e => { setSearch(e.target.value); setMore({ items: [], cursor: undefined }); }} /></label>
          <label><span className="ld-visually-hidden">{s.t('status')}</span>
            <select value={status} onChange={e => { setStatus(e.target.value); setMore({ items: [], cursor: undefined }); }}>
              <option value="">{s.t('allStatuses')}</option>
              {['new', 'in_progress', 'qualified', 'not_qualified'].map(v => <option key={v} value={v}>{s.t(`q_${v}`)}</option>)}
            </select></label>
          {canExport && <button type="button" className="ld-button ld-quiet" disabled={!!busy} onClick={() => run('csv', () => exportContacts(pack.fields.map(f => f.key)))}>{busy === 'csv' ? s.t('exporting') : `${s.t('export')} CSV`}</button>}
          {canExport && <button type="button" className="ld-button ld-quiet" disabled={!!busy} onClick={() => run('zip', () => exportAccount({ lang: s.lang, business: overview.business.name, fieldKeys: pack.fields.map(f => f.key) }))}>{busy === 'zip' ? s.t('exporting') : s.t('exportAll')}</button>}
          {canImport && <button type="button" className="ld-button ld-primary" onClick={() => setImporting(true)}>{s.t('addContacts')}</button>}
        </div>
      </div>
      {notice && <p className="ld-inline-error" role="alert">{notice}</p>}
      {list.data?.migrationPending && <p className="ld-help" role="status">{s.t('migrationPending')}</p>}
      {list.loading && !list.data ? <p className="ld-state" role="status">{s.t('loading')}</p>
        : list.error && !list.data ? <p className="ld-state" role="alert">{s.reason(list.error.reason)}</p>
        : !items.length ? <p className="ld-state">{query || status ? s.t('noResults') : s.t('noContacts')}</p>
        : (
          <div className="ld-table-wrap">
            <table className="ld-table">
              <thead><tr>
                <th scope="col">{s.t('name')}</th><th scope="col">{s.t('status')}</th><th scope="col">{s.t('fieldsHeading')}</th>
                <th scope="col">{s.t('source')}</th><th scope="col">{s.t('consent')}</th><th scope="col">{s.t('lastActivity')}</th><th scope="col">{s.t('takeover')}</th>
              </tr></thead>
              <tbody>
                {items.map(c => (
                  <tr key={c.id}>
                    <th scope="row">
                      <button type="button" className="ld-row-open" onClick={() => setOpenId(c.id)}>
                        <bdi>{c.nameSource === 'number' ? formatPhone(c.number) : c.name}</bdi>
                        <small>{c.channel==='instagram'?'Instagram':<><bdi dir="ltr" className="ld-num">{formatPhone(c.number)}</bdi> · {s.t(`name_${c.nameSource}`)}</>}</small>
                      </button>
                    </th>
                    <td data-label={s.t('status')}><QualificationChip s={s} status={c.status} /></td>
                    <td data-label={s.t('fieldsHeading')} className="ld-fields-cell">{c.fields.slice(0, 3).map(f => <span key={f.key}><b>{fieldLabel(f.key)}:</b> <bdi>{valueLabel(f.key, f.value)}</bdi></span>)}</td>
                    <td data-label={s.t('source')}>{s.t(`source_${c.source}`)}</td>
                    <td data-label={s.t('consent')}>{c.optout ? <span className="ld-chip is-coral">{s.t('optedOut')}</span> : s.t(`consent_${c.consent.status}`)}</td>
                    <td data-label={s.t('lastActivity')} className="ld-num">{listTimestamp(c.lastActivityAt, s.lang, overview.timezone)}</td>
                    <td data-label={s.t('takeover')}>{c.conversationId ? <button type="button" className="ld-link" onClick={() => onOpenChat(c.conversationId)}>{c.takeover ? s.t('handling') : s.t('openChat')}</button> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      {!query && cursor && <button type="button" className="ld-button ld-quiet ld-more" onClick={() => run('more', async () => { const r = await dashboard('contacts', { cursor, ...(status ? { status } : {}) }); setMore(m => ({ items: [...m.items, ...r.items], cursor: r.cursor })); })}>{s.t('loadMore')}</button>}
      {open && <Dialog s={s} title={s.t('editContact')} onClose={() => setOpenId(null)}>
        <ContactPanel s={s} contact={open} pack={pack} timezone={overview.timezone} canDelete={canDeleteCustomer} onOpenChat={onOpenChat} onSaved={reset} onDeleted={() => { setOpenId(null); setNotice(s.t('contactDeleted')); reset(); }} />
      </Dialog>}
      {importing && <Dialog s={s} title={s.t('importTitle')} onClose={() => setImporting(false)} wide>
        <ContactImporter s={s} pack={pack} requireConsent={false} onImported={() => { reset(); }} onClose={() => setImporting(false)} />
      </Dialog>}
    </div>
  );
}
