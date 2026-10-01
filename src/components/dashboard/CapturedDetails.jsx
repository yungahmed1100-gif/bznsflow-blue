import React, { useState } from 'react';
import { hasib } from '../../lib/dashboard/api';
import { useHasib } from '../hasib/HasibContext';
import { OrderComposer } from '../hasib/OrderComposer';
import { visitDateFrom } from '../../lib/hasib/visitDate';

const plain = text => String(text || '').trim().toLowerCase();

/** The service item Layla's captured service names, when one matches exactly (Arabic or English). */
async function matchService(label) {
  if (!label) return null;
  try {
    const { items } = await hasib('items', { search: label, limit: 10 });
    return items.find(i => [i.nameEn, i.nameAr].some(n => plain(n) === plain(label)) && i.variants.length) || null;
  } catch { return null; }
}

/**
 * What Layla captured in this chat (the pack's fields, consent and status), shown
 * above the conversation. For a clinic, one tap turns it into a prefilled visit the
 * owner checks before saving. Nothing here comes from message text.
 */
export function CapturedDetails({ s, contact, qualification, conversationId, channel }) {
  const hb = useHasib();
  const [prefill, setPrefill] = useState(null), [busy, setBusy] = useState(false), [saved, setSaved] = useState('');
  const fields = (qualification?.fields || []).map(f => ({ f, captured: contact.fields.find(x => x.key === f.key && x.value) })).filter(x => x.captured);
  const label = (f, value) => { const o = f.options?.find(x => x.id === value); return o ? (s.ar ? o.ar : o.en) : value; };
  // Only a clinic records visits from a chat. Shops don't: Layla files their orders herself (d1f29e7).
  const clinic = !!hb?.overview.pack.serviceItems;
  const canRecord = clinic && !!hb.overview.modules.includes('orders') && !contact.optout;

  const start = async () => {
    setBusy(true); setSaved('');
    const service = contact.fields.find(x => x.key === 'service' || x.key === 'item');
    const serviceDef = qualification?.fields.find(f => f.key === service?.key);
    const shown = service ? label(serviceDef || {}, service.value) : '';
    // Try the owner's language first, then the other one (a built-in option has both names).
    const option = serviceDef?.options?.find(o => o.id === service?.value);
    const item = await matchService(shown) || (option ? await matchService(s.ar ? option.en : option.ar) : null);
    const when = contact.fields.find(x => x.key === 'preferred_time');
    const where = contact.fields.find(x => x.key === 'location')?.value;
    const orderFields = hb.overview.pack.orderFields.map(f => f.key);
    const visitDate = when && orderFields.includes('visit_date') ? visitDateFrom(when.value, when.at, hb.timezone || 'Asia/Muscat') : '';
    setPrefill({
      contact: { name: contact.name }, contactId: contact.id, conversationId, channel: channel === 'instagram' ? 'instagram' : 'whatsapp', customerName: '',
      lines: item ? [{ variantId: item.variants[0].id, nameAr: item.nameAr, nameEn: item.nameEn, options: item.variants[0].options, qty: 1, unitPriceMinor: item.variants[0].priceMinor, onHand: item.trackStock ? item.variants[0].onHand : null }] : [],
      unmatched: service && !item ? shown : '',
      fulfilment: { type: hb.overview.pack.fulfilment?.[0] || 'pickup' },
      fields: { ...(visitDate ? { visit_date: visitDate } : {}), ...(where && where !== 'branch' && orderFields.includes('branch') ? { branch: where.slice(0, 40) } : {}) },
    });
    setBusy(false);
  };

  return (
    <section className="ld-captured" aria-labelledby="ld-captured-title">
      <h3 id="ld-captured-title">{s.t('captured')}</h3>
      {fields.length ? (
        <dl className="ld-captured-list">
          {fields.map(({ f, captured }) => <div key={f.key}><dt>{s.ar ? f.ar : f.en}</dt><dd><bdi>{label(f, captured.value)}</bdi>{captured.source === 'owner' && <small> · {s.t('fromOwner')}</small>}</dd></div>)}
          <div><dt>{s.t('consent')}</dt><dd>{contact.optout ? s.t('optedOut') : s.t(`consent_${contact.consent.status}`)}</dd></div>
        </dl>
      ) : <p className="ld-captured-none">{s.t('capturedNone')}</p>}
      {canRecord && <button type="button" className="ld-button ld-compact" disabled={busy} onClick={start}>{busy ? hb.h.t('loading') : hb.h.t('recordVisit')}</button>}
      {saved && <p className="ld-captured-none" role="status">{saved}</p>}
      {prefill && <OrderComposer s={s} h={hb.h} overview={hb.overview} prefill={prefill} timezone={hb.timezone} onClose={() => setPrefill(null)}
        onSaved={order => { setPrefill(null); setSaved(hb.h.t('orderNumber', { number: order.number })); hb.onChanged?.(); }} />}
    </section>
  );
}
