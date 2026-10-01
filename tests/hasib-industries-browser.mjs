// Local-only synthetic preview checks. Starts an isolated backend for each pack.
// node tests/hasib-industries-browser.mjs [pack ...]
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { industryCatalog, hasibPack } from '../config/hasib-packs.js';
import { createHasibStrings } from '../src/lib/hasib/strings.js';

const ROOT = new URL('../', import.meta.url).pathname;
const OUT = `${ROOT}work/industry-optimization/browser`;
const PORT = Number(process.env.INDUSTRY_BROWSER_PORT || 5199);
const API_PORT = Number(process.env.INDUSTRY_BROWSER_API_PORT || 5399);
const BASE = `http://127.0.0.1:${PORT}`;
const journeysOnly = process.argv.includes('--journeys-only');
const requested = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
// Real Estate has its own dashboard and suite (tests/real-estate-browser.mjs); its generic scenarios are retired.
const packs = (requested.length ? requested : industryCatalog().map(p => p.id)).filter(id => id !== 'real-estate');
const results = [];
await mkdir(OUT, { recursive: true });

async function start(args, ready, env = {}) {
  const child = spawn(process.execPath, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error(`Server startup timed out: ${output}`)); }, 30000);
    const read = chunk => { output += chunk; if (ready.test(output)) { clearTimeout(timer); resolve(); } };
    child.stdout.on('data', read); child.stderr.on('data', read);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${output}`)); });
  });
  return child;
}
async function stop(child) { if (child && child.exitCode == null) { const exited = once(child, 'exit'); child.kill(); await exited; } }
async function api(action, body = {}) {
  const response = await fetch(`http://127.0.0.1:${API_PORT}/api/layla-meta?surface=hasib`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...body }) });
  const value = await response.json(); assert.ok(value.ok, `${action}: ${JSON.stringify(value)}`); return value;
}

class OwnerPage {
  constructor(page, lang) { this.page = page; this.lang = lang; this.h = createHasibStrings(lang); }
  async open(tab = '') {
    await this.page.goto(`${BASE}${this.lang === 'en' ? '/en' : ''}/layla/dashboard${tab ? `?tab=${tab}` : ''}`);
    await this.page.locator('.ld').waitFor();
  }
  async noOverflow(label) {
    const dimensions = await this.page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth }));
    assert.ok(dimensions.page <= dimensions.viewport + 1, `${label}: width ${dimensions.page} exceeds ${dimensions.viewport}`);
  }
  async screenshot(name) { await this.page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true }); }
  async accessible(scope = '.ld') {
    const violations = (await new AxeBuilder({ page: this.page }).include(scope).analyze()).violations.filter(v => ['critical', 'serious'].includes(v.impact));
    assert.deepEqual(violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), []);
  }
}

