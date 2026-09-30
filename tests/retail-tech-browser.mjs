// Retail-tech (phone and electronics store, Ascend) in a real browser against the
// real-logic demo: IMEI sales, warranty, trade-ins and repairs all run through the
// production Convex state code. Runs a manager and an employee demo.
// Usage: npm run build && node tests/retail-tech-browser.mjs
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

const OUT = process.env.RETAIL_TECH_BROWSER_OUT || 'work/hardening/retail-tech/browser';
const MANAGER_PORT = 5341, EMPLOYEE_PORT = 5342;
await mkdir(OUT, { recursive: true });

function demo(port, ...flags) {
  const child = spawn(process.execPath, ['scripts/hasib-demo.mjs', String(port), '--pack=retail-tech', ...flags], { stdio: ['ignore', 'pipe', 'inherit'] });
  const ready = new Promise((resolve, reject) => {
    child.stdout.on('data', chunk => { if (String(chunk).includes('Hasib demo')) resolve(); });
    child.on('exit', code => reject(new Error(`demo on ${port} exited with ${code}`)));
  });
  return { child, ready, base: `http://127.0.0.1:${port}` };
}

const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const axe = async (page, scope = '.ld') => (await new AxeBuilder({ page }).include(scope).analyze()).violations.filter(v => ['critical', 'serious'].includes(v.impact)).map(v => `${v.id}: ${v.nodes.length}`);
// Business details and Instagram call surfaces the demo does not serve; they are checked live.
const DEMO_ONLY = /surface=(customer|instagram)/;

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
  // A refusal the journey provokes on purpose is asserted there; drop it from the problem list.
  const expected = () => problems.splice(0, problems.length, ...problems.filter(p => !p.startsWith('409')));
  await page.goto(`${base}${lang === 'ar' ? '' : '/en'}${path}`);
  await page.locator('.ld-nav a').first().waitFor();
  return { page, context, problems, expected };
}
const call = (page, base, surface, action, body = {}) => page.evaluate(async ([url, payload]) => (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })).json(),
  [`${base}/api/layla-meta?surface=${surface}`, { action, ...body }]);
const api = (page, base, action, body) => call(page, base, 'hasib', action, body);
const sections = page => page.locator('.ld-nav a').allInnerTexts().then(list => list.map(x => x.trim()));
const unitsOf = async (page, base, sku) => {
  const item = (await api(page, base, 'items', { search: sku })).items.find(i => i.variants.some(v => v.sku === sku));
  const variant = item.variants.find(v => v.sku === sku);
  return { variant, serials: (await api(page, base, 'serials', { variantId: variant.id })).items.map(u => u.serial) };
};

