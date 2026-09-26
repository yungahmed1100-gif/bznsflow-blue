// Browser checks for Hasib (Orders, Stock) inside the owner dashboard.
// Usage: npm run dev -- --port 5199 & node tests/hasib-dashboard-browser.mjs http://127.0.0.1:5199
// All API responses are synthetic and every non-local request is aborted.
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const BASE = process.argv[2] || 'http://127.0.0.1:5199';
const OUT = process.env.HASIB_BROWSER_OUT || 'work/hasib-dashboard-browser';
await mkdir(OUT, { recursive: true });
const HOUR = 3600000, now = Date.now();
const CSRF = 'a'.repeat(64);

const packRetail = { id: 'retail', archetype: 'catalog', version: 'hasib-packs-v1',
  variantOptions: [{ key: 'size', en: 'Size', ar: 'المقاس' }, { key: 'length', en: 'Length', ar: 'الطول' }, { key: 'colour', en: 'Colour', ar: 'اللون' }],
  orderFields: [{ key: 'made_to_measure', en: 'Made to measure', ar: 'تفصيل حسب المقاس', type: 'boolean' }, { key: 'measurements', en: 'Measurements', ar: 'المقاسات', type: 'text', max: 300 }],
  expenseCategories: [] };
const contact = { id: 'k1', name: 'Mariam Al Balushi', nameSource: 'whatsapp', number: '96891234567', ownerName: '', customerName: '', profileName: 'Mariam Al Balushi', source: 'inbound', sectorId: 'retail',
  fields: [{ key: 'item', value: 'Black abaya', source: 'customer', confidence: 1, at: now }], qualificationStatus: 'in_progress', qualificationOverride: null, status: 'in_progress',
  consent: { status: 'unknown', source: '', date: '', purpose: '' }, optout: false, lastActivityAt: now - HOUR, lastInboundAt: now - HOUR, takeover: false, conversationId: 'c-k1', windowOpenUntil: now + 23 * HOUR, channel: 'whatsapp' };

function fixture() {
  const variant = { id: 'v1', sku: 'AB-52', options: [{ key: 'size', value: '52' }, { key: 'colour', value: 'Black' }], priceMinor: 25000, costMinor: 12000, onHand: 1, reorderPoint: 2, low: true };
  const item = { id: 'i1', kind: 'product', nameAr: 'عباية سوداء', nameEn: 'Black abaya', category: 'Abayas', unit: 'piece', trackStock: true, catalogEntryKey: null, variants: [variant], updatedAt: now };
  return { item, orders: [], payments: [], calls: [], needsSetup: false, chosen: false };
}

function publicOrder(o) { return { ...o, balanceMinor: o.totalMinor - o.paidMinor }; }

