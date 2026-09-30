import React from 'react';
import { usePolling } from '../../hooks/usePolling';
import { hasib } from '../../lib/dashboard/api';
import { Money } from './Badges';
import { hasibPack } from '../../../config/hasib-packs';
import { ActionCards, EmptyState, MetricCards, PageHeader } from './DashboardVisuals';

/** "Saturday, 26 September" for the business's own date (Western digits, as elsewhere in the dashboard). */
const longDate = (date, ar) => new Intl.DateTimeFormat(ar ? 'ar-OM-u-nu-latn' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));

/** One thing waiting for the owner, with where to go for it. */
function NeedRow({ tone, text, action, onGo, children }) {
  return (
    <li className={`hb-need is-${tone}`}>
      <div className="hb-need-main"><p className="hb-need-text">{text}</p>{children}</div>
      <button type="button" className="ld-button ld-compact" onClick={onGo}>{action}</button>
    </li>
  );
}

function SetupChecklist({ h, steps, onGo }) {
  const done = steps.filter(x => x.done).length;
  if (done === steps.length) return null;
  return (
    <section className="hb-today-card hb-setup" aria-labelledby="hb-setup-title">
      <div className="hb-card-head"><h2 id="hb-setup-title">{h.t('setupTitle')}</h2><span className="ld-help">{h.t('setupProgress', { done, total: steps.length })}</span></div>
      <progress max={steps.length} value={done} aria-label={h.t('setupProgress', { done, total: steps.length })} />
      <ol>{steps.map(step => (
        <li key={step.id} className={step.done ? 'is-done' : ''}>
          <span className="hb-step-mark" aria-hidden="true">{step.done ? '✓' : ''}</span>
          <span className="hb-step-label">{h.t(`setup_${step.id}`)}<span className="ld-visually-hidden"> — {step.done ? h.t('setupDone') : h.t('setupTodo')}</span></span>
          {!step.done && step.go && <button type="button" className="ld-button ld-compact ld-quiet" onClick={() => onGo(...step.go)}>{h.t('setupStart')}</button>}
        </li>
      ))}</ol>
    </section>
  );
}

/**
 * Home for the owner: what needs them (each with one tap to act), what Layla did
 * today, and the money, in their business's day. Setup steps show until done.
 */
