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
      // The money summary leads with recorded profit; sales sit under "Details".
      await page.locator('.hb-money-summary').waitFor();
      assert.match(await page.locator('.hb-money-summary').textContent(), new RegExp(grouped(month.recordedProfitMinor).replace(/[.,]/g, m => `\\${m}`))); count++;
      assert.match(await page.locator('.hb-report-details').textContent(), new RegExp(grouped(month.sales.totalMinor).replace(/[.,]/g, m => `\\${m}`))); count++;
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

  // 4. A buying message in a real chat: Layla files the order herself and acknowledges it;
  //    the chat header and Orders → Waiting for you both show it. No button involved.
  {
    await fetch(`${BASE}/demo/inbound`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ from: '96899887766', text: 'I want the embroidered abaya please', name: 'Test Buyer' }) });
    const waiting = await api('orders', { status: 'layla_waiting' });
    const mine = waiting.items.find(o => o.contact?.name === 'Test Buyer');
    assert.ok(mine, 'Layla created the order'); count++;
    assert.equal(mine.source, 'layla'); count++;
    const { page, context } = await open(1280, 'en', '/layla/dashboard?tab=chats');
    await page.getByRole('button', { name: /Test Buyer/ }).click();
    assert.equal(await page.getByRole('button', { name: 'Create order' }).count(), 0, 'no manual create-order button in the chat'); count++;
    await page.locator('.hb-chat-order').first().waitFor();
    assert.match(await page.locator('.hb-chat-orders').textContent(), new RegExp(`Order #${mine.number}.*From Layla`)); count++;
    assert.match(await page.locator('.ld-messages').textContent(), new RegExp(`Order #${mine.number} received`), 'Layla acknowledged it in the chat'); count++;
    await page.locator('.hb-chat-order').first().click();
    await page.locator('.hb-detail').waitFor();
    assert.match(await page.locator('.hb-detail').textContent(), /عباية مطرزة|Embroidered abaya/); count++;
    assert.deepEqual(await axe(page, '.ld-dialog'), [], 'order from chat axe'); count++;
    await page.screenshot({ path: `${OUT}/chat-layla-order-en-1280.png` });
    await context.close();
    const orders = await open(1280, 'ar', '/layla/dashboard?tab=orders');
    await orders.page.locator('.hb-order-table').waitFor();
    assert.equal(await orders.page.locator('select').first().inputValue(), 'layla_waiting', 'Orders opens on “Waiting for you” when Layla has orders waiting'); count++;
    assert.ok(await orders.page.locator('.ld-nav-badge').first().isVisible(), 'the nav shows a waiting badge'); count++;
    await orders.page.screenshot({ path: `${OUT}/orders-waiting-ar-1280.png` });
    await orders.context.close();
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
  // Today, from the real logic: the three retail measures the API returns.
  const day = await api('today');
  assert.ok(day.ok, 'today op answers through the real API route');
  const best = day.industryMetrics.find(m => m.id === 'best_variant');
  for (const lang of ['en', 'ar']) {
    const { page, context, errors } = await open(375, lang, '/layla/dashboard');
    await page.locator('.hb-today .hb-needs').waitFor();
    if (best.value != null) { assert.match(await page.locator('.hb-today').textContent(), new RegExp(String(best.value)), `best seller matches (${lang})`); count++; }
    assert.equal(await noOverflow(page), true); count++;
    assert.deepEqual(await axe(page), [], `today axe ${lang}`); count++;
    assert.deepEqual(errors, []); count++;
    await page.screenshot({ path: `${OUT}/today-${lang}-375.png`, fullPage: true });
    await context.close();
  }
  console.log(`hasib demo browser: ${count} assertions passed`);
} finally {
  await browser.close();
}
