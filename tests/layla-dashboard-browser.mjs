// Browser checks for the owner dashboard and activation hand-off.
// Usage: npm run dev -- --port 5199 & node tests/layla-dashboard-browser.mjs http://127.0.0.1:5199
// All API responses are synthetic and every non-local request is aborted.
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { hasibPack, industryCatalog, visibleModules } from '../config/hasib-packs.js';
import { capabilitiesFor } from '../convex/hasib/capabilities.js';

const BASE = process.argv[2] || 'http://127.0.0.1:5199';
const OUT = process.env.LAYLA_BROWSER_OUT || 'work/layla-dashboard-browser';
await mkdir(OUT, { recursive: true });
const HOUR = 3600000, now = Date.now();
const pack = { id: 'real-estate', archetype: 'project', sensitive: false, fields: [
  { key: 'need', kind: 'enum', en: 'Need', ar: 'الاحتياج', required: true, options: [{ id: 'rent', en: 'Rent', ar: 'إيجار' }, { id: 'buy', en: 'Buy', ar: 'شراء' }] },
  { key: 'area', kind: 'area', en: 'Area', ar: 'المنطقة', required: true, options: [] },
  { key: 'budget', kind: 'budget', en: 'Budget', ar: 'الميزانية', required: true, options: [] }] };

function fixture() {
  const contact = (id, name, number, extra = {}) => ({ id, name, nameSource: name.startsWith('+') ? 'number' : 'whatsapp', number, ownerName: '', customerName: '', profileName: name, source: 'inbound', sectorId: 'real-estate',
    fields: [{ key: 'need', value: 'rent', source: 'customer', confidence: 0.9, at: now }], qualificationStatus: 'in_progress', qualificationOverride: null, status: 'in_progress',
    consent: { status: 'unknown', source: '', date: '', purpose: '' }, optout: false, lastActivityAt: now - HOUR, lastInboundAt: now - HOUR, takeover: false, conversationId: `c-${id}`, windowOpenUntil: now + 23 * HOUR, ...extra });
  const contacts = [
    contact('k1', 'Aisha Al Balushi', '96891234567'),
    contact('k2', 'محمد الحارثي', '96892345678', { lastInboundAt: now - 30 * HOUR, windowOpenUntil: now - 6 * HOUR, consent: { status: 'granted', source: 'Store form', date: '2026-09-01', purpose: 'Offers' } }),
    contact('k3', '+971501234567', '971501234567', { nameSource: 'number', status: 'qualified', qualificationStatus: 'qualified', optout: true }),
  ];
  const messages = {
    'c-k1': [{ id: 'm1', direction: 'in', text: 'Do you have villas for rent in Seeb?', status: 'received', at: now - 2 * HOUR }, { id: 'm2', direction: 'out', text: 'Yes — villas from 500 OMR.\n\nTo help you further, could you share your approximate budget?', status: 'read', at: now - 2 * HOUR + 5000 },
      { id: 'm3', direction: 'in', text: null, textExpired: true, status: 'received', at: now - 40 * 86400000 }],
    'c-k2': [{ id: 'm4', direction: 'in', text: 'كم سعر الشقة في الموالح؟', status: 'received', at: now - 30 * HOUR }, { id: 'm5', direction: 'template', templateName: 'autumn_offer', text: 'Hello محمد, enjoy 10% off.', status: 'failed', errorCode: 131049, at: now - 29 * HOUR }],
    'c-k3': [{ id: 'm6', direction: 'in', text: 'stop', status: 'received', at: now - 3 * HOUR }],
  };
  return { contacts, messages, campaigns: [], calls: [], takeover: {} };
}

