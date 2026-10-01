import React from 'react';
import { ActionCards, EmptyState, MetricCards, PageHeader } from '../DashboardVisuals';
import { label, OPEN_STAGES } from './labels.js';

const COUNTS = [
  ['opportunities', 'Open deals', 'الصفقات المفتوحة', 'users'], ['unassigned', 'Unassigned', 'غير مُسندة', 'users'], ['slaBreaches', 'Late first replies', 'ردود أولى متأخرة', 'clock'],
  ['staleListings', 'Listings to verify', 'إعلانات تحتاج تحققاً', 'home'], ['todayViewings', 'Viewings today', 'معاينات اليوم', 'calendar'], ['tasks', 'Open tasks', 'مهام مفتوحة', 'target'],
];
const WARN = new Set(['slaBreaches', 'staleListings', 'tasks']);
// Where each task is acted on.
const TASK_GO = { opportunity: ['orders'], viewing: ['orders'], offer: ['orders'], draft: ['orders'], property: ['stock'] };

export function TodayView({ ar, data, busy, onGo, onResolve }) {
  const tr = (en, arabic) => (ar ? arabic : en);
  const summary = data.summary || {};
  const tasks = summary.tasks || [];
  return <>
    <PageHeader title={tr('Today', 'اليوم')} description={tr('Late replies, listings to verify, viewings and offers that need you.', 'الردود المتأخرة والإعلانات التي تحتاج تحققاً والمعاينات والعروض التي تحتاجك.')} icon="clock" />
    <ActionCards label={tr('Quick actions', 'إجراءات سريعة')} actions={[
      { id: 'opportunity', label: tr('Add a deal', 'إضافة صفقة'), icon: 'users', onClick: () => onGo?.('orders', { action: 'opportunity' }) },
      { id: 'property', label: tr('Add a listing', 'إضافة إعلان'), icon: 'home', onClick: () => onGo?.('stock', { action: 'property' }) },
      { id: 'viewing', label: tr('Schedule a viewing', 'جدولة معاينة'), icon: 'calendar', onClick: () => onGo?.('orders', { action: 'viewing' }) },
      { id: 'offer', label: tr('Draft an offer', 'مسودة عرض'), icon: 'receipt', onClick: () => onGo?.('orders', { action: 'offer' }) },
    ]} />
    <MetricCards label={tr('Today at a glance', 'اليوم في لمحة')} items={COUNTS.map(([key, en, arabic, icon]) => {
      const value = summary.counts?.[key] ?? 0;
      return { id: key, value, label: ar ? arabic : en, icon, tone: value ? (WARN.has(key) ? 'coral' : 'blue') : 'green' };
    })} />
    <section aria-labelledby="re-pipeline"><h2 id="re-pipeline">{tr('Deal pipeline', 'مسار الصفقات')}</h2>
      <div className="hb-pipeline">{[...OPEN_STAGES, 'won', 'lost'].map(stage => <article key={stage}><strong>{summary.pipeline?.[stage] ?? 0}</strong><span>{label('stage', stage, ar)}</span></article>)}</div>
    </section>
    <section aria-labelledby="re-tasks"><h2 id="re-tasks">{tr('Needs you', 'يحتاجك')}</h2>
      {tasks.length ? <ul className="hb-re-tasks">{tasks.map(task => <li className="hb-panel" key={task.id}>
        <div><b>{label('task', task.kind, ar)}</b><p>{task.reason}</p></div>
        <div className="ld-actions">
          <button type="button" className="ld-button" onClick={() => onGo?.(...(TASK_GO[task.entityType] || ['orders']))}>{tr('Open', 'فتح')}</button>
          <button type="button" className="ld-button ld-quiet" disabled={busy} onClick={() => onResolve(task)}>{tr('Mark done', 'تم')}</button>
        </div>
      </li>)}</ul>
        : <EmptyState icon="check" title={tr('Nothing needs you right now', 'لا شيء يحتاجك الآن')} description={tr('Late replies, listings to verify and unanswered offers appear here.', 'ستظهر هنا الردود المتأخرة والإعلانات التي تحتاج تحققاً والعروض غير المجاب عليها.')} />}
    </section>
  </>;
}
