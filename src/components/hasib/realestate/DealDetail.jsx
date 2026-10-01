import React from 'react';
import { usePolling } from '../../../hooks/usePolling';
import { hasib } from '../../../lib/dashboard/api';
import { formatDateTime } from '../../../lib/dashboard/format';
import { Money } from '../Badges';
import { label, OPEN_STAGES, CHECKS, VIEWING_NEXT, OFFER_NEXT, LOST_REASONS } from './labels.js';

const lostReason = (code, ar) => { const row = LOST_REASONS.find(([id]) => id === code); return row ? (ar ? row[2] : row[1]) : code; };

/** Everything about one deal on one screen, with the next step for each part of it. */
export function DealDetail({ deal, ar, h, s, timezone, manager, busy, viewings, offers, drafts, act, openForm, onGo, onClose }) {
  const tr = (en, arabic) => (ar ? arabic : en);
  const extra = usePolling(async () => ({
    matches: await hasib('matches', { opportunityId: deal.id }),
    history: await hasib('deal_history', { opportunityId: deal.id }),
    compliance: await hasib('compliance', { opportunityId: deal.id }),
  }), [deal.id, deal.version], { interval: 60000 });
  const more = extra.data || {};
  const open = OPEN_STAGES.includes(deal.stage);
  const next = OPEN_STAGES[OPEN_STAGES.indexOf(deal.stage) + 1];
  const who = `${deal.contactName || tr('Customer', 'عميل')} · ${label('need', deal.need, ar)}`;
  const compliance = more.compliance || {};
  const allChecked = CHECKS.every(c => ['confirmed', 'not_applicable'].includes(compliance[`${c}Status`]));
  const accepted = offers.find(o => o.status === 'accepted');
  const refresh = () => extra.refresh();
  return <section className="hb-panel hb-deal-detail" aria-labelledby="re-deal-title">
    <div className="hb-status-line">
      <h2 id="re-deal-title">{who}</h2>
      <span className="ld-chip">{label('stage', deal.stage, ar)}</span>
      <button type="button" className="ld-button ld-quiet" onClick={onClose}>{tr('Back to all deals', 'العودة إلى كل الصفقات')}</button>
    </div>
    <dl className="hb-deal-facts">
      <div><dt>{tr('Areas', 'المناطق')}</dt><dd>{deal.areas.join('، ') || '—'}</dd></div>
      <div><dt>{tr('Property types', 'أنواع العقار')}</dt><dd>{deal.propertyTypes.join('، ') || '—'}</dd></div>
      <div><dt>{tr('Budget', 'الميزانية')}</dt><dd>{deal.budgetMinMinor ? <><Money h={h} minor={deal.budgetMinMinor} /> – </> : null}<Money h={h} minor={deal.budgetMaxMinor} /></dd></div>
      <div><dt>{tr('Finance', 'التمويل')}</dt><dd>{label('finance', deal.financeReadiness, ar)}</dd></div>
      <div><dt>{tr('Decision maker', 'صاحب القرار')}</dt><dd>{label('decision', deal.decisionMakerReadiness, ar)}</dd></div>
      <div><dt>{tr('Timeline', 'الإطار الزمني')}</dt><dd>{deal.timeline === 'unknown' ? label('finance', 'unknown', ar) : deal.timeline}</dd></div>
      {deal.nextAction && <div><dt>{tr('Next step', 'الخطوة التالية')}</dt><dd>{deal.nextAction}</dd></div>}
      {deal.stage === 'lost' && <div><dt>{tr('Lost because', 'سبب الخسارة')}</dt><dd>{lostReason(deal.lostReason, ar)}</dd></div>}
    </dl>
    <div className="ld-actions">
      {deal.conversationId && <button type="button" className="ld-button" onClick={() => onGo?.('chats', { chat: deal.conversationId })}>{tr('Open chat', 'فتح المحادثة')}</button>}
      {open && <button type="button" className="ld-button" onClick={() => openForm('opportunity', { ...dealValues(deal) })}>{tr('Edit requirements', 'تعديل المتطلبات')}</button>}
      {open && next && <button type="button" className="ld-button" disabled={busy} onClick={() => act('opportunity_stage', { opportunityId: deal.id, version: deal.version, status: next })}>{tr('Move to', 'نقل إلى')} {label('stage', next, ar)}</button>}
      {open && <button type="button" className="ld-button ld-danger" onClick={() => openForm('lost', { opportunityId: deal.id, version: deal.version })}>{tr('Mark as lost', 'تسجيل كخاسرة')}</button>}
    </div>

    <h3>{tr('Matching listings', 'العقارات المطابقة')}</h3>
    {open && <button type="button" className="ld-button" disabled={busy} onClick={() => act('match_generate', { opportunityId: deal.id }, refresh)}>{tr('Find matches', 'البحث عن مطابقات')}</button>}
    {(more.matches?.items || []).length ? <ul className="hb-re-list">{more.matches.items.map(m => <li key={m.id}>
      <b>{m.propertyLabel}</b> · {m.location} · <Money h={h} minor={m.askingPriceMinor} /> <span className="ld-chip">{label('match', m.state, ar)}</span>
      {open && <span className="ld-actions">
        <button type="button" className="ld-button" onClick={() => openForm('viewing', { opportunityId: deal.id, propertyId: m.propertyId, lockedDeal: who })}>{tr('Schedule viewing', 'جدولة معاينة')}</button>
        {m.state !== 'interested' && <button type="button" className="ld-button ld-quiet" disabled={busy} onClick={() => act('match_update', { matchId: m.id, status: 'interested' }, refresh)}>{tr('Interested', 'مهتم')}</button>}
        {m.state !== 'rejected' && <button type="button" className="ld-button ld-quiet" disabled={busy} onClick={() => act('match_update', { matchId: m.id, status: 'rejected' }, refresh)}>{tr('Not interested', 'غير مهتم')}</button>}
      </span>}
    </li>)}</ul> : <p className="ld-help">{tr('No verified listing matches yet. Complete the requirements and verify listings to see matches.', 'لا يوجد إعلان موثّق مطابق بعد. أكمل المتطلبات وتحقّق من الإعلانات لتظهر المطابقات.')}</p>}

    <h3>{tr('Viewings', 'المعاينات')}</h3>
    {open && <button type="button" className="ld-button" onClick={() => openForm('viewing', { opportunityId: deal.id, lockedDeal: who })}>{tr('Schedule a viewing', 'جدولة معاينة')}</button>}
    {viewings.length ? <ul className="hb-re-list">{viewings.map(v => <li key={v.id}>
      <b>{formatDateTime(v.scheduledAt, s.lang, timezone)}</b> · {v.propertyLabel} <span className="ld-chip">{label('viewing', v.status, ar)}</span>
      {v.outcome && <p>{v.outcome}</p>}
      {VIEWING_NEXT[v.status] && <span className="ld-actions">
        {v.status === 'requested' && <button type="button" className="ld-button" disabled={busy} onClick={() => act('viewing_save', { viewingId: v.id, version: v.version, workflow: { status: 'confirmed' } })}>{tr('Confirm', 'تأكيد')}</button>}
        <button type="button" className="ld-button" onClick={() => openForm('outcome', { viewingId: v.id, version: v.version, status: 'completed' })}>{tr('Record outcome', 'تسجيل النتيجة')}</button>
      </span>}
    </li>)}</ul> : <p className="ld-help">{tr('No viewings yet.', 'لا توجد معاينات بعد.')}</p>}

    <h3>{tr('Offers', 'العروض')}</h3>
    {open && <button type="button" className="ld-button" onClick={() => openForm('offer', { opportunityId: deal.id, lockedDeal: who })}>{tr('Draft an offer', 'مسودة عرض')}</button>}
    {offers.length ? <ul className="hb-re-list">{offers.map(o => <li key={o.id}>
      <b><Money h={h} minor={o.amountMinor} /></b> · {o.propertyLabel} <span className="ld-chip">{label('offer', o.status, ar)}</span><p>{o.terms}</p>
      <span className="ld-actions">
        {manager && o.status === 'draft' && <button type="button" className="ld-button ld-primary" disabled={busy} onClick={() => act('offer_approve', { offerId: o.id, version: o.version }, null, tr('Approve this offer so it can be presented?', 'اعتماد هذا العرض ليُقدَّم؟'))}>{tr('Approve', 'اعتماد')}</button>}
        {(OFFER_NEXT[o.status] || []).filter(st => st !== 'countered').map(st => <button key={st} type="button" className={`ld-button ${['rejected', 'withdrawn'].includes(st) ? 'ld-quiet' : ''}`} disabled={busy}
          onClick={() => act('offer_save', { offerId: o.id, version: o.version, workflow: { status: st } }, null, st === 'presented' ? null : tr(`Record this offer as ${label('offer', st, false).toLowerCase()}? This can’t be undone.`, `تسجيل العرض كـ«${label('offer', st, true)}»؟ لا يمكن التراجع.`))}>{label('offer', st, ar)}</button>)}
        {(OFFER_NEXT[o.status] || []).includes('countered') && <button type="button" className="ld-button" onClick={() => openForm('counter', { offerId: o.id, version: o.version, amount: o.amountMinor / 1000, terms: o.terms })}>{tr('Counter-offer', 'عرض مضاد')}</button>}
      </span>
    </li>)}</ul> : <p className="ld-help">{tr('No offers yet.', 'لا توجد عروض بعد.')}</p>}

    {(accepted || deal.stage === 'won') && <>
      <h3>{tr('Compliance before closing', 'الامتثال قبل الإغلاق')}</h3>
      <ul className="hb-re-checks">{CHECKS.map(check => {
        const status = compliance[`${check}Status`] || 'pending';
        return <li key={check} data-done={status !== 'pending' ? '' : undefined}>
          <span><b>{label('check', check, ar)}</b> — {label('checkStatus', status, ar)}{compliance.confirmedAt?.[check] ? ` · ${formatDateTime(compliance.confirmedAt[check], s.lang, timezone)}` : ''}</span>
          {manager && deal.stage !== 'won' && <span className="ld-actions">
            {status !== 'confirmed' && <button type="button" className="ld-button" disabled={busy} onClick={() => act('compliance_update', { opportunityId: deal.id, version: compliance.version || undefined, kind: check, status: 'confirmed' }, refresh, tr(`Confirm “${label('check', check, false)}”? Your name and the time are recorded.`, `تأكيد «${label('check', check, true)}»؟ يُسجَّل اسمك والوقت.`))}>{tr('Confirm', 'تأكيد')}</button>}
            {status === 'pending' && <button type="button" className="ld-button ld-quiet" disabled={busy} onClick={() => act('compliance_update', { opportunityId: deal.id, version: compliance.version || undefined, kind: check, status: 'not_applicable' }, refresh)}>{tr('Not applicable', 'لا ينطبق')}</button>}
            {status !== 'pending' && <button type="button" className="ld-button ld-quiet" disabled={busy} onClick={() => act('compliance_update', { opportunityId: deal.id, version: compliance.version || undefined, kind: check, status: 'pending' }, refresh)}>{tr('Undo', 'تراجع')}</button>}
          </span>}
        </li>;
      })}</ul>
      {manager && accepted && deal.stage !== 'won' && <button type="button" className="ld-button ld-primary" disabled={busy || !allChecked} onClick={() => openForm('close', { opportunityId: deal.id, offerId: accepted.id })}>{allChecked ? tr('Close the deal', 'إغلاق الصفقة') : tr('Confirm all five checks to close', 'أكّد البنود الخمسة للإغلاق')}</button>}
      {!manager && accepted && <p className="ld-help">{tr('The manager confirms compliance and closes the deal.', 'يؤكد المدير الامتثال ويغلق الصفقة.')}</p>}
    </>}

    <h3>{tr('Messages to the customer', 'رسائل للعميل')}</h3>
    {open && <button type="button" className="ld-button" onClick={() => openForm('draft', { opportunityId: deal.id, lockedDeal: who, kind: 'follow_up' })}>{tr('Draft a message', 'مسودة رسالة')}</button>}
    {drafts.length ? <ul className="hb-re-list">{drafts.map(d => <li key={d.id}>
      <b>{label('draftKind', d.kind, ar)}</b> <span className="ld-chip">{label('draft', d.status, ar)}</span><p>{d.text}</p>
      {manager && d.status === 'draft' && <button type="button" className="ld-button ld-primary" disabled={busy} onClick={() => act('draft_approve', { draftId: d.id, version: d.version }, null, tr('Send this message to the customer?', 'إرسال هذه الرسالة إلى العميل؟'))}>{tr('Approve and send', 'اعتماد وإرسال')}</button>}
    </li>)}</ul> : <p className="ld-help">{tr('No messages drafted.', 'لا توجد رسائل.')}</p>}

    <h3>{tr('History', 'السجل')}</h3>
    <ol className="hb-re-history">{(more.history?.items || []).map(e => <li key={e.id}>{formatDateTime(e.at, s.lang, timezone)} — {e.fromStage ? `${label('stage', e.fromStage, ar)} → ` : ''}{label('stage', e.toStage, ar)}{e.reason ? ` (${lostReason(e.reason, ar)})` : ''}</li>)}</ol>
  </section>;
}

/** The deal's saved requirements as form values (money in OMR, lists as text). */
export function dealValues(deal) {
  return { opportunityId: deal.id, version: deal.version, need: deal.need, areas: deal.areas.join(', '), propertyTypes: deal.propertyTypes.join(', '),
    budgetMin: deal.budgetMinMinor ? deal.budgetMinMinor / 1000 : '', budgetMax: deal.budgetMaxMinor / 1000, bedrooms: deal.bedrooms || '',
    financeReadiness: deal.financeReadiness, decisionMakerReadiness: deal.decisionMakerReadiness, timeline: deal.timeline === 'unknown' ? '' : deal.timeline,
    mustHaves: (deal.mustHaves || []).join(', '), nextAction: deal.nextAction || '', assignedAccountId: deal.assignedAccountId || '' };
}
