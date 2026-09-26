// Local Hasib demo: the real Layla + Hasib Convex state logic on an in-memory
// database, seeded with 30 days of an Omani abaya boutique, behind the built site.
//
//   npm run build && node scripts/hasib-demo.mjs [port]
//   open http://localhost:5310/layla/dashboard?tab=insights   (English: /en/layla/dashboard)
//
// Local only. No network, no Meta, no Convex deployment; nothing is sent.
// POST /demo/inbound {"from":"96899...","text":"..."} simulates a customer message to Layla.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { randomUUID } from 'node:crypto';
import { convexMemory, SECRET } from '../tests/helpers/convex-memory.mjs';
import { seedTenant } from '../tests/helpers/blue-tenant.mjs';
import { executeMessaging } from '../convex/blueMessagingState.js';
import { executeDashboard } from '../convex/blueDashboardState.js';
import { executeCampaigns } from '../convex/blueCampaignState.js';
import { executeHasib } from '../convex/hasib/hasibState.js';
import { grantPlan } from '../convex/hasib/plans.js';

const PORT = Number(process.argv[2] || 5310), DIST = new URL('../dist/', import.meta.url).pathname;
const DAY = 86400000, HOUR = 3600000, CSRF = 'd'.repeat(64);
const m = convexMemory({ start: Date.now() - 30 * DAY });

// ── Seed ───────────────────────────────────────────────────────────────────
const tenant = await seedTenant(m, { name: 'n', sector: 'Retail' });
await m.db.patch(tenant.rowId, { profile: { businessName: 'Noor Abayas', sector: 'Retail', services: 'Abayas, shaylas and tailoring', prices: 'From 8 OMR', hours: '10–10', location: 'Al Khuwair, Muscat', humanContact: 'owner@noor.example', reviewed: true } });
for (const key of ['global', 'broadcast', 'hasib']) await m.db.insert('blueMessagingSettings', { key, enabled: key !== 'broadcast' });
await grantPlan(m.ctx, { email: 'n@example.com', plan: 'ascend', packId: 'retail' }, m.now());
await m.db.insert('blueBusinessSettings', { accountId: tenant.accountId, timezone: 'Asia/Muscat', updatedAt: m.now() });
const call = (fn, operation, args = {}, at = m.now()) => fn(m.ctx, { operation, sessionHash: tenant.sessionHash, hashSecret: SECRET, workerFunction: 'dispatch', ...args }, at);
const hasib = async (operation, args, at) => { const r = await call(executeHasib, operation, args, at); if (!r.ok) throw Error(`${operation}: ${r.reason}`); return r.value; };
await call(executeMessaging, 'activate');

const catalog = [['Black classic abaya', 'عباية سوداء كلاسيك'], ['Embroidered abaya', 'عباية مطرزة'], ['Silk shayla', 'شيلة حرير'], ['Everyday abaya', 'عباية يومية'], ['Linen kaftan', 'قفطان كتان']];
for (const [i, [nameEn, nameAr]] of catalog.entries()) {
  await m.db.insert('blueCatalogEntries', { ownerKey: String(tenant.accountId), entryKey: randomUUID(), kind: 'product', status: 'approved', nameEn, nameAr, category: 'Abayas', benefitEn: '', benefitAr: '',
    descriptionEn: '', descriptionAr: '', availability: '', prices: [], source: 'owner', confidence: 1, laylaUseEn: '', laylaUseAr: '', revision: 1, sortOrder: i, createdAt: m.now(), updatedAt: m.now() });
}
const product = async (nameEn, nameAr, category, price, cost, variants, kind = 'product') => (await hasib('item_save', { requestId: randomUUID(),
  item: { kind, nameAr, nameEn, category, unit: 'piece', trackStock: kind === 'product' },
  variants: variants.map(([options, stock, sku]) => ({ sku, options, priceMinor: price, costMinor: cost, reorderPoint: 2, openingStock: stock })) })).variants;