const vite = await start(['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.hasib-demo.config.js', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], /Local:/, { HASIB_DEMO_PORT: String(API_PORT) });
let browser;
try {
  browser = await chromium.launch();
  for (const packId of packs) {
    const pack = hasibPack(packId);
    const backend = await start(['scripts/hasib-demo.mjs', String(API_PORT), `--pack=${packId}`], /Hasib demo/);
    try {
      for (const lang of journeysOnly ? [] : ['en', 'ar']) for (const width of [1440, 320]) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
        await context.tracing.start({ screenshots: true, snapshots: true });
        await context.route('**/*', route => new URL(route.request().url()).origin === BASE ? route.continue() : route.abort());
        const page = await context.newPage(); page.setDefaultTimeout(12000);
        const owner = new OwnerPage(page, lang), name = `${packId}-${lang}-${width}`;
        const errors = []; page.on('pageerror', e => errors.push(e.message));
        try {
          await owner.open();
          if (packId === 'automotive') {
            await page.locator('.hb-automotive').waitFor();
            assert.equal(await page.locator('.hb-action-card').count(), 4);
            assert.equal(await page.locator('.hb-visual-metric').count(), 3);
            assert.equal(await page.locator('.ld').evaluate(el => getComputedStyle(el).direction), lang === 'ar' ? 'rtl' : 'ltr');
            await owner.noOverflow('Automotive Today');
            if (width === 320) await owner.accessible();
            await owner.open('orders');
            await page.getByRole('heading', { name: lang === 'en' ? 'Workshop' : 'الورشة' }).waitFor();
            await page.getByRole('button', { name: lang === 'en' ? 'Add vehicle' : 'إضافة مركبة', exact: true }).click();
            const form = page.locator('.hb-automotive-form');
            await form.getByLabel(lang === 'en' ? 'Customer' : 'العميل').selectOption({ index: 1 });
            await form.getByLabel(lang === 'en' ? 'Plate number' : 'رقم اللوحة').fill(`WEB ${lang} ${width}`);
            await form.getByLabel(lang === 'en' ? 'Make' : 'الشركة المصنعة').fill('Toyota');
            await form.getByLabel(lang === 'en' ? 'Model' : 'الموديل').fill('Hilux');
            await form.getByLabel(lang === 'en' ? 'Year' : 'السنة').fill('2025');
            await form.getByLabel(lang === 'en' ? 'Odometer (km)' : 'عداد المسافة (كم)').fill('12000');
            const [vehicleResponse] = await Promise.all([page.waitForResponse(r => r.url().includes('/api/layla-meta') && r.request().postDataJSON()?.action === 'automotive_vehicle_save'), form.getByRole('button', { name: lang === 'en' ? 'Save' : 'حفظ', exact: true }).click()]);
            assert.ok((await vehicleResponse.json()).ok);
            await page.getByText(`WEB ${lang.toUpperCase()} ${width}`, { exact: false }).waitFor();
            await owner.noOverflow('Automotive Workshop');
            await owner.open('stock&view=products');
            await page.getByRole('heading', { name: pack.ownerUi.stock[lang], exact: true }).waitFor();
            await owner.noOverflow('Automotive Parts');
            await owner.open('money');
            await page.getByRole('heading', { name: lang === 'en' ? 'Money & insights' : 'الأموال والمؤشرات' }).waitFor();
            assert.equal(await page.locator('.hb-visual-metric').count(), 3);
            await owner.noOverflow('Automotive Money');
            await owner.open('settings');
            await page.getByRole('heading', { name: lang === 'en' ? 'Workshop settings' : 'إعدادات الورشة' }).waitFor();
            await owner.noOverflow('Automotive Settings');
            assert.deepEqual(errors, []); results.push({ name, status: 'passed' }); console.log(`PASS ${name}`); continue;
          }
          if (packId === 'construction') {
            await page.locator('.hb-construction').waitFor();
            assert.equal(await page.locator('.hb-action-card').count(), 4);
            assert.equal(await page.locator('.hb-visual-metric').count(), 3);
            assert.equal(await page.locator('.ld').evaluate(el => getComputedStyle(el).direction), lang === 'ar' ? 'rtl' : 'ltr');
            await owner.noOverflow('Construction Today');
            if (width === 320) await owner.accessible();
            await page.locator('.hb-action-card').first().click();
            const form = page.locator('.hb-construction-form'); await form.waitFor();
            await form.getByLabel(lang === 'en' ? 'Reference' : 'المرجع').fill(`WEB-${lang}-${width}`);
            await form.getByLabel(lang === 'en' ? 'Project name' : 'اسم المشروع').fill(lang === 'en' ? 'Browser fit-out' : 'مشروع تشطيبات المتصفح');
            await form.getByLabel(lang === 'en' ? 'Location' : 'الموقع').fill('Muscat');
            await form.getByLabel(lang === 'en' ? 'Contract value (OMR)' : 'قيمة العقد (ر.ع.)').fill('150000');
            await form.getByLabel(lang === 'en' ? 'Cost baseline (OMR)' : 'خط أساس التكلفة (ر.ع.)').fill('100000');
            await form.getByLabel(lang === 'en' ? 'Start date' : 'تاريخ البدء').fill('2026-10-01');
            await form.getByLabel(lang === 'en' ? 'Contract finish' : 'نهاية العقد').fill('2027-03-31');
            const [response] = await Promise.all([page.waitForResponse(r => r.url().includes('/api/layla-meta') && r.request().postDataJSON()?.action === 'construction_project_save'),form.getByRole('button',{name:lang === 'en'?'Create project':'إنشاء المشروع'}).click()]);
            assert.ok((await response.json()).ok);
            await page.getByRole('heading',{name:lang === 'en'?'Browser fit-out':'مشروع تشطيبات المتصفح'}).waitFor();
            await owner.noOverflow('Construction Projects');
            await owner.open('stock&view=products&action=commitment');
            await page.getByRole('heading',{name:lang === 'en'?'Procurement & site controls':'المشتريات وضبط الموقع'}).waitFor();
            assert.equal(await page.locator('.ld-section-tabs').count(),0,'construction does not show generic Products/Services tabs');
            const commitment=page.locator('.hb-construction-form'); await commitment.waitFor();
            await commitment.getByLabel(lang === 'en'?'Project':'المشروع').selectOption({index:1});
            await commitment.getByLabel(lang === 'en'?'Supplier':'المورد').fill('Muscat Ready Mix');
            await commitment.getByLabel(lang === 'en'?'Package':'الحزمة').fill(lang === 'en'?'Concrete':'الخرسانة');
            await commitment.getByLabel(lang === 'en'?'Description':'الوصف').fill(lang === 'en'?'Foundation concrete':'خرسانة الأساسات');
            await commitment.getByLabel(lang === 'en'?'Amount (OMR)':'المبلغ (ر.ع.)').fill('25000');
            await commitment.getByLabel(lang === 'en'?'Required date':'تاريخ الطلب').fill('2026-11-01');
            const [commitmentResponse]=await Promise.all([page.waitForResponse(r=>r.url().includes('/api/layla-meta')&&r.request().postDataJSON()?.action==='construction_commitment_save'),commitment.getByRole('button',{name:lang === 'en'?'Save commitment':'حفظ الالتزام'}).click()]);
            assert.ok((await commitmentResponse.json()).ok);
            await page.getByText('Muscat Ready Mix',{exact:false}).first().waitFor();
            await owner.noOverflow('Construction Procurement');
            await owner.open('insights'); await page.getByRole('heading',{name:lang === 'en'?'Money & insights':'الأموال والمؤشرات'}).waitFor();
            assert.equal(await page.locator('.hb-visual-metric').count(),9); await owner.noOverflow('Construction Money');
            await owner.open('settings'); const denominator=page.getByLabel(lang === 'en'?'Safety frequency denominator (worker hours)':'مقام معدل السلامة (ساعات العمل)'); await denominator.waitFor(); await denominator.fill('100000');
            const [settingsResponse]=await Promise.all([page.waitForResponse(r=>r.url().includes('/api/layla-meta')&&r.request().postDataJSON()?.action==='settings_update'),page.getByRole('button',{name:lang === 'en'?'Save safety denominator':'حفظ مقام السلامة'}).click()]);
            assert.ok((await settingsResponse.json()).ok); const savedOverview=await fetch(`http://127.0.0.1:${API_PORT}/api/layla-meta?surface=hasib`).then(r=>r.json()); assert.equal(savedOverview.settings.constructionIncidentHoursDenominator,100000); await owner.noOverflow('Construction Settings');
            await owner.open('team'); await page.getByRole('button',{name:lang === 'en'?'Invite employee':'دعوة موظف'}).first().click();
            const invite=page.locator('.hb-construction-form'); await invite.getByLabel(lang === 'en'?'Employee email':'بريد الموظف').fill(`construction-${lang}-${width}@example.com`);
            const [inviteResponse]=await Promise.all([page.waitForResponse(r=>r.url().includes('/api/layla-meta')&&r.request().postDataJSON()?.action==='team_invite'),invite.getByRole('button',{name:lang === 'en'?'Send invitation':'إرسال الدعوة'}).click()]);
            assert.ok((await inviteResponse.json()).ok); await page.getByText(`construction-${lang}-${width}@example.com`,{exact:true}).waitFor(); await owner.noOverflow('Construction Team');
            assert.deepEqual(errors, []); results.push({name,status:'passed'}); console.log(`PASS ${name}`); continue;
          }
          // Today: three industry measures as metric cards, and one primary quick action.
          await page.locator('.hb-today .hb-visual-metrics').waitFor();
          assert.equal(await page.locator('.hb-today .hb-visual-metrics .hb-visual-metric').count(), 3);
          assert.equal(await page.locator('.hb-today .hb-action-card.is-primary').count(), 1);
          assert.equal(await page.locator('.ld').evaluate(el => getComputedStyle(el).direction), lang === 'ar' ? 'rtl' : 'ltr');
          const digits = value => value.replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
          for (const metric of pack.todayMetrics) assert.ok(digits(await page.locator('.hb-today .hb-visual-metrics').textContent()).includes(digits(metric[lang])));
          await owner.noOverflow('Today'); await owner.screenshot(`${name}-today`);
          if (width === 320) await owner.accessible();
          // Keyboard activation verifies the primary action and modal focus.
          await page.locator('.hb-today .hb-action-card.is-primary').focus(); await page.keyboard.press('Enter');
          const dialog = page.getByRole('dialog'); await dialog.waitFor();
          // The primary quick action opens its own section (Orders for most packs, Service for a phone shop's New repair).
          const primaryTab = pack.dashboard.actions[0][4][0];
          assert.equal(new URL(page.url()).searchParams.get('tab'), primaryTab);
          assert.ok(await dialog.evaluate(el => el.contains(document.activeElement)), 'modal owns keyboard focus');
          await owner.noOverflow('Work form');
          if (width === 320) { await owner.screenshot(`${name}-work-form`); await owner.accessible('.ld-dialog'); }
          await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' });
          assert.ok((await page.locator('h1').textContent()).includes(primaryTab === 'service' ? owner.h.t('service') : pack.ownerUi.work[lang]));
          await owner.noOverflow('Work');
          await owner.open('insights'); await page.locator('.hb-money-summary').waitFor();
          assert.equal(await page.locator('.hb-money-summary .hb-tile').count(), 3);
          assert.equal(await page.locator('.hb-insights .hb-report-details').getAttribute('open'), null);
          await owner.noOverflow('Money');
          const summary = page.locator('.hb-insights .hb-report-details > summary');
          await summary.focus(); await page.keyboard.press('Enter');
          assert.notEqual(await page.locator('.hb-insights .hb-report-details').getAttribute('open'), null);
          await owner.noOverflow('Expanded Money');
          if (width === 320) await owner.screenshot(`${name}-money`);
          await owner.open('stock');
          await page.getByRole('heading', { name: pack.ownerUi.stock[lang], exact: true }).waitFor();
          if (['restaurant', 'cafe', 'cakes'].includes(packId)) {
            await page.getByRole('button', { name: owner.h.t('recordWaste'), exact: true }).waitFor();
            assert.equal(await page.locator('.hb-restaurant-form').count(), 0, 'stock forms initially hidden');
            await page.getByRole('button', { name: owner.h.t('recordWaste'), exact: true }).click();
            await page.getByRole('dialog').waitFor();
            assert.equal(await page.locator('.hb-restaurant-form').count(), 1);
            await page.getByRole('dialog').getByLabel(owner.h.t('ingredient')).selectOption({ index: 1 });
            await owner.noOverflow('Waste form');
            if (width === 320) await owner.accessible('.ld-dialog');
            await page.keyboard.press('Escape');
          }
          await owner.noOverflow('Stock');
          if (width === 320) await owner.screenshot(`${name}-stock`);
          assert.deepEqual(errors, [], 'no browser runtime errors');
          results.push({ name, status: 'passed' }); console.log(`PASS ${name}`);
        } catch (error) {
          await owner.screenshot(`${name}-failure`);
          results.push({ name, status: 'failed', error: error.stack }); console.error(`FAIL ${name}: ${error.message}`);
        } finally { await context.tracing.stop({ path: `${OUT}/${name}.zip` }); await context.close(); }
      }
      const journey = async (name, action, lang = 'en') => {
        const context = await browser.newContext({ viewport: { width: 320, height: 900 }, reducedMotion: 'reduce' });
        await context.tracing.start({ screenshots: true, snapshots: true });
        await context.route('**/*', route => new URL(route.request().url()).origin === BASE ? route.continue() : route.abort());
        const page = await context.newPage(); page.setDefaultTimeout(12000);
        const owner = new OwnerPage(page, lang);
        try { await action(page, owner); await owner.noOverflow(name); await owner.screenshot(name); results.push({ name, status: 'passed' }); console.log(`PASS ${name}`); }
        catch (error) { results.push({ name, status: 'failed', error: error.stack }); await owner.screenshot(`${name}-failure`); console.error(`FAIL ${name}: ${error.message}`); }
        finally { await context.tracing.stop({ path: `${OUT}/${name}.zip` }); await context.close(); }
      };
      const save = async (page, action, click) => {
        const [response] = await Promise.all([
          page.waitForResponse(response => response.url().includes('/api/layla-meta') && response.request().postDataJSON()?.action === action),
          click(),
        ]);
        const result = await response.json(); assert.ok(result.ok, `${action}: ${JSON.stringify(result)}`); return result;
      };
      const dateTime = days => new Date(Date.now() + (days * 24 + 4) * 3600000).toISOString().slice(0, 16);
      if (['retail', 'retail-tech', 'fitness'].includes(packId)) for (const lang of ['en', 'ar']) await journey(`${packId}-threshold-${lang}`, async (page, owner) => {
        await owner.open('settings&view=business');
        const dialog = page.locator('.hb-setup'), gym = packId === 'fitness';
        const input = dialog.getByLabel(gym ? lang === 'en' ? 'Days a member is absent' : 'عدد أيام غياب العضو' : lang === 'en' ? 'Days stock remains unsold' : 'عدد أيام بقاء البضاعة دون بيع');
        await input.fill(gym ? '15' : '61');
        await save(page, 'settings_update', () => dialog.getByRole('button', { name: owner.h.t('save'), exact: true }).click());
        const overview = await fetch(`http://127.0.0.1:${API_PORT}/api/layla-meta?surface=hasib`).then(r => r.json());
        assert.equal(overview.settings[gym ? 'absenceDays' : 'unsoldDays'], gym ? 15 : 61);
      }, lang);
      if (packId === 'retail-tech') for (const lang of ['en', 'ar']) await journey(`electronics-approval-quote-reset-${lang}`, async (page, owner) => {
        const repair = await api('repair_create', { requestId: crypto.randomUUID(), device: `Browser customer phone ${lang}`, fault: 'Charging issue', quoteMinor: 15000 });
        await owner.open('service');
        await page.getByRole('button', { name: owner.h.t('repairNumber', { number: repair.number }), exact: true }).click();
        const dialog = page.getByRole('dialog');
        const name = owner.h.t('approvedByLabel');
        await dialog.getByLabel(name).fill('Browser customer');
        await save(page, 'repair_approval', () => dialog.getByRole('button', { name: owner.h.t('recordApproval'), exact: true }).click());
        await dialog.getByText('Browser customer', { exact: true }).waitFor();
        const approved = await api('repair', { repairId: repair.id }); assert.equal(approved.approvalStatus, 'approved');
        await dialog.getByLabel(owner.h.t('labour')).fill(String(approved.labourMinor / 1000 + 1));
        await save(page, 'repair_update', () => dialog.getByRole('button', { name: owner.h.t('saveQuote'), exact: true }).click());
        await dialog.getByLabel(name).waitFor();
        assert.notEqual((await api('repair', { repairId: repair.id })).approvalStatus, 'approved');
        await owner.noOverflow('Repair approval'); await owner.accessible('.ld-dialog');
        await page.keyboard.press('Escape');
        const stock = (await api('items', { limit: 100 })).items.find(item => item.serialized);
        const serial = (await api('serials', { variantId: stock.variants[0].id, status: 'in_stock' })).items[0].serial;
        await page.getByLabel(owner.h.t('lookupPlaceholder')).fill(serial);
        await save(page, 'serial_lookup', () => page.getByRole('button', { name: owner.h.t('lookup'), exact: true }).click());
        await page.getByText(owner.h.t('daysInStockLabel')).first().waitFor();
      }, lang);
      if (packId === 'beauty') await journey('beauty-book-complete-pay', async (page, owner) => {
        const summary = (await api('orders')).items.find(order => order.balanceMinor > 0);
        const existing = await api('order', { orderId: summary.id });
        await owner.open('orders'); await page.getByRole('button', { name: 'Add booking', exact: true }).click();
        let dialog = page.getByRole('dialog');
        await dialog.getByLabel('Customer', { exact: false }).selectOption(existing.contact.id);
        await dialog.getByLabel('Service', { exact: false }).selectOption({ index: 1 });
        await dialog.getByLabel('Link existing charge').selectOption(existing.id);
        await dialog.getByLabel('Date and time', { exact: true }).fill(dateTime(-2));
        const booking = await save(page, 'booking_create', () => dialog.getByRole('button', { name: 'Save', exact: true }).click());
        await dialog.waitFor({ state: 'detached' });
        await page.getByLabel('Show all history', { exact: true }).check();
        for (const status of ['Confirmed', 'Arrived', 'Completed']) {
          const row = page.locator('.hb-work-list > li').filter({ has: page.getByRole('button', { name: status, exact: true }) }).filter({ has: page.getByRole('link', { name: 'Open charge and payments' }) });
          await save(page, 'booking_status', () => row.getByRole('button', { name: status, exact: true }).click());
        }
        const persisted = (await api('bookings')).items.find(row => row.id === booking.id);
        assert.equal(persisted.status, 'completed'); assert.equal(persisted.orderId, existing.id);
        await page.getByRole('link', { name: 'Open charge and payments' }).last().click();
        await page.locator('.hb-detail').waitFor();
        const payment = page.locator('.hb-payment');
        await payment.getByLabel(owner.h.t('amount'), { exact: true }).fill('1');
        await save(page, 'payment_record', () => payment.getByRole('button', { name: owner.h.t('recordPayment'), exact: true }).click());
        assert.equal((await api('order', { orderId: existing.id })).paidMinor, existing.paidMinor + 1000);
      });
      if (packId === 'real-estate') await journey('property-commission-ledger', async (page, owner) => {
        const before = await api('insights', { period: 'month' });
        const property = await api('property_save', { requestId: crypto.randomUUID(), workflow: { label: 'Browser Seeb property', location: 'Seeb', askingPriceMinor: 55000000, availability: 'available' } });
        await owner.open('orders');
        const row = page.locator('.hb-work > section').filter({ hasText: 'Seeb' });
        await row.getByRole('button', { name: 'Record commission', exact: true }).click();
        const dialog = page.getByRole('dialog'); await dialog.getByLabel('Commission (OMR)', { exact: true }).fill('120');
        await dialog.getByLabel('Property').selectOption(property.id);
        const enquiry = await save(page, 'enquiry_update', () => dialog.getByRole('button', { name: 'Save', exact: true }).click()); await dialog.waitFor({ state: 'detached' });
        const charge = await api('order', { orderId: enquiry.orderId }); assert.equal(charge.totalMinor, 120000);
        assert.equal((await api('insights', { period: 'month' })).sales.totalMinor, before.sales.totalMinor, 'draft commission is not completed revenue');
        await row.getByRole('link', { name: 'Open charge', exact: true }).click(); await page.locator('.hb-detail').waitFor();
      });
      // A real owner action updates both stock and profit through the existing API.
      if (packId === 'cafe') {
        const context = await browser.newContext({ viewport: { width: 320, height: 900 } });
        await context.route('**/*', route => new URL(route.request().url()).origin === BASE ? route.continue() : route.abort());
        await context.tracing.start({ screenshots: true, snapshots: true });
        const page = await context.newPage(), owner = new OwnerPage(page, 'en');
        try {
          const before = await api('restaurant_summary', { period: 'month' });
          const items = await api('items', { limit: 100 });
          const milk = items.items.find(item => item.nameEn === 'Milk').variants[0];
          await owner.open('stock'); await page.getByRole('button', { name: 'Record waste', exact: true }).click();
          const dialog = page.getByRole('dialog');
          await dialog.getByLabel('Ingredient').selectOption(milk.id);
          await dialog.getByLabel('Quantity', { exact: true }).fill('1');
          await dialog.getByLabel('Waste reason').selectOption('spoilage');
          await dialog.getByRole('button', { name: 'Record waste', exact: true }).click();
          await dialog.waitFor({ state: 'detached' });
          const after = await api('restaurant_summary', { period: 'month' });
          const updated = (await api('items', { limit: 100 })).items.find(item => item.nameEn === 'Milk').variants[0];
          assert.equal(updated.onHand, milk.onHand - 1);
          assert.equal(after.wasteMinor - before.wasteMinor, 1000);
          await owner.screenshot('cafe-record-spoiled-milk');
          results.push({ name: 'cafe-record-spoiled-milk', status: 'passed' });
        } catch (error) { results.push({ name: 'cafe-record-spoiled-milk', status: 'failed', error: error.stack }); await owner.screenshot('cafe-waste-failure'); }
        finally { await context.tracing.stop({ path: `${OUT}/cafe-record-spoiled-milk.zip` }); await context.close(); }
      }
    } finally { await stop(backend); }
  }
} finally {
  await browser?.close(); await stop(vite);
  const report = journeysOnly ? 'journeys-results' : 'results';
  const escaped = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]));
  await writeFile(`${OUT}/${report}.json`, JSON.stringify({ testedAt: new Date().toISOString(), results }, null, 2));
  await writeFile(`${OUT}/${report}.xml`, `<?xml version="1.0" encoding="UTF-8"?><testsuite name="Hasib industries" tests="${results.length}" failures="${results.filter(r => r.status === 'failed').length}">${results.map(r => `<testcase name="${escaped(r.name)}">${r.error ? `<failure>${escaped(r.error)}</failure>` : ''}</testcase>`).join('')}</testsuite>`);
  await writeFile(`${OUT}/${report}.html`, `<!doctype html><html lang="en"><meta charset="utf-8"><title>Hasib browser results</title><h1>Hasib browser results</h1><p>Synthetic local records only.</p><table><thead><tr><th>Scenario</th><th>Result</th><th>Evidence</th></tr></thead><tbody>${results.map(r => `<tr><td>${escaped(r.name)}</td><td>${escaped(r.status)}${r.error ? `<pre>${escaped(r.error)}</pre>` : ''}</td><td><a href="${escaped(r.name)}.zip">Trace</a></td></tr>`).join('')}</tbody></table></html>`);
}
const failed = results.filter(result => result.status === 'failed');
console.log(`${results.length - failed.length}/${results.length} scenarios passed; evidence: ${OUT}`);
if (failed.length) process.exitCode = 1;
