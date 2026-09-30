// End-to-end for the tech-store pack against the real-logic demo:
//   npm run build && node scripts/hasib-demo.mjs 5311 --pack=retail-tech & node tests/hasib-tech-browser.mjs http://localhost:5311
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const BASE = process.argv[2] || 'http://localhost:5311';
const OUT = process.env.HASIB_TECH_OUT || 'work/hasib-tech-browser';
await mkdir(OUT, { recursive: true });
const api = (action, body = {}) => fetch(`${BASE}/api/layla-meta?surface=hasib`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...body }) }).then(r => r.json());
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const axe = async (page, scope = '.ld') => (await new AxeBuilder({ page }).include(scope).analyze()).violations.filter(v => ['critical', 'serious'].includes(v.impact)).map(v => `${v.id}: ${v.nodes.map(n => n.target).join(', ')}`);
const T = {
  en: { service: 'Service', stock: 'Stock', orders: 'Orders', newOrder: 'New order', search: 'Search products or SKU', save: 'Save order', lookup: 'Look up', scan: 'Scan or type an IMEI', newRepair: 'New repair', tradeIn: 'Trade-in' },
  ar: { service: 'الصيانة', stock: 'المخزون', orders: 'الطلبات', newOrder: 'طلب جديد', search: 'ابحث عن منتج أو رمز SKU', save: 'حفظ الطلب', lookup: 'بحث', scan: 'امسح أو اكتب رقم IMEI', newRepair: 'تذكرة صيانة جديدة', tradeIn: 'استبدال' },
};