const sz = (size, colour) => [{ key: 'size', value: size }, ...(colour ? [{ key: 'colour', value: colour }] : [])];
const classic = await product('Black classic abaya', 'عباية سوداء كلاسيك', 'Abayas', 25000, 11000, [[sz('52'), 10, 'BC-52'], [sz('54'), 14, 'BC-54'], [sz('56'), 12, 'BC-56'], [sz('58'), 5, 'BC-58']]);
const embroidered = await product('Embroidered abaya', 'عباية مطرزة', 'Abayas', 38000, 17000, [[sz('54', 'Navy'), 8, 'EM-54N'], [sz('56', 'Navy'), 6, 'EM-56N'], [sz('56', 'Black'), 5, 'EM-56B']]);
const shayla = await product('Silk shayla', 'شيلة حرير', 'Shaylas', 8000, 3000, [[[{ key: 'colour', value: 'Black' }], 60, 'SH-B'], [[{ key: 'colour', value: 'Beige' }], 30, 'SH-G']]);
const everyday = await product('Everyday abaya', 'عباية يومية', 'Abayas', 16000, 7000, [[sz('52'), 0, 'EV-52'], [sz('54'), 1, 'EV-54']]);
const hemming = await product('Hemming', 'تقصير', 'Tailoring', 2000, 0, [[[], 0, 'SRV-HEM']], 'service');

// Customers write to Layla over the month; each product question becomes a demand signal.
const people = [['96891234501', 'مريم البلوشي'], ['96891234502', 'Salma Al Harthy'], ['96891234503', 'عائشة الرواحي'], ['96891234504', 'فاطمة السعدي'], ['96891234505', 'Noora Al Hinai'],
  ['96891234506', 'هدى المسكرية'], ['96891234507', 'Reem Al Lawati'], ['96891234508', 'شمسة الكندية'], ['96891234509', 'Maha Al Busaidi'], ['96891234510', 'أمل الشكيلية']];
let msg = 0;
const inbound = async (from, text, intent, profileName) => call(executeMessaging, 'ingest', { integrationId: tenant.integration.id,
  events: [{ kind: 'message', id: `demo-${++msg}`, from, at: m.now(), text, reply: 'Thanks — the team will confirm.', intent, handoff: false, ...(profileName ? { profileName } : {}) }] });
const contactOf = waId => m.table('blueContacts').find(c => c.waId === waId && c.state === 'active');
// [days ago, person, message, Layla's intent] — oldest first; the clock only moves forward.
const script = [
  [28, 1, 'Do you have the embroidered abaya in navy?', 'availability_request'], [26, 0, 'عندكم عباية سوداء كلاسيك مقاس 54؟', 'availability_request'],
  [23, 3, 'عندكم عباية يومية مقاس 54؟', 'availability_request'], [20, 2, 'كم سعر الشيلة الحرير؟', 'price'], [19, 7, 'أبغى عباية مطرزة', 'catalog_item'],
  [14, 5, 'عندكم قفطان كتان؟', 'availability_request'], [12, 4, 'Is the everyday abaya available?', 'availability_request'], [10, 8, 'Do you have the black classic abaya?', 'availability_request'],
  [9, 6, 'How much is the linen kaftan?', 'price'], [5, 9, 'عندكم عباية يومية؟', 'availability_request'], [4, 2, 'عندكم عباية مطرزة؟', 'availability_request'],
  [2, 4, 'Price of the silk shayla?', 'price'], [1, 10, 'Do you have the linen kaftan in beige?', 'availability_request'],
];
people.push(['96891234511', 'Latifa Al Zadjali']);
// Chats and sales are replayed in true time order, so each question sees the stock that existed then.
const events = [];
const moveTo = t => { if (t > m.now()) m.advance(t - m.now()); };
m.advance(Date.now() - 29.9 * DAY - m.now());
for (const [waId, name] of people) await inbound(waId, /[؀-ۿ]/.test(name) ? 'السلام عليكم' : 'Hello', 'greeting', name);
for (const [daysAgo, who, text, intent] of script) {
  const t = Date.now() - daysAgo * DAY + 2 * HOUR;
  events.push({ t, run: async () => { moveTo(t); await inbound(people[who][0], text, intent, people[who][1]); } });
}

