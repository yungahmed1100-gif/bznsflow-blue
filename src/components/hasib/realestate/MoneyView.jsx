import React from 'react';
import { Money } from '../Badges';
import { EmptyState, HorizontalBars, MetricCards, PageHeader } from '../DashboardVisuals';
import { label, LOST_REASONS } from './labels.js';

/** Commission and conversion, for the manager. */
export function MoneyView({ ar, h, data, busy, act }) {
  const tr = (en, arabic) => (ar ? arabic : en);
  const i = data.insights || {};
  const commissions = data.commissions?.items || [];
  const lost = code => { const row = LOST_REASONS.find(([id]) => id === code); return row ? (ar ? row[2] : row[1]) : code; };
  return <>
    <PageHeader title={tr('Money and results', 'المال والنتائج')} description={tr('Agency commission and how deals convert. Asking prices are never counted as income.', 'عمولة الوكالة ونسب تحويل الصفقات. لا تُحتسب الأسعار المطلوبة كدخل.')} icon="bar-chart" />
    <MetricCards label={tr('Commission and conversion', 'العمولة والتحويل')} items={[
      { id: 'due', value: <Money h={h} minor={i.commissions?.dueMinor || 0} />, label: tr('Commission due', 'العمولة المستحقة'), icon: 'receipt', tone: i.commissions?.dueMinor ? 'yellow' : 'green' },
      { id: 'paid', value: <Money h={h} minor={i.commissions?.paidMinor || 0} />, label: tr('Commission paid', 'العمولة المدفوعة'), icon: 'check', tone: 'green' },
      { id: 'response', value: i.averageFirstResponseMinutes ?? '—', label: tr('Average first reply (minutes)', 'متوسط الرد الأول (دقائق)'), icon: 'clock' },
      { id: 'qualified', value: `${i.qualificationRate || 0}%`, label: tr('Enquiries qualified', 'الاستفسارات المؤهلة'), icon: 'target' },
      { id: 'viewing', value: `${i.viewingToOfferRate || 0}%`, label: tr('Viewings that led to an offer', 'معاينات أدت إلى عرض'), icon: 'calendar' },
      { id: 'close', value: `${i.offerToCloseRate || 0}%`, label: tr('Offers that closed', 'عروض أُغلقت'), icon: 'trending-up' },
    ]} />
    {(i.sourceConversion?.length || i.lostReasons?.length) ? <div className="hb-real-grid">
      <HorizontalBars title={tr('Won deals by source', 'الصفقات الرابحة حسب المصدر')} rows={(i.sourceConversion || []).map(row => ({ id: row.source, label: row.source, value: row.rate, detail: row }))} format={(value, row) => `${row.detail.won}/${row.detail.opportunities} · ${value}%`} />
      <HorizontalBars title={tr('Why deals were lost', 'أسباب خسارة الصفقات')} rows={(i.lostReasons || []).map(row => ({ id: row.label, label: lost(row.label), value: row.count }))} />
    </div> : <EmptyState icon="bar-chart" title={tr('No results yet', 'لا توجد نتائج بعد')} description={tr('Charts use your recorded deals, offers and closes only.', 'تستخدم الرسوم صفقاتك وعروضك وإغلاقاتك المسجلة فقط.')} />}
    <h2>{tr('Commission records', 'سجلات العمولة')}</h2>
    {commissions.length ? <ul className="hb-re-list">{commissions.map(row => <li key={row.id} className="hb-panel">
      <b><Money h={h} minor={row.amountMinor} /></b> · {row.contactName || tr('Customer', 'عميل')} <span className="ld-chip">{label('commission', row.status, ar)}</span>
      {row.status === 'due' && <button type="button" className="ld-button" disabled={busy} onClick={() => act('commission_record', { commissionId: row.id, status: 'paid' }, null, tr('Record this commission as paid?', 'تسجيل هذه العمولة كمدفوعة؟'))}>{tr('Mark paid', 'تسجيل كمدفوعة')}</button>}
    </li>)}</ul> : <EmptyState icon="receipt" title={tr('No commission yet', 'لا توجد عمولة بعد')} description={tr('Commission is recorded when you close a deal after its compliance checks.', 'تُسجَّل العمولة عند إغلاق الصفقة بعد بنود الامتثال.')} />}
  </>;
}

/** The manager's agents: invite, resend, revoke. */
export function TeamView({ ar, data, busy, act, openForm }) {
  const tr = (en, arabic) => (ar ? arabic : en);
  const members = data.team?.members || [];
  const status = st => ({ active: tr('Active', 'نشط'), pending: tr('Invited', 'مدعو'), revoked: tr('Removed', 'محذوف') })[st] || st;
  return <>
    <PageHeader title={tr('Team', 'الفريق')} description={tr(`One manager and up to ${data.team?.limit || 5} agents. Agents see their own deals; money and approvals stay with you.`, `مدير واحد وحتى ${data.team?.limit || 5} وكلاء. يرى الوكلاء صفقاتهم فقط، ويبقى المال والموافقات لك.`)} icon="users"
      primary={{ label: tr('Invite an agent', 'دعوة وكيل'), onClick: () => openForm('invite', {}) }} />
    {members.length ? <ul className="hb-re-list">{members.map(row => <li className="hb-panel hb-row" key={row.id}>
      <div><b>{row.email}</b><p>{status(row.status)}</p></div>
      {row.status === 'pending' && <button type="button" className="ld-button" disabled={busy} onClick={() => act('team_resend', { memberId: row.id })}>{tr('Resend invitation', 'إعادة إرسال الدعوة')}</button>}
      {row.status !== 'revoked' && <button type="button" className="ld-button ld-danger" disabled={busy} onClick={() => act('team_revoke', { memberId: row.id }, null, tr(`Remove ${row.email}? They are signed out at once.`, `حذف ${row.email}؟ سيُسجَّل خروجه فوراً.`))}>{tr('Remove', 'حذف')}</button>}
    </li>)}</ul> : <EmptyState icon="users" title={tr('No agents yet', 'لا يوجد وكلاء بعد')} description={tr('Invite your agents by email.', 'ادعُ وكلاءك بالبريد الإلكتروني.')} action={{ label: tr('Invite an agent', 'دعوة وكيل'), onClick: () => openForm('invite', {}) }} />}
  </>;
}