try {
  // 1. Every manager section, deep-linked, in both languages and three widths.
  const MANAGER_TABS = ['today', 'chats', 'orders', 'stock', 'service', 'money', 'customers', 'team', 'settings'];
  for (const lang of process.env.RETAIL_TECH_QUICK ? [] : ['en', 'ar']) {
    for (const width of [1440, 768, 320]) {
      for (const tab of MANAGER_TABS) {
        const { page, context, problems } = await open(manager.base, width, lang, `/layla/dashboard?tab=${tab}`);
        await page.locator('main h1, main h2').first().waitFor();
        eq((await sections(page)).length, 9, `${lang} ${width}: nine sections`);
        eq(await page.locator('main').getAttribute('data-tab'), tab, `${lang} ${width} ${tab}: deep link`);
        eq(await noOverflow(page), true, `${lang} ${width} ${tab}: overflow`);
        eq(await axe(page), [], `${lang} ${width} ${tab}: axe`);
        eq(problems, [], `${lang} ${width} ${tab}: no page errors or refused calls`);
        if (width !== 768) await page.screenshot({ path: `${OUT}/manager-${tab}-${lang}-${width}.png`, fullPage: true });
        await context.close();
      }
    }
  }

  // 2. An IMEI sale: one order on a double click, overpayment refused, cancel asks first and the unit returns.
  {
    const { page, context, problems, expected } = await open(manager.base, 1440, 'en', '/layla/dashboard?tab=orders');
    const before = await unitsOf(page, manager.base, 'S24-256-GY');
    await page.getByRole('button', { name: 'New order' }).first().click();
    const composer = page.getByRole('dialog');
    await composer.getByPlaceholder('Search products or SKU').fill('S24-256');
    await composer.locator('.hb-picker-list button').first().click();
    const chip = composer.locator('.hb-serial-chips button').first();
    const serial = (await chip.locator('bdi').textContent()).trim();
    ok(/days in stock/.test(await chip.textContent()), 'each unit shows its age in stock');
    await chip.click();
    await composer.getByRole('button', { name: 'Save order' }).dblclick();
    const detail = page.getByRole('dialog').filter({ hasText: 'Record payment' });
    await detail.waitFor();
    const after = await unitsOf(page, manager.base, 'S24-256-GY');
    eq(after.serials.length, before.serials.length - 1, 'a double-clicked save sells one unit');
    eq(after.variant.onHand, after.serials.length, 'on-hand equals the IMEIs in stock');
    await detail.getByLabel('Amount (OMR)').fill('9999');
    await detail.getByRole('button', { name: 'Record payment' }).click();
    await detail.getByText('more than the customer still owes').waitFor(); count++;
    expected();
    await detail.getByRole('button', { name: 'Move to: Cancelled' }).click();
    await detail.getByRole('alertdialog').getByRole('button', { name: 'Move to: Cancelled' }).click();
    await detail.locator('.hb-detail-meta').getByText('Cancelled').waitFor(); count++;
    ok((await unitsOf(page, manager.base, 'S24-256-GY')).serials.includes(serial), 'the cancelled unit is back in stock');
    eq(problems, [], 'IMEI sale: no unexpected errors');
    await context.close();
  }

  // 3. Check warranty: the quick action focuses the lookup, and a sold unit shows its cover.
  {
    const { page, context, problems } = await open(manager.base, 1440, 'ar', '/layla/dashboard?tab=service&action=warranty');
    const input = page.locator('.hb-lookup input');
    await page.waitForFunction(() => document.activeElement?.closest('.hb-lookup'));
    ok(await input.evaluate(el => el === document.activeElement), 'the warranty lookup is focused');
    const sold = (await api(page, manager.base, 'serials', { variantId: (await unitsOf(page, manager.base, 'IP15-128-BK')).variant.id, status: 'sold' })).items[0].serial;
    await input.fill(sold);
    await page.locator('.hb-lookup button[type="submit"]').click();
    await page.locator('.hb-lookup-result').waitFor(); count++;
    eq(await axe(page), [], 'warranty lookup axe');
    eq(problems, [], 'warranty: no errors');
    await context.close();
  }

  // 4. A trade-in chosen explicitly, then the unit is on record as a trade-in.
  {
    const { page, context, problems } = await open(manager.base, 1440, 'en', '/layla/dashboard?tab=service');
    await page.locator('.hb-action-card', { hasText: 'Trade-in' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('select').first().waitFor();
    eq(await dialog.locator('select').first().inputValue(), '', 'no product is picked for the owner');
    const used = await dialog.locator('select option', { hasText: /iPhone 13/ }).first().getAttribute('value');
    await dialog.locator('select').first().selectOption(used);
    await dialog.getByLabel('IMEI / serial').fill('353251509998888');
    await dialog.getByLabel('Price paid (OMR)').fill('95');
    await dialog.getByRole('button', { name: 'Save', exact: true }).dblclick();
    await page.getByText(/Trade-in #\d+ saved/).waitFor(); count++;
    eq((await api(page, manager.base, 'serial_lookup', { serial: '353251509998888' })).source, 'trade_in', 'recorded as a trade-in');
    eq(problems, [], 'trade-in: no errors');
    await context.close();
  }

  // 5. A repair: quote with a part, Ready waits for approval, collect with money owed asks first, the balance is taken after.
  {
    const { page, context, problems } = await open(manager.base, 1440, 'en', '/layla/dashboard?tab=service');
    await page.getByRole('button', { name: 'New repair' }).first().click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel('Device', { exact: true }).fill('Galaxy S22');
    await dialog.getByLabel('Fault', { exact: true }).fill('Back glass cracked');
    await dialog.getByLabel('Quote (OMR)').fill('10');
    await dialog.getByRole('button', { name: 'Save', exact: true }).dblclick();
    dialog = page.getByRole('dialog');
    await dialog.locator('.hb-detail').waitFor();
    eq((await api(page, manager.base, 'repairs', {})).items.filter(r => r.device === 'Galaxy S22').length, 1, 'a double-clicked save books one repair');
    await dialog.getByPlaceholder('Search parts in stock').fill('protector');
    await dialog.locator('.hb-picker-list button').first().click();
    await dialog.getByRole('button', { name: 'Save quote and parts' }).click();
    await page.waitForFunction(() => /15\.000/.test(document.querySelector('.ld-dialog .hb-totals')?.textContent || ''));
    await dialog.getByRole('button', { name: 'Move to: Diagnosing' }).click();
    await dialog.getByRole('button', { name: 'Move to: Ready' }).waitFor();
    eq(await dialog.getByRole('button', { name: 'Move to: Ready' }).isDisabled(), true, 'Ready waits for the customer’s approval');
    await dialog.getByLabel('Name of the customer who approved').fill('Khalid in store');
    await dialog.getByRole('button', { name: 'Record customer approval' }).click();
    await dialog.getByText('Customer approved this quote').waitFor();
    await dialog.getByRole('button', { name: 'Move to: Ready' }).click();
    await dialog.getByRole('button', { name: 'Move to: Collected' }).click();
    const confirm = dialog.getByRole('alertdialog');
    await confirm.getByText('still owes').waitFor(); count++;
    await confirm.getByRole('button', { name: 'Move to: Collected' }).click();
    await dialog.locator('.hb-detail-meta').getByText('Collected').waitFor(); count++;
    await dialog.getByLabel('Amount (OMR)').fill('15');
    await dialog.getByRole('button', { name: 'Record payment' }).click();
    await page.waitForFunction(() => /Balance\s*0\.000/.test(document.querySelector('.ld-dialog .hb-totals')?.textContent || ''));
    count++;
    eq(await axe(page, '.ld-dialog'), [], 'repair axe');
    eq(problems, [], 'repair: no errors');
    await page.screenshot({ path: `${OUT}/repair-collected-en.png` });
    await context.close();
  }

  // 6. A deep link opens a repair once; closing clears it. Cancelling a repair asks first.
  {
    const { page, context, problems } = await open(manager.base, 1440, 'en', '/layla/dashboard?tab=service');
    const ticket = (await api(page, manager.base, 'repairs', { status: 'waiting_parts' })).items[0];
    await page.goto(`${manager.base}/en/layla/dashboard?tab=service&repair=${ticket.id}`);
    const dialog = page.getByRole('dialog');
    await dialog.locator('.hb-detail').waitFor();
    await dialog.getByRole('button', { name: 'Move to: Cancelled' }).click();
    await dialog.getByRole('alertdialog').getByText('Its parts go back into stock').waitFor(); count++;
    await dialog.getByRole('alertdialog').getByRole('button', { name: 'Keep it' }).click();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await dialog.waitFor({ state: 'detached' });
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('repair'), null, { timeout: 5000 }).catch(() => {});
    eq(new URL(page.url()).searchParams.get('repair'), null, 'closing clears the deep link');
    eq(problems, [], 'deep link: no errors');
    await context.close();
  }

  // 7. Team: invite, then remove access after confirming.
  for (const lang of ['en', 'ar']) {
    const { page, context, problems } = await open(manager.base, lang === 'en' ? 1440 : 320, lang, '/layla/dashboard?tab=team');
    const email = `tech-helper-${lang}@muscatmobile.example`;
    await page.locator('.hb-page-header .ld-primary').click();
    await page.getByRole('dialog').locator('input[type="email"]').fill(email);
    await page.getByRole('dialog').locator('button[type="submit"]').click();
    const row = page.locator('.hb-team li', { hasText: email });
    await row.waitFor(); count++;
    await row.locator('.ld-danger').click();
    await page.getByRole('dialog').locator('.ld-danger').click();
    await row.locator('.ld-danger').waitFor({ state: 'detached' }); count++;
    eq(problems, [], `${lang}: team, no errors`);
    await context.close();
  }

  // 8. The employee: six sections everywhere; manager tabs fall back.
  for (const lang of process.env.RETAIL_TECH_QUICK ? [] : ['en', 'ar']) {
    for (const width of [1440, 320]) {
      for (const tab of ['today', 'chats', 'orders', 'stock', 'service', 'customers', 'money', 'settings', 'team']) {
        const { page, context, problems } = await open(employee.base, width, lang, `/layla/dashboard?tab=${tab}`);
        await page.locator('main h1, main h2').first().waitFor();
        eq((await sections(page)).length, 6, `${lang} ${width} ${tab}: six sections for an employee`);
        ok(['today', 'chats', 'orders', 'stock', 'service', 'customers'].includes(await page.locator('main').getAttribute('data-tab')), `${lang} ${width} ${tab}: manager tabs fall back`);
        eq(await noOverflow(page), true, `${lang} ${width} ${tab}: overflow`);
        eq(await axe(page), [], `${lang} ${width} ${tab}: axe`);
        eq(problems, [], `${lang} ${width} ${tab}: no page errors or refused calls`);
        if (width === 320) await page.screenshot({ path: `${OUT}/employee-${tab}-${lang}-${width}.png`, fullPage: true });
        await context.close();
      }
    }
  }

  // 9. What the employee can and cannot do in a phone shop.
  {
    const { page, context, problems } = await open(employee.base, 1440, 'en', '/layla/dashboard?tab=today');
    await page.locator('.hb-today').waitFor();
    eq(await page.locator('.hb-action-card', { hasText: 'Record trade-in' }).count(), 0, 'no trade-in on Today');
    eq(await page.getByText('Profit per device').count(), 0, 'no profit card');
    await page.goto(`${employee.base}/en/layla/dashboard?tab=service`);
    await page.locator('.hb-service').waitFor();
    eq(await page.locator('.hb-action-card', { hasText: 'Trade-in' }).count(), 0, 'no trade-in in Service');
    const serials = await api(page, employee.base, 'serials', { variantId: (await unitsOf(page, employee.base, 'IP15-128-BK')).variant.id });
    eq(serials.items.every(u => u.costMinor === undefined), true, 'no unit costs');
    // Employees quote repairs.
    await page.getByRole('button', { name: 'New repair' }).first().click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel('Device', { exact: true }).fill('iPhone 11');
    await dialog.getByLabel('Fault', { exact: true }).fill('Battery');
    await dialog.getByLabel('Quote (OMR)').fill('18');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.locator('.hb-detail').waitFor();
    await dialog.getByLabel('Labour (OMR)').fill('20');
    await dialog.getByRole('button', { name: 'Save quote and parts' }).click();
    await page.waitForFunction(() => /20\.000/.test(document.querySelector('.ld-dialog .hb-totals')?.textContent || ''));
    count++;
    await dialog.getByLabel('Amount (OMR)').fill('5');
    await dialog.getByRole('button', { name: 'Record payment' }).click();
    await dialog.locator('.hb-payments li').first().waitFor(); count++;
    eq(await dialog.getByLabel('Refund').count(), 0, 'no refund for an employee');
    await dialog.getByRole('button', { name: 'Close' }).click();
    await page.goto(`${employee.base}/en/layla/dashboard?tab=stock`);
    await page.getByRole('button', { name: /iPhone 15/ }).first().click();
    const editor = page.getByRole('dialog');
    eq(await editor.locator('select').filter({ has: page.locator('option[value="store"]') }).isDisabled(), true, 'warranty provider is locked');
    eq(problems, [], 'employee phone shop: no errors');
    await page.screenshot({ path: `${OUT}/employee-editor-en.png` });
    await context.close();
  }
  console.log(`retail-tech browser: ${count} assertions passed`);
} finally {
  await browser.close();
  manager.child.kill(); employee.child.kill();
}
