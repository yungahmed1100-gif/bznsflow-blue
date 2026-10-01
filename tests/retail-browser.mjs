// Retail (abaya boutique, Ascend) in a real browser against the real-logic demo:
// every order, payment, stock move, request, follow-up, team change and chat goes
// through the production Convex state code. Runs a manager and an employee demo.
// Usage: npm run build && node tests/retail-browser.mjs
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

const OUT = process.env.RETAIL_BROWSER_OUT || 'work/hardening/retail/browser';
const MANAGER_PORT = 5331, EMPLOYEE_PORT = 5332;
await mkdir(OUT, { recursive: true });

function demo(port, ...flags) {
  const child = spawn(process.execPath, ['scripts/hasib-demo.mjs', String(port), ...flags], { stdio: ['ignore', 'pipe', 'inherit'] });
  const ready = new Promise((resolve, reject) => {
    child.stdout.on('data', chunk => { if (String(chunk).includes('Hasib demo')) resolve(); });
    child.on('exit', code => reject(new Error(`demo on ${port} exited with ${code}`)));
  });
  return { child, ready, base: `http://127.0.0.1:${port}` };
}

const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const axe = async page => (await new AxeBuilder({ page }).include('.ld').analyze()).violations.filter(v => ['critical', 'serious'].includes(v.impact)).map(v => `${v.id}: ${v.nodes.length}`);
// Business details and Instagram call surfaces the demo does not serve; they are checked live.
const DEMO_ONLY = /surface=(customer|instagram)/;
// A 4×4 PNG, uploaded as a product photo.
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000004000000040802000000269309290000001049444154789c63687070802306e23800a4431001fd60a3f00000000049454e44ae426082', 'hex');

const manager = demo(MANAGER_PORT), employee = demo(EMPLOYEE_PORT, '--role=employee');
await Promise.all([manager.ready, employee.ready]);
const browser = await chromium.launch();
let count = 0;
const ok = (value, message) => { assert.ok(value, message); count++; };
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); count++; };

async function open(base, width, lang, path) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', e => problems.push(`pageerror ${e.message}`));
  page.on('response', r => { if (r.url().includes('/api/') && r.status() >= 400 && !DEMO_ONLY.test(r.url())) problems.push(`${r.status()} ${r.url()}`); });
  // An expected refusal is asserted by the journey; anything else is a problem.
  const expect = reason => problems.splice(0, problems.length, ...problems.filter(p => !p.startsWith('409') || !reason));
  await page.goto(`${base}${lang === 'ar' ? '' : '/en'}${path}`);
  await page.locator('.ld-nav a').first().waitFor();
  return { page, context, problems, expect };
}
const api = (page, base, action, body = {}) => page.evaluate(async ([url, payload]) => (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })).json(),
  [`${base}/api/layla-meta?surface=hasib`, { action, ...body }]);
const sections = page => page.locator('.ld-nav a').allInnerTexts().then(list => list.map(x => x.trim()));

