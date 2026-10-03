// WhatsApp setup rehearsal: API and Meta SDK are synthetic, external traffic blocked.
// Proves the help journey, v4 launch options, and recovery from a Meta refusal.
// Not evidence of Meta consent or delivery.
//   npm run build && npx vite preview --port 5199 & node tests/whatsapp-connect-browser.mjs http://127.0.0.1:5199
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const BASE = process.argv[2] || 'http://127.0.0.1:5199';
const OUT = 'work/whatsapp-connect';
await mkdir(OUT, { recursive: true });
// Records FB.login options, opens a popup like the SDK does, then reports a declined login.
const FAKE_SDK = `window.FB={init(o){window.__fbInit=o;},login(cb,o){window.__fbLogin=o;window.open('about:blank','fb');setTimeout(()=>cb({status:'not_authorized'}),50);}};`;
const browser = await chromium.launch();
let checks = 0;
try {
  for (const [lang, width] of [['en', 1440], ['ar', 768], ['en', 320]]) {
    const ar = lang === 'ar', t = (en, arabic) => ar ? arabic : en;
    const context = await browser.newContext({ viewport: { width, height: 900 } }), page = await context.newPage();
    const calls = [], apiCalls = [], errors = [];
    const state = { ok: true, available: true, account: { email: 'owner@example.test' }, accountSaveAvailable: true, savedToAccount: true, journeyStep: 1, profileVersion: 1, csrfToken: 'c',
      profile: { businessName: 'Noor Abayas', sector: 'Retail', services: 'Abayas', humanContact: 'team@example.test', reviewed: true, faqs: [] }, integration: null };
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', async route => {
      const u = new URL(route.request().url());
      if (u.hostname === 'connect.facebook.net') return route.fulfill({ contentType: 'text/javascript', body: FAKE_SDK });
      if (u.origin !== BASE) return route.abort();
      if (u.pathname === '/api/layla-meta') {
        const body = route.request().postDataJSON() || {}, surface = u.searchParams.get('surface');
        if (surface !== 'customer') return route.fulfill({ json: { ok: true, connected: false, available: false } });
        calls.push(body.action || 'get');
        if (body.action === 'begin') return route.fulfill({ json: { ...state, attempt: `a-${calls.length}`, state: 'f'.repeat(64), path: body.path, expiresAt: Date.now() + 600000, appId: '1388038082832745', configId: '998877665544', version: 'v25.0', esVersion: 'v4' } });
        return route.fulfill({ json: state });
      }
      if (u.pathname.startsWith('/api/')) { apiCalls.push(u.pathname); return route.fulfill({ status: 404, json: { ok: false } }); }
      return route.continue();
    });
    await page.goto(`${BASE}/${ar ? '' : 'en/'}layla/setup`);
    await page.getByRole('heading', { name: t('Connect your channels', 'ربط قنواتك'), exact: true }).waitFor();
    assert.equal(calls.includes('begin'), false, 'no Meta attempt before the customer asks for WhatsApp'); checks++;
    const card = page.getByRole('region', { name: 'WhatsApp', exact: true });
    await card.getByRole('button', { name: t('Connect WhatsApp', 'ربط واتساب'), exact: true }).click();
    assert.equal(calls.filter(c => c === 'begin').length, 0, 'opening help does not start a Meta attempt'); checks++;
    await page.screenshot({ path: `${OUT}/${lang}-${width}-choose-app.png`, fullPage: true });
    if (width === 1440) {
      await card.locator('.layla-which-card').first().click();
      await card.getByRole('heading', { name: t('Before you start, have these ready', 'قبل أن تبدأ، جهّز ما يلي') }).waitFor();
      await card.getByRole('radio', { name: new RegExp(t('My number already uses an API or another provider', 'رقمي مرتبط بواجهة API أو مزوّد آخر')) }).check();
      await card.getByRole('radio', { name: new RegExp(t('Keep my WhatsApp Business app', 'الاستمرار باستخدام تطبيق واتساب للأعمال')) }).check();
      assert.equal(await card.getByRole('heading', { name: t('Which WhatsApp do you use for your shop?', 'أي واتساب تستخدم لمتجرك؟') }).count(), 1, 'changing paths resets the Business App checklist'); checks++;
    }
    await card.locator('.layla-which-card').nth(1).click();
    const switchButton = card.getByRole('button', { name: t('Done — I now use WhatsApp Business', 'تم، أستخدم الآن واتساب للأعمال'), exact: true });
    await switchButton.waitFor();
    await switchButton.click();
    const readyHeading = card.getByRole('heading', { name: t('Before you start, have these ready', 'قبل أن تبدأ، جهّز ما يلي') });
    await readyHeading.waitFor();
    await page.screenshot({ path: `${OUT}/${lang}-${width}-checklist.png`, fullPage: true });
    const start = card.getByRole('button', { name: t('I have everything — start', 'جهّزت كل شيء، ابدأ'), exact: true });
    assert.equal(await start.isDisabled(), true, 'readiness must be acknowledged before continuing'); checks++;
    for (const checkbox of await card.getByRole('checkbox').all()) await checkbox.check();
    await start.click();
    assert.equal(await page.evaluate(() => localStorage.getItem('layla-ready-v1')), null, 'readiness checks are not remembered across people sharing this browser'); checks++;
    const metaGuide = card.getByText(t('What you’ll see in Facebook’s window', 'ما ستراه في نافذة فيسبوك'), { exact: true });
    await metaGuide.waitFor();
    assert.equal(calls.filter(c => c === 'begin').length, 0, 'the owner chooses when to prepare Meta'); checks++;
    const launcher = page.getByRole('button', { name: t('Open setup help chat', 'فتح محادثة مساعدة الإعداد'), exact: true });
    await launcher.click();
    await page.getByRole('button', { name: t('I use regular WhatsApp', 'أستخدم واتساب العادي'), exact: true }).click();
    await page.getByText(t('free WhatsApp Business app', 'تطبيق واتساب للأعمال المجاني'), { exact: false }).waitFor(); checks++;
    const helpDialog = page.getByRole('dialog', { name: t('Setup help', 'مساعدة الإعداد') });
    await helpDialog.getByRole('textbox', { name: t('Type your question…', 'اكتب سؤالك…') }).fill(t('My WhatsApp PIN is 908172', 'رمز PIN الخاص بي ٩٠٨١٧٢'));
    await helpDialog.getByRole('button', { name: t('Send question', 'إرسال السؤال') }).click();
    await helpDialog.getByText(t('Your question was not sent or saved.', 'لم نرسل سؤالك أو نحفظه.'), { exact: false }).waitFor(); checks++;
    const supportHref = await helpDialog.locator('.chat-wa-btn').getAttribute('href');
    assert.equal(decodeURIComponent(supportHref).includes('908172'), false, 'secret input is not copied into the support message'); checks++;
    assert.equal(apiCalls.includes('/api/chat'), false, 'setup help stays local and never calls general chat'); checks++;
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const serious = axe.violations.filter(item => ['serious', 'critical'].includes(item.impact));
    const contrast = await page.locator('.chat-wa-btn > span').evaluate(el => ({ color: getComputedStyle(el).color, background: getComputedStyle(el.parentElement).backgroundColor }));
    assert.deepEqual(serious.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) })), [], `serious accessibility findings at ${lang}/${width}; support colors ${JSON.stringify(contrast)}`); checks++;
    await page.getByRole('dialog', { name: t('Setup help', 'مساعدة الإعداد') }).getByRole('button', { name: t('Close help chat', 'إغلاق محادثة المساعدة'), exact: true }).click();
    await card.getByRole('radio', { name: new RegExp(t('Use another number I own', 'استخدام رقم آخر أملكه')) }).check();
    await card.getByRole('button', { name: t('Get Meta ready', 'تجهيز الربط مع Meta'), exact: true }).click();
    const connect = card.getByRole('button', { name: t('Connect with Facebook', 'الربط عبر فيسبوك'), exact: true });
    await connect.waitFor();
    // Switching the number type releases the unused attempt before preparing another.
    await card.getByRole('radio', { name: new RegExp(t('My number already uses an API or another provider', 'رقمي مرتبط بواجهة API أو مزوّد آخر')) }).check();
    await card.getByRole('button', { name: t('Get Meta ready', 'تجهيز الربط مع Meta'), exact: true }).click();
    await connect.waitFor();
    assert.deepEqual(calls.filter(c => ['begin', 'cancel'].includes(c)), ['begin', 'cancel', 'begin']); checks++;
    await page.screenshot({ path: `${OUT}/${lang}-${width}-ready.png`, fullPage: true });
    await connect.click();
    await page.getByRole('alert').filter({ hasText: t('Meta permissions were declined', 'رُفضت أذونات Meta') }).waitFor(); checks++;
    const options = await page.evaluate(() => window.__fbLogin);
    assert.deepEqual(options.extras, {}, 'v4 extras stay empty for a new number'); checks++;
    assert.equal(options.config_id, '998877665544'); assert.equal(options.auth_type, undefined); checks++;
    assert.equal((await page.evaluate(() => window.__fbInit)).fedCM, false); checks++;
    assert.equal(calls.at(-1), 'cancel', 'the declined attempt is released'); checks++;
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `no horizontal scroll at ${width}px`); checks++;
    await page.screenshot({ path: `${OUT}/${lang}-${width}-declined.png`, fullPage: true });
    assert.deepEqual(errors, []); checks++;
    await context.close();
  }
  // A signed-in owner whose setup is still only in this browser gets it attached to the account automatically.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await context.newPage();
    const calls = [];
    const state = { ok: true, available: true, account: { email: 'owner@example.test' }, accountSaveAvailable: true, savedToAccount: false, journeyStep: 1, profileVersion: 1, csrfToken: 'c',
      profile: { businessName: 'Qurum Coast Properties', sector: 'Real estate', services: 'Sales', humanContact: '96892183502', reviewed: true, faqs: [] }, integration: null };
    await page.route('**/*', async route => {
      const u = new URL(route.request().url());
      if (u.hostname === 'connect.facebook.net') return route.fulfill({ contentType: 'text/javascript', body: FAKE_SDK });
      if (u.origin !== BASE) return route.abort();
      if (u.pathname === '/api/layla-meta') {
        const body = route.request().postDataJSON() || {};
        if (u.searchParams.get('surface') !== 'customer') return route.fulfill({ json: { ok: true, connected: false, available: false } });
        calls.push(body.action || 'get');
        // The first (automatic) claim is refused; the owner recovers from the checklist.
        if (body.action === 'claim_draft' && calls.filter(c => c === 'claim_draft').length === 1) return route.fulfill({ status: 409, json: { ok: false, reason: 'draft_operation_in_progress' } });
        if (body.action === 'claim_draft') state.savedToAccount = true;
        return route.fulfill({ json: state });
      }
      if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 404, json: { ok: false } });
      return route.continue();
    });
    await page.goto(`${BASE}/layla/setup`);
    const card = page.getByRole('region', { name: 'WhatsApp', exact: true });
    const alert = card.getByRole('alert');
    await alert.waitFor();
    assert.equal(calls.filter(c => c === 'claim_draft').length, 1, 'the setup is claimed once automatically'); checks++;
    assert.match(await alert.textContent(), /خطوة ربط ما زالت قيد الإنهاء/, 'the refusal says what to do'); checks++;
    assert.equal(await alert.evaluate(el => document.activeElement === el), true, 'the message takes focus'); checks++;
    await card.getByRole('button', { name: 'ربط واتساب', exact: true }).click();
    await card.getByRole('radio', { name: /استخدام رقم آخر أملكه/ }).check();
    const prepare = card.getByRole('button', { name: 'تجهيز الربط مع Meta' });
    assert.equal(await prepare.isDisabled(), true); checks++;
    assert.match(await prepare.getAttribute('aria-describedby'), /whatsapp-requirements/, 'the disabled button points to what is missing'); checks++;
    await card.getByRole('button', { name: 'احفظ إعدادي في حسابي' }).click();
    await page.waitForFunction(() => !document.querySelector('#whatsapp-requirements button'));
    assert.equal(calls.filter(c => c === 'claim_draft').length, 2, 'one press saves the setup'); checks++;
    assert.equal(await page.getByRole('heading', { name: 'احفظ إعدادك لربط القنوات' }).count(), 0, 'no hidden save prompt for a signed-in owner'); checks++;
    await context.close();
  }
  console.log(`${checks} WhatsApp connect checks passed. Synthetic rehearsal; no Meta consent or delivery evidence.`);
} finally { await browser.close(); }