// A month of orders, payments and expenses, at the times they happened.
const at = daysAgo => Date.now() - daysAgo * DAY + 3 * HOUR;
const order = async (daysAgo, lines, { who, channel = who !== undefined ? 'whatsapp' : 'walk_in', status = 'completed', paid = 'full', method = 'cash', fulfilment = { type: 'in_store' }, fields, notes, dueAt } = {}) => {
  const contactId = who !== undefined ? contactOf(people[who][0])?._id : undefined;
  let o = await hasib('order_create', { requestId: randomUUID(), channel, confirm: status !== 'pending', lines, fulfilment: { ...fulfilment, ...(dueAt ? { dueAt } : {}) },
    ...(contactId ? { contactId } : {}), ...(fields ? { customFields: fields } : {}), ...(notes ? { notes } : {}) }, at(daysAgo));
  const amount = paid === 'full' ? o.totalMinor : paid === 'none' ? 0 : paid;
  if (amount) o = (await hasib('payment_record', { requestId: randomUUID(), orderId: o.id, amountMinor: amount, method }, at(daysAgo) + HOUR)).order;
  if (status === 'delivered') { o = await hasib('order_status', { orderId: o.id, to: 'out_for_delivery', version: o.version }, at(daysAgo) + 2 * HOUR); o = await hasib('order_status', { orderId: o.id, to: 'delivered', version: o.version }, at(daysAgo) + 5 * HOUR); }
  else if (status === 'completed') o = await hasib('order_status', { orderId: o.id, to: 'completed', version: o.version }, at(daysAgo) + 2 * HOUR);
  else if (status === 'cancelled') o = await hasib('order_status', { orderId: o.id, to: 'cancelled', version: o.version }, at(daysAgo) + 2 * HOUR);
  return o;
};
const plan = (daysAgo, ...args) => events.push({ t: at(daysAgo), run: () => order(daysAgo, ...args) });
const L = (v, qty = 1) => ({ variantId: v.id, qty });
const delivery = area => ({ type: 'delivery', area });
plan(29, [L(classic[1]), L(shayla[0])]);
plan(27, [L(embroidered[0])], { who: 1, status: 'delivered', method: 'cod', fulfilment: delivery('Al Mouj') });
plan(26, [L(shayla[0], 2)]);
plan(24, [L(classic[2])], { who: 0, method: 'bank_transfer' });
plan(22, [L(classic[1]), L(hemming[0])]);
plan(21, [L(everyday[1])], { who: 3, status: 'delivered', method: 'cod', fulfilment: delivery('Seeb') });
plan(19, [L(shayla[1], 3)], { method: 'card' });
plan(18, [L(embroidered[2])], { who: 7, method: 'bank_transfer' });
plan(16, [L(classic[0]), L(shayla[0])], { who: 2, status: 'delivered', method: 'cod', fulfilment: delivery('Bausher') });
plan(15, [L(classic[3])], { status: 'cancelled', paid: 'none' });
plan(13, [L(classic[1], 2)], { method: 'card' });
plan(12, [L(embroidered[1]), L(hemming[0])], { who: 5, method: 'bank_transfer' });
plan(10, [L(shayla[0])]);
plan(9, [L(classic[2]), L(shayla[1])], { who: 8, status: 'delivered', method: 'cod', fulfilment: delivery('Qurum') });
plan(7, [L(shayla[0]), L(shayla[1])], { method: 'card' });
plan(6, [L(classic[1])], { who: 4, method: 'bank_transfer' });
plan(5, [L(embroidered[0])], { who: 6, status: 'confirmed', paid: 15000, method: 'bank_transfer',
  fields: [{ key: 'made_to_measure', value: 'yes' }, { key: 'measurements', value: 'Length 58, sleeve 60, shoulder 40' }, { key: 'fitting_date', value: new Date(at(-3)).toISOString().slice(0, 10) }], notes: 'Navy, gold thread', dueAt: at(-4) });
plan(4, [L(shayla[0], 2)], { method: 'card' });
plan(3, [L(classic[2])], { who: 9, status: 'out_for_delivery', paid: 'none', fulfilment: delivery('Al Khoud') });
plan(2, [L(classic[0]), L(hemming[0])]);
plan(1, [L(embroidered[1])], { who: 1, status: 'confirmed', paid: 10000, method: 'bank_transfer', fulfilment: delivery('Al Mouj') });
plan(0.2, [L(shayla[1])], { method: 'cash' });
plan(0.1, [L(classic[1])], { who: 0, status: 'pending', paid: 'none', fulfilment: delivery('Al Khuwair') });
// Everyday counter trade: deterministic, so every run shows the same month.
for (let d = 29; d >= 0; d--) {
  plan(d + 0.3, [L(shayla[d % 2], 1 + (d % 3 === 0))], { method: d % 2 ? 'cash' : 'card' });
  if (d % 3 === 1) plan(d + 0.28, [L(classic[(d + 1) % 4]), L(shayla[0])], { method: 'card' });
  if (d % 2 === 0) plan(d + 0.25, [L(classic[d % 4])], { method: d % 4 ? 'card' : 'cash', channel: d % 6 === 0 ? 'instagram' : 'walk_in' });
  if (d % 5 === 1) plan(d + 0.2, [L(embroidered[d % 3])], { method: 'bank_transfer', channel: 'instagram', status: 'delivered', fulfilment: delivery(['Qurum', 'Seeb', 'Al Amerat'][d % 3]) });
}
for (const e of events.sort((x, y) => x.t - y.t)) await e.run();
const expense = (daysAgo, category, amount, vendor, method = 'bank_transfer') => hasib('expense_create', { requestId: randomUUID(), category, amountMinor: amount, method,
  paidOn: new Date(at(daysAgo) + 4 * HOUR).toISOString().slice(0, 10), vendor }, at(daysAgo));
