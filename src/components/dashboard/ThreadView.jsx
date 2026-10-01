import { ChatOrders } from '../hasib/ChatOrders';
import { CapturedDetails } from './CapturedDetails';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { dashboard, messaging } from '../../lib/dashboard/api';
import { formatPhone } from '../../lib/dashboard/phone';
import { issueKey } from '../../lib/dashboard/strings.js';
import { formatDay, formatTime, formatDateTime, sameDay } from '../../lib/dashboard/format';
import { exportChat } from '../../lib/dashboard/exports';
import { StatusTicks, QualificationChip } from './Badges';
import { CampaignWizard } from './CampaignWizard';
import { Dialog } from './Dialog';
import { dashboardPermissions } from '../../lib/dashboard/permissions';

const newRequestId = () => crypto.randomUUID();

export function ThreadView({ s, overview, conversationId, onBack, onChanged }) {
  const thread = usePolling(() => dashboard('thread', { conversationId }), [conversationId]);
  const [draft, setDraft] = useState({ text: '', id: newRequestId() });
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [templateOpen, setTemplateOpen] = useState(false);
  const [optimisticTakeover, setOptimisticTakeover] = useState(null);
  const [earlier, setEarlier] = useState({ messages: [], before: undefined });
  const scroller = useRef(null), stick = useRef(true);
  const data = thread.data;
  const count = data?.messages?.length || 0;
  useLayoutEffect(() => { if (stick.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; }, [count]);
  useEffect(() => { setError(''); }, [conversationId]);

  if (thread.loading && !data) return <p className="ld-state" role="status">{s.t('loading')}</p>;
  if (thread.error && !data) return <div className="ld-state" role="alert"><p>{s.reason(thread.error.reason)}</p><button className="ld-button" onClick={onBack}>{s.t('back')}</button></div>;
  const { contact, conversation } = data;
  // Older pages are kept locally; the polled page always holds the newest messages.
  const messages = [...earlier.messages.filter(m => !data.messages.some(x => x.id === m.id)), ...data.messages];
  const olderCursor = earlier.before === undefined ? data.before : earlier.before;
  const loadEarlier = () => act('earlier', async () => {
    const page = await dashboard('thread', { conversationId, before: olderCursor });
    stick.current = false;
    setEarlier(e => ({ messages: [...page.messages, ...e.messages], before: page.before }));
  });
  const now = Date.now();
  const windowOpen = conversation.windowOpenUntil > now;
  const name = contact.nameSource === 'number' ? formatPhone(contact.number) : contact.name;
  // Dental chats keep text for 24 hours only (the captured details stay).
  const clinical = contact.sectorId === 'dental' || s.packId === 'dental';

  const act = async (label, task) => {
    setBusy(label); setError('');
    try { await task(); await thread.refresh({ quiet: true }); onChanged(); }
    catch (e) { setError(s.reason(e.reason)); }
    finally { setBusy(''); }
  };
  const takeover = optimisticTakeover ?? conversation.takeover;
  // Optimistic: the switch moves at once and rolls back with an error if the server refuses.
  const toggleLeave = async () => {
    const next = !takeover;
    setOptimisticTakeover(next);
    await act('leave', () => messaging(next ? 'takeover' : 'resume_conversation', { conversationId,channel:conversation.channel }));
    setOptimisticTakeover(null);
  };
  const send = e => {
    e.preventDefault();
    const text = draft.text.trim();
    if (!text) return;
    // Resubmitting unchanged text reuses the request id, so a retry never duplicates; editing starts a new one.
    act('send', async () => { await messaging('manual_reply', { conversationId,channel:conversation.channel, text, requestId: draft.id }); setDraft({ text: '', id: newRequestId() }); });
  };
  const { canExport, canBroadcast } = dashboardPermissions(overview);
  const exportAs = format => act(`export-${format}`, () => exportChat(conversationId, format, { lang: s.lang, business: overview.business.name }));

  return (
    <article className="ld-thread">
      <header className="ld-thread-head">
        <button type="button" className="ld-icon-button ld-back" onClick={onBack} aria-label={s.t('back')}><span aria-hidden="true">{s.ar ? '→' : '←'}</span></button>
        <div className="ld-thread-title">
          <h2><bdi>{name}</bdi></h2>
          <p><bdi dir="ltr" className="ld-num">{contact.channel==='instagram'?'Instagram':formatPhone(contact.number)}</bdi> <QualificationChip s={s} status={contact.status} />{contact.optout && <span className="ld-chip is-coral">{s.t('optedOut')}</span>}</p>
        </div>
        <div className="ld-thread-actions">
          <label className="ld-switch">
            <input type="checkbox" role="switch" checked={takeover} disabled={busy === 'leave' || contact.optout} onChange={toggleLeave} aria-describedby="ld-leave-help" />
            <span className="ld-switch-track" aria-hidden="true" /><span>{s.t('leaveChat')}</span>
          </label>
          {canExport && <details className="ld-menu">
            <summary className="ld-button ld-quiet">{s.t('export')}</summary>
            <div className="ld-menu-list">
              <button type="button" onClick={() => exportAs('csv')} disabled={!!busy}>{s.t('exportCsv')}</button>
              <button type="button" onClick={() => exportAs('pdf')} disabled={!!busy}>{s.t('exportPdf')}</button>
            </div>
          </details>}
        </div>
        <p id="ld-leave-help" className="ld-help">{s.t('leaveChatHelp')}</p>
        <CapturedDetails s={s} contact={contact} qualification={data.qualification} conversationId={conversationId} channel={conversation.channel} />
        <ChatOrders s={s} conversationId={conversationId} />
      </header>
      <ol className="ld-messages" ref={scroller} tabIndex={0} aria-live="polite" aria-relevant="additions"
        onScroll={e => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
        {olderCursor && <li className="ld-day"><button type="button" className="ld-button ld-quiet" disabled={busy === 'earlier'} onClick={loadEarlier}>{s.t('loadEarlier')}</button></li>}
        {messages.map((m, i) => (
          <React.Fragment key={m.id}>
            {(i === 0 || !sameDay(messages[i - 1].at, m.at, overview.timezone)) && <li className="ld-day" aria-label={formatDay(m.at, s.lang, overview.timezone)}><span aria-hidden="true">{formatDay(m.at, s.lang, overview.timezone)}</span></li>}
            <li className={`ld-bubble is-${m.direction === 'in' ? 'in' : 'out'} ${m.direction === 'template' ? 'is-template' : ''}`}>
              <span className="ld-bubble-author">{m.direction === 'in' ? s.t('customer') : m.direction === 'human' ? s.t('yourTeamApp') : m.direction === 'template' ? `${s.t('template')} · ${m.templateName}` : m.manual ? s.t('you') : s.t('layla')}</span>
              {m.text === null ? <p className="ld-expired" title={clinical ? s.t('textClearedHelp') : undefined}>{clinical ? s.t('textCleared') : s.t('textExpired')}</p> : <p dir="auto">{m.text}</p>}
              <span className="ld-bubble-meta">
                <time dateTime={new Date(m.at).toISOString()} className="ld-num">{formatTime(m.at, s.lang, overview.timezone)}</time>
                {m.direction !== 'in' && m.direction !== 'human' && <StatusTicks s={s} status={m.status} channel={contact.channel} />}
                {['failed', 'ambiguous', 'blocked'].includes(m.status) && <span className="ld-bubble-issue">{issueKey(m.reason) ? s.t(issueKey(m.reason)) : <>{s.t(`status_${m.status}`)}{m.errorCode ? ` · ${m.errorCode}` : ''}</>}</span>}
              </span>
            </li>
          </React.Fragment>
        ))}
      </ol>
      {error && <p className="ld-inline-error" role="alert">{error}</p>}
      <footer className="ld-composer">
        {contact.optout ? <p className="ld-help">{s.t('optedOutComposer')}</p>
          : windowOpen ? (
            <form onSubmit={send}>
              <label className="ld-visually-hidden" htmlFor="ld-reply">{s.t('composer', { name })}</label>
              <textarea id="ld-reply" rows={1} maxLength={1000} dir="auto" value={draft.text} placeholder={s.t('composer', { name })}
                onChange={e => setDraft({ text: e.target.value, id: newRequestId() })}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) send(e); }} />
              <button type="submit" className="ld-button ld-primary" disabled={busy === 'send' || !draft.text.trim()}>{busy === 'send' ? s.t('sending') : s.t('send')}</button>
              <p className="ld-help">{takeover ? s.t('windowOpen', { time: formatDateTime(conversation.windowOpenUntil, s.lang, overview.timezone) }) : s.t('replyPauses')}</p>
            </form>
          ) : (
            <div className="ld-window-closed">
              <p>{s.t(canBroadcast && conversation.channel !== 'instagram' ? 'windowClosed' : 'windowClosedWait', { time: formatDateTime(conversation.windowOpenUntil, s.lang, overview.timezone) })}</p>
              {conversation.channel!=='instagram' && canBroadcast && <button type="button" className="ld-button" onClick={() => setTemplateOpen(true)} disabled={!overview.broadcastEnabled}>{s.t('sendTemplate')}</button>}
              {conversation.channel!=='instagram' && canBroadcast && !overview.broadcastEnabled && <p className="ld-help">{s.t('broadcastUnavailable')}</p>}
            </div>
          )}
      </footer>
      {templateOpen && canBroadcast && conversation.channel!=='instagram' && (
        <Dialog s={s} title={s.t('sendTemplate')} onClose={() => setTemplateOpen(false)} wide>
          <CampaignWizard s={s} overview={overview} single={contact} onDone={() => { setTemplateOpen(false); thread.refresh({ quiet: true }); }} />
        </Dialog>
      )}
    </article>
  );
}
