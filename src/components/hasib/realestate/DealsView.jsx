import React, { useState } from 'react';
import { Money } from '../Badges';
import { EmptyState, PageHeader } from '../DashboardVisuals';
import { label, OPEN_STAGES } from './labels.js';
import { DealDetail } from './DealDetail.jsx';

const FILTERS = ['open', 'won', 'lost'];

/** The agency's deals (an agent's own and unassigned ones), and the approvals waiting on the manager. */
export function DealsView({ ar, h, s, timezone, manager, busy, data, act, openForm, onGo, selectedId, onSelect }) {
  const tr = (en, arabic) => (ar ? arabic : en);
  const [filter, setFilter] = useState('open');
  const deals = data.opportunities?.items || [];
  const selected = deals.find(d => d.id === selectedId);
  const forDeal = (list, id) => (list?.items || []).filter(x => x.opportunityId === id);
  if (selected) return <DealDetail deal={selected} ar={ar} h={h} s={s} timezone={timezone} manager={manager} busy={busy}
    viewings={forDeal(data.viewings, selected.id)} offers={forDeal(data.offers, selected.id)} drafts={forDeal(data.drafts, selected.id)}
    act={act} openForm={openForm} onGo={onGo} onClose={() => onSelect(null)} />;
  const shown = deals.filter(d => filter === 'open' ? OPEN_STAGES.includes(d.stage) : d.stage === filter);
  const waiting = manager ? [...(data.offers?.items || []).filter(o => o.status === 'draft'), ...(data.drafts?.items || []).filter(d => d.status === 'draft')] : [];
  return <>
    <PageHeader title={tr('Deals', 'الصفقات')} description={manager ? tr('Every customer the agency is working with, from first enquiry to close.', 'كل العملاء الذين تعمل معهم الوكالة، من أول استفسار حتى الإغلاق.') : tr('Your deals and unassigned ones.', 'صفقاتك والصفقات غير المُسندة.')} icon="users"
      primary={{ label: tr('Add a deal', 'إضافة صفقة'), onClick: () => openForm('opportunity', {}) }} />
    {waiting.length > 0 && <section className="hb-panel" aria-labelledby="re-approvals"><h2 id="re-approvals">{tr('Waiting for your approval', 'بانتظار موافقتك')}</h2>
      <ul className="hb-re-list">{waiting.map(row => <li key={row.id}>
        <button type="button" className="hb-link" onClick={() => onSelect(row.opportunityId)}>{row.contactName || tr('Customer', 'عميل')}</button>
        {' — '}{row.amountMinor ? <><Money h={h} minor={row.amountMinor} /> · {row.propertyLabel}</> : label('draftKind', row.kind, ar)}
      </li>)}</ul>
    </section>}
    <div className="ld-segmented" role="radiogroup" aria-label={tr('Show deals', 'عرض الصفقات')}>
      {FILTERS.map(f => <label key={f}><input type="radio" name="re-deal-filter" checked={filter === f} onChange={() => setFilter(f)} /><span>{f === 'open' ? tr('Open', 'مفتوحة') : label('stage', f, ar)}</span></label>)}
    </div>
    {shown.length ? <ul className="hb-re-deals">{shown.map(d => <li key={d.id} className="hb-panel">
      <div className="hb-status-line"><b>{d.contactName || tr('Customer', 'عميل')}</b><span className="ld-chip">{label('stage', d.stage, ar)}</span></div>
      <p>{label('need', d.need, ar)} · {d.areas.join('، ') || '—'} · {tr('up to', 'حتى')} <Money h={h} minor={d.budgetMaxMinor} /></p>
      <p className="ld-help">{d.nextAction || tr('No next step set', 'لا توجد خطوة تالية')}{!d.assignedAccountId ? ` · ${tr('unassigned', 'غير مُسندة')}` : ''}</p>
      <button type="button" className="ld-button" onClick={() => onSelect(d.id)}>{tr('Open deal', 'فتح الصفقة')}</button>
    </li>)}</ul>
      : <EmptyState icon="users" title={filter === 'open' ? tr('No open deals', 'لا توجد صفقات مفتوحة') : tr('Nothing here yet', 'لا شيء هنا بعد')}
        description={tr('Deals from Layla’s chats appear here, or add one yourself.', 'تظهر هنا الصفقات من محادثات ليلى، أو أضف صفقة بنفسك.')} action={filter === 'open' ? { label: tr('Add a deal', 'إضافة صفقة'), onClick: () => openForm('opportunity', {}) } : undefined} />}
  </>;
}
