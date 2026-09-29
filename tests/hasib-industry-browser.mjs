// Synthetic local preview across every configured owner pack; never reaches external APIs.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { hasibPack, industryCatalog, visibleModules } from '../config/hasib-packs.js';
import { createHasibStrings } from '../src/lib/hasib/strings.js';
const base = process.argv[2] || 'http://127.0.0.1:5198';
const browser = await chromium.launch();
try {
  for (const industry of industryCatalog()) for (const lang of ['en', 'ar']) {
    const pack = hasibPack(industry.id), calls = [], errors = [];
    const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
    page.on('pageerror', error => errors.push(error.message));
    const overview = { ok: true, csrfToken: 'a'.repeat(64), account: { email: 'preview@example.test' }, connected: true, dashboardAvailable: true, timezone: 'Asia/Muscat', business: { name: 'Preview', sectorId: industry.id }, integration: null, messaging: { available: false }, qualification: { fields: [], id: industry.id } };
    const hasibOverview = { pack, modules: visibleModules(pack), setupRequired: false, settings: { currency: 'OMR', vatRegistered: false, vatRateBps: 500, pricesIncludeVat: false }, counts: { lowStock: 0 }, livePacks: [industry] };
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== new URL(base).origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      const body = request.postDataJSON(), surface = url.searchParams.get('surface');
      calls.push(body?.action);
      let value = { items: [] };
      if (surface === 'dashboard' && !body) value = overview;
      else if (surface === 'hasib' && !body) value = hasibOverview;
      else if (body?.action === 'today') value = { date: '2026-09-28', setup: { products: true, photos: true, services: true }, needsYou: { ordersCount: 0, chats: 0, lowStockCount: 0, repairsReady: 0 }, industryMetrics: pack.todayMetrics.map(m => ({ id: m.id, value: null })) };
      else if (body?.action === 'restaurant_summary') value = { foodCostBps: null, laborCostBps: null, primeCostBps: null, wasteMinor: 0, stockVarianceMinor: 0, usageVarianceMinor: null, actualUsageMinor: null };
      else if (body?.action === 'contacts') value = { items: [{ id: 'contact-1', name: 'Preview Customer' }], qualification: overview.qualification };
      else if (body?.action === 'resources') value = { items: [{ id: 'resource-1', name: 'Provider', capacity: 1 }] };
      else if (body?.action === 'services') value = { items: [{ id: 'service-1', name: 'Visit', durationMinutes: 30 }] };
      return route.fulfill({ json: { ok: true, csrfToken: 'a'.repeat(64), ...value } });
    });
    const prefix = lang === 'en' ? '/en' : '';
    await page.goto(`${base}${prefix}/layla/dashboard?tab=today`);
    await page.locator('.hb-industry-figures').waitFor();
    assert.equal(await page.locator('.hb-industry-figures .hb-figure').count(), 3, industry.id);
    assert.equal(await page.locator('.ld').getAttribute('dir'), lang === 'ar' ? 'rtl' : 'ltr');
    await page.locator('.hb-today > .ld-primary').click();
    await page.locator('[role="dialog"]').waitFor();
    assert.equal(await page.locator('[role="dialog"]').count(), 1, `${industry.id}: primary action opens one form`);
    await page.keyboard.press('Escape');
    if (['restaurant', 'cafe', 'cakes'].includes(industry.id)) {
      await page.goto(`${base}${prefix}/layla/dashboard?tab=stock`);
      const controls = page.locator('.hb-restaurant-controls');
      await controls.waitFor();
      assert.equal(await controls.locator('form').count(), 0, 'food forms initially hidden');
      await controls.getByRole('button', { name: createHasibStrings(lang).t('recordWaste'), exact: true }).click();
      assert.equal(await page.locator('[role="dialog"] form').count(), 1);
      await page.keyboard.press('Escape');
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${industry.id}/${lang}: 320px overflow`);
    assert.deepEqual(errors, [], `${industry.id}/${lang}: runtime errors`);
    console.log(`PASS ${industry.id}/${lang}: three measures, primary form, 320px, ${lang === 'ar' ? 'RTL' : 'LTR'}`);
    await page.close();
  }
} finally { await browser.close(); }
