import { ChannelConnections } from '../components/dashboard/ChannelConnections';
import { BusinessDetails } from '../components/dashboard/BusinessDetails';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Seo } from '../components/ui/Seo';
import logoImg from '../assets/logo_bznsflow.png';
import { DashboardHeader } from '../components/dashboard/DashboardHeader';
import { DashboardNav } from '../components/dashboard/DashboardNav';
import { ChatsView } from '../components/dashboard/ChatsView';
import { ContactsView } from '../components/dashboard/ContactsView';
import { BroadcastView } from '../components/dashboard/BroadcastView';
import { usePolling } from '../hooks/usePolling';
import { dashboard, hasib, loadOverview, loadHasib, setHasibPreviewIndustry, setupPath, DashboardError } from '../lib/dashboard/api';
import { createHasibStrings } from '../lib/hasib/strings';
import { HasibProvider } from '../components/hasib/HasibContext';
import { hasibPack } from '../../config/hasib-packs';
import { BookingWorkView } from '../components/hasib/BookingWorkView';
import { JobsWorkView } from '../components/hasib/JobsWorkView';
import { FollowupView } from '../components/hasib/FollowupView';
import { OrdersView } from '../components/hasib/OrdersView';
import { StockView } from '../components/hasib/StockView';
import { InsightsView } from '../components/hasib/InsightsView';
import { FounderIndustryPreview } from '../components/hasib/FounderIndustryPreview';
import { IndustrySetup } from '../components/hasib/IndustrySetup';
import { ExpensesView } from '../components/hasib/ExpensesView';
import { TodayView } from '../components/hasib/TodayView';
import { TeamView } from '../components/hasib/TeamView';
import { SectionTabs } from '../components/dashboard/SectionTabs';
import { dashboardMap, resolveTab } from '../lib/dashboard/navigation';
import { ServiceView } from '../components/hasib/ServiceView';
import { browserTimezone } from '../lib/dashboard/format';
import { createStrings } from '../lib/dashboard/strings';
import { RealEstateDashboard } from '../components/hasib/RealEstateDashboard';
import { ClinicDashboard } from '../components/hasib/ClinicDashboard';
import { ConstructionDashboard } from '../components/hasib/ConstructionDashboard';
import { AutomotiveDashboard } from '../components/hasib/AutomotiveDashboard';
import '../styles/layla-dashboard.css';
import '../styles/hasib.css';

