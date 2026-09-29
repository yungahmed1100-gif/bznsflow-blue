import React, { useCallback, useEffect, useState } from 'react';
import { hasib } from '../../lib/dashboard/api';
import { BookingWorkView } from './BookingWorkView';
import { EmptyState, MetricCards, PageHeader } from './DashboardVisuals';

const money = (minor, ar) => `${new Intl.NumberFormat(ar?'ar-OM':'en-OM',{minimumFractionDigits:3,maximumFractionDigits:3}).format((minor||0)/1000)} ${ar?'ر.ع.':'OMR'}`;
const pct = (value, ar) => value == null ? (ar?'بيانات غير كافية':'Not enough records') : new Intl.NumberFormat(ar?'ar-OM':'en-OM',{style:'percent',maximumFractionDigits:1}).format(value);
const dateTime = (value, ar, timezone) => new Intl.DateTimeFormat(ar?'ar-OM':'en-OM',{timeZone:timezone||'Asia/Muscat',dateStyle:'medium',timeStyle:'short'}).format(value);

export function ClinicDashboard({ mode, s, h, overview, timezone, onChanged, onGo, initialAction }) {
  const ar=s.ar, tr=(en,arabic)=>ar?arabic:en;
  const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const load=useCallback(async()=>{setError('');try{
    if(mode==='money')setData(await hasib('clinic_insights'));
    else if(mode==='team')setData(await hasib('team_list'));
    else setData(await hasib('clinic_overview'));
  }catch(e){setError(e.reason||'clinic_unavailable');}},[mode]);
  useEffect(()=>{load();},[load]);
  const mutate=async(action,body)=>{setBusy(true);setError('');try{await hasib(action,{requestId:crypto.randomUUID(),...body});await load();onChanged?.();}catch(e){setError(e.reason||'clinic_update_failed');}finally{setBusy(false);}};
  if(error)return <div className="ld-state" role="alert"><p>{error}</p><button className="ld-button" onClick={load}>{tr('Retry','إعادة المحاولة')}</button></div>;
  if(!data)return <p className="ld-state" role="status">{tr('Loading clinic operations…','جارٍ تحميل عمليات العيادة…')}</p>;

  if(mode==='today')return <div className="hb-clinic">
    <PageHeader title={tr('Today','اليوم')} description={tr('Reception exceptions and the day’s operational schedule.','استثناءات الاستقبال وجدول العمليات اليومي.')} icon="stethoscope" />
    {!data.activationReady&&<p className="hb-governance-warning" role="status">{tr('Real clinic data is blocked until SEC-04 governance and the Oman permit disposition are approved.','بيانات العيادة الحقيقية محظورة حتى اعتماد حوكمة SEC-04 ووضع تصريح عُمان.')}</p>}
    <MetricCards label={tr('Today measures','مؤشرات اليوم')} items={[
      {id:'unconfirmed',icon:'calendar',value:data.metrics?.[0]?.value||0,label:tr('Unconfirmed within 48 hours','غير مؤكدة خلال ٤٨ ساعة'),onClick:()=>onGo('orders')},
      {id:'missed',icon:'close',tone:'coral',value:data.metrics?.[1]?.value||0,label:tr('Confirmed visits missed today','زيارات مؤكدة فائتة اليوم'),onClick:()=>onGo('orders')},
      {id:'balance',icon:'receipt',value:money(data.metrics?.[2]?.value,ar),label:tr('Outstanding completed-visit balance','رصيد الزيارات المكتملة المستحق'),onClick:overview.capabilities?.money===false?undefined:()=>onGo('money')},
    ]}/>
    <section className="hb-real-grid"><section className="hb-panel"><h2>{tr('Appointment requests','طلبات المواعيد')}</h2>{data.requests?.length?<ul className="hb-clinic-list">{data.requests.map(row=><li key={row.id}><span>{dateTime(row.preferredFrom,ar,timezone)}</span><span className="ld-chip">{row.status}</span></li>)}</ul>:<EmptyState icon="calendar" title={tr('No waiting requests','لا توجد طلبات منتظرة')} description={tr('New operational requests will appear here without clinical message text.','ستظهر الطلبات التشغيلية الجديدة هنا دون نصوص طبية.')}/>}</section>
    <section className="hb-panel"><h2>{tr('Operational tasks','المهام التشغيلية')}</h2>{data.tasks?.length?<ul className="hb-clinic-list">{data.tasks.map(row=><li key={row.id}><span>{row.reason}</span><button className="ld-button" disabled={busy} onClick={()=>mutate('clinic_task_resolve',{taskId:row.id})}>{tr('Resolve','إغلاق')}</button></li>)}</ul>:<p>{tr('Nothing needs attention.','لا توجد مهام تحتاج متابعة.')}</p>}</section></section>
  </div>;

  if(mode==='visits')return <div className="hb-clinic"><PageHeader title={tr('Visits','الزيارات')} description={tr('Requests, resource-safe scheduling, attendance, reminders and waitlist recovery.','الطلبات والجدولة الآمنة للموارد والحضور والتذكيرات واستعادة قائمة الانتظار.')} icon="calendar" />
    {data.requests?.length>0&&<section className="hb-panel"><h2>{tr('Request queue','قائمة الطلبات')}</h2><ul className="hb-clinic-list">{data.requests.map(row=><li key={row.id}><span>{dateTime(row.preferredFrom,ar,timezone)}</span><span>{row.status}</span></li>)}</ul></section>}
    <BookingWorkView s={s} h={h} overview={overview} timezone={timezone} initialCreate={initialAction==='booking'} initialAction={initialAction||''} onChanged={()=>{load();onChanged?.();}} />
  </div>;

  if(mode==='money'){const m=data.metrics||{};return <div className="hb-clinic"><PageHeader title={tr('Money & insights','الأموال والمؤشرات')} description={tr('Operational trends with explicit denominators and coverage.','اتجاهات تشغيلية مع مقامات وتغطية واضحة.')} icon="bar-chart"/><MetricCards label={tr('Clinic performance','أداء العيادة')} items={[
    {id:'response',value:m.responseMedianMinutes==null?tr('Not enough records','بيانات غير كافية'):`${m.responseMedianMinutes.toFixed(1)} min`,label:tr('Median first response','وسيط أول استجابة'),help:m.responseP90Minutes==null?'':`p90 ${m.responseP90Minutes.toFixed(1)} min`},
    {id:'no-show',value:pct(m.noShowRate,ar),label:tr('No-show rate','معدل عدم الحضور')},{id:'wait',value:m.arrivalWaitMedianMinutes==null?tr('Not enough records','بيانات غير كافية'):`${m.arrivalWaitMedianMinutes.toFixed(1)} min`,label:tr('Arrival-to-start median','وسيط الوصول إلى بدء الخدمة')},
    {id:'collection',value:pct(m.collectionRate,ar),label:tr('Collection rate','معدل التحصيل')},{id:'revenue',value:money(m.recordedRevenueMinor,ar),label:tr('Recorded visit revenue','إيراد الزيارات المسجل')},{id:'receivables',value:money(m.openReceivablesMinor,ar),label:tr('Open receivables','المستحقات المفتوحة')},
  ]}/><p className="ld-help">{tr(`Coverage: ${data.coverage?.arrivalToStart?.numerator||0} of ${data.coverage?.arrivalToStart?.denominator||0} completed visits have both arrival and service-start timestamps.`,`التغطية: ${(data.coverage?.arrivalToStart?.numerator||0)} من ${(data.coverage?.arrivalToStart?.denominator||0)} زيارة مكتملة لديها وقت الوصول وبدء الخدمة.`)}</p></div>}

  if(mode==='team')return <div className="hb-clinic"><PageHeader title={tr('Team','الفريق')} description={tr('One manager and up to five verified-email operations employees.','مدير واحد وحتى خمسة موظفين عمليات ببريد موثّق.')} icon="users"/>{data.members?.length?<ul className="hb-clinic-list">{data.members.map(row=><li key={row.id}><span>{row.email}</span><span className="ld-chip">{row.status}</span></li>)}</ul>:<EmptyState icon="users" title={tr('No employees yet','لا يوجد موظفون بعد')} description={tr('Invite reception staff after governance approval and acceptance testing.','ادعُ موظفي الاستقبال بعد اعتماد الحوكمة واختبار القبول.')}/>}</div>;

  return <div className="hb-clinic"><PageHeader title={tr('Clinic settings','إعدادات العيادة')} description={tr('Governance, hours, resources, reminders, templates and channel health.','الحوكمة والساعات والموارد والتذكيرات والقوالب وصحة القنوات.')} icon="shield"/><section className="hb-panel"><h2>{tr('Governance activation gate','بوابة تفعيل الحوكمة')}</h2><dl className="hb-clinic-governance"><div><dt>{tr('SEC-04 status','حالة SEC-04')}</dt><dd>{data.governance?.status||'draft'}</dd></div><div><dt>{tr('Oman permit','تصريح عُمان')}</dt><dd>{data.governance?.permitStatus||'unknown'}</dd></div><div><dt>{tr('Activation','التفعيل')}</dt><dd>{data.activationReady?tr('Eligible after release authorization','مؤهل بعد تصريح الإصدار'):tr('Blocked','محظور')}</dd></div></dl><p className="ld-help">{tr('Approval cannot be completed from this screen until the signed governance disposition, restore test and deployment authorization are recorded.','لا يمكن إكمال الاعتماد من هذه الشاشة قبل تسجيل قرار الحوكمة الموقّع واختبار الاستعادة وتصريح النشر.')}</p></section></div>;
}
