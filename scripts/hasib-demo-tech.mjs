// 30 days of a fictional Muscat phone and electronics store ("Muscat Mobile") for
// the local Hasib demo. Chats, receipts, sales, trade-ins and repairs are replayed
// in true time order, so every IMEI's state is what the real code produced.
import { randomUUID } from 'node:crypto';

export async function seedTech({ m, tenant, call, hasib, executeMessaging, DAY, HOUR }) {
  const at = daysAgo => Date.now() - daysAgo * DAY + 3 * HOUR;
  const imei = (prefix, n) => `${prefix}${String(n).padStart(15 - prefix.length, '0')}`;

  // Layla's catalog: what customers can ask about by name.
  for (const [i, [nameEn, nameAr]] of [['iPhone 15', 'آيفون 15'], ['Galaxy S24', 'جالكسي S24'], ['iPhone 13 used', 'آيفون 13 مستعمل'], ['AirPods Pro', 'إيربودز برو'], ['Screen protector', 'شاشة حماية']].entries()) {
    await m.db.insert('blueCatalogEntries', { ownerKey: String(tenant.accountId), entryKey: randomUUID(), kind: 'product', status: 'approved', nameEn, nameAr, category: 'Phones', benefitEn: '', benefitAr: '',
      descriptionEn: '', descriptionAr: '', availability: '', prices: [], source: 'owner', confidence: 1, laylaUseEn: '', laylaUseAr: '', revision: 1, sortOrder: i, createdAt: m.now(), updatedAt: m.now() });
  }
  const opt = (key, value) => ({ key, value });
  const product = async (nameEn, nameAr, category, variants, { serialized = false, warrantyMonths = 0, warrantyBy = 'none', price, cost }) => (await hasib('item_save', { requestId: randomUUID(),
    item: { kind: 'product', nameAr, nameEn, category, unit: 'piece', trackStock: true, ...(serialized ? { serialized: true } : {}), ...(warrantyMonths ? { warrantyMonths, warrantyBy } : {}) },
    variants: variants.map(([options, sku, opening = 0, p = price, c = cost]) => ({ sku, options, priceMinor: p, costMinor: c, reorderPoint: serialized ? 1 : 5, ...(serialized ? {} : { openingStock: opening }) })) })).variants;

  const ip15 = await product('iPhone 15 (official)', 'آيفون 15 (وكيل)', 'Phones', [[[opt('storage', '128GB'), opt('colour', 'Black'), opt('condition', 'New')], 'IP15-128-BK'], [[opt('storage', '256GB'), opt('colour', 'Blue'), opt('condition', 'New')], 'IP15-256-BL', 0, 385000, 338000]],
    { serialized: true, warrantyMonths: 12, warrantyBy: 'agent', price: 329000, cost: 289000 });
  const ip15i = await product('iPhone 15 (international)', 'آيفون 15 (نسخة دولية)', 'Phones', [[[opt('storage', '128GB'), opt('colour', 'Pink'), opt('condition', 'New')], 'IP15I-128-PK']],
    { serialized: true, warrantyMonths: 12, warrantyBy: 'store', price: 299000, cost: 262000 });
  const s24 = await product('Galaxy S24', 'جالكسي S24', 'Phones', [[[opt('storage', '256GB'), opt('colour', 'Grey'), opt('condition', 'New')], 'S24-256-GY']],
    { serialized: true, warrantyMonths: 12, warrantyBy: 'agent', price: 289000, cost: 251000 });
  const ip13u = await product('iPhone 13 (used)', 'آيفون 13 (مستعمل)', 'Used phones', [[[opt('storage', '128GB'), opt('condition', 'Used')], 'IP13-U']],
    { serialized: true, warrantyMonths: 3, warrantyBy: 'store', price: 145000, cost: 0 });
  const protector = await product('Screen protector', 'شاشة حماية', 'Accessories', [[[], 'ACC-SP', 120]], { price: 5000, cost: 1200 });
  const charger = await product('USB-C charger 20W', 'شاحن USB-C 20 واط', 'Accessories', [[[], 'ACC-CH20', 40]], { price: 9000, cost: 4500 });
  const casing = await product('Silicone case', 'غطاء سيليكون', 'Accessories', [[[], 'ACC-CASE', 80]], { price: 6000, cost: 1800 });
  const screen = await product('iPhone 15 screen (part)', 'شاشة آيفون 15 (قطعة)', 'Repair parts', [[[], 'PRT-IP15-SCR', 4]], { price: 62000, cost: 41000 });

  // Stock arrives with its IMEIs.
  const queue = new Map();
  const receive = async (variant, prefix, count, daysAgo, unitCostMinor) => {
    const serials = Array.from({ length: count }, (_, i) => imei(prefix, (queue.get(variant.id)?.length || 0) + i + 1));
    queue.set(variant.id, [...(queue.get(variant.id) || []), ...serials]);
    await hasib('stock_move', { requestId: randomUUID(), variantId: variant.id, delta: count, reason: 'stock_in', serials, unitCostMinor }, at(daysAgo));
  };
  const take = (variant, n = 1) => { const q = queue.get(variant.id); return q.splice(0, n); };
  await receive(ip15[0], '35693810', 24, 29, 289000);
  await receive(ip15[1], '35693820', 4, 29, 338000);
  await receive(ip15i[0], '35412030', 5, 28, 262000);
  await receive(s24[0], '35071140', 16, 28, 251000);

  const people = [['96892100001', 'سالم الهنائي'], ['96892100002', 'Khalid Al Rashdi'], ['96892100003', 'مريم الشيدية'], ['96892100004', 'Omar Al Farsi'], ['96892100005', 'نوال البوسعيدية'],
    ['96892100006', 'Yousuf Al Amri'], ['96892100007', 'حمد الغيثي'], ['96892100008', 'Aisha Al Kharusi']];
  for (const [waId, name] of people) {
    await call(executeMessaging, 'ingest', { integrationId: tenant.integration.id, events: [{ kind: 'message', id: `tech-hello-${waId}`, from: waId, at: m.now(), text: /[؀-ۿ]/.test(name) ? 'السلام عليكم' : 'Hello', reply: 'Welcome!', intent: 'greeting', handoff: false, profileName: name }] });
  }
  const contactOf = i => m.table('blueContacts').find(c => c.waId === people[i][0] && c.state === 'active')?._id;

  const events = [];
  const plan = (daysAgo, run) => events.push({ t: at(daysAgo), run: () => run(at(daysAgo)) });
  const ask = (daysAgo, who, text, intent) => events.push({ t: at(daysAgo) - HOUR, run: async () => {
    const t = at(daysAgo) - HOUR; if (t > m.now()) m.advance(t - m.now());
    await call(executeMessaging, 'ingest', { integrationId: tenant.integration.id, events: [{ kind: 'message', id: `tech-${randomUUID()}`, from: people[who][0], at: m.now(), text, reply: 'Let me check for you.', intent, handoff: false }] });
  } });
  const sell = (daysAgo, lines, { who, method = 'card', confirm = true, complete = true } = {}) => plan(daysAgo, async t => {
    let o = await hasib('order_create', { requestId: randomUUID(), channel: who !== undefined ? 'whatsapp' : 'walk_in', confirm, fulfilment: { type: 'in_store' },
      lines: lines.map(([v, qty = 1]) => (v.serialized ? { variantId: v.id, qty, serials: take(v, qty) } : { variantId: v.id, qty })), ...(who !== undefined ? { contactId: contactOf(who) } : {}) }, t);
    o = (await hasib('payment_record', { requestId: randomUUID(), orderId: o.id, amountMinor: o.totalMinor, method }, t + HOUR)).order;
    if (complete) await hasib('order_status', { orderId: o.id, to: 'completed', version: o.version }, t + 2 * HOUR);
  });
  const P = (v, extra = {}) => Object.assign(v, extra);
  [ip15[0], ip15[1], ip15i[0], s24[0], ip13u[0]].forEach(v => P(v, { serialized: true }));

  // Demand through Layla, including a product the shop does not stock.
  ask(26, 0, 'عندكم آيفون 15؟', 'availability_request'); ask(24, 1, 'Do you have the Galaxy S24?', 'availability_request'); ask(21, 2, 'كم سعر إيربودز برو؟', 'price');
  ask(19, 3, 'Price of AirPods Pro?', 'price'); ask(15, 4, 'عندكم آيفون 13 مستعمل؟', 'availability_request'); ask(9, 5, 'Do you have AirPods Pro?', 'availability_request');
  ask(6, 6, 'عندكم آيفون 15؟', 'availability_request'); ask(3, 7, 'Is the Galaxy S24 available?', 'availability_request');

  sell(27, [[ip15[0]], [protector[0]], [casing[0]]], { who: 0 });
  sell(25, [[s24[0]], [charger[0]]], { who: 1, method: 'bank_transfer' });
  sell(23, [[ip15i[0]], [protector[0]]]);
  sell(22, [[protector[0], 2], [charger[0]]], { method: 'cash' });
  sell(20, [[ip15[1]]], { method: 'bank_transfer' });
  sell(18, [[ip15[0]], [casing[0]]], { method: 'cash' });
  sell(16, [[s24[0]]]);
  sell(14, [[protector[0]], [casing[0]]], { method: 'cash' });
  sell(12, [[ip15i[0]]], { who: 3 });
  sell(10, [[ip15[0]], [charger[0]]], { method: 'bank_transfer' });
  sell(8, [[casing[0], 2]], { method: 'cash' });
  sell(6, [[ip15[0]]], { who: 6 });
  sell(4, [[s24[0]], [protector[0]]], { method: 'card' });
  sell(2, [[ip15[1]], [casing[0]]], { method: 'bank_transfer' });
  sell(1, [[protector[0], 3]], { method: 'cash' });
  sell(0.2, [[charger[0]]], { method: 'cash' });
  // Everyday trade: accessories daily, and a phone most days.
  for (let d = 29; d >= 0; d--) {
    sell(d + 0.4, [[protector[0]], [casing[0]], ...(d % 3 === 0 ? [[charger[0]]] : [])], { method: d % 2 ? 'cash' : 'card' });
    if (d % 2 === 0) sell(d + 0.35, [[d % 4 ? ip15[0] : s24[0]], [protector[0]]], { method: d % 4 ? 'card' : 'bank_transfer' });
  }

  // Trade-ins: used iPhones bought from customers, two resold.
  const tradeIn = (daysAgo, n, cost, seller, note) => plan(daysAgo, async t => {
    const serial = imei('35325150', n);
    queue.set(ip13u[0].id, [...(queue.get(ip13u[0].id) || []), serial]);
    await hasib('trade_in', { requestId: randomUUID(), variantId: ip13u[0].id, serial, costMinor: cost, method: 'cash', customerName: seller, note }, t);
  });
  tradeIn(20, 1, 105000, 'Walk-in seller', 'Battery 88%, clean');
  tradeIn(13, 2, 98000, 'Hilal', 'Battery 84%, light scratch');
  tradeIn(5, 3, 110000, 'Walk-in seller', 'Battery 91%, boxed');
  sell(11, [[ip13u[0]]], { who: 4, method: 'cash' });
  sell(3, [[ip13u[0]]], { method: 'card' });

  // Repairs at every stage; one is a phone this shop sold, under store warranty.
  const repair = (daysAgo, fields, steps = [], { labour, parts = [], deposit } = {}) => plan(daysAgo, async t => {
    let r = await hasib('repair_create', { requestId: randomUUID(), ...fields }, t);
    if (deposit) await hasib('payment_record', { requestId: randomUUID(), orderId: r.order.id, amountMinor: deposit, method: 'cash' }, t + HOUR);
    for (const [i, to] of steps.entries()) {
      if (to === 'quote') { r = await hasib('repair_update', { repairId: r.id, version: r.version, ...(labour !== undefined ? { labourMinor: labour } : {}), parts: parts.map(([v, qty]) => ({ variantId: v.id, qty })) }, t + (i + 2) * HOUR); continue; }
      // Work starts only once the customer approves the quote.
      if (to === 'approve') { r = await hasib('repair_approval', { repairId: r.id, version: r.version, approvedBy: `${fields.customerName} (in store)` }, t + (i + 2) * HOUR); continue; }
      r = await hasib('repair_status', { repairId: r.id, to, version: r.version }, t + (i + 2) * HOUR);
      if (to === 'collected' && r.order.balanceMinor > 0) await hasib('payment_record', { requestId: randomUUID(), orderId: r.order.id, amountMinor: r.order.balanceMinor, method: 'card' }, t + (i + 3) * HOUR);
    }
  });
  repair(17, { device: 'iPhone 14 Pro', serial: '353251600000011', fault: 'Cracked screen', customerName: 'Saif', quoteMinor: 20000 }, ['diagnosing', 'quote', 'approve', 'ready', 'collected'], { labour: 20000, parts: [[screen[0], 1]], deposit: 20000 });
  repair(4, { device: 'Galaxy A54', serial: '353251600000029', fault: 'Charging port loose', customerName: 'Mona', quoteMinor: 12000 }, ['diagnosing', 'approve', 'repairing', 'ready'], { deposit: 5000 });
  repair(2, { device: 'iPhone 12', fault: 'Battery drains fast', accessories: 'Case, charger', customerName: 'Rashid', quoteMinor: 15000 }, ['diagnosing', 'waiting_parts']);
  repair(0.5, { device: 'iPad Air', fault: 'Does not power on', customerName: 'Laila', quoteMinor: 0 }, ['diagnosing']);
  events.push({ t: at(0.3), run: async () => {
    const soldImei = m.table('hasibSerials').find(s => s.status === 'sold' && s.warrantyBy === 'store')?.serial;
    await hasib('repair_create', { requestId: randomUUID(), device: 'iPhone 15 128GB Pink', serial: soldImei, fault: 'Face ID not working', customerName: 'Walk-in customer', quoteMinor: 25000 }, at(0.3));
  } });

  for (const e of events.sort((x, y) => x.t - y.t)) await e.run();

  const expense = (daysAgo, category, amount, vendor, method = 'bank_transfer') => hasib('expense_create', { requestId: randomUUID(), category, amountMinor: amount, method,
    paidOn: new Date(at(daysAgo) + 4 * HOUR).toISOString().slice(0, 10), vendor }, at(daysAgo));
  await expense(25, 'rent', 450000, 'Ruwi shop landlord');
  await expense(2, 'salaries', 600000, 'Two sales staff');
  await expense(28, 'stock_purchase', 9800000, 'Dubai distributor');
  await expense(14, 'marketing', 60000, 'Instagram ads', 'card');
  await expense(9, 'repair_parts', 41000, 'Parts supplier');
  await expense(3, 'utilities', 52000, 'Nama electricity');
}
