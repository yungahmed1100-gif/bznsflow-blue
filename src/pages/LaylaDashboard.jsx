import { ChannelConnections } from '../components/dashboard/ChannelConnections';
import { BusinessDetails } from '../components/dashboard/BusinessDetails';
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Seo } from '../components/ui/Seo';
import logoImg from '../assets/logo_bznsflow.png';
import { DashboardHeader } from '../components/dashboard/DashboardHeader';
import { DashboardNav } from '../components/dashboard/DashboardNav';
import { ChatsView } from '../components/dashboard/ChatsView';
import { ContactsView } from '../components/dashboard/ContactsView';
import { BroadcastView } from '../components/dashboard/BroadcastView';
import { usePolling } from '../hooks/usePolling';
import { dashboard, loadOverview, setupPath, DashboardError } from '../lib/dashboard/api';
import { browserTimezone } from '../lib/dashboard/format';
import { createStrings } from '../lib/dashboard/strings';
import '../styles/layla-dashboard.css';

const TABS = ['broadcast', 'chats', 'contacts', 'channels', 'business'];

export default function LaylaDashboard({ lang = 'ar' }) {
  const s = useMemo(() => createStrings(lang), [lang]);
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'chats';
  const [ready, setReady] = useState(false);
  const overview = usePolling(loadOverview, [], { interval: 30000, enabled: ready });

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
    if (overview.data?.connected && !overview.data.timezone) dashboard('set_timezone', { timezone: browserTimezone() }).then(() => overview.refresh({ quiet: true })).catch(() => {});
  }, [overview.data?.connected, overview.data?.timezone]);

  const go = (next, extra = {}) => {
    const search = new URLSearchParams({ tab: next, ...extra });
    setParams(search, { replace: false });
  };
  const data = overview.data;
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
      <DashboardNav s={s} tab={tab} onSelect={go} />
      <main id="ld-main" className="ld-main" tabIndex={-1} data-tab={tab}>
        {!ready || (overview.loading && !data) ? <p className="ld-state" role="status">{s.t('loading')}</p>
          : unavailable ? <div className="ld-state"><p>{s.t('dashboardUnavailable')}</p><a className="ld-button" href={setupPath(lang)}>{s.t('setup')}</a></div>
          : overview.error && !data ? <div className="ld-state" role="alert"><p>{s.reason(overview.error.reason)}</p><button className="ld-button" onClick={() => overview.refresh()}>{s.t('retry')}</button></div>
          : data?.connected ? (
            tab === 'channels' ? <ChannelConnections s={s} data={data} onChange={()=>overview.refresh({quiet:true})} />
            : tab === 'business' ? <BusinessDetails s={s} />
            : tab === 'contacts' ? <ContactsView s={s} overview={data} onOpenChat={id => go('chats', { chat: id })} />
            : tab === 'broadcast' && !data.integration ? <p className="ld-state">{s.ar?'البث متاح لقناة واتساب فقط.':'Broadcasts are available for WhatsApp only.'}</p>
            : tab === 'broadcast' ? <BroadcastView s={s} overview={data} onTimezone={() => overview.refresh({ quiet: true })} />
            : <ChatsView s={s} overview={data} selected={params.get('chat')} onSelect={id => go('chats', id ? { chat: id } : {})} />
          ) : <p className="ld-state" role="status">{s.t('loading')}</p>}
      </main>
    </div>
  );
}