await expense(25, 'rent', 300000, 'Al Khuwair shop landlord');
await expense(2, 'salaries', 350000, 'Sales assistant');
await expense(20, 'stock_purchase', 900000, 'Dubai wholesaler');
await expense(14, 'marketing', 45000, 'Instagram ads', 'card');
await expense(8, 'delivery', 30000, 'Courier', 'cash');
await expense(3, 'utilities', 38500, 'Nama electricity');
await hasib('stock_move', { requestId: randomUUID(), variantId: shayla[0].id, delta: -1, reason: 'damage', note: 'Stain on display piece' }, at(11));

// ── Server ─────────────────────────────────────────────────────────────────
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webp': 'image/webp', '.xml': 'application/xml', '.txt': 'text/plain' };
const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
const readJson = req => new Promise(resolve => { let b = ''; req.on('data', c => { b += c; if (b.length > 70000) req.destroy(); }); req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve({}); } }); });
const DASHBOARD_OPS = new Set(['overview', 'set_timezone', 'conversations', 'thread', 'contacts', 'contact_update', 'contact_delete', 'export_chat', 'export_contacts', 'export_account']);
const messagingState = { ok: true, available: true, active: true, reason: '', limits: { perMinute: 10, perDay: 100, usedToday: 0 }, csrfToken: CSRF };

async function api(req, res, url) {
  const surface = url.searchParams.get('surface');
  const body = req.method === 'POST' ? await readJson(req) : {};
  const reply = r => r.ok ? json(res, 200, { ok: true, ...(r.value || {}), csrfToken: CSRF }) : json(res, r.reason === 'sign_in_required' ? 401 : 409, { ok: false, reason: r.reason });
  const { action, ...args } = body;
  if (surface === 'hasib') return reply(await call(executeHasib, req.method === 'GET' ? 'overview' : action, args, Date.now()));
  if (surface === 'dashboard') {
    if (req.method === 'GET') {
      const r = await call(executeDashboard, 'overview', {}, Date.now());
      return r.ok ? json(res, 200, { ok: true, ...r.value, account: { email: 'owner@noor.example' }, dashboardAvailable: true, broadcastApiEnabled: false, broadcastEnabled: false, csrfToken: CSRF }) : reply(r);
    }
    if (DASHBOARD_OPS.has(action)) return reply(await call(executeDashboard, action, args, Date.now()));
    if (['templates', 'campaigns'].includes(action)) return reply(await call(executeCampaigns, action, args, Date.now()));
    return json(res, 409, { ok: false, reason: 'broadcast_unavailable' });
  }
  if (surface === 'messaging') return json(res, 200, messagingState);
  return json(res, 404, { ok: false, reason: 'not_in_demo' });
}

async function staticFile(res, pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  for (const candidate of [clean, `${clean}.html`, join(clean, 'index.html')]) {
    const file = join(DIST, candidate);
    if (!file.startsWith(DIST)) break;
    try { if ((await stat(file)).isFile()) { res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' }); return res.end(await readFile(file)); } } catch { /* try the next candidate */ }
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found');
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname === '/api/layla-meta') return await api(req, res, url);
    if (url.pathname === '/demo/inbound' && req.method === 'POST') {
      const { from = '96899000001', text = '', name } = await readJson(req);
      await call(executeMessaging, 'ingest', { integrationId: tenant.integration.id, events: [{ kind: 'message', id: `live-${randomUUID()}`, from: String(from).replace(/\D/g, '').slice(0, 15), at: Date.now(),
        text: String(text).slice(0, 500), reply: 'Thanks!', intent: /price|how much|كم|سعر/i.test(text) ? 'price' : 'availability_request', handoff: false, ...(name ? { profileName: String(name).slice(0, 60) } : {}) }] }, Date.now());
      return json(res, 200, { ok: true });
    }
    if (url.pathname.startsWith('/api/')) return json(res, 404, { ok: false, reason: 'not_in_demo' });
    return await staticFile(res, url.pathname === '/' ? '/layla/dashboard' : url.pathname);
  } catch (e) { json(res, 500, { ok: false, reason: 'demo_error', detail: String(e.message).slice(0, 200) }); }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Hasib demo (Noor Abayas) → http://localhost:${PORT}/layla/dashboard?tab=insights   ·   English: http://localhost:${PORT}/en/layla/dashboard?tab=insights`);
});