function api(state) {
  const overview = { ok: true, csrfToken: CSRF, account: { email: 'owner@example.test' }, dashboardAvailable: true, broadcastEnabled: false, connected: true,
    business: { name: 'Noor Abayas', sector: 'Retail', sectorId: 'retail' }, integration: { sender: '96890000000', path: 'new_number', status: 'connected', checks: { routing: true, registered: true, path: true }, checkedAt: now },
    messaging: { available: true, active: true, reason: '', broadcastAvailable: false, limits: { perMinute: 10, perDay: 100, usedToday: 3 } }, timezone: 'Asia/Muscat', migrationPending: false,
    qualification: { id: 'retail', archetype: 'catalog', sensitive: false, fields: [{ key: 'item', kind: 'catalog', en: 'Item', ar: 'المنتج', required: true, options: [] }] } };
  const livePacks = [{ id: 'retail', en: 'Retail and fashion', ar: 'التجزئة والأزياء' }];
  const hasibOverview = () => state.needsSetup && !state.chosen ? { setupRequired: true, livePacks, modules: [], settings: { currency: 'OMR', vatRegistered: false, vatRateBps: 500, pricesIncludeVat: false, vatin: '', stockPolicy: 'warn' } } : ({ setupRequired: false, livePacks, pack: packRetail, modules: ['orders', 'stock', 'expenses', 'insights'], settings: { currency: 'OMR', vatRegistered: false, vatRateBps: 500, pricesIncludeVat: false, vatin: '', stockPolicy: 'warn' },
    counts: { pendingOrders: state.orders.filter(o => o.status === 'pending').length, lowStock: state.item.variants.filter(v => v.low).length } });
  return async (surface, method, body) => {
    state.calls.push({ surface, method, action: body?.action, item: body?.item, products: body?.products });
    const ok = value => ({ status: 200, json: { ok: true, csrfToken: CSRF, ...value } });
    if (surface === 'dashboard' && method === 'GET') return { status: 200, json: overview };
    if (surface === 'messaging') return ok({ available: true, active: true, reason: '', limits: { usedToday: 3 } });
    if (surface === 'dashboard') {
      if (body?.action === 'conversations') return ok({ items: [{ id: 'c-k1', channel: 'whatsapp', contact, lastMessage: { direction: 'in', text: 'I want the black abaya, size 52', status: 'received', at: now - HOUR }, updatedAt: now - HOUR, takeover: false, optout: false, windowOpenUntil: now + 23 * HOUR }], cursor: null });
      if (body?.action === 'thread') return ok({ contact, conversation: { id: 'c-k1', takeover: false, optout: false, windowOpenUntil: now + 23 * HOUR }, messages: [{ id: 'm1', direction: 'in', text: 'I want the black abaya, size 52', status: 'received', at: now - HOUR }], before: null });
      if (body?.action === 'contacts') return ok({ items: [contact], cursor: null, migrationPending: false, qualification: overview.qualification });
      return ok({});
    }
    if (surface !== 'hasib') return { status: 404, json: { ok: false } };
    if (method === 'GET') return ok(hasibOverview());
    switch (body?.action) {
      case 'items': return ok({ items: !body.search || /abaya|عباية|ab/i.test(body.search) ? [state.item] : [], cursor: null });
      case 'low_stock': return ok({ items: state.item.variants.filter(v => v.low).map(v => ({ ...v, itemId: state.item.id, nameAr: state.item.nameAr, nameEn: state.item.nameEn })) });
      case 'orders': return ok({ items: state.orders.map(o => ({ ...publicOrder(o), lineCount: o.lines.length })), cursor: null });
      case 'conversation_orders': return ok({ items: state.orders.filter(o => o.conversationId === body.conversationId).map(o => ({ id: o.id, number: o.number, status: o.status, source: o.source || 'owner', kind: 'sale', lineCount: o.lines.length, totalMinor: o.totalMinor, balanceMinor: o.totalMinor - o.paidMinor, paymentStatus: o.paymentStatus, createdAt: o.createdAt })) });
      case 'contact_summary': return ok({ orderCount: state.orders.length, lifetimeMinor: state.orders.reduce((n, o) => n + o.totalMinor, 0), balanceMinor: state.orders.reduce((n, o) => n + o.totalMinor - o.paidMinor, 0), lastOrderAt: null, recent: [] });
      case 'order_create': {
        const existing = state.orders.find(o => o.requestId === body.requestId);
        if (existing) return ok(publicOrder(existing));
        const lines = body.lines.map(l => ({ ...l, name: l.variantId ? 'عباية سوداء — 52 / Black' : l.name, discountMinor: 0, vatBps: 0, netMinor: l.qty * l.unitPriceMinor, vatMinor: 0, unitCostMinor: 0, tracked: !!l.variantId }));
        const sub = lines.reduce((n, l) => n + l.netMinor, 0), total = sub + (body.deliveryFeeMinor || 0);
        const order = { id: `o${state.orders.length + 1}`, requestId: body.requestId, number: state.orders.length + 1, status: body.confirm ? 'confirmed' : 'pending', channel: body.channel,
          contact: body.conversationId ? { id: 'k1', name: contact.name } : null, customerName: body.customerName || '', conversationId: body.conversationId || null, lines,
          subtotalMinor: sub, discountMinor: 0, deliveryMinor: body.deliveryFeeMinor || 0, vatMinor: 0, totalMinor: total, pricesIncludeVat: false, paidMinor: 0, paymentStatus: 'unpaid',
          fulfilment: body.fulfilment, customFields: body.customFields || [], notes: body.notes || '', stockShort: body.confirm && lines.some(l => l.variantId && l.qty > 1), history: [{ status: body.confirm ? 'confirmed' : 'pending', at: now }], version: 1, createdAt: now, updatedAt: now };
        state.orders.unshift(order);
        return ok(publicOrder(order));
      }
      case 'order': { const o = state.orders.find(x => x.id === body.orderId); return ok({ ...publicOrder(o), payments: state.payments.filter(p => p.orderId === o.id) }); }
      case 'order_status': { const o = state.orders.find(x => x.id === body.orderId); o.status = body.to; o.version++; o.history.push({ status: body.to, at: now }); return ok(publicOrder(o)); }
      case 'payment_record': {
        const o = state.orders.find(x => x.id === body.orderId);
        if (!state.payments.some(p => p.requestId === body.requestId)) { state.payments.push({ id: `p${state.payments.length + 1}`, requestId: body.requestId, orderId: o.id, amountMinor: body.amountMinor, method: body.method, reference: body.reference || '', at: now }); o.paidMinor += body.amountMinor; }
        o.paymentStatus = o.paidMinor >= o.totalMinor ? 'paid' : o.paidMinor > 0 ? 'partial' : 'unpaid';
        return ok({ order: publicOrder(o) });
      }
      case 'settings_update': if (body.packId !== 'retail') return { status: 409, json: { ok: false, reason: 'pack_not_live' } }; state.chosen = true; return ok({ settings: {} });
      case 'items_import': state.imports = (state.imports || []).concat([body.products]); return ok({ results: body.products.map((p, index) => ({ index, status: 'created', itemId: `imp${index}` })), created: body.products.length, updated: 0, failed: 0 });
      case 'today': return ok({ date: '2026-09-26', timezone: 'Asia/Muscat',
        needsYou: { orders: [{ id: 'o9', number: 9, flags: ['out_of_stock'], createdAt: now - HOUR, totalMinor: 75000, customerName: 'Mariam' }], ordersCount: 1, chats: 2, lowStock: [{ variantId: 'v1', itemId: 'i1', nameAr: 'عباية سوداء', nameEn: 'Black abaya', options: [{ key: 'size', value: '52' }], onHand: 1 }], lowStockCount: 1, repairsReady: null },
        layla: { replies: 14, ordersConfirmed: 3, productQuestions: 6 }, money: { todayMinor: 50000, monthMinor: 1282000, owedMinor: 25000 }, setup: { products: true, photos: false, services: true } });
      case 'photo_upload_url': return ok({ url: `${BASE}/upload-test` });
      case 'photo_register': return ok({ photoId: body.storageId });
      case 'item_save': return ok({ item: state.item, variants: state.item.variants });
      case 'stock_move': { const v = state.item.variants[0]; v.onHand += body.delta; v.low = v.onHand <= v.reorderPoint; return ok({ variant: v }); }
      default: return { status: 400, json: { ok: false, reason: 'invalid_action' } };
    }
  };
}