export function TodayView({ s, h, hasibOverview, connected, onGo }) {
  const setupRequired = hasibOverview.setupRequired;
  const today = usePolling(() => hasib('today'), [], { interval: 60000, enabled: !setupRequired });
  const t = today.data;
  const flagText = flags => flags.map(f => h.t(`flag_${f}`)).join(' · ');
  const steps = [
    { id: 'whatsapp', done: connected, go: ['settings', { view: 'channels' }] },
    { id: 'industry', done: !setupRequired, go: null },
    { id: 'products', done: !!t?.setup?.products, go: ['stock'] },
    { id: 'photos', done: !!t?.setup?.photos, go: ['stock'] },
    { id: 'services', done: !!t?.setup?.services, go: ['stock', { view: 'services' }] },
  ];

  if (setupRequired) {
    const industry = hasibOverview.industry;
    const status = industry?.status === 'preview' ? (s.ar ? 'هذا القطاع متاح حالياً للمعاينة فقط، ولم يُطرح لبيانات العملاء بعد.' : 'This industry is preview only and is not released for customer data yet.')
      : (s.ar ? 'لوحة حسيب لهذا القطاع قيد التجهيز.' : 'The Hasib dashboard for this industry is pending.');
    return (
      <div className="hb-today">
        <h1>{h.t('todayTitle')}</h1>
        <section className="hb-today-card hb-setup" aria-labelledby="hb-industry-status">
          <h2 id="hb-industry-status">{industry ? (s.ar ? industry.ar : industry.en) : (s.ar ? 'قطاع نشاطك' : 'Your industry')}</h2>
          <p>{status}</p>
          <button type="button" className="ld-button" onClick={() => onGo('settings', { view: 'business' })}>{s.ar ? 'تغيير القطاع في إعداد النشاط' : 'Change industry in Business Setup'}</button>
        </section>
      </div>
    );
  }
  if (!t && today.error) return <div className="ld-state" role="alert"><p>{h.reason(today.error.reason) || s.reason(today.error.reason)}</p><button type="button" className="ld-button" onClick={() => today.refresh()}>{h.t('retry')}</button></div>;
  if (!t) return <p className="ld-state" role="status">{h.t('loading')}</p>;
  // Employees don't import stock or run setup; those stay with the manager.
  const staff = hasibOverview.workspaceRole === 'employee';

  const pack = hasibPack(hasibOverview.pack.id);
  const n = t.needsYou;
  const needs = [
    ...(t.industryActions || []).slice(0, 4).map(action => <NeedRow key={action.id} tone="blue" text={h.ar ? action.textAr : action.textEn} action={h.ar ? action.actionAr : action.actionEn} onGo={() => onGo(...action.go)} />),
    n.ordersCount > 0 && (
      <NeedRow key="orders" tone="coral" text={h.t('ordersWaitingLine', { count: n.ordersCount })} action={h.t('seeAll')} onGo={() => onGo('orders')}>
        <ul className="hb-need-list">{n.orders.slice(0, 3).map(o => <li key={o.id}><bdi>#{o.number}</bdi>{o.customerName && <> · <bdi>{o.customerName}</bdi></>} — {flagText(o.flags)}</li>)}</ul>
      </NeedRow>
    ),
    n.chats > 0 && <NeedRow key="chats" tone="blue" text={h.t('chatsHandedLine', { count: n.chats })} action={h.t('openChats')} onGo={() => onGo('chats')} />,
    n.lowStockCount > 0 && (
      <NeedRow key="stock" tone="yellow" text={h.t('lowStockLine', { count: n.lowStockCount })} action={h.t('openStock')} onGo={() => onGo('stock', { low: '1' })}>
        <ul className="hb-need-list">{n.lowStock.slice(0, 3).map(v => <li key={v.variantId}><bdi>{h.name(v)}</bdi>{v.options.length ? ` (${v.options.map(o => o.value).join(' / ')})` : ''} — {v.onHand <= 0 ? h.t('outOfStock') : h.t('onHandShort', { count: v.onHand })}</li>)}</ul>
      </NeedRow>
    ),
    n.repairsReady > 0 && <NeedRow key="repairs" tone="blue" text={h.t('repairsReadyLine', { count: n.repairsReady })} action={h.t('openService')} onGo={() => onGo('service')} />,
  ].filter(Boolean);

  return (
    <div className="hb-today">
      <PageHeader title={h.t('todayTitle')} description={<time dateTime={t.date}>{longDate(t.date, h.ar)}</time>} icon={pack.dashboard.icon} />
      <ActionCards label={h.ar ? 'إجراءات سريعة' : 'Quick actions'} actions={pack.dashboard.actions.filter(action => !(staff && action[0] === 'import')).map(action => ({ id: action[0], label: h.ar ? action[2] : action[1], icon: action[3], onClick: () => onGo(...action[4]) }))} />
      <section className="hb-today-card hb-needs" aria-labelledby="hb-needs-title">
        <h2 id="hb-needs-title">{h.t('needsYou')}</h2>
        {needs.length ? <ul className="hb-need-rows">{needs.slice(0, 4)}</ul> : <EmptyState icon="check" title={h.t('allClear')} description={h.ar ? 'لا توجد مهام عاجلة الآن. استخدم الإجراءات أعلاه لتسجيل العمل الجديد.' : 'There are no urgent tasks right now. Use the actions above to record new work.'} />}
      </section>
      <MetricCards label={h.ar ? 'أرقام اليوم' : 'Today’s numbers'} items={pack.todayMetrics.map((metric, index) => {
          const result = t.industryMetrics?.find(row => row.id === metric.id);
          const value = result?.value;
          return { id: metric.id, icon: ['trending-up', 'clock', 'target'][index], tone: ['blue', 'yellow', 'coral'][index], label: (h.ar ? metric.ar : metric.en).replace('60', String(hasibOverview.settings?.unsoldDays || 60)).replace('٦٠', String(hasibOverview.settings?.unsoldDays || 60)), help: result?.detail || '', value: value == null ? h.t('notEnoughRecords') : result.format === 'money' ? <Money h={h} minor={value} /> : <bdi>{value}{result.format === 'percent' ? '%' : ''}</bdi>, onClick: () => onGo(...metric.go) };
        })} />
      {!staff && <SetupChecklist h={h} steps={steps} onGo={onGo} />}
    </div>
  );
}