function api(state, { overviewStatus = 200, overviewReason, founderPreview = false } = {}) {
  // The real overview always carries the plan's capabilities (convex/blueDashboardState.js); this owner is on Ascend.
  const overview = { ok: true, csrfToken: 'a'.repeat(64), account: { email: 'owner@example.test' }, plan: 'ascend', workspaceRole: 'manager', capabilities: capabilitiesFor('ascend'), dashboardAvailable: true, broadcastEnabled: true, connected: true,
    founderPreview,
    business: { name: 'Blue Studio Properties', sector: 'Real estate', sectorId: 'real-estate' }, integration: { sender: '96890000000', path: 'new_number', status: 'connected', checks: { routing: true, registered: true, path: true }, checkedAt: now },
    messaging: { available: true, active: true, reason: '', broadcastAvailable: true, limits: { perMinute: 10, perDay: 100, usedToday: 7 } }, timezone: 'Asia/Muscat', migrationPending: false, qualification: pack };
  const template = { id: '111', name: 'autumn_offer', language: 'en', category: 'MARKETING', status: 'APPROVED', parameterFormat: 'positional', header: null, body: 'Hello {{1}}, enjoy {{2}} off this week.', footer: 'Tap Stop promotions to opt out',
    buttons: [], variables: [{ key: '1', component: 'body', example: 'Sara' }, { key: '2', component: 'body', example: '10%' }], sendable: true, unsupportedReason: null, syncedAt: now };
  const item = c => ({ id: c.conversationId, contact: { ...c, takeover: !!state.takeover[c.conversationId] }, lastMessage: (m => m && { direction: m.direction, text: m.text, status: m.status, at: m.at })(state.messages[c.conversationId].filter(x => x.text).at(-1)),
    updatedAt: c.lastActivityAt, takeover: !!state.takeover[c.conversationId], optout: c.optout, windowOpenUntil: c.windowOpenUntil });
  return async (surface, method, body) => {
    state.calls.push({ surface, method, action: body?.action });
    const ok = value => ({ status: 200, json: { ok: true, csrfToken: 'a'.repeat(64), ...value } });
    if (surface === 'dashboard' && method === 'GET') return overviewStatus === 200 ? { status: 200, json: overview } : { status: overviewStatus, json: { ok: false, reason: overviewReason } };
    if (surface === 'messaging') {
      if (['takeover', 'resume_conversation'].includes(body?.action)) state.takeover[body.conversationId] = body.action === 'takeover';
      return ok({ available: true, active: true, reason: '', limits: { usedToday: 7 } });
    }
    switch (body?.action) {
      case 'conversations': return ok({ items: state.contacts.filter(c => !body.search || c.name.includes(body.search) || c.number.includes(body.search)).map(item), cursor: null });
      case 'thread': { const c = state.contacts.find(x => x.conversationId === body.conversationId);
        return ok({ contact: c, conversation: { id: c.conversationId, takeover: !!state.takeover[c.conversationId], optout: c.optout, windowOpenUntil: c.windowOpenUntil }, messages: state.messages[c.conversationId], before: null }); }
      case 'contacts': return ok({ items: state.contacts.map(c => ({ ...c, takeover: !!state.takeover[c.conversationId] })), cursor: null, migrationPending: false, qualification: pack });
      case 'templates': return ok({ templates: [template], syncedAt: now, broadcastAvailable: true });
      case 'campaigns': return ok({ items: state.campaigns, cursor: null });
      case 'campaign_preview': return ok({ eligible: body.contactIds.filter(id => id === 'k2').map(id => ({ contactId: id, name: 'محمد الحارثي', number: '+968 9234 5678' })), excluded: body.contactIds.filter(id => id !== 'k2').map(id => ({ contactId: id, name: 'x', number: '', reason: 'consent_unknown' })), cap: 100, allowance: 250, maxRecipients: 100 });
      case 'campaign_create': state.campaigns.push({ id: 'camp1', name: 'autumn_offer', origin: 'broadcast', status: 'scheduled', reason: null, template: { name: 'autumn_offer', language: 'en', body: template.body }, scheduledAt: now + HOUR, timezone: 'Asia/Muscat', recipientCount: 1, createdAt: now, counts: { submitted: 0, sent: 0, delivered: 0, read: 0, failed: 0 } });
        return ok({ campaign: state.campaigns[0] });
      default: return { status: 400, json: { ok: false, reason: 'invalid_action' } };
    }
  };
}

