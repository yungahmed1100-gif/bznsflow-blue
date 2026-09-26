import React, { useEffect, useRef, useState } from 'react';
import { dashboardPath, loadOverview, messaging, messagingState } from '../../lib/dashboard/api';
import { createStrings } from '../../lib/dashboard/strings';
import { Dialog } from './Dialog';

export const ACTIVATION_REDIRECT_MS = 1800;

/**
 * Replaces the embedded inbox on the setup page: activation status and the
 * Activate control. After activation a short dialog opens the dashboard.
 */
export function ActivationPanel({lang, setup}) {
  const s = createStrings(lang);
  const [state, setState] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [dialog, setDialog] = useState(false), [dashboardReady, setDashboardReady] = useState(false);
  const timer = useRef(null);
  useEffect(() => {
    let live = true;
    messagingState().then(r => { if (live) setState(r); }).catch(e => { if (live) setError(s.reason(e.reason)); });
    loadOverview().then(() => { if (live) setDashboardReady(true); }).catch(() => {});
    return () => { live = false; clearTimeout(timer.current); };
  }, []);
  const activate = async () => {
    setBusy(true); setError('');
    try {
      const next = await messaging('activate');
      setState(next);
      if (!next.active) { setError(s.reason(next.reason || 'activation_not_ready')); return; }
      setDialog(true);
      if (dashboardReady) timer.current = setTimeout(() => window.location.assign(dashboardPath(lang)), ACTIVATION_REDIRECT_MS);
    } catch (e) { setError(s.reason(e.reason)); }
    finally { setBusy(false); }
  };
  return (
    <section className="layla-answer" aria-labelledby="layla-activation-heading">
      <h3 id="layla-activation-heading">{s.t('activate')}</h3>
      {error && <p role="alert" className="layla-error">{error}</p>}
      <p role="status">{state?.active ? s.t('active') : state ? s.t('paused') : s.t('loading')}</p>
      {state?.active
        ? dashboardReady && <a className="ld-button ld-primary" href={dashboardPath(lang)}>{s.t('openDashboard')}</a>
        : <button type="button" className="layla-primary" disabled={busy || !state?.available || !['connected', 'paused'].includes(setup.integration.status)} onClick={activate}>{busy ? s.t('loading') : s.t('activate')}</button>}
      <p className="layla-help">{lang === 'ar' ? 'يرد التفعيل على العملاء الواردين باستخدام معلومات نشاطك المعتمدة. تدير المحادثات وجهات الاتصال والرسائل الجماعية من اللوحة.' : 'Activation replies to incoming customers using your approved business facts. Manage chats, contacts and broadcasts from the dashboard.'}</p>
      {dialog && (
        <Dialog s={s} title={s.t('activeDialog')} role="alertdialog">
          <p role="status">{dashboardReady ? s.t('activeDialogBody') : s.t('dashboardUnavailable')}</p>
          {dashboardReady
            ? <a className="ld-button ld-primary" href={dashboardPath(lang)}>{s.t('openDashboard')}</a>
            : <button type="button" className="ld-button" onClick={() => setDialog(false)}>{s.t('close')}</button>}
        </Dialog>
      )}
    </section>
  );
}
