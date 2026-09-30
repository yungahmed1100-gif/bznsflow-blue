import React, { useState } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { hasib } from '../../lib/dashboard/api';
import { Dialog } from '../dashboard/Dialog';
import { EmptyState, PageHeader } from './DashboardVisuals';

// The manager's staff list for a shop: invite by email, resend, revoke. Employees
// sell and manage stock; money, settings and the team stay with the manager.
const loadTeam = () => hasib('team_list');

function InviteDialog({ s, h, onClose, onInvited }) {
  const [email, setEmail] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await hasib('team_invite', { email: email.trim() });
      onInvited(result.invitationDelivery === 'failed' ? h.t('teamInviteNotSent') : h.t('teamInviteSent', { email: email.trim() }));
    } catch (err) { setError(h.reason(err.reason) || s.reason(err.reason)); setBusy(false); }
  };
  return (
    <Dialog s={s} title={h.t('teamInvite')} onClose={onClose}>
      <form className="hb-move" onSubmit={submit}>
        <p className="ld-help">{h.t('teamInviteHelp')}</p>
        <label className="ld-field">{h.t('teamEmail')}<input type="email" dir="ltr" autoComplete="off" required value={email} onChange={e => setEmail(e.target.value)} /></label>
        {error && <p className="ld-error" role="alert">{error}</p>}
        <div className="hb-actions"><button type="button" className="ld-button" onClick={onClose}>{s.t('cancel')}</button>
          <button type="submit" className="ld-button ld-primary" disabled={busy || !email.trim()}>{busy ? h.t('saving') : h.t('teamSendInvite')}</button></div>
      </form>
    </Dialog>
  );
}

function RevokeDialog({ s, h, member, busy, error, onClose, onConfirm }) {
  return (
    <Dialog s={s} title={h.t('teamRevoke')} onClose={onClose}>
      <p>{h.t('teamRevokeConfirm', { email: member.email })}</p>
      {error && <p className="ld-error" role="alert">{error}</p>}
      <div className="hb-actions"><button type="button" className="ld-button" onClick={onClose}>{s.t('cancel')}</button>
        <button type="button" className="ld-button ld-danger" disabled={busy} onClick={onConfirm}>{h.t('teamRevoke')}</button></div>
    </Dialog>
  );
}

export function TeamView({ s, h }) {
  const team = usePolling(loadTeam, [], { interval: 60000 });
  const [inviting, setInviting] = useState(false), [revoking, setRevoking] = useState(null);
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const members = team.data?.members || [], limit = team.data?.limit || 5;
  const seats = members.filter(m => m.status !== 'revoked').length;
  const act = async (operation, member) => {
    if (busy) return;
    setBusy(member.id); setError(''); setNotice('');
    try {
      const result = await hasib(operation, { memberId: member.id });
      if (operation === 'team_resend') setNotice(result.invitationDelivery === 'failed' ? h.t('teamInviteNotSent') : h.t('teamInviteSent', { email: member.email }));
      setRevoking(null);
      await team.refresh({ quiet: true });
    } catch (err) { setError(h.reason(err.reason) || s.reason(err.reason)); }
    setBusy('');
  };
  return (
    <section className="hb-team" aria-label={h.t('teamTitle')}>
      <PageHeader title={h.t('teamTitle')} description={h.t('teamLimit', { limit })} icon="users"
        primary={seats < limit ? { label: h.t('teamInvite'), icon: 'users', onClick: () => { setNotice(''); setInviting(true); } } : null} />
      {notice && <p className="ld-note" role="status">{notice}</p>}
      {error && !revoking && <p className="ld-error" role="alert">{error}</p>}
      {team.loading && !team.data ? <p className="ld-state" role="status">{s.t('loading')}</p>
        : team.error && !team.data ? <div className="ld-state" role="alert"><p>{h.reason(team.error.reason) || s.reason(team.error.reason)}</p><button className="ld-button" onClick={() => team.refresh()}>{s.t('retry')}</button></div>
        : members.length ? <ul className="hb-list">{members.map(m => (
          <li className="hb-panel hb-row" key={m.id}>
            <div><b dir="ltr">{m.email}</b><p>{h.t(`teamStatus_${m.status}`)}</p></div>
            <div className="hb-actions">
              {m.status === 'pending' && <button className="ld-button" disabled={!!busy} onClick={() => act('team_resend', m)}>{h.t('teamResend')}</button>}
              {m.status !== 'revoked' && <button className="ld-button ld-danger" disabled={!!busy} onClick={() => { setError(''); setRevoking(m); }}>{h.t('teamRevoke')}</button>}
            </div>
          </li>))}</ul>
        : <EmptyState icon="users" title={h.t('teamEmpty')} description={h.t('teamEmptyHelp')} action={{ label: h.t('teamInvite'), onClick: () => setInviting(true) }} />}
      {inviting && <InviteDialog s={s} h={h} onClose={() => setInviting(false)} onInvited={message => { setInviting(false); setNotice(message); team.refresh({ quiet: true }); }} />}
      {revoking && <RevokeDialog s={s} h={h} member={revoking} busy={busy === revoking.id} error={error} onClose={() => { setRevoking(null); setError(''); }} onConfirm={() => act('team_revoke', revoking)} />}
    </section>
  );
}