export default function LaylaDashboard({ lang = 'ar' }) {
  const s = useMemo(() => createStrings(lang), [lang]);
  const [params, setParams] = useSearchParams();
  const [ready, setReady] = useState(false);
  const [previewIndustry, setPreviewIndustry] = useState('');
  const overview = usePolling(loadOverview, [], { interval: 30000, enabled: ready });
  // Hasib is optional: when it is off (or unavailable) its tabs simply do not appear.
  // Catalyst has no operations capability; asking Hasib would only earn a plan_required refusal every minute.
  const hasibAllowed = !!overview.data?.capabilities?.operations || !!overview.data?.founderPreview;
  const hasibState = usePolling(loadHasib, [], { interval: 60000, enabled: ready && !!overview.data?.connected && hasibAllowed });
  const hasibOverview = hasibState.data?.modules ? hasibState.data : null;
  // Eight plain sections; Hasib's appear only when Business Setup selects a live pack.
  const map = useMemo(() => dashboardMap(hasibOverview, overview.data?.capabilities || hasibOverview?.capabilities, overview.data?.workspaceRole), [hasibOverview, overview.data?.capabilities, overview.data?.workspaceRole]);
  const h = useMemo(() => createHasibStrings(lang), [lang]);
  // The prerendered shell has no URL, so resolving the tab before mount bakes "chats" into
  // the markup and hydration keeps that stale aria-current/data-tab. Resolve after mount.
  const { tab, view } = ready ? resolveTab(params.get('tab'), params.get('view'), map) : { tab: null, view: null };

  // Client-only: the prerendered HTML is a neutral loading shell.
  useEffect(() => { setReady(true); }, []);
  useEffect(() => {
    const error = overview.error;
    if (!(error instanceof DashboardError)) return;
    if (error.reason === 'sign_in_required') window.location.replace(setupPath(lang, 'dashboard'));
    else if (error.reason === 'setup_required') window.location.replace(setupPath(lang));
  }, [overview.error, lang]);
  useEffect(() => {
    if (overview.data && !overview.data.connected) window.location.replace(setupPath(lang));
    // The business timezone starts as the owner's browser zone and stays editable.
    if (overview.data?.connected && !overview.data.timezone && overview.data.workspaceRole !== 'employee') dashboard('set_timezone', { timezone: browserTimezone() }).then(() => overview.refresh({ quiet: true })).catch(() => {});
  }, [overview.data?.connected, overview.data?.timezone, overview.data?.workspaceRole]);

  const go = (next, extra = {}) => {
    const search = new URLSearchParams({ tab: next, ...extra });
    setParams(search, { replace: false });
  };
  const refreshHasib = useCallback(() => hasibState.refresh({ quiet: true }), [hasibState.refresh]); // eslint-disable-line react-hooks/exhaustive-deps
  const changePreview = async value => {
    const industry = hasibOverview?.industries?.find(item => item.id === value);
    if (industry?.status === 'live') {
      setHasibPreviewIndustry('');
      setPreviewIndustry(value);
      try {
        await hasib('settings_update', { packId: value });
        await hasibState.refresh();
        go('today');
      } catch {
        setPreviewIndustry('');
        await hasibState.refresh();
      }
      return;
    }
    setHasibPreviewIndustry(value);
    setPreviewIndustry(value);
    hasibState.refresh();
    go('today');
  };
  const data = overview.data;
  const workflow = hasibOverview?.pack ? hasibPack(hasibOverview.pack.id).ownerUi.workflow : 'orders';
  const unavailable = overview.error?.reason === 'dashboard_unavailable';

  return (
    <div className="ld" dir={s.ar ? 'rtl' : 'ltr'} lang={lang}>
      <Seo lang={lang} path="/layla/dashboard" title={`${s.t('title')} | BznsFlow`} description={s.t('title')} noindex />
      <a className="ld-skip" href="#ld-main">{s.ar ? 'تخطَّ إلى المحتوى' : 'Skip to content'}</a>
      <header className="ld-top">
        <a className="ld-brand" href={setupPath(lang)} aria-label="BznsFlow"><img src={logoImg} alt="" width="32" height="32" /><span>BznsFlow</span></a>
        {data && <DashboardHeader s={s} data={data} onChange={() => overview.refresh({ quiet: true })} />}
        <a className="ld-lang" href={`${s.ar ? '/en' : ''}/layla/dashboard${params.toString() ? `?${params}` : ''}`} lang={s.ar ? 'en' : 'ar'}>{s.t('language')}</a>
      </header>
      <HasibProvider lang={lang} overview={hasibOverview} business={data?.business?.name || ''} timezone={data?.timezone} onChanged={refreshHasib}>
      <DashboardNav packId={hasibOverview?.pack?.id} s={s} h={h} sections={map.sections} tab={tab} onSelect={go} badges={{ orders: hasibOverview?.counts?.laylaWaiting || 0 }} />
      <main id="ld-main" className={`ld-main ${hasibOverview?.readOnly ? 'hb-preview-mode' : ''}`} tabIndex={-1} data-tab={tab}>
        {!ready || (overview.loading && !data) ? <p className="ld-state" role="status">{s.t('loading')}</p>
          : unavailable ? <div className="ld-state"><p>{s.t('dashboardUnavailable')}</p><a className="ld-button" href={setupPath(lang)}>{s.t('setup')}</a></div>
          : overview.error && !data ? <div className="ld-state" role="alert"><p>{s.reason(overview.error.reason)}</p><button className="ld-button" onClick={() => overview.refresh()}>{s.t('retry')}</button></div>
          : data?.connected ? (
            <>
              {data.founderPreview && hasibOverview && <FounderIndustryPreview s={s} industries={hasibOverview.industries} current={previewIndustry} onChange={changePreview} />}
              {hasibOverview?.readOnly && hasibOverview?.industry?.status !== 'live' && <p className="hb-preview-banner" role="status">{s.ar ? 'معاينة للقراءة فقط — جميع إجراءات الحفظ محظورة.' : 'Read-only preview — all save actions are blocked.'}</p>}
              <SectionTabs s={s} tab={tab} views={map.views[tab]} view={view} onSelect={go} />
              {hasibOverview?.pack?.id === 'clinic' && ['today','orders','money','team'].includes(tab) ? <ClinicDashboard mode={({today:'today',orders:'visits',money:'money',team:'team'})[tab]} s={s} h={h} overview={hasibOverview} timezone={data.timezone} onChanged={refreshHasib} onGo={go} initialAction={params.get('action') || ''} />
                : hasibOverview?.pack?.id === 'automotive' && ['today','orders','stock','money','team','settings'].includes(tab) ? <AutomotiveDashboard mode={({today:'today',orders:'workshop',stock:'parts',money:'money',team:'team',settings:'settings'})[tab]} s={s} h={h} overview={hasibOverview} timezone={data.timezone} connections={data} onChanged={refreshHasib} onGo={go} initialAction={params.get('action') || ''} />
                : hasibOverview?.pack?.id === 'construction' && ['today','orders','stock','money','team','settings'].includes(tab) ? <ConstructionDashboard mode={({today:'today',orders:'projects',stock:'procurement',money:'money',team:'team',settings:'settings'})[tab]} s={s} overview={hasibOverview} timezone={data.timezone} onChanged={refreshHasib} onGo={go} initialAction={params.get('action') || ''} />
                : hasibOverview?.pack?.id === 'real-estate' && ['today', 'orders', 'stock', 'money', 'team'].includes(tab) ? <RealEstateDashboard mode={({ today:'today', orders:'deals', stock:'properties', money:'money', team:'team' })[tab]} s={s} h={h} overview={hasibOverview} timezone={data.timezone} onChanged={refreshHasib} onGo={go} initialAction={params.get('action') || ''} />
                : tab === 'today' ? <TodayView s={s} h={h} hasibOverview={hasibOverview} connected={!!data.connected} onGo={go} />
                : tab === 'orders' && (params.get('order') || params.get('ledger')) ? <OrdersView s={s} h={h} overview={hasibOverview} business={data.business.name} timezone={data.timezone} initialOrderId={params.get('order')} initialCreate={params.get('create') === '1'} onChanged={refreshHasib} />
                : tab === 'orders' && ['bookings', 'lessons', 'memberships'].includes(workflow) ? <BookingWorkView s={s} h={h} overview={hasibOverview} timezone={data.timezone} initialCreate={params.get('create') === '1'} initialAction={params.get('action') || ''} onChanged={refreshHasib} />
                : tab === 'orders' && ['jobs', 'property'].includes(workflow) ? <JobsWorkView s={s} h={h} overview={hasibOverview} timezone={data.timezone} initialCreate={params.get('create') === '1'} onChanged={refreshHasib} />
                : tab === 'orders' ? <OrdersView initialCreate={params.get('create') === '1' || params.get('action') === 'charge'} s={s} h={h} overview={hasibOverview} business={data.business.name} timezone={data.timezone} onChanged={refreshHasib} />
                : tab === 'stock' && workflow === 'property' ? <JobsWorkView s={s} h={h} overview={hasibOverview} timezone={data.timezone} propertiesOnly onChanged={refreshHasib} />
                : tab === 'stock' && view === 'products' ? <StockView timezone={data.timezone} s={s} h={h} overview={hasibOverview} initialLow={params.get('low') === '1'} initialAction={params.get('action') || ''} onChanged={refreshHasib} />
                : tab === 'stock' ? <BusinessDetails s={s} section="services" onSaved={refreshHasib} />
                : tab === 'service' ? <ServiceView initialRepairId={params.get('repair')} initialAction={params.get('action') || ''} s={s} h={h} timezone={data.timezone} onChanged={refreshHasib} />
                : tab === 'money' && view === 'expenses' ? <ExpensesView s={s} h={h} overview={hasibOverview} timezone={data.timezone} initialCreate={params.get('action') === 'expense'} />
                : tab === 'money' ? <InsightsView s={s} h={h} overview={hasibOverview} onGo={go} />
                : tab === 'customers' && view === 'broadcast' ? (data.integration ? <BroadcastView s={s} overview={data} onTimezone={() => overview.refresh({ quiet: true })} /> : <p className="ld-state">{s.ar ? 'الرسائل الجماعية متاحة لقناة واتساب فقط.' : 'Messaging many customers is available on WhatsApp only.'}</p>)
                : tab === 'customers' ? <>{hasibOverview?.pack && <FollowupView s={s} h={h} packId={hasibOverview.pack.id} timezone={data.timezone} />}<ContactsView s={s} overview={data} onOpenChat={id => go('chats', { chat: id })} /></>
                : tab === 'settings' && view === 'business' ? <><BusinessDetails s={s} section={map.sections.includes('stock') ? 'details' : 'all'} initialIndustryId={hasibOverview?.readOnly ? undefined : hasibOverview?.legacyIndustryId || undefined} onSaved={refreshHasib} />
                    {!hasibOverview?.readOnly && hasibOverview?.pack && <IndustrySetup selection={false} heading={false} s={s} h={h} livePacks={hasibOverview.livePacks} industries={hasibOverview.industries} current={hasibOverview.pack.id} settings={hasibOverview.settings} onChosen={refreshHasib} />}</>
                : tab === 'team' ? <TeamView s={s} h={h} />
                : tab === 'settings' ? <ChannelConnections s={s} data={data} onChange={() => overview.refresh({ quiet: true })} />
                : <ChatsView s={s} overview={data} selected={params.get('chat')} onSelect={id => go('chats', id ? { chat: id } : {})} />}
            </>
          ) : <p className="ld-state" role="status">{s.t('loading')}</p>}
      </main>
      </HasibProvider>
    </div>
  );
}