function hasibOverview(packId, preview = false) {
  const value = hasibPack(packId), industry = industryCatalog().find(row => row.id === packId);
  return { ok: true, csrfToken: 'a'.repeat(64), preview, readOnly: preview, synthetic: preview, setupRequired: false, selectedIndustryId: packId, industry,
    pack: { id: value.id, archetype: value.archetype, version: value.version, ownerUi: value.ownerUi, todayMetrics: value.todayMetrics, thresholds: value.thresholds,
      variantOptions: value.variantOptions, orderFields: value.orderFields, expenseCategories: value.expenseCategories, modules: value.modules },
    livePacks: industryCatalog().filter(row => row.live), industries: industryCatalog(), modules: visibleModules(value),
    settings: { currency: 'OMR', vatRegistered: false, vatRateBps: 500, pricesIncludeVat: false, stockPolicy: 'warn', unsoldDays: 60, absenceDays: 14 },
    workspaceRole: packId === 'real-estate' ? 'manager' : undefined,
    teamSummary: packId === 'real-estate' ? { members: 0, pending: 0, limit: 5 } : undefined,
    capabilities: packId === 'real-estate' ? { hasib: true, realEstate: true, money: true, insights: true, approvals: true, team: true, settings: true, imports: true, exports: true } : undefined,
    counts: { pendingOrders: 0, lowStock: 0, laylaWaiting: 0, laylaOverdue: 0 } };
}

async function openPage(browser, { width, lang = 'en', path, handler, extra }) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(BASE).origin) return route.abort();
    if (url.pathname === '/api/layla-meta') {
      const surface = url.searchParams.get('surface');
      const response = extra?.(surface, route.request()) || await handler(surface, route.request().method(), route.request().postDataJSON());
      return route.fulfill({ status: response.status, json: response.json });
    }
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, json: { ok: false } });
    return route.continue();
  });
  await page.goto(`${BASE}${lang === 'ar' ? '' : '/en'}${path}`);
  return { page, context };
}
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const axe = async page => (await new AxeBuilder({ page }).include('.ld').analyze()).violations.filter(v => ['critical', 'serious'].includes(v.impact)).map(v => `${v.id}: ${v.nodes.map(n => n.target).join(' ')}`);

