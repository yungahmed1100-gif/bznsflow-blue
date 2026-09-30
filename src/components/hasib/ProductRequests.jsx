import React, { useState } from 'react';
import { hasib, dashboard } from '../../lib/dashboard/api';
import { usePolling } from '../../hooks/usePolling';
import { Dialog } from '../dashboard/Dialog';
import { loadWorkflowPages } from '../../lib/hasib/pagination';

// A sale fills a request once stock has left for that customer (matches the server).
const FILLING = ['confirmed', 'ready', 'out_for_delivery', 'failed_delivery', 'delivered', 'completed'];
const PICKER_PAGES = 4;

const variantLabel = (h, item, v) => `${h.name(item)} ${v.options.map(o => o.value).join(' / ')}`.trim();

/** Record a missing size or colour for a customer. Contacts and products load only when the form opens. */
function CreateDialog({ s, h, busy, error, onClose, onSubmit }) {
  const [form, setForm] = useState({ qty: '1' });
  const choices = usePolling(async () => {
    const [contacts, items] = await Promise.all([
      loadWorkflowPages(cursor => dashboard('contacts', { limit: 50, ...(cursor ? { cursor } : {}) }), PICKER_PAGES),
      loadWorkflowPages(cursor => hasib('items', { limit: 50, ...(cursor ? { cursor } : {}) }), PICKER_PAGES),
    ]);
    return { contacts: contacts.items, variants: items.items.filter(i => i.kind === 'product').flatMap(item => item.variants.map(v => ({ id: v.id, name: variantLabel(h, item, v) }))) };
  }, [h.ar], { interval: 0 });
  const set = patch => setForm(f => ({ ...f, ...patch }));
  return (
    <Dialog s={s} title={h.t('prRecordTitle')} onClose={onClose}>
      <form className="hb-move" onSubmit={e => { e.preventDefault(); onSubmit({ contactId: form.contactId, variantId: form.variantId, qty: Number(form.qty || 1) }); }}>
        {choices.loading && !choices.data ? <p className="ld-state" role="status">{h.t('loading')}</p>
          : choices.error && !choices.data ? <div className="ld-state" role="alert"><p>{h.reason(choices.error.reason) || s.reason(choices.error.reason)}</p><button type="button" className="ld-button" onClick={() => choices.refresh()}>{h.t('retry')}</button></div>
          : <fieldset disabled={busy} className="hb-action-fields">
            <label className="ld-field">{h.t('customer')}<select required value={form.contactId || ''} onChange={e => set({ contactId: e.target.value })}>
              <option value="">—</option>{choices.data.contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label className="ld-field">{h.t('prExactVariant')}<select required value={form.variantId || ''} onChange={e => set({ variantId: e.target.value })}>
              <option value="">—</option>{choices.data.variants.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
            <label className="ld-field">{h.t('quantity')}<input required type="number" min="1" max="10000" inputMode="numeric" value={form.qty} onChange={e => set({ qty: e.target.value })} /></label>
            {error && <p className="ld-inline-error" role="alert">{error}</p>}
            <div className="ld-actions"><button type="button" className="ld-button ld-quiet" onClick={onClose}>{h.t('cancel')}</button><button type="submit" className="ld-button ld-primary">{busy ? h.t('saving') : h.t('save')}</button></div>
          </fieldset>}
      </form>
    </Dialog>
  );
}

/** Mark a request filled by one of that customer's own sales. */
function FillDialog({ s, h, request, busy, error, onClose, onSubmit }) {
  const [orderId, setOrderId] = useState('');
  const orders = usePolling(() => hasib('contact_summary', { contactId: request.contactId }), [request.contactId], { interval: 0 });
  const eligible = (orders.data?.recent || []).filter(o => FILLING.includes(o.status));
  return (
    <Dialog s={s} title={h.t('prMarkFilled')} onClose={onClose}>
      <form className="hb-move" onSubmit={e => { e.preventDefault(); onSubmit(orderId); }}>
        <p className="ld-help">{h.t('prFillHelp', { name: request.contactName || '' })}</p>
        {orders.loading && !orders.data ? <p className="ld-state" role="status">{h.t('loading')}</p>
          : orders.error && !orders.data ? <div className="ld-state" role="alert"><p>{h.reason(orders.error.reason) || s.reason(orders.error.reason)}</p><button type="button" className="ld-button" onClick={() => orders.refresh()}>{h.t('retry')}</button></div>
          : !eligible.length ? <p className="ld-state">{h.t('prNoOrders')}</p>
          : <label className="ld-field">{h.t('prOrderWithVariant')}<select required value={orderId} disabled={busy} onChange={e => setOrderId(e.target.value)}>
            <option value="">—</option>{eligible.map(o => <option key={o.id} value={o.id}>#{o.number} · {h.t(`st_${o.status}`)} · {h.money(o.totalMinor)}</option>)}</select></label>}
        {error && <p className="ld-inline-error" role="alert">{error}</p>}
        <div className="ld-actions"><button type="button" className="ld-button ld-quiet" onClick={onClose}>{h.t('cancel')}</button>
          <button type="submit" className="ld-button ld-primary" disabled={busy || !orderId}>{busy ? h.t('saving') : h.t('prMarkFilled')}</button></div>
      </form>
    </Dialog>
  );
}

/** Customers waiting for an exact size or colour, kept together until a sale fills it. */
export function ProductRequests({ s, h }) {
  const [dialog, setDialog] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [requestIds] = useState(() => new Map());
  const list = usePolling(() => hasib('product_requests', { status: 'waiting', limit: 50 }), [], { interval: 30000 });
  const rows = list.data?.items || [];
  const close = () => { setDialog(null); setError(''); };
  const run = async (op, body) => {
    if (busy) return;
    setBusy(true); setError('');
    // One request id per distinct submission, so a retried or double-clicked save is recorded once.
    const key = JSON.stringify([op, body]);
    if (!requestIds.has(key)) requestIds.set(key, crypto.randomUUID());
    try { await hasib(op, { requestId: requestIds.get(key), ...body }); requestIds.delete(key); close(); list.refresh({ quiet: true }); }
    catch (e) { setError(h.reason(e.reason) || s.reason(e.reason)); if (['request_conflict', 'request_not_found'].includes(e.reason)) list.refresh({ quiet: true }); }
    finally { setBusy(false); }
  };
  const productName = row => `${row.product ? h.name(row.product) : h.t('prProductGone')} ${row.options.map(o => o.value).join(' / ')}`.trim();
  return (
    <section className="hb-panel hb-requests" aria-labelledby="hb-requests-title">
      <div className="ld-page-head"><h2 id="hb-requests-title">{h.t('prTitle')}</h2>
        <button type="button" className="ld-button" onClick={() => { setError(''); setDialog({ kind: 'create' }); }}>{h.t('prRecord')}</button></div>
      {list.loading && !list.data ? <p className="ld-state" role="status">{h.t('loading')}</p>
        : list.error && !list.data ? <div className="ld-state" role="alert"><p>{h.reason(list.error.reason) || s.reason(list.error.reason)}</p><button type="button" className="ld-button" onClick={() => list.refresh()}>{h.t('retry')}</button></div>
        : !rows.length ? <p className="ld-help">{h.t('prEmpty')}</p>
        : <ul className="hb-list">{rows.map(row => (
          <li className="hb-panel hb-row" key={row.id}>
            <div><b><bdi>{row.contactName || h.t('walkIn')}</bdi></b><p><bdi>{productName(row)}</bdi> × <span className="ld-num">{row.qty}</span></p>
              {row.availableNow && <p className="ld-chip is-green">{h.t('prBackInStock')}</p>}</div>
            <div className="ld-actions">
              {row.conversationId && <a className="ld-button" href={`?tab=chats&chat=${encodeURIComponent(row.conversationId)}`}>{h.t('openChats')}</a>}
              <button type="button" className="ld-button" disabled={busy} onClick={() => { setError(''); setDialog({ kind: 'fill', request: row }); }}>{h.t('prMarkFilled')}</button>
              <button type="button" className="ld-button ld-quiet ld-danger" disabled={busy} onClick={() => { setError(''); setDialog({ kind: 'cancel', request: row }); }}>{h.t('prCancel')}</button>
            </div>
          </li>))}</ul>}
      {error && !dialog && <p className="ld-inline-error" role="alert">{error}</p>}
      {list.data?.cursor && <p className="ld-help">{h.t('prMore')}</p>}
      {dialog?.kind === 'create' && <CreateDialog s={s} h={h} busy={busy} error={error} onClose={close} onSubmit={workflow => run('product_request_create', { workflow })} />}
      {dialog?.kind === 'fill' && <FillDialog s={s} h={h} request={dialog.request} busy={busy} error={error} onClose={close}
        onSubmit={orderId => run('product_request_status', { productRequestId: dialog.request.id, version: dialog.request.version, workflow: { status: 'fulfilled', orderId } })} />}
      {dialog?.kind === 'cancel' && <Dialog s={s} title={h.t('prCancel')} onClose={close}>
        <p>{h.t('prCancelConfirm', { name: dialog.request.contactName || h.t('walkIn') })}</p>
        {error && <p className="ld-inline-error" role="alert">{error}</p>}
        <div className="ld-actions"><button type="button" className="ld-button ld-quiet" onClick={close}>{h.t('keepOrder')}</button>
          <button type="button" className="ld-button ld-danger" disabled={busy} onClick={() => run('product_request_status', { productRequestId: dialog.request.id, version: dialog.request.version, workflow: { status: 'cancelled' } })}>{h.t('prCancel')}</button></div>
      </Dialog>}
    </section>
  );
}
