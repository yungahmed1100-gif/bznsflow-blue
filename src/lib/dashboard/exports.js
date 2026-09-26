// Owner exports built in the browser from tenant-scoped API responses.
// PDF uses the browser's print-to-PDF so Arabic shapes and RTL render correctly.
import { dashboard } from './api.js';
import { toCsv } from './csv.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const safeName = value => String(value || 'contact').replace(/[^\p{L}\p{N}+ _-]/gu, '').trim().slice(0, 40) || 'contact';

export function chatCsv(chat) {
  return toCsv([['time', 'direction', 'template', 'status', 'text'], ...chat.messages.map(m => [m.at, m.direction, m.template, m.status, m.text])]);
}
export function contactsCsv(items, fieldKeys = []) {
  const keys = [...new Set([...fieldKeys, ...items.flatMap(c => Object.keys(c.fields || {}))])];
  return toCsv([
    ['name', 'number', 'channel', 'instagram_id', 'status', 'source', 'consent', 'consent_source', 'consent_date', 'consent_purpose', 'opted_out', 'handled_by_you', 'last_activity', ...keys],
    ...items.map(c => [c.name, c.number, c.channel || 'whatsapp', c.instagramId || '', c.status, c.source, c.consent, c.consentSource, c.consentDate, c.consentPurpose, c.optedOut ? 'yes' : 'no', c.takeover ? 'yes' : 'no', c.lastActivity, ...keys.map(k => c.fields?.[k] || '')]),
  ]);
}
export function chatHtml(chat, { lang, business }) {
  const ar = lang === 'ar';
  const rows = chat.messages.map(m => `<tr><td>${escapeHtml(new Date(m.at).toLocaleString(ar ? 'ar-OM-u-nu-latn' : 'en-GB'))}</td><td>${escapeHtml(m.direction === 'in' ? (ar ? 'العميل' : 'Customer') : m.template ? `${ar ? 'قالب' : 'Template'}: ${m.template}` : (ar ? 'النشاط' : 'Business'))}</td><td dir="auto">${escapeHtml(m.text)}</td><td>${escapeHtml(m.status)}</td></tr>`).join('');
  return `<!doctype html><html lang="${lang}" dir="${ar ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${escapeHtml(chat.contact.name)}</title>
<style>body{font:14px/1.6 ${ar ? "'IBM Plex Sans Arabic'," : ''}Poppins,Arial,sans-serif;color:#1a1a1a;margin:32px}h1{font-size:20px;margin:0}p{color:#4b5563;margin:4px 0 20px}table{width:100%;border-collapse:collapse}th,td{text-align:start;vertical-align:top;border-bottom:1px solid rgba(0,0,0,.15);padding:8px}td:nth-child(3){white-space:pre-wrap;overflow-wrap:anywhere}th{font-size:12px}</style></head>
<body><h1>${escapeHtml(chat.contact.name)} · ${escapeHtml(chat.contact.channel==='instagram'?`Instagram ${chat.contact.instagramId || ''}`:chat.contact.number)}</h1><p>${escapeHtml(business)}</p><table><thead><tr><th>${ar ? 'الوقت' : 'Time'}</th><th>${ar ? 'من' : 'From'}</th><th>${ar ? 'الرسالة' : 'Message'}</th><th>${ar ? 'الحالة' : 'Status'}</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
}

export function download(filename, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename, rel: 'noopener' });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function printHtml(html) {
  const frame = Object.assign(document.createElement('iframe'), { title: 'print', srcdoc: html });
  Object.assign(frame.style, { position: 'fixed', width: '0', height: '0', border: '0', insetInlineStart: '-9999px' });
  frame.onload = () => { frame.contentWindow.focus(); frame.contentWindow.print(); setTimeout(() => frame.remove(), 60000); };
  document.body.appendChild(frame);
}

export async function exportChat(conversationId, format, { lang, business }) {
  const chat = await dashboard('export_chat', { conversationId });
  const base = safeName(chat.contact.name);
  if (format === 'csv') download(`${base}.csv`, chatCsv(chat), 'text/csv;charset=utf-8');
  else printHtml(chatHtml(chat, { lang, business }));
}
async function allPages(action, key) {
  const items = [];
  let cursor;
  for (let page = 0; page < 200; page++) {
    const result = await dashboard(action, cursor ? { cursor } : {}, { timeout: 60000 });
    items.push(...result[key]);
    if (!result.cursor) break;
    cursor = result.cursor;
  }
  return items;
}
export async function exportContacts(fieldKeys) {
  download('contacts.csv', contactsCsv(await allPages('export_contacts', 'items'), fieldKeys), 'text/csv;charset=utf-8');
}
export async function exportAccount({ lang, business, fieldKeys }) {
  const [{ default: JSZip }, contacts, chats] = await Promise.all([import('jszip'), allPages('export_contacts', 'items'), allPages('export_account', 'chats')]);
  const zip = new JSZip();
  zip.file('contacts.csv', contactsCsv(contacts, fieldKeys));
  chats.forEach((chat, index) => {
    const base = `chats/${String(index + 1).padStart(3, '0')}-${safeName(chat.contact.name)}`;
    zip.file(`${base}.csv`, chatCsv(chat));
    zip.file(`${base}.html`, chatHtml(chat, { lang, business }));
  });
  download('bznsflow-layla-export.zip', await zip.generateAsync({ type: 'blob' }));
}