async function openPage(browser, { width, lang = 'en', path, handler }) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(BASE).origin) return route.abort();
    if (url.pathname === '/api/layla-meta') {
      const response = await handler(url.searchParams.get('surface'), route.request().method(), route.request().postDataJSON());
      return route.fulfill({ status: response.status, json: response.json });
    }
    if (url.pathname === '/upload-test') return route.fulfill({ status: 200, json: { storageId: 'kg_photo1' } });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, json: { ok: false } });
    return route.continue();
  });
  await page.goto(`${BASE}${lang === 'ar' ? '' : '/en'}${path}`);
  return { page, context };
}
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const axe = async (page, scope = '.ld') => (await new AxeBuilder({ page }).include(scope).analyze()).violations.filter(v => ['critical', 'serious'].includes(v.impact)).map(v => `${v.id}: ${v.nodes.map(n => n.target).join(', ')}`);
const T = { en: { stock: 'Stock', orders: 'Orders', newOrder: 'New order', save: 'Save order', record: 'Record payment', create: 'Create order', search: 'Search products or SKU', adjust: 'Adjust stock' },
  ar: { stock: 'المخزون', orders: 'الطلبات', newOrder: 'طلب جديد', save: 'حفظ الطلب', record: 'تسجيل دفعة', create: 'إنشاء طلب', search: 'ابحث عن منتج أو رمز SKU', adjust: 'تعديل المخزون' } };