try {
  // 1. Every manager section, deep-linked, in both languages and three widths.
  const MANAGER_TABS = ['today', 'chats', 'orders', 'stock', 'money', 'customers', 'team', 'settings'];
  for (const lang of process.env.RETAIL_QUICK ? [] : ['en', 'ar']) {
    for (const width of [1440, 768, 320]) {
      for (const tab of MANAGER_TABS) {
        const { page, context, problems } = await open(manager.base, width, lang, `/layla/dashboard?tab=${tab}`);
        await page.locator('main h1, main h2').first().waitFor();
        eq((await sections(page)).length, 8, `${lang} ${width}: eight sections`);
        eq(await page.locator('main').getAttribute('data-tab'), tab, `${lang} ${width} ${tab}: deep link`);
        eq(await noOverflow(page), true, `${lang} ${width} ${tab}: overflow`);
        eq(await axe(page), [], `${lang} ${width} ${tab}: axe`);
        eq(problems, [], `${lang} ${width} ${tab}: no page errors or refused calls`);
        if (width === 320 || width === 1440) await page.screenshot({ path: `${OUT}/manager-${tab}-${lang}-${width}.png`, fullPage: true });
        await context.close();
      }
    }
  }

  // 2. A sale: confirm, overpayment refused, exact payment, cancel asks first and puts the piece back.
  {
    const { page, context, problems, expect } = await open(manager.base, 1440, 'en', '/layla/dashboard?tab=orders');
    const before = (await api(page, manager.base, 'items', { search: 'BC-58' })).items[0].variants.find(v => v.sku === 'BC-58').onHand;
    await page.getByRole('button', { name: 'New order' }).first().click();
    await page.getByPlaceholder('Search products or SKU').fill('BC-58');
    await page.locator('.hb-picker-list button', { hasText: '— 58' }).click();
    await page.getByRole('button', { name: 'Save order' }).dblclick();
    const detail = page.getByRole('dialog').filter({ hasText: 'Record payment' });
    await detail.waitFor();
    const after = (await api(page, manager.base, 'items', { search: 'BC-58' })).items[0].variants.find(v => v.sku === 'BC-58').onHand;
    eq(after, before - 1, 'a double-clicked save makes one confirmed sale');
    await detail.getByLabel('Amount (OMR)').fill('999');
    await detail.getByRole('button', { name: 'Record payment' }).click();
    await detail.getByText('more than the customer still owes').waitFor(); count++;
    expect('payment_exceeds_balance');
    await detail.getByLabel('Amount (OMR)').fill('25');
    await detail.getByRole('button', { name: 'Record payment' }).click();
    await detail.locator('.hb-payments li').first().waitFor(); count++;
    await detail.getByRole('button', { name: 'Move to: Cancelled' }).click();
    const confirm = detail.getByRole('alertdialog');
    await confirm.waitFor(); count++;
    await confirm.getByRole('button', { name: 'Keep it' }).click();
    eq((await api(page, manager.base, 'items', { search: 'BC-58' })).items[0].variants.find(v => v.sku === 'BC-58').onHand, before - 1, 'keeping the order leaves stock alone');
    await detail.getByRole('button', { name: 'Move to: Cancelled' }).click();
    await detail.getByRole('alertdialog').getByRole('button', { name: 'Move to: Cancelled' }).click();
    await detail.locator('.hb-detail-meta').getByText('Cancelled').waitFor(); count++;
    eq((await api(page, manager.base, 'items', { search: 'BC-58' })).items[0].variants.find(v => v.sku === 'BC-58').onHand, before, 'cancelling puts the piece back');
    eq(problems, [], 'sale journey: no unexpected errors');
    await page.screenshot({ path: `${OUT}/sale-cancelled-en.png` });
    await context.close();
  }

  // 3. A customer waits for a size; a delivered order fills the request (it could not before).
  {
    const { page, context, problems } = await open(manager.base, 1440, 'en', '/layla/dashboard?tab=orders');
    const salma = (await page.evaluate(async url => (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'contacts' }) })).json(), `${manager.base}/api/layla-meta?surface=dashboard`)).items.find(c => c.name === 'Salma Al Harthy');
    const navy = (await api(page, manager.base, 'items', { search: 'EM-54N' })).items[0].variants.find(v => v.sku === 'EM-54N');
    const requests = page.locator('.hb-requests');
    await requests.getByRole('button', { name: 'Record missing size or colour' }).click();
    const form = page.getByRole('dialog', { name: 'Record a product request' });
    await form.getByLabel('Customer').selectOption(salma.id);
    await form.getByLabel('Exact size and colour').selectOption(navy.id);
    await form.getByRole('button', { name: 'Save' }).dblclick();
    await requests.getByText('Salma Al Harthy').waitFor(); count++;
    eq((await api(page, manager.base, 'product_requests', { status: 'waiting' })).items.length, 1, 'a double-clicked save records one request');
    await requests.getByRole('button', { name: 'Mark filled' }).click();
    const fill = page.getByRole('dialog', { name: 'Mark filled' });
    const option = fill.locator('select option', { hasText: 'Delivered' }).first();
    await option.waitFor({ state: 'attached' });
    await fill.getByRole('combobox').selectOption(await option.getAttribute('value'));
    await fill.getByRole('button', { name: 'Mark filled' }).click();
    await fill.waitFor({ state: 'detached' });
    await requests.getByText('No customer is waiting').waitFor(); count++;
    eq(problems, [], 'product request journey: no errors');
    await context.close();
  }

  // 4. A new product with a photo, then archived after confirming.
  {
    const { page, context, problems } = await open(manager.base, 1440, 'en', '/layla/dashboard?tab=stock');
    await page.getByRole('button', { name: 'Add product' }).first().click();
    const editor = page.getByRole('dialog');
    await editor.getByLabel('Name (English)').fill('Test crepe abaya');
    await editor.getByLabel('Price (OMR)').first().fill('30');
    await editor.locator('input[type="file"]').setInputFiles({ name: 'abaya.png', mimeType: 'image/png', buffer: PNG });
    await editor.locator('img').first().waitFor(); count++;
    await editor.getByRole('button', { name: 'Save' }).click();
    await editor.waitFor({ state: 'detached' });
    const saved = (await api(page, manager.base, 'items', { search: 'crepe' })).items[0];
    ok(saved?.photoUrl, 'the photo is stored with the product');
    await page.getByRole('button', { name: 'Test crepe abaya' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Archive' }).click();
    await page.getByRole('dialog').getByText('Archive Test crepe abaya?').waitFor(); count++;
    await page.getByRole('dialog').getByRole('button', { name: 'Archive' }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    eq((await api(page, manager.base, 'items', { search: 'crepe' })).items.length, 0, 'archived products leave the list');
    eq(problems, [], 'product journey: no errors');
    await context.close();
  }

  // 5. Team: invite, see it pending, remove access after confirming.
  for (const lang of ['en', 'ar']) {
    const { page, context, problems } = await open(manager.base, lang === 'en' ? 1440 : 320, lang, '/layla/dashboard?tab=team');
    const email = `helper-${lang}@noor.example`;
    await page.locator('.hb-page-header .ld-primary').click();
    await page.getByRole('dialog').locator('input[type="email"]').fill(email);
    await page.getByRole('dialog').locator('button[type="submit"]').click();
    const row = page.locator('.hb-team li', { hasText: email });
    await row.waitFor(); count++;
    await row.locator('.ld-danger').click();
    await page.getByRole('dialog').locator('.ld-danger').click();
    await row.locator('.ld-danger').waitFor({ state: 'detached' }); count++;
    eq(await axe(page), [], `${lang}: team axe`);
    eq(problems, [], `${lang}: team journey, no errors`);
    await page.screenshot({ path: `${OUT}/team-${lang}.png`, fullPage: true });
    await context.close();
  }

  // 6. An expense voided once, even when Void is double-clicked.
  {
    const { page, context, problems } = await open(manager.base, 1440, 'en', '/layla/dashboard?tab=money&view=expenses');
    // Seeded expenses are days old, so on the 1st of a month "This month" is empty.
    await page.getByLabel('Period').selectOption('30d');
    await page.locator('.hb-expenses table').waitFor();
    const before = (await api(page, manager.base, 'expenses', { period: '30d' })).items.filter(e => e.voided).length;
    await page.locator('.hb-expenses tbody tr').first().getByRole('button', { name: 'Void' }).click();
    await page.locator('.hb-confirm').getByRole('button', { name: 'Void' }).dblclick();
    await page.locator('.hb-confirm').waitFor({ state: 'detached' });
    eq((await api(page, manager.base, 'expenses', { period: '30d' })).items.filter(e => e.voided).length, before + 1, 'one expense voided');
    eq(problems, [], 'expense journey: no errors');
    await context.close();
  }

  // 7. Follow-up: retail links only orders; the note shows with the customer's name.
  {
    const { page, context, problems } = await open(manager.base, 1440, 'en', '/layla/dashboard?tab=customers');
    const panel = page.locator('.hb-followups');
    await panel.getByRole('button', { name: 'Add follow-up' }).click();
    const form = page.getByRole('dialog', { name: 'Add follow-up' });
    await form.getByLabel('Customer').selectOption({ label: 'Salma Al Harthy' });
    eq(await form.getByLabel('Linked record (optional)').locator('option').allInnerTexts(), ['—', 'Order'], 'only orders can be linked in retail');
    await form.getByLabel('Reason').fill('Tell her the navy 54 is back');
    await form.locator('input[type="datetime-local"]').fill('2030-01-01T10:00');
    await form.getByRole('button', { name: 'Save' }).click();
    await panel.getByText('Tell her the navy 54 is back').waitFor(); count++;
    await panel.locator('li', { hasText: 'navy 54' }).getByRole('button', { name: 'Mark done' }).click();
    await panel.getByText('Tell her the navy 54 is back').waitFor({ state: 'detached' }); count++;
    eq(problems, [], 'follow-up journey: no errors');
    await context.close();
  }

  // 8. The employee: sells and adjusts stock, but no money, team, settings, import, price edits or refunds.
  for (const lang of ['en', 'ar']) {
    for (const width of [1440, 320]) {
      for (const tab of ['today', 'chats', 'orders', 'stock', 'customers', 'money', 'settings', 'team']) {
        const { page, context, problems } = await open(employee.base, width, lang, `/layla/dashboard?tab=${tab}`);
        await page.locator('main h1, main h2').first().waitFor();
        eq((await sections(page)).length, 5, `${lang} ${width} ${tab}: five sections for an employee`);
        ok(['today', 'chats', 'orders', 'stock', 'customers'].includes(await page.locator('main').getAttribute('data-tab')), `${lang} ${width} ${tab}: manager tabs fall back`);
        eq(await noOverflow(page), true, `${lang} ${width} ${tab}: overflow`);
        eq(await axe(page), [], `${lang} ${width} ${tab}: axe`);
        eq(problems, [], `${lang} ${width} ${tab}: no page errors or refused calls`);
        if (width === 320) await page.screenshot({ path: `${OUT}/employee-${tab}-${lang}-${width}.png`, fullPage: true });
        await context.close();
      }
    }
  }
  {
    const { page, context, problems } = await open(employee.base, 1440, 'en', '/layla/dashboard?tab=today');
    await page.locator('.hb-today').waitFor();
    eq(await page.getByRole('button', { name: /Import stock/ }).count(), 0, 'no import on Today');
    eq(await page.getByRole('button', { name: /Pause|Check connection/ }).count(), 0, 'no whole-business switches');
    const today = await api(page, employee.base, 'today');
    eq(today.money, null, 'no cash figures');
    await page.goto(`${employee.base}/en/layla/dashboard?tab=stock`);
    await page.locator('.hb-stock table').waitFor();
    eq(await page.getByRole('button', { name: 'Import from a file' }).count(), 0, 'no import on Stock');
    const items = await api(page, employee.base, 'items');
    eq(items.items.every(i => i.variants.every(v => v.costMinor === undefined)), true, 'no costs in the product list');
    await page.goto(`${employee.base}/en/layla/dashboard?tab=orders`);
    await page.getByRole('button', { name: 'New order' }).first().click();
    await page.getByPlaceholder('Search products or SKU').fill('SH-B');
    await page.locator('.hb-picker-list button', { hasText: 'Black' }).first().click();
    eq(await page.getByRole('dialog').locator('table input.hb-money').first().getAttribute('readonly'), '', 'the selling price is fixed');
    eq(await page.getByRole('button', { name: 'Custom line' }).count(), 0, 'no free-typed lines');
    await page.getByRole('button', { name: 'Save order' }).click();
    const detail = page.getByRole('dialog').filter({ hasText: 'Record payment' });
    await detail.waitFor();
    await detail.getByLabel('Amount (OMR)').fill('8');
    await detail.getByRole('button', { name: 'Record payment' }).click();
    await detail.locator('.hb-payments li').first().waitFor(); count++;
    eq(await detail.getByLabel('Refund').count(), 0, 'no refund for an employee');
    eq(problems, [], 'employee sale: no errors');
    await page.screenshot({ path: `${OUT}/employee-sale-en.png` });
    await context.close();
  }
  console.log(`retail browser: ${count} assertions passed`);
} finally {
  await browser.close();
  manager.child.kill(); employee.child.kill();
}
