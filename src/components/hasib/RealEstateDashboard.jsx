import React, { useEffect, useRef, useState } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { hasib, dashboard } from '../../lib/dashboard/api';
import { photoProblem, uploadProductPhoto } from '../../lib/hasib/photo.js';
import { buildRealEstateSubmission } from '../../lib/hasib/realEstateForms.js';
import { TodayView } from './realestate/TodayView.jsx';
import { PropertiesView } from './realestate/PropertiesView.jsx';
import { DealsView } from './realestate/DealsView.jsx';
import { MoneyView, TeamView } from './realestate/MoneyView.jsx';
import { RecordForm } from './realestate/RecordForm.jsx';

const empty = { items: [] };
// Which quick action opens which form on which section (Today's buttons deep-link here).
const ACTIONS_BY_MODE = { properties: { property: 'property' }, deals: { opportunity: 'opportunity', viewing: 'viewing', offer: 'offer', 'follow-up': 'draft' }, team: { invite: 'invite' } };

async function load(mode, manager) {
  if (mode === 'today') return { summary: await hasib('real_estate_overview') };
  if (mode === 'properties') return { properties: await hasib('properties'), team: manager ? await hasib('team_list') : empty };
  if (mode === 'money') return { commissions: await hasib('commissions'), insights: await hasib('real_estate_insights') };
  if (mode === 'team') return { team: await hasib('team_list') };
  const [opportunities, viewings, offers, drafts, contacts, properties, team] = await Promise.all([
    hasib('opportunities'), hasib('viewings'), hasib('offers'), hasib('drafts'), dashboard('contacts', { limit: 50 }), hasib('properties'), manager ? hasib('team_list') : Promise.resolve(empty),
  ]);
  return { opportunities, viewings, offers, drafts, contacts, properties, team };
}

