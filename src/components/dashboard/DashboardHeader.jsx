import { setupPath } from '../../lib/dashboard/api';
import React, { useState } from 'react';
import { messaging } from '../../lib/dashboard/api';
import { formatPhone } from '../../lib/dashboard/phone';
import { formatDateTime } from '../../lib/dashboard/format';

/** Global Pause/Activate and connection health, always visible. */
export function DashboardHeader({ s, data, onChange }) {
  const [busy, setBusy] = useState(''), [notice, setNotice] = useState(null);
  const checks = data.integration?.checks;
  const healthy = !!(checks?.routing && checks?.registered && checks?.path && ['connected', 'paused'].includes(data.integration?.status));
  const run = async (action) => {
    setBusy(action); setNotice(null);
    try { await messaging(action); setNotice({ ok: true, text: action==='disconnect'?(s.ar?'تم فصل واتساب':'WhatsApp disconnected'):action === 'check_connection' ? s.t('connectionOk') : s.t(action === 'pause' ? 'paused' : 'active') }); }
    catch (e) { setNotice({ ok: false, text: s.reason(e.reason) }); }
    finally { setBusy(''); onChange(); }
  };
  const active = data.messaging?.active;
  return (
    <div className="ld-header">
      <div className="ld-identity">
        <strong>{data.business.name}</strong>
        {data.integration && <bdi dir="ltr">{formatPhone(data.integration.sender)}</bdi>}
      </div>
      {data.integration && <>
      <p className={`ld-health ${healthy ? 'is-ok' : 'is-warn'}`} title={data.integration?.checkedAt ? s.t('checkedAt', { time: formatDateTime(data.integration.checkedAt, s.lang, data.timezone) }) : undefined}>
        <span aria-hidden="true" className="ld-dot" />{healthy ? s.t('connectionOk') : s.t('connectionAttention')}
      </p>
      <p className={`ld-layla ${active ? 'is-on' : ''}`} role="status">
        {active ? s.t('active') : s.t('paused')}
        <small className="ld-num">{s.t('repliesToday', { used: data.messaging?.limits?.usedToday || 0, limit: data.messaging?.limits?.perDay || 100 })}</small>
      </p>
      {data.workspaceRole !== 'employee' && <div className="ld-header-actions">
        <button type="button" className="ld-button ld-quiet" disabled={!!busy} onClick={() => run('check_connection')}>{busy === 'check_connection' ? s.t('loading') : s.t('checkConnection')}</button>
        {active
          ? <button type="button" className="ld-button" disabled={!!busy} onClick={() => run('pause')}>{s.t('pause')}</button>
          : <button type="button" className="ld-button ld-primary" disabled={!!busy || !data.messaging?.available} onClick={() => run('activate')}>{s.t('activate')}</button>}
      </div>}
      </>}
      {!data.integration && <a className="ld-button" href={setupPath(s.lang)}>{s.ar?'ربط واتساب':'Connect WhatsApp'}</a>}

      {notice && <p className={`ld-toast ${notice.ok ? '' : 'is-error'}`} role={notice.ok ? 'status' : 'alert'}>{notice.text}</p>}
    </div>
  );
}
