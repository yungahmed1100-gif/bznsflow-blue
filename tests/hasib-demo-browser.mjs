// End-to-end against the real-logic demo (scripts/hasib-demo.mjs): the UI drives
// the actual Hasib/Layla Convex state code, so every figure asserted here was
// computed by the production executors, not a fixture.
// Usage: npm run build && node scripts/hasib-demo.mjs 5310 & node tests/hasib-demo-browser.mjs http://localhost:5310
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const BASE = process.argv[2] || 'http://localhost:5310';
const OUT = process.env.HASIB_DEMO_OUT || 'work/hasib-demo-browser';
await mkdir(OUT, { recursive: true });
const api = (action, body = {}) => fetch(`${BASE}/api/layla-meta?surface=hasib`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...body }) }).then(r => r.json());
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const axe = async (page, scope = '.ld') => (await new AxeBuilder({ page }).include(scope).analyze()).violations.filter(v => ['critical', 'serious'].includes(v.impact)).map(v => `${v.id}: ${v.nodes.map(n => n.target).join(', ')}`);
const grouped = minor => new Intl.NumberFormat('en-US', { minimumFractionDigits: 3 }).format(minor / 1000);

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
  // 1. Insights renders the real figures in both languages and at every width.
  const month = await api('insights', { period: 'month' });
  assert.ok(month.ok && month.sales.orders > 0, 'demo has sales');
  for (const lang of ['en', 'ar']) {
    for (const width of [1440, 1024, 768, 375, 320]) {
      const { page, context, errors } = await open(width, lang, '/layla/dashboard?tab=insights');
      await page.locator('.hb-hero-value').waitFor();
      assert.match(await page.locator('.hb-hero-value').textContent(), new RegExp(grouped(month.netProfitMinor).replace('.', '\\.'))); count++;
      assert.match(await page.locator('.hb-tiles').first().textContent(), new RegExp(grouped(month.sales.totalMinor).replace(/[.,]/g, m => `\\${m}`))); count++;
      assert.match(await page.locator('.hb-demand').textContent(), lang === 'ar' ? /قفطان كتان|Linen kaftan/ : /Linen kaftan/, 'unlisted demand surfaced'); count++;
      assert.equal(await noOverflow(page), true, `insights overflow ${lang} ${width}`); count++;
      assert.deepEqual(await axe(page), [], `insights axe ${lang} ${width}`); count++;
      assert.deepEqual(errors, [], `no page errors ${lang} ${width}`); count++;
      await page.screenshot({ path: `${OUT}/insights-${lang}-${width}.png`, fullPage: true });
      await context.close();
    }
  }

  // 2. An expense added in the UI moves operating costs and net profit by exactly its amount.
  {
    const before = await api('insights', { period: 'month' });
    const { page, context } = await open(1280, 'en', '/layla/dashboard?tab=expenses');
    await page.getByRole('button', { name: 'Add expense' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Category').selectOption('marketing');
    await dialog.getByLabel('Amount (OMR)').fill('12.5');
    await dialog.getByLabel('Paid to (optional)').fill('Snapchat ads');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    await page.getByText('Snapchat ads').waitFor(); count++;
    assert.deepEqual(await axe(page), [], 'expenses axe'); count++;
    await page.screenshot({ path: `${OUT}/expenses-en-1280.png`, fullPage: true });
    const after = await api('insights', { period: 'month' });
    assert.equal(after.expenses.operatingMinor - before.expenses.operatingMinor, 12500); count++;
    assert.equal(before.netProfitMinor - after.netProfitMinor, 12500); count++;
    await context.close();
  }

  // 3. A confirmed sale made in the UI takes stock and appears in sales, profit and best sellers.
  {
    const before = await api('insights', { period: 'today' });
    const { page, context } = await open(1280, 'ar', '/layla/dashboard?tab=orders');
    await page.getByRole('button', { name: 'طلب جديد' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('ابحث عن منتج أو رمز SKU').fill('شيلة');
    await dialog.locator('.hb-picker-list button').first().click();
    await dialog.getByRole('button', { name: 'حفظ الطلب' }).click();
    await page.locator('.hb-detail').waitFor();
    await page.screenshot({ path: `${OUT}/order-detail-ar-1280.png` });
    const after = await api('insights', { period: 'today' });
    assert.equal(after.sales.orders - before.sales.orders, 1); count++;
    assert.equal(after.sales.totalMinor - before.sales.totalMinor, 8000); count++;
    assert.equal(after.sales.grossProfitMinor - before.sales.grossProfitMinor, 5000, 'price 8.000 minus cost 3.000'); count++;
    await context.close();
  }

  // 4. A real chat becomes a prefilled order: Layla captured the item, Hasib matched the product.
  {
    await fetch(`${BASE}/demo/inbound`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ from: '96899887766', text: 'Do you have the embroidered abaya?', name: 'Test Buyer' }) });
    const { page, context } = await open(1280, 'en', '/layla/dashboard?tab=chats');
    await page.getByRole('button', { name: /Test Buyer/ }).click();
    await page.getByRole('button', { name: 'Create order' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('.hb-totals').waitFor();
    assert.match(await dialog.locator('.hb-lines').textContent(), /عباية مطرزة|Embroidered abaya/); count++;
    assert.match(await dialog.textContent(), /Test Buyer/); count++;
    await page.screenshot({ path: `${OUT}/chat-to-order-en-1280.png` });
    await context.close();
  }

  // 5. Stock shows sizes that sold out, and the phone tab bar scrolls inside itself.
  {
    const { page, context } = await open(375, 'ar', '/layla/dashboard?tab=stock');
    await page.locator('.hb-stock-table').waitFor();
    assert.ok(await page.getByText('نفد').first().isVisible(), 'sold-out size flagged'); count++;
    assert.equal(await noOverflow(page), true); count++;
    assert.deepEqual(await axe(page), [], 'stock axe phone'); count++;
    await page.screenshot({ path: `${OUT}/stock-ar-375.png`, fullPage: true });
    await context.close();
  }
  console.log(`hasib demo browser: ${count} assertions passed`);
} finally {
  await browser.close();
}