const browser = await chromium.launch();
let count = 0;
try {
  // Direct visits: unsigned owners go through sign-in, accounts without a number go to setup.
  for (const [reason, expected] of [['sign_in_required', /\/en\/layla\/setup\?next=dashboard$/], ['setup_required', /\/en\/layla\/setup$/]]) {
    const { page, context } = await openPage(browser, { width: 1280, path: '/layla/dashboard', handler: api(fixture(), { overviewStatus: reason === 'sign_in_required' ? 401 : 409, overviewReason: reason }) });
    await page.waitForURL(expected); count++;
    await context.close();
  }

  // The founder-only selector includes live and preview-only built dashboards.
  // Pending packs are disabled and preview responses contain no customer data.
  for (const lang of ['en', 'ar']) {
    const state = fixture(), handler = api(state, { founderPreview: true });
    const { page, context } = await openPage(browser, { width: 320, lang, path: '/layla/dashboard', handler, extra: (surface, request) => {
      if (surface !== 'hasib') return null;
      const previewId = new URL(request.url()).searchParams.get('previewIndustry');
      if (request.method() === 'GET') return { status: 200, json: hasibOverview(previewId || state.livePack || 'retail', !!previewId) };
      const body = request.postDataJSON();
      if (body.action === 'settings_update') { state.livePack = body.packId; return { status: 200, json: { ok: true, csrfToken: 'a'.repeat(64), settings: {} } }; }
      if (body.action === 'today') { const packId = body.previewIndustry || state.livePack || 'retail'; return { status: 200, json: { ok: true, csrfToken: 'a'.repeat(64), synthetic: !!body.previewIndustry, date: '2026-09-28', needsYou: { ordersCount: 0, orders: [], chats: 0, lowStockCount: 0, lowStock: [], repairsReady: 0 }, industryActions: [], industryMetrics: hasibPack(packId).todayMetrics.map(metric => ({ id: metric.id, value: 0, format: 'number', detail: '' })), setup: { products: false, photos: false, services: false } } }; }
      return { status: 403, json: { ok: false, reason: 'preview_read_only' } };
    } });
    const ar = lang === 'ar';
    const selector = page.locator('.hb-founder-preview select');
    await selector.waitFor();
    assert.equal(await selector.locator('option[value="retail-tech"]').count(), 1); count++;
    assert.equal(await selector.locator('option[value="dental"]').count(), 1); count++;
    assert.match(await selector.locator('option[value="retail-tech"]').textContent(), ar ? /مباشر/ : /Live/); count++;
    assert.match(await selector.locator('option[value="dental"]').textContent(), ar ? /مباشر/ : /Live/); count++;
    assert.match(await selector.locator('option[value=""]').textContent(), ar ? /بيانات حقيقية/ : /real data/); count++;
    assert.notEqual(await selector.locator('option[value="travel"]').getAttribute('disabled'), null); count++;
    await selector.selectOption('retail-tech');
    await page.waitForFunction(() => document.querySelector('.hb-founder-preview select')?.value === 'retail-tech');
    assert.equal(await page.getByText(ar ? /معاينة للقراءة فقط/ : /Read-only preview/).count(), 0); count++;
    await selector.selectOption('dental');
    await page.waitForFunction(() => document.querySelector('.hb-founder-preview select')?.value === 'dental');
    assert.equal(await page.getByText(ar ? /معاينة للقراءة فقط/ : /Read-only preview/).count(), 0); count++;
    await selector.selectOption('beauty');
    await page.getByText(ar ? /معاينة للقراءة فقط/ : /Read-only preview/).first().waitFor(); count++;
    assert.equal(await noOverflow(page), true); count++;
    await context.close();
  }

  // Every released industry has visible, bilingual actions and truthful visuals at phone, tablet and desktop sizes.
  for (const packId of ['retail', 'retail-tech', 'dental', 'real-estate', 'construction']) for (const lang of ['en', 'ar']) for (const width of [320, 768, 1440]) {
    const state = fixture(), handler = api(state);
    const { page, context } = await openPage(browser, { width, lang, path: '/layla/dashboard?tab=today', handler, extra: (surface, request) => {
      if (surface !== 'hasib') return null;
      if (request.method() === 'GET') return { status: 200, json: hasibOverview(packId) };
      const body = request.postDataJSON();
      if (body.action === 'today') return { status: 200, json: { ok: true, csrfToken: 'a'.repeat(64), date: '2026-09-29', needsYou: { ordersCount: 0, orders: [], chats: 0, lowStockCount: 0, lowStock: [], repairsReady: 0 }, industryActions: [], industryMetrics: hasibPack(packId).todayMetrics.map(metric => ({ id: metric.id, value: 0, format: 'number', detail: '' })), setup: { products: false, photos: false, services: false } } };
      if (body.action === 'real_estate_overview') return { status: 200, json: { ok: true, csrfToken: 'a'.repeat(64), workspaceRole: 'manager', counts: { opportunities: 0, unassigned: 0, slaBreaches: 0, staleListings: 0, todayViewings: 0, tasks: 0 }, pipeline: { new: 0, contacted: 0, qualified: 0, viewing: 0, offer: 0, won: 0, lost: 0 }, listings: { available: 0, reserved: 0, unavailable: 0, verifiedFresh: 0, stale: 0 }, viewings: { today: 0, upcoming: 0, outcomeMissing: 0 }, offers: { draft: 0, approvalPending: 0, active: 0, accepted: 0 }, approvals: { offers: 0, drafts: 0, total: 0 }, tasks: [] } };
      if (body.action === 'real_estate_tasks') return { status: 200, json: { ok: true, csrfToken: 'a'.repeat(64), items: [] } };
      return { status: 200, json: { ok: true, csrfToken: 'a'.repeat(64), items: [], members: [], cursor: null, limit: 5 } };
    } });
    await page.locator('.hb-action-strip').first().waitFor();
    assert.equal(await page.locator('.hb-action-card').count(), packId === 'real-estate' ? 5 : 4, `${packId} ${lang} actions at ${width}`); count++;
    assert.equal(await page.locator('.hb-visual-metric').count(), packId === 'real-estate' ? 6 : 3, `${packId} ${lang} metrics at ${width}`); count++;
    assert.equal(await page.locator('.ld').getAttribute('dir'), lang === 'ar' ? 'rtl' : 'ltr'); count++;
    assert.equal(await noOverflow(page), true, `${packId} ${lang} no overflow at ${width}`); count++;
    assert.deepEqual(await axe(page), [], `${packId} ${lang} axe at ${width}`); count++;
    await page.locator('.hb-action-card').first().click();
    const expectedTab = packId === 'real-estate' ? 'stock' : packId === 'retail-tech' ? 'service' : 'orders';
    await page.waitForFunction(tab => new URL(location.href).searchParams.get('tab') === tab, expectedTab); count++;
    if (width === 320 || width === 1440) await page.screenshot({ path: `${OUT}/live-${packId}-${lang}-${width}.png`, fullPage: true });
    await context.close();
  }

  for (const width of [1440, 1024, 768, 375, 320]) {
    const state = fixture();
    const { page, context } = await openPage(browser, { width, path: '/layla/dashboard', handler: api(state) });
    await page.getByRole('heading', { name: 'Chats', exact: true }).waitFor();
    assert.equal(await page.getByRole('navigation', { name: 'Dashboard sections' }).getByRole('link').allTextContents().then(t => t.join('|')), 'Chats|Customers|Settings'); count++;
    assert.equal(await page.getByRole('link', { name: 'Chats' }).getAttribute('aria-current'), 'page'); count++;
    await page.getByRole('button', { name: /Aisha Al Balushi/ }).click();
    await page.getByRole('heading', { name: 'Aisha Al Balushi' }).waitFor();
    const listVisible = await page.locator('.ld-list').isVisible();
    assert.equal(listVisible, width > 768, `list beside thread at ${width}`); count++;
    assert.match(await page.locator('.ld-messages').textContent(), /Text removed after 30 days/); count++;
    await page.getByRole('switch', { name: 'Leave this chat for me' }).check();
    await page.waitForFunction(() => document.querySelector('[role=switch]')?.checked);
    assert.ok(state.calls.some(c => c.action === 'takeover')); count++;
    assert.equal(await noOverflow(page), true, `no horizontal overflow at ${width}`); count++;
    assert.deepEqual(await axe(page), [], `axe at ${width}`); count++;
    await page.screenshot({ path: `${OUT}/chats-en-${width}.png` });
    if (width <= 768) { await page.getByRole('button', { name: 'Back' }).click(); await page.locator('.ld-list').waitFor(); count++; }
    await context.close();
  }

  // Arabic: RTL mirroring, 24-hour window blocking, template action.
  for (const width of [1280, 375]) {
    const state = fixture();
    const { page, context } = await openPage(browser, { width, lang: 'ar', path: '/layla/dashboard?tab=chats&chat=c-k2', handler: api(state) });
    await page.getByRole('heading', { name: 'محمد الحارثي' }).waitFor();
    assert.equal(await page.locator('.ld').getAttribute('dir'), 'rtl'); count++;
    if (width > 768) { const nav = await page.locator('.ld-nav').boundingBox(); assert.ok(nav.x > width / 2, 'rail on the right in RTL'); count++; }
    assert.equal(await page.locator('#ld-reply').count(), 0, 'composer disabled outside 24h'); count++;
    assert.match(await page.locator('.ld-window-closed').textContent(), /انتهت نافذة الرد/); count++;
    assert.match(await page.locator('.ld-messages').textContent(), /131049/); count++;
    assert.deepEqual(await axe(page), []); count++;
    assert.equal(await noOverflow(page), true); count++;
    await page.screenshot({ path: `${OUT}/chats-ar-${width}.png` });
    await page.getByRole('button', { name: 'إرسال قالب' }).click();
    await page.getByRole('dialog').getByRole('radio', { name: /autumn_offer/ }).check(); count++;
    await context.close();
  }

  // Contacts and Broadcast wizard.
  {
    const state = fixture();
    const { page, context } = await openPage(browser, { width: 1280, path: '/layla/dashboard?tab=contacts', handler: api(state) });
    await page.getByRole('heading', { name: 'Contacts', exact: true }).waitFor();
    assert.equal(await page.locator('.ld-table tbody tr').count(), 3); count++;
    assert.match(await page.locator('.ld-table').textContent(), /Opted out/); count++;
    assert.deepEqual(await axe(page), []); count++;
    await page.screenshot({ path: `${OUT}/contacts-en-1280.png`, fullPage: true });
    // Contacts and Broadcast now sit under Customers as two views.
    await page.getByRole('navigation', { name: 'Views in this section' }).getByRole('link', { name: 'Message many' }).click();
    await page.getByRole('heading', { name: 'Broadcast', exact: true }).waitFor();
    await page.getByRole('button', { name: 'New broadcast' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('radio', { name: /autumn_offer/ }).check();
    await dialog.getByRole('button', { name: 'Continue' }).click();
    assert.match(await dialog.locator('.ld-template-preview').textContent(), /Hello .+, enjoy 10% off/); count++;
    await dialog.getByRole('button', { name: 'Continue' }).click();
    assert.equal(await dialog.getByRole('checkbox', { name: /Aisha/ }).isDisabled(), true, 'no consent → not selectable'); count++;
    await dialog.getByRole('checkbox', { name: /محمد/ }).check();
    await dialog.getByRole('button', { name: 'Continue' }).click();
    await dialog.getByRole('radio', { name: 'Schedule for later' }).check();
    await dialog.getByRole('button', { name: 'Continue' }).click();
    await dialog.getByText('1 will receive it').waitFor(); count++;
    assert.deepEqual(await axe(page), []); count++;
    await page.screenshot({ path: `${OUT}/broadcast-review-1280.png` });
    await dialog.getByRole('button', { name: 'Schedule for 1' }).click();
    await dialog.getByText('Broadcast saved.').waitFor(); count++;
    assert.ok(state.calls.some(c => c.action === 'campaign_create')); count++;
    await context.close();
  }

  // Every tab at narrow widths in both languages: no overflow, no serious accessibility issues.
  for (const [width, lang] of [[375, 'ar'], [768, 'en'], [320, 'en']]) {
    for (const tab of ['contacts', 'broadcast']) {
      const { page, context } = await openPage(browser, { width, lang, path: `/layla/dashboard?tab=${tab}`, handler: api(fixture()) });
      await page.locator('.ld-main h1').waitFor();
      await page.waitForFunction(() => !document.querySelector('.ld-main [role=status]')?.textContent.match(/Loading|جارٍ التحميل/));
      assert.equal(await noOverflow(page), true, `${tab} ${lang} ${width} overflow`); count++;
      assert.deepEqual(await axe(page), [], `${tab} ${lang} ${width} axe`); count++;
      await page.screenshot({ path: `${OUT}/${tab}-${lang}-${width}.png`, fullPage: true });
      await context.close();
    }
  }

  // Account recovery: a dashboard visitor sent to sign-in returns once their connected account is restored.
  {
    const saved = { ok: true, csrfToken: 'a'.repeat(64), available: true, status: 'connected', profile: { businessName: 'Blue Studio Properties', sector: 'Real estate', services: 'Villas', prices: '', hours: '', location: '', humanContact: 'team@example.com', faqs: [], reviewed: true },
      journeyStep: 3, profileVersion: 1, capabilities: {}, integration: { id: 'i1', sender: '96890000000', path: 'new_number', status: 'connected' }, account: { email: 'owner@example.test' }, savedToAccount: true, accountSaveAvailable: true, catalog: { entries: [], cursor: null } };
    const { page, context } = await openPage(browser, { width: 390, path: '/layla/setup?next=dashboard', handler: api(fixture()), extra: surface => surface === 'customer' ? { status: 200, json: saved } : null });
    await page.waitForURL(/\/en\/layla\/dashboard$/); count++;
    await context.close();
    const signedOut = { ...saved, account: null, savedToAccount: false, integration: null, status: 'business_saved' };
    const second = await openPage(browser, { width: 390, path: '/layla/setup?next=dashboard', handler: api(fixture()), extra: surface => surface === 'customer' ? { status: 200, json: signedOut } : surface === 'messaging' ? { status: 401, json: { ok: false, reason: 'sign_in_required' } } : null });
    await second.page.getByRole('region', { name: 'Save your setup' }).waitFor(); count++;
    await second.context.close();
  }

  // Activation success dialog on setup, then automatic navigation to the dashboard.
  {
    const setup = { ok: true, csrfToken: 'a'.repeat(64), review: false, available: true, status: 'connected', profile: { businessName: 'Blue Studio Properties', sector: 'Real estate', services: 'Villas', prices: '', hours: '', location: '', humanContact: 'team@example.com', faqs: [], reviewed: true },
      journeyStep: 3, profileVersion: 1, capabilities: {}, integration: { id: 'i1', sender: '96890000000', path: 'new_number', status: 'connected' }, account: { email: 'owner@example.test' }, savedToAccount: true, accountSaveAvailable: true };
    let active = false;
    const handler = api(fixture());
    const { page, context } = await openPage(browser, { width: 1280, path: '/layla/setup', handler, extra: (surface, request) => {
      if (surface === 'customer') return { status: 200, json: { ...setup, catalog: { entries: [], cursor: null, total: 0 } } };
      if (surface === 'messaging') { if (request.method() === 'POST') active = true; return { status: 200, json: { ok: true, csrfToken: 'a'.repeat(64), available: true, active, reason: active ? '' : 'not_activated', limits: { usedToday: 0 } } }; }
      return null;
    } });
    await page.getByRole('button', { name: 'Activate Layla' }).click();
    await page.getByRole('alertdialog', { name: 'Layla is active' }).waitFor(); count++;
    await page.screenshot({ path: `${OUT}/activation-dialog-1280.png` });
    await page.waitForURL(/\/en\/layla\/dashboard$/, { timeout: 5000 }); count++;
    await context.close();
  }
  // Dashboard → Business: edit the facts Layla answers from. Saving is the review.
  for (const [lang, width] of [['en', 1280], ['ar', 375]]) {
    const saves = [];
    const setup = { ok: true, csrfToken: 'a'.repeat(64), available: true, status: 'connected', savedToAccount: true, profileVersion: 3,
      profile: { businessName: 'Blue Studio', sector: 'Photography', services: 'Portraits', prices: '', hours: '', location: '', humanContact: 'team@example.test', faqs: [], reviewed: true } };
    const { page, context } = await openPage(browser, { width, lang, path: '/layla/dashboard?tab=business', handler: api(fixture()), extra: (surface, request) => {
      if (surface !== 'customer') return null;
      const body = request.method() === 'POST' ? request.postDataJSON() : {};
      if (body.action === 'profile') { saves.push(body); return { status: 200, json: { ...setup, profileVersion: 4, profile: { ...body.profile, businessName: body.businessName } } }; }
      if (body.action === 'catalog_list') return { status: 200, json: { ...setup, catalog: { entries: [], cursor: null } } };
      return { status: 200, json: setup };
    } });
    const ar = lang === 'ar', t = (en, arabic) => ar ? arabic : en;
    await page.getByRole('heading', { name: t('Your business', 'نشاطك التجاري'), exact: true }).waitFor(); count++;
    await page.getByText(t('Questions your customers ask (optional)', 'أسئلة يطرحها عملاؤك (اختياري)')).click();
    const faq = page.getByLabel(t('Customer question', 'سؤال العميل'), { exact: true });
    await faq.fill(t('Do you have parking?', 'هل لديكم موقف سيارات؟'));
    await faq.press('Enter');
    await page.waitForTimeout(300);
    assert.deepEqual(saves, [], `${lang}: Enter in an optional field must not save`); count++;
    await page.getByLabel(t('Short service summary', 'ملخص الخدمات')).fill(t('Portraits and weddings', 'صور شخصية وحفلات زفاف'));
    assert.equal(await page.locator('label.layla-check').count(), 0, `${lang}: no second confirmation in the dashboard`); count++;
    await page.getByRole('button', { name: t('Save changes', 'حفظ التغييرات') }).click();
    await page.getByText(t('Saved. Layla now answers with these details.', 'تم الحفظ. تجيب ليلى الآن بهذه المعلومات.')).waitFor(); count++;
    assert.equal(saves.length, 1); assert.equal(saves[0].profile.reviewed, true, 'saving is the review');
    assert.equal(saves[0].profile.services, t('Portraits and weddings', 'صور شخصية وحفلات زفاف')); count += 2;
    assert.equal(await noOverflow(page), true, `${lang} ${width}: no horizontal overflow`); count++;
    await context.close();
  }
  console.log(`${count} dashboard browser assertions passed at 320–1440px in English and Arabic. Synthetic API; no external network.`);
} finally { await browser.close(); }
