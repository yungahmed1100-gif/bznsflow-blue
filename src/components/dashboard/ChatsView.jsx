import React, { useState } from 'react';
import { usePolling, useDebounced } from '../../hooks/usePolling';
import { dashboard } from '../../lib/dashboard/api';
import { formatPhone } from '../../lib/dashboard/phone';
import { initials, listTimestamp } from '../../lib/dashboard/format';
import { exportAccount } from '../../lib/dashboard/exports';
import { ThreadView } from './ThreadView';
import { StatusTicks, QualificationChip } from './Badges';
import { dashboardPermissions } from '../../lib/dashboard/permissions';

/** Conversation list + active thread. Desktop shows both; phones show one at a time. */
export function ChatsView({ s, overview, selected, onSelect }) {
  const [search, setSearch] = useState('');
  const [channel,setChannel]=useState('');
  const [exporting, setExporting] = useState(false), [exportError, setExportError] = useState('');
  const { canExport } = dashboardPermissions(overview);
  const exportAll = async () => {
    setExporting(true); setExportError('');
    try { await exportAccount({ lang: s.lang, business: overview.business.name, fieldKeys: overview.qualification.fields.map(f => f.key) }); }
    catch (e) { setExportError(s.reason(e.reason)); }
    finally { setExporting(false); }
  };
  const query = useDebounced(search.trim(), 300);
  const [extra, setExtra] = useState({ items: [], cursor: null });
  const list = usePolling(async () => {
    const result = await dashboard('conversations', {...(query?{search:query}:{}),...(channel?{channel}:{})});
    return result;
  }, [query,channel]);
  const items = [...(list.data?.items || []), ...extra.items.filter(i => !(list.data?.items || []).some(x => x.id === i.id))];
  const cursor = extra.cursor ?? list.data?.cursor;
  const [loadingMore, setLoadingMore] = useState(false), [moreError, setMoreError] = useState('');
  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true); setMoreError('');
    try {
      const result = await dashboard('conversations', { cursor,...(channel?{channel}:{}) });
      setExtra(e => ({ items: [...e.items, ...result.items], cursor: result.cursor }));
    } catch (e) { setMoreError(s.reason(e.reason)); }
    finally { setLoadingMore(false); }
  };
  return (
    <div className={`ld-chats ${selected ? 'has-thread' : ''}`}>
      <section className="ld-list" aria-label={s.t('chats')}>
        <div className="ld-list-head">
          <div className="ld-list-title">
            <h1>{s.t('chats')}</h1>
            {canExport && <button type="button" className="ld-button ld-quiet" disabled={exporting} onClick={exportAll}>{exporting ? s.t('exporting') : s.t('exportAll')}</button>}
          </div>
          {exportError && <p className="ld-inline-error" role="alert">{exportError}</p>}
          <label>{s.ar?'القناة':'Channel'} <select value={channel} onChange={e=>{setChannel(e.target.value);setExtra({items:[],cursor:null});}}><option value="">{s.ar?'كل القنوات':'All channels'}</option><option value="whatsapp">WhatsApp</option><option value="instagram">Instagram</option></select></label>
          <label className="ld-search"><span className="ld-visually-hidden">{s.t('searchChats')}</span>
            <input type="search" value={search} placeholder={s.t('searchChats')} onChange={e => { setSearch(e.target.value); setExtra({ items: [], cursor: null }); }} />
          </label>
        </div>
        {list.loading && !list.data ? <p className="ld-state" role="status">{s.t('loading')}</p>
          : list.error && !list.data ? <p className="ld-state" role="alert">{s.reason(list.error.reason)} <button className="ld-link" onClick={() => list.refresh()}>{s.t('retry')}</button></p>
          : !items.length ? <p className="ld-state">{query ? s.t('noResults') : s.t('noChats')}</p>
          : <ul className="ld-conversations">
            {items.map(item => (
              <li key={item.id}>
                <button type="button" className="ld-conversation" aria-current={selected === item.id ? 'true' : undefined} onClick={() => onSelect(item.id)}>
                  <span className="ld-avatar" aria-hidden="true">{initials(item.contact.name)}</span>
                  <span className="ld-conversation-main">
                    <span className="ld-conversation-top">
                      <bdi className="ld-name">{item.contact.nameSource === 'number' ? formatPhone(item.contact.number) : item.contact.name}</bdi>
                      <time className="ld-num">{item.lastMessage ? listTimestamp(item.lastMessage.at, s.lang, overview.timezone) : ''}</time>
                    </span>
                    <span className="ld-conversation-bottom">
                      {item.lastMessage && item.lastMessage.direction !== 'in' && <StatusTicks s={s} status={item.lastMessage.status} channel={item.contact.channel} />}
                      <span className="ld-preview" dir="auto">{item.lastMessage?.text ?? (item.lastMessage ? s.t('textExpired') : '')}</span>
                    </span>
                    <span className="ld-conversation-tags"><span className="ld-chip">{item.channel==='instagram'?'Instagram':'WhatsApp'}</span>
                      {item.takeover && <span className="ld-chip is-ink">{s.t('handling')}</span>}
                      {item.optout && <span className="ld-chip is-coral">{s.t('optedOut')}</span>}
                      {item.contact.status !== 'new' && <QualificationChip s={s} status={item.contact.status} />}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>}
        {moreError && <p className="ld-inline-error" role="alert">{moreError}</p>}
        {!query && cursor && <button type="button" className="ld-button ld-quiet ld-more" disabled={loadingMore} onClick={loadMore}>{loadingMore ? s.t('loading') : s.t('loadMore')}</button>}
      </section>
      <section className="ld-thread-pane" aria-label={s.t('selectChat')}>
        {selected ? <ThreadView key={selected} s={s} overview={overview} conversationId={selected} onBack={() => onSelect(null)} onChanged={() => list.refresh({ quiet: true })} />
          : <p className="ld-state ld-empty-thread">{s.t('selectChat')}</p>}
      </section>
    </div>
  );
}