/** The Real Estate pack: Today, Properties, Deals, Money and Team, one section at a time. */
export function RealEstateDashboard({ mode, s, h, overview, timezone = 'Asia/Muscat', onChanged, onGo, initialAction = '' }) {
  const ar = s.ar, tr = (en, arabic) => (ar ? arabic : en);
  const manager = overview.workspaceRole === 'manager';
  const [form, setForm] = useState(null), [values, setValues] = useState({}), [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirm, setConfirm] = useState(null), [selectedId, setSelectedId] = useState(null);
  const busyRef = useRef(false);
  const state = usePolling(() => load(mode, manager), [mode, manager], { interval: 30000 });
  const data = state.data || {};

  const clearPhotos = () => { for (const p of photos) if (p.preview?.startsWith('blob:')) URL.revokeObjectURL(p.preview); setPhotos([]); };
  const openForm = (type, preset = {}) => { setError(''); setValues(preset); if (type !== 'property') clearPhotos(); setForm(type); };
  const closeForm = () => { clearPhotos(); setForm(null); setValues({}); };
  useEffect(() => {
    const type = ACTIONS_BY_MODE[mode]?.[initialAction];
    setSelectedId(null); setConfirm(null); setError('');
    if (type) openForm(type); else closeForm();
  }, [mode, initialAction]);

  /** Runs one change; refuses double-clicks, reloads, and explains any refusal in the owner's language. */
  const perform = async (operation, body, after) => {
    if (busyRef.current) return false;
    busyRef.current = true; setBusy(true); setError(''); setConfirm(null);
    try {
      const result = await hasib(operation, body);
      if (result?.invitationDelivery === 'failed') setError(tr('Invitation saved, but the email could not be sent. Use “Resend invitation”.', 'تم حفظ الدعوة، لكن تعذّر إرسال البريد. استخدم «إعادة إرسال الدعوة».'));
      await state.refresh(); after?.(); onChanged?.();
      return true;
    } catch (e) { setError(h.reason(e.reason) || s.reason(e.reason)); return false; }
    finally { busyRef.current = false; setBusy(false); }
  };
  const act = (operation, body, after, question) => question ? setConfirm({ question, run: () => perform(operation, body, after) }) : perform(operation, body, after);

  const submit = async e => {
    e.preventDefault();
    const submission = buildRealEstateSubmission(form, values, { requestId: crypto.randomUUID(), propertyPhotos: photos, opportunities: data.opportunities?.items });
    if (submission && await perform(submission.operation, submission.body)) closeForm();
  };
  const pickPhotos = async e => {
    const files = [...(e.target.files || [])].slice(0, 10 - photos.length); e.target.value = '';
    for (const file of files) {
      const problem = photoProblem(file); if (problem) { setError(h.reason(problem)); continue; }
      try { const up = await uploadProductPhoto(hasib, file); setPhotos(rows => [...rows, { id: up.photoId, preview: URL.createObjectURL(up.preview) }].slice(0, 10)); }
      catch (err) { setError(h.reason(err.reason) || h.reason('photo_upload_failed')); }
    }
  };
  const editProperty = row => {
    openForm('property', { propertyId: row.id, version: row.version, label: row.label, reference: row.reference || '', transactionType: row.transactionType || 'sale', propertyType: row.propertyType || '', area: row.area || '',
      location: row.location || '', price: (row.askingPriceMinor || 0) / 1000, pricePeriod: row.pricePeriod === 'total' ? '' : row.pricePeriod || '', bedrooms: row.bedrooms || '', bathrooms: row.bathrooms || '', sizeSqm: row.sizeSqm || '',
      description: row.description || '', assignedAccountId: row.assignedAccountId || '', availability: row.availability || 'available', authorityStatus: row.authorityStatus || 'pending', features: (row.features || []).join(', ') });
    setPhotos((row.photoIds || []).map((id, index) => ({ id, preview: row.photoUrls?.[index] || '' })));
  };

  if (state.loading && !state.data) return <p className="ld-state" role="status">{s.t('loading')}</p>;
  if (state.error && !state.data) return <div className="ld-state" role="alert"><p>{h.reason(state.error.reason) || s.reason(state.error.reason)}</p><button type="button" className="ld-button" onClick={() => state.refresh()}>{h.t('retry')}</button></div>;
  const shared = { ar, h, s, data, busy, timezone };
  return <div className="hb-real-estate">
    {error && <p className="ld-inline-error" role="alert">{error}</p>}
    {confirm && <div className="hb-confirm" role="alertdialog" aria-label={confirm.question}><p>{confirm.question}</p>
      <button type="button" className="ld-button ld-primary" disabled={busy} onClick={confirm.run}>{tr('Yes, continue', 'نعم، متابعة')}</button>
      <button type="button" className="ld-button ld-quiet" disabled={busy} onClick={() => setConfirm(null)}>{s.t('cancel')}</button></div>}
    {form && <RecordForm form={form} values={values} setValues={setValues} ar={ar} h={h} s={s} busy={busy} data={data} manager={manager} actorAccountId={overview.teamSummary?.actorAccountId}
      photos={photos} onPickPhotos={pickPhotos} onRemovePhoto={photo => { if (photo.preview?.startsWith('blob:')) URL.revokeObjectURL(photo.preview); setPhotos(rows => rows.filter(r => r.id !== photo.id)); }}
      onSubmit={submit} onCancel={closeForm} />}
    {mode === 'today' && <TodayView {...shared} onGo={onGo} onResolve={task => act('real_estate_task_resolve', { taskId: task.id, reason: 'done' })} />}
    {mode === 'properties' && <PropertiesView {...shared} onAdd={() => openForm('property', { transactionType: 'sale', availability: 'available', authorityStatus: 'pending' })} onEdit={editProperty}
      onVerify={row => act('property_verify', { propertyId: row.id, version: row.version }, null, tr(`Confirm you checked “${row.label}” today: still available, price and authority correct?`, `تأكيد أنك تحققت اليوم من «${row.label}»: ما زال متاحاً والسعر والصلاحية صحيحة؟`))} />}
    {mode === 'deals' && <DealsView {...shared} manager={manager} act={act} openForm={openForm} onGo={onGo} selectedId={selectedId} onSelect={setSelectedId} />}
    {mode === 'money' && <MoneyView {...shared} act={act} />}
    {mode === 'team' && <TeamView {...shared} act={act} openForm={openForm} />}
  </div>;
}
