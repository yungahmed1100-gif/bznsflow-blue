import React, { useState } from 'react';
import { hasib, dashboard } from '../../lib/dashboard/api';
import { usePolling } from '../../hooks/usePolling';
import { Dialog } from '../dashboard/Dialog';
import { loadWorkflowPages } from '../../lib/hasib/pagination';

/** Keep the exact variant and customer together until the request is filled. */
export function ProductRequests({ s, h }) {
  const [open, setOpen] = useState(false), [form, setForm] = useState({}), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const text = (en, ar) => h.ar ? ar : en;
  const [requestIds] = useState(() => new Map());
  const [pages, setPages] = useState(20);
  const state = usePolling(async () => {
    const [requests, contacts, items, orders] = await Promise.all([
      loadWorkflowPages(cursor => hasib('product_requests', { limit: 200, ...(cursor ? { cursor } : {}) }), pages),
      loadWorkflowPages(cursor => dashboard('contacts', { limit: 50, ...(cursor ? { cursor } : {}) }), pages),
      ...['items', 'orders'].map(op => loadWorkflowPages(cursor => hasib(op, { limit: 50, ...(cursor ? { cursor } : {}) }), pages)),
    ]);
    return { orders: orders.items, requests: requests.items, contacts: contacts.items, hasMore: [requests, contacts, items, orders].some(page => page.cursor), variants: items.items.flatMap(item => item.variants.map(v => ({ ...v, name: `${h.name(item)} ${v.options.map(o => o.value).join(' / ')}` }))) };
  }, [pages, h.ar], { interval: 30000 });
  const run = async (op, body) => { if (busy) return; setBusy(true); setError(''); const key = JSON.stringify([op, body]); if (!requestIds.has(key)) requestIds.set(key, crypto.randomUUID());
    try { await hasib(op, { requestId: requestIds.get(key), ...body }); requestIds.delete(key); setOpen(false); state.refresh(); } catch (e) { setError(h.reason(e.reason) || s.reason(e.reason)); } finally { setBusy(false); } };
  return <section className="hb-panel"><div className="ld-page-head"><h2>{text('Customers waiting for a product', 'عملاء ينتظرون منتجاً')}</h2><button className="ld-button" onClick={() => { setForm({}); setOpen(true); }}>{text('Record missing size or colour', 'تسجيل مقاس أو لون غير متوفر')}</button></div>{error && <p role="alert">{error}</p>}
    {state.error && <p role="alert">{h.reason(state.error.reason) || s.reason(state.error.reason)}</p>}
    {state.data?.hasMore && <button className="ld-button" disabled={state.loading} onClick={() => setPages(value => value + 20)}>{text('Load more records', 'تحميل المزيد من السجلات')}</button>}
    {(state.data?.requests || []).filter(row => !['fulfilled', 'cancelled'].includes(row.status)).map(row => { const variant = state.data.variants.find(v => v.id === row.variantId), contact = state.data.contacts.find(c => c.id === row.contactId); return <div className="hb-panel" key={row.id}><b>{contact?.name}</b><p>{variant?.name} × {row.qty}</p>{variant?.onHand >= row.qty && <p>{text('Back in stock — contact this customer.', 'متوفر الآن — تواصل مع هذا العميل.')}</p>}<div className="ld-actions">{contact?.conversationId && <a className="ld-button" href={`?tab=chats&chat=${contact.conversationId}`}>{h.t('openChats')}</a>}<button className="ld-button" disabled={busy} onClick={() => { setForm({ request: row }); setOpen(true); }}>{text('Mark filled', 'تم توفير الطلب')}</button></div></div>; })}
    {open && <Dialog s={s} title={text('Record a product request', 'تسجيل طلب منتج')} onClose={() => setOpen(false)}><form onSubmit={e => { e.preventDefault(); if (form.request) run('product_request_status', { productRequestId: form.request.id, version: form.request.version, workflow: { status: 'fulfilled', orderId: form.orderId } }); else run('product_request_create', { workflow: { contactId: form.contactId, variantId: form.variantId, qty: Number(form.qty || 1) } }); }}><fieldset disabled={busy} className="hb-action-fields">{error && <p role="alert">{error}</p>}{form.request ? <label className="ld-field">{text('Order with this exact size and colour', 'طلب بنفس المقاس واللون')}<select required value={form.orderId || ''} onChange={e => setForm(f => ({ ...f, orderId: e.target.value }))}><option value="">—</option>{state.data?.orders.filter(row => ['confirmed', 'preparing', 'ready', 'completed'].includes(row.status)).map(row => <option key={row.id} value={row.id}>#{row.number} · {row.customerName || row.contact?.name} · {h.money(row.totalMinor)}</option>)}</select></label> : <>{[['contactId', h.t('customer'), state.data?.contacts], ['variantId', text('Exact size and colour', 'المقاس واللون المحددان'), state.data?.variants]].map(([key, label, rows]) => <label className="ld-field" key={key}>{label}<select required value={form[key] || ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}><option value="">—</option>{rows?.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>)}<label className="ld-field">{h.t('quantity')}<input required type="number" min="1" value={form.qty || 1} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} /></label></>}<button className="ld-button ld-primary">{h.t('save')}</button></fieldset></form></Dialog>}
  </section>;
}
