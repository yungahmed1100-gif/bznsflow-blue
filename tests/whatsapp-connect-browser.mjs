// WhatsApp connect rehearsal: API and Meta SDK are synthetic, external traffic blocked.
// Proves the v4 launch options, one Meta attempt per chosen number type, and that
// a Meta refusal is shown in plain words. Not evidence of Meta consent or delivery.
//   npm run build && npx vite preview --port 5199 & node tests/whatsapp-connect-browser.mjs http://127.0.0.1:5199
import { chromium } from 'playwright';
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
    const calls = [], errors = [];
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
      if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 404, json: { ok: false } });
      return route.continue();
    });
    await page.goto(`${BASE}/${ar ? '' : 'en/'}layla/setup`);
    await page.getByRole('heading', { name: t('Connect your channels', 'ربط قنواتك'), exact: true }).waitFor();
    assert.equal(calls.includes('begin'), false, 'no Meta attempt before the customer asks for WhatsApp'); checks++;
    const card = page.getByRole('region', { name: 'WhatsApp', exact: true });
    await card.getByRole('button', { name: t('Connect WhatsApp', 'ربط واتساب'), exact: true }).click();
    const connect = card.getByRole('button', { name: t('Connect with Facebook', 'الربط عبر فيسبوك'), exact: true });
    await connect.waitFor();
    assert.equal(calls.filter(c => c === 'begin').length, 1, 'one attempt prepared'); checks++;
    // Switching the number type releases the unused attempt before preparing another.
    await card.getByText(t('Use another number I own', 'استخدام رقم آخر أملكه')).click();
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
        if (body.action === 'claim_draft') state.savedToAccount = true;
        return route.fulfill({ json: state });
      }
      if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 404, json: { ok: false } });
      return route.continue();
    });
    await page.goto(`${BASE}/layla/setup`);
    await page.getByRole('button', { name: 'ربط واتساب', exact: true }).waitFor();
    assert.equal(calls.filter(c => c === 'claim_draft').length, 1, 'the setup is claimed once, without a click'); checks++;
    assert.equal(await page.getByRole('heading', { name: 'احفظ إعدادك لربط القنوات' }).count(), 0, 'no save prompt once claimed'); checks++;
    await context.close();
  }
  console.log(`${checks} WhatsApp connect checks passed. Synthetic rehearsal; no Meta consent or delivery evidence.`);
} finally { await browser.close(); }