const browser = await chromium.launch();
let count = 0;
const open = async (width, lang, path) => {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}${lang === 'ar' ? '' : '/en'}${path}`);
  return { page, context, errors };
};
try {
  // Screens render in both languages at desktop and phone widths.
  for (const lang of ['en', 'ar']) {
    for (const width of [1280, 375]) {
      for (const tab of ['insights', 'stock', 'service']) {
        const { page, context, errors } = await open(width, lang, `/layla/dashboard?tab=${tab}`);
        await page.locator(tab === 'insights' ? '.hb-money-summary' : tab === 'stock' ? '.hb-stock-table' : '.hb-service .ld-table').first().waitFor();
        if (tab === 'service') assert.ok(await page.getByRole('link', { name: T[lang].service }).isVisible() || width < 768, 'Service tab in nav');
        if (tab === 'stock') assert.ok(await page.getByText('IMEI', { exact: true }).first().isVisible(), 'IMEI chip on serialized products');
        assert.equal(await noOverflow(page), true, `${tab} overflow ${lang} ${width}`); count++;
        assert.deepEqual(await axe(page), [], `${tab} axe ${lang} ${width}`); count++;
        assert.deepEqual(errors, [], `${tab} errors ${lang} ${width}`); count++;
        await page.screenshot({ path: `${OUT}/${tab}-${lang}-${width}.png`, fullPage: true });
        await context.close();
      }
    }
  }

  // Sell a phone by picking its IMEI; the unit becomes sold with warranty.
  {
    const { page, context } = await open(1280, 'en', '/layla/dashboard?tab=orders');
    await page.getByRole('button', { name: T.en.newOrder }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder(T.en.search).fill('Galaxy');
    await dialog.locator('.hb-picker-list button').first().click();
    const chip = dialog.locator('.hb-serial-chips button').first();
    // The chip shows the IMEI and its age in stock; the IMEI itself is the <bdi>.
    const serial = (await chip.locator('bdi').textContent()).trim();
    assert.equal(await dialog.getByRole('button', { name: T.en.save }).isDisabled(), true, 'cannot save a phone line without an IMEI'); count++;
    await chip.click();
    assert.equal(await chip.getAttribute('aria-pressed'), 'true'); count++;
    assert.deepEqual(await axe(page, '.ld-dialog'), [], 'composer axe'); count++;
    await page.screenshot({ path: `${OUT}/composer-imei-en.png` });
    await dialog.getByRole('button', { name: T.en.save }).click();
    await page.locator('.hb-detail').waitFor();
    assert.match(await page.locator('.hb-line-serials').textContent(), new RegExp(serial)); count++;
    const lookup = await api('serial_lookup', { serial });
    assert.deepEqual([lookup.status, lookup.warranty.active, lookup.warranty.by], ['sold', true, 'agent']); count++;
    await context.close();

    // Warranty lookup in the Service tab finds that sale.
    const svc = await open(1280, 'ar', '/layla/dashboard?tab=service');
    await svc.page.getByPlaceholder(T.ar.scan).first().fill(serial);
    await svc.page.getByRole('button', { name: T.ar.lookup, exact: true }).click();
    await svc.page.locator('.hb-warranty.is-active').waitFor();
    assert.match(await svc.page.locator('.hb-lookup-result').textContent(), /ضمن الضمان/); count++;
    await svc.page.screenshot({ path: `${OUT}/warranty-ar.png` });
    await svc.context.close();
  }

  // A repair from booking to ready: quote with a part, deposit, then parts leave stock.
  {
    const partBefore = (await api('items', { search: 'screen' })).items.find(i => i.nameEn.includes('screen')).variants[0].onHand;
    const { page, context } = await open(1280, 'en', '/layla/dashboard?tab=service');
    await page.getByRole('button', { name: T.en.newRepair }).first().click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel('Device', { exact: true }).fill('iPhone 15 Pro');
    await dialog.getByLabel('Fault', { exact: true }).fill('Screen lines after a drop');
    await dialog.getByLabel('Quote (OMR)').fill('25');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.locator('.hb-detail').waitFor();
    await dialog.getByPlaceholder('Search parts in stock').fill('screen');
    await dialog.locator('.hb-picker-list button').filter({ hasText: /screen \(part\)/i }).first().click();
    await dialog.getByRole('button', { name: 'Save quote and parts' }).click();
    await page.waitForFunction(() => /87\.000/.test(document.querySelector('.ld-dialog .hb-totals')?.textContent || ''));
    count++;
    await dialog.getByRole('button', { name: 'Move to: Diagnosing' }).click();
    // Work waits for the customer's approval of the quote.
    await dialog.getByRole('button', { name: 'Move to: Ready' }).waitFor();
    assert.equal(await dialog.getByRole('button', { name: 'Move to: Ready' }).isDisabled(), true, 'Ready waits for approval'); count++;
    await dialog.getByLabel('Name of the customer who approved').fill('Saif by phone');
    await dialog.getByRole('button', { name: 'Record customer approval' }).click();
    await dialog.getByText('Customer approved this quote').waitFor();
    await dialog.getByRole('button', { name: 'Move to: Ready' }).click();
    await dialog.getByText('Quote and parts are fixed once the device is ready.').waitFor(); count++;
    assert.deepEqual(await axe(page, '.ld-dialog'), [], 'repair axe'); count++;
    await page.screenshot({ path: `${OUT}/repair-en.png` });
    const partAfter = (await api('items', { search: 'screen' })).items.find(i => i.nameEn.includes('screen')).variants[0].onHand;
    assert.equal(partBefore - partAfter, 1, 'the part left stock at ready'); count++;
    await context.close();
  }

  // Trade-in, then Money opens on its summary.
  {
    const { page, context } = await open(1280, 'en', '/layla/dashboard?tab=service');
    await page.getByRole('button', { name: T.en.tradeIn }).click();
    const dialog = page.getByRole('dialog');
    const used = await dialog.locator('select option', { hasText: /iPhone 13/ }).first().getAttribute('value');
    await dialog.getByLabel('Traded-in product').selectOption(used).catch(() => dialog.locator('select').first().selectOption(used));
    await dialog.getByLabel('IMEI / serial').fill('353251509999999');
    await dialog.getByLabel('Price paid (OMR)').fill('95');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText(/Trade-in #\d+ saved/).waitFor(); count++;
    assert.equal((await api('serial_lookup', { serial: '353251509999999' })).source, 'trade_in'); count++;
    await page.getByRole('navigation', { name: 'Dashboard sections' }).getByRole('link', { name: 'Money' }).click();
    assert.equal(await page.getByRole('navigation', { name: 'Views in this section' }).getByRole('link', { name: 'Summary' }).getAttribute('aria-current'), 'page', 'Money opens on its summary'); count++;
    await context.close();
  }
  console.log(`hasib tech browser: ${count} assertions passed`);
} finally {
  await browser.close();
}
