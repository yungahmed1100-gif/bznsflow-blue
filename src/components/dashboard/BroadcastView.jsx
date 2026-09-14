import React, { useState } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { dashboard } from '../../lib/dashboard/api';
import { formatDateTime } from '../../lib/dashboard/format';
import { CampaignWizard } from './CampaignWizard';
import { Dialog } from './Dialog';

const MANAGER_URL = 'https://business.facebook.com/wa/manage/message-templates/';

export function BroadcastView({ s, overview, onTimezone }) {
  const enabled = overview.broadcastApiEnabled ?? overview.broadcastEnabled;
  const sending = overview.broadcastEnabled;
  const templates = usePolling(() => dashboard('templates'), [], { interval: 0, enabled });
  const campaigns = usePolling(() => dashboard('campaigns'), [], { interval: 10000, enabled });
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [wizard, setWizard] = useState(false), [openId, setOpenId] = useState(null);
  const detail = usePolling(() => dashboard('campaign_detail', { campaignId: openId }), [openId], { interval: 10000, enabled: !!openId });
  const run = async (label, task) => {
    setBusy(label); setError('');
    try { await task(); } catch (e) { setError(s.reason(e.reason)); } finally { setBusy(''); }
  };
  if (!enabled) return <div className="ld-broadcast"><h1>{s.t('broadcast')}</h1><p className="ld-state">{s.t('broadcastUnavailable')}</p></div>;
  const list = templates.data?.templates || [];

  return (
    <div className="ld-broadcast">
      <div className="ld-page-head">
        <div><h1>{s.t('broadcast')}</h1><p className="ld-lede">{s.t('broadcastIntro')}</p></div>
        <button type="button" className="ld-button ld-primary" onClick={() => setWizard(true)} disabled={!sending || !list.some(t => t.sendable)}>{s.t('newBroadcast')}</button>
      </div>
      {!sending && <p className="ld-help" role="status">{s.t('broadcastSendingOff')}</p>}
      {error && <p className="ld-inline-error" role="alert">{error}</p>}

      <section className="ld-section" aria-labelledby="ld-campaigns">
        <h2 id="ld-campaigns">{s.t('campaigns')}</h2>
        {campaigns.loading && !campaigns.data ? <p className="ld-state" role="status">{s.t('loading')}</p>
          : !campaigns.data?.items.length ? <p className="ld-state">{s.t('noCampaigns')}</p>
          : <ul className="ld-campaigns">
            {campaigns.data.items.map(c => (
              <li key={c.id} className="ld-campaign">
                <div className="ld-campaign-main">
                  <strong>{c.name}</strong>
                  <span className={`ld-chip ${c.status === 'completed' ? 'is-green' : c.status === 'blocked' ? 'is-coral' : ['processing', 'starting'].includes(c.status) ? 'is-yellow' : ''}`}>{s.t(`camp_${c.status}`)}</span>
                  <small>{s.t('scheduledFor', { time: formatDateTime(c.scheduledAt, s.lang, c.timezone) })} · {c.timezone}</small>
                  {c.reason && <small className="ld-issue">{c.reason}</small>}
                </div>
                <dl className="ld-counts ld-num">
                  {['sent', 'delivered', 'read', 'failed'].map(k => <div key={k}><dt>{s.t(`status_${k}`)}</dt><dd>{k === 'sent' ? c.counts.submitted + c.counts.sent : c.counts[k]}</dd></div>)}
                  <div><dt>{s.t('recipients')}</dt><dd>{c.recipientCount}</dd></div>
                </dl>
                <div className="ld-actions">
                  <button type="button" className="ld-button ld-quiet" onClick={() => setOpenId(openId === c.id ? null : c.id)} aria-expanded={openId === c.id}>{s.t('details')}</button>
                  {['scheduled', 'starting'].includes(c.status) && <button type="button" className="ld-button ld-danger" disabled={!!busy} onClick={() => run(`cancel-${c.id}`, async () => { await dashboard('campaign_cancel', { campaignId: c.id }); campaigns.refresh({ quiet: true }); })}>{s.t('cancelBroadcast')}</button>}
                </div>
                {openId === c.id && detail.data?.campaign && (
                  <div className="ld-table-wrap">
                    <table className="ld-table ld-compact">
                      <thead><tr><th scope="col">{s.t('name')}</th><th scope="col">{s.t('number')}</th><th scope="col">{s.t('status')}</th></tr></thead>
                      <tbody>{detail.data.campaign.recipients.map((r, i) => <tr key={i}><th scope="row"><bdi>{r.name}</bdi></th><td><bdi dir="ltr" className="ld-num">{r.number}</bdi></td><td>{s.t(`status_${r.status}`)}{r.errorCode ? ` · ${r.errorCode}` : ''}</td></tr>)}</tbody>
                    </table>
                  </div>
                )}
              </li>
            ))}
          </ul>}
      </section>

      <section className="ld-section" aria-labelledby="ld-templates">
        <div className="ld-section-head">
          <h2 id="ld-templates">{s.t('templates')}</h2>
          <p className="ld-help">{templates.data?.syncedAt ? s.t('lastSynced', { time: formatDateTime(templates.data.syncedAt, s.lang, overview.timezone) }) : s.t('neverSynced')}</p>
          <button type="button" className="ld-button" disabled={!!busy} onClick={() => run('sync', async () => { templates.setData(await dashboard('sync_templates', {}, { timeout: 60000 })); })}>{busy === 'sync' ? s.t('syncing') : s.t('syncTemplates')}</button>
          <a className="ld-link" href={MANAGER_URL} target="_blank" rel="noopener noreferrer">{s.t('manageTemplates')}</a>
        </div>
        {!list.length ? <p className="ld-state">{s.t('noTemplates')}</p> : (
          <ul className="ld-templates">
            {list.map(t => (
              <li key={t.id} className={`ld-template ${t.sendable ? '' : 'is-disabled'}`}>
                <header><strong dir="ltr">{t.name}</strong><span className="ld-chip">{t.language}</span><span className="ld-chip is-green">{t.status}</span>{!t.sendable && <span className="ld-chip is-muted">{s.t('unsupported')}: {s.t(`unsupported_${t.unsupportedReason}`)}</span>}</header>
                {t.header?.text && <p className="ld-template-header" dir="auto">{t.header.text}</p>}
                <p dir="auto">{t.body}</p>
                {t.footer && <p className="ld-help" dir="auto">{t.footer}</p>}
                {!!t.variables.length && <p className="ld-help ld-num">{t.variables.map(v => `{{${v.key}}}${v.example ? ` → ${v.example}` : ''}`).join(' · ')}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
      {wizard && <Dialog s={s} title={s.t('newBroadcast')} onClose={() => setWizard(false)} wide>
        <CampaignWizard s={s} overview={overview} templates={list} onTimezone={onTimezone} onDone={() => { setWizard(false); campaigns.refresh({ quiet: true }); }} />
      </Dialog>}
    </div>
  );
}