const browser = await chromium.launch();
let count = 0;
try {
  for (const lang of ['en', 'ar']) {
    const t = T[lang];
    for (const width of [1440, 1280, 1024, 768, 375, 320]) {
      const state = fixture();
      // Stock tab: product listed with its low-stock flag; nav shows the Hasib tabs.
      const { page, context } = await openPage(browser, { width, lang, path: '/layla/dashboard?tab=stock', handler: api(state) });
      await page.getByRole('heading', { name: t.stock, exact: true }).waitFor();
      const nav = await page.getByRole('navigation').first().getByRole('link').allTextContents();
      assert.ok(nav.includes(t.orders) && nav.includes(t.stock), `Hasib tabs in nav (${lang} ${width})`); count++;
      assert.match(await page.locator('.hb-stock-table').textContent(), lang === 'ar' ? /عباية سوداء/ : /Black abaya/); count++;
      assert.equal(await noOverflow(page), true, `stock no overflow ${lang} ${width}`); count++;
      assert.deepEqual(await axe(page), [], `stock axe ${lang} ${width}`); count++;
      await page.screenshot({ path: `${OUT}/stock-${lang}-${width}.png`, fullPage: true });

      // Adjust stock through the dialog.
      await page.getByRole('button', { name: t.adjust }).first().click();
      const move = page.getByRole('dialog');
      await move.locator('input[dir=ltr]').first().fill('5');
      await move.getByRole('button', { name: lang === 'ar' ? 'حفظ' : 'Save', exact: true }).click();
      await move.waitFor({ state: 'detached' });
      assert.ok(state.calls.some(c => c.action === 'stock_move')); count++;

      // Orders tab: new order from the product search, then the detail and a payment.
      await page.getByRole('link', { name: t.orders }).click();
      await page.getByRole('heading', { name: t.orders, exact: true }).waitFor();
      await page.getByRole('button', { name: t.newOrder }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByPlaceholder(t.search).fill('abaya');
      await dialog.locator('.hb-picker-list button').first().click();
      await dialog.locator('.hb-totals').waitFor();
      assert.match(await dialog.locator('.hb-grand').first().textContent(), /25\.000/); count++;
      assert.equal(await noOverflow(page), true, `composer no overflow ${lang} ${width}`); count++;
      assert.deepEqual(await axe(page, '.ld-dialog'), [], `composer axe ${lang} ${width}`); count++;
      await page.screenshot({ path: `${OUT}/composer-${lang}-${width}.png` });
      await dialog.getByRole('button', { name: t.save }).dblclick();
      await page.locator('.hb-detail').waitFor();
      assert.equal(state.orders.length, 1, 'double-click still makes one order'); count++;
      const detail = page.getByRole('dialog');
      await detail.locator('.hb-payment input.hb-money').fill('10');
      await detail.getByRole('button', { name: t.record }).click();
      await page.waitForFunction(() => /15\.000/.test(document.querySelector('.hb-detail .hb-totals')?.textContent || ''));
      assert.equal(state.payments[0].amountMinor, 10000, 'money is sent in baisa'); count++;
      assert.deepEqual(await axe(page, '.ld-dialog'), [], `detail axe ${lang} ${width}`); count++;
      await page.screenshot({ path: `${OUT}/detail-${lang}-${width}.png` });
      await context.close();
    }

    // Chat: no create-order button; the orders Layla filed for this chat show in the header.
    for (const width of [1280, 375]) {
      const state = fixture();
      state.orders.push({ id: 'o9', requestId: 'x', number: 9, status: 'pending', channel: 'whatsapp', source: 'layla', contact: { id: 'k1', name: contact.name }, customerName: '', conversationId: 'c-k1',
        lines: [{ variantId: 'v1', name: 'عباية سوداء — 52 / Black', qty: 1, unitPriceMinor: 25000, discountMinor: 0, vatBps: 0, netMinor: 25000, vatMinor: 0, unitCostMinor: 0, tracked: true }],
        subtotalMinor: 25000, discountMinor: 0, deliveryMinor: 0, vatMinor: 0, totalMinor: 25000, pricesIncludeVat: false, paidMinor: 0, paymentStatus: 'unpaid', fulfilment: { type: 'pickup' },
        customFields: [], notes: '', stockShort: false, history: [{ status: 'pending', at: now }], version: 1, createdAt: now, updatedAt: now });
      const { page, context } = await openPage(browser, { width, lang, path: '/layla/dashboard?tab=chats&chat=c-k1', handler: api(state) });
      await page.locator('.hb-chat-order').first().waitFor();
      assert.equal(await page.getByRole('button', { name: t.create }).count(), 0, 'no create-order button'); count++;
      assert.match(await page.locator('.hb-chat-orders').textContent(), lang === 'ar' ? /من ليلى/ : /From Layla/); count++;
      assert.equal(await noOverflow(page), true, `chat orders overflow ${lang} ${width}`); count++;
      await page.locator('.hb-chat-order').first().click();
      await page.locator('.hb-detail').waitFor();
      assert.deepEqual(await axe(page, '.ld-dialog'), [], `chat order axe ${lang} ${width}`); count++;
      await context.close();
    }
  }
  // First run for a business whose Layla sector is not live: pick Retail, then the tabs appear.
  for (const [lang, width] of [['en', 1280], ['ar', 375]]) {
    const state = { ...fixture(), needsSetup: true };
    const { page, context } = await openPage(browser, { width, lang, path: '/layla/dashboard?tab=insights', handler: api(state) });
    await page.getByRole('heading', { name: lang === 'ar' ? 'إعداد الطلبات والمخزون' : 'Set up orders and stock' }).waitFor();
    const links = await page.getByRole('navigation').first().getByRole('link').allTextContents();
    assert.ok(!links.includes(T[lang].orders) && !links.includes(T[lang].stock), 'no Hasib tabs before an industry is chosen'); count++;
    assert.deepEqual(await axe(page), [], `setup axe ${lang}`); count++;
    assert.equal(await noOverflow(page), true); count++;
    await page.screenshot({ path: `${OUT}/setup-${lang}-${width}.png` });
    await page.getByRole('button', { name: lang === 'ar' ? 'استخدام التجزئة والأزياء' : 'Use Retail and fashion' }).click();
    await page.getByRole('link', { name: T[lang].orders }).waitFor();
    assert.ok(state.calls.some(c => c.action === 'settings_update'), 'the choice is saved to Hasib settings'); count++;
    await context.close();
  }
  // RTL: the rail sits on the right in Arabic.
  {
    const { page, context } = await openPage(browser, { width: 1280, lang: 'ar', path: '/layla/dashboard?tab=orders', handler: api(fixture()) });
    await page.getByRole('heading', { name: 'الطلبات', exact: true }).waitFor();
    assert.equal(await page.locator('.ld').getAttribute('dir'), 'rtl'); count++;
    const nav = await page.locator('.ld-nav').boundingBox();
    assert.ok(nav.x > 640, 'rail on the right in RTL'); count++;
    await context.close();
  }
  // Product photo: thumbnail in Stock, upload from the editor, saved with the product.
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  for (const [lang, width] of [['en', 1280], ['ar', 375]]) {
    const state = fixture();
    state.item = { ...state.item, photoUrl: `data:image/png;base64,${PNG.toString('base64')}` };
    const { page, context } = await openPage(browser, { width, lang, path: '/layla/dashboard?tab=stock', handler: api(state) });
    await page.locator('.hb-stock-table img.hb-thumb').first().waitFor();
    count++;
    await page.locator('.hb-stock-table .ld-row-open').first().click();
    const editor = page.getByRole('dialog');
    await editor.getByText(lang === 'ar' ? 'تغيير الصورة' : 'Change photo').waitFor();
    assert.equal(await editor.locator('.hb-photo-frame img').count(), 1, `current photo shown (${lang})`); count++;
    await editor.locator('input[type=file]').setInputFiles({ name: 'abaya.png', mimeType: 'image/png', buffer: PNG });
    await page.waitForFunction(() => document.querySelector('.hb-photo-frame img')?.src.startsWith('blob:'));
    assert.deepEqual(await axe(page, '[role=dialog]'), [], `photo editor axe ${lang}`); count++;
    await page.screenshot({ path: `${OUT}/photo-editor-${lang}-${width}.png` });
    await editor.locator('input[type=file]').setInputFiles({ name: 'notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
    await editor.getByRole('alert').filter({ hasText: lang === 'ar' ? 'JPG أو PNG أو WebP' : 'JPG, PNG or WebP' }).waitFor();
    count++;
    await editor.getByRole('button', { name: lang === 'ar' ? 'حفظ' : 'Save', exact: true }).click();
    await editor.waitFor({ state: 'detached' });
    assert.equal(state.calls.find(c => c.action === 'item_save')?.item?.photoId, 'kg_photo1', `photo saved with the product (${lang})`); count++;
    assert.equal(await noOverflow(page), true); count++;
    await context.close();
  }
  // Today is home: what needs the owner (each with its reason and one tap), Layla's day, the money, setup left.
  const TT = { en: { today: 'Today', seeAll: 'See all', orders: 'Orders', stock: 'Stock', money: 'Money', customers: 'Customers', list: 'Customer list', settings: 'Settings', channels: 'Channels', services: 'Services' },
    ar: { today: 'اليوم', seeAll: 'عرض الكل', orders: 'الطلبات', stock: 'المخزون', money: 'المال', customers: 'العملاء', list: 'قائمة العملاء', settings: 'الإعدادات', channels: 'القنوات', services: 'الخدمات' } };
  for (const lang of ['en', 'ar']) {
    const t = TT[lang];
    for (const width of [1440, 1024, 768, 375, 320]) {
      const state = fixture();
      const { page, context } = await openPage(browser, { width, lang, path: '/layla/dashboard', handler: api(state) });
      await page.getByRole('heading', { level: 1, name: new RegExp(`^${t.today}`) }).waitFor();
      const sections = await page.getByRole('navigation', { name: lang === 'ar' ? 'أقسام اللوحة' : 'Dashboard sections' }).getByRole('link').allTextContents();
      assert.deepEqual(sections.map(x => x.replace(/\d+$/, '')), lang === 'ar' ? ['اليوم', 'المحادثات', 'الطلبات', 'المخزون', 'المال', 'العملاء', 'الإعدادات'] : ['Today', 'Chats', 'Orders', 'Stock', 'Money', 'Customers', 'Settings'], `sections ${lang}`); count++;
      const needs = await page.locator('.hb-needs').textContent();
      assert.match(needs, lang === 'ar' ? /طلبات بانتظارك: 1/ : /Orders waiting for you: 1/); count++;
      assert.match(needs, lang === 'ar' ? /الكمية غير كافية/ : /Not enough in stock/, 'the reason is shown'); count++;
      assert.match(await page.locator('.hb-today').textContent(), lang === 'ar' ? /أُنجز 4 من 5/ : /4 of 5 done/, 'setup progress'); count++;
      assert.equal(await noOverflow(page), true, `today no overflow ${lang} ${width}`); count++;
      assert.deepEqual(await axe(page), [], `today axe ${lang} ${width}`); count++;
      await page.screenshot({ path: `${OUT}/today-${lang}-${width}.png`, fullPage: true });
      if (width === 375) {
        await page.locator('.hb-need').first().getByRole('button').click();
        await page.getByRole('heading', { name: t.orders, exact: true }).waitFor();
        assert.match(page.url(), /tab=orders/); count++;
        // Old links land where their content lives now.
        await page.goto(`${BASE}${lang === 'ar' ? '' : '/en'}/layla/dashboard?tab=contacts`);
        const views = page.getByRole('navigation', { name: lang === 'ar' ? 'أقسام هذه الصفحة' : 'Views in this section' });
        assert.equal(await views.getByRole('link', { name: t.list }).getAttribute('aria-current'), 'page', `contacts → customers (${lang})`); count++;
        await page.goto(`${BASE}${lang === 'ar' ? '' : '/en'}/layla/dashboard?tab=stock&view=services`);
        assert.equal(await views.getByRole('link', { name: t.services }).getAttribute('aria-current'), 'page'); count++;
        assert.deepEqual(await axe(page), [], `stock services axe ${lang}`); count++;
      }
      await context.close();
    }
  }

  // A new product starts simple: name, size, price, stock. Cost, alert and SKU wait under "More details".
  for (const lang of ['en', 'ar']) {
    const { page, context } = await openPage(browser, { width: 375, lang, path: '/layla/dashboard?tab=stock', handler: api(fixture()) });
    await page.getByRole('button', { name: lang === 'ar' ? 'إضافة منتج' : 'Add product' }).click();
    const editor = page.getByRole('dialog');
    const cost = editor.getByLabel(lang === 'ar' ? 'التكلفة (ر.ع.)' : 'Cost (OMR)');
    assert.equal(await cost.count(), 0, `cost hidden for a new product (${lang})`); count++;
    await editor.getByRole('button', { name: lang === 'ar' ? 'تفاصيل أكثر' : 'More details' }).click();
    assert.equal(await cost.count(), 1, `cost shown on request (${lang})`); count++;
    assert.deepEqual(await axe(page, '[role=dialog]'), [], `simple editor axe ${lang}`); count++;
    await context.close();
  }

  // Import from a file: pick a CSV, check the columns and products, save, see the summary.
  const CSV = 'Stock list September\n\nProduct,Size,Selling price,Qty,SKU\nBlack abaya,52,25.000,3,AB-52\nBlack abaya,56,25.000,2,AB-56\nKaftan,,18.5,,\nShayla,,,4,\n';
  for (const [lang, width] of [['en', 1280], ['ar', 375]]) {
    const state = fixture();
    const { page, context } = await openPage(browser, { width, lang, path: '/layla/dashboard?tab=stock', handler: api(state) });
    await page.getByRole('button', { name: lang === 'ar' ? 'استيراد من ملف' : 'Import from a file' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[type=file]').setInputFiles({ name: 'stock.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
    await dialog.locator('.hb-import-table').waitFor();
    assert.match(await dialog.locator('.hb-import-summary').textContent(), lang === 'ar' ? /المنتجات: 2 · الخيارات: 3 · في المخزون: 5/ : /Products: 2 · Options: 3 · In stock: 5/, `summary (${lang})`); count++;
    assert.match(await dialog.locator('.hb-import-issues').textContent(), lang === 'ar' ? /السطر 5: السعر غير موجود/ : /Line 5: the price is missing/, 'the bad line is explained'); count++;
    assert.equal(await dialog.locator('select').first().inputValue(), '0', 'the product column was recognised'); count++;
    assert.deepEqual(await axe(page, '[role=dialog]'), [], `importer axe ${lang}`); count++;
    assert.equal(await noOverflow(page), true, `importer no overflow ${lang} ${width}`); count++;
    await page.screenshot({ path: `${OUT}/import-review-${lang}-${width}.png` });
    await dialog.getByRole('button', { name: lang === 'ar' ? 'إضافة المنتجات (2)' : 'Add products (2)' }).click();
    await dialog.locator('.hb-import-summary').filter({ hasText: lang === 'ar' ? 'جديد 2' : '2 new' }).waitFor();
    const sent = state.calls.find(c => c.action === 'items_import').products;
    assert.deepEqual(sent.map(p => [p.item.nameEn, p.variants.map(v => [v.sku, v.priceMinor, v.quantity ?? null])]), [['Black abaya', [['AB-52', 25000, 3], ['AB-56', 25000, 2]]], ['Kaftan', [['', 18500, null]]]]); count++;
    await page.screenshot({ path: `${OUT}/import-done-${lang}-${width}.png` });
    await dialog.getByRole('button', { name: lang === 'ar' ? 'تم' : 'Done', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    await context.close();
  }
  console.log(`hasib dashboard browser: ${count} assertions passed`);
} finally {
  await browser.close();
}
