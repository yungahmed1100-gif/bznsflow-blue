// Catalyst owner journeys in a real browser, against the real-logic demo
// (scripts/hasib-demo.mjs --plan=catalyst): every chat, reply and customer
// change goes through the production Layla/dashboard Convex state code.
// Usage: npm run build && node scripts/hasib-demo.mjs 5320 --plan=catalyst & node tests/catalyst-browser.mjs http://127.0.0.1:5320
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const BASE = process.argv[2] || 'http://127.0.0.1:5320';
const OUT = process.env.CATALYST_BROWSER_OUT || 'work/hardening/catalyst/browser';
await mkdir(OUT, { recursive: true });
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const axe = async page => (await new AxeBuilder({ page }).include('.ld').analyze()).violations.filter(v => ['critical', 'serious'].includes(v.impact)).map(v => `${v.id}: ${v.nodes.length}`);
// Settings → Business details and Instagram call surfaces the demo does not serve; they are checked live.
const DEMO_ONLY = /surface=(customer|instagram)/;

const browser = await chromium.launch();
let count = 0;
const open = async (width, lang, path) => {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', e => problems.push(`pageerror ${e.message}`));
  page.on('response', r => { if (r.url().includes('/api/') && r.status() >= 400 && !DEMO_ONLY.test(r.url())) problems.push(`${r.status()} ${r.url()}`); });
  await page.goto(`${BASE}${lang === 'ar' ? '' : '/en'}${path}`);
  await page.locator('.ld-nav a').first().waitFor();
  return { page, context, problems };
};
const current = page => page.locator('.ld-nav a[aria-current="page"]').innerText();

try {
  // 1. Only Chats, Customers and Settings exist; deep links highlight the right tab; gated tabs fall back to Chats.
  for (const lang of ['en', 'ar']) {
    for (const width of [1440, 768, 320]) {
      for (const [tab, expected] of [['chats', 0], ['customers', 1], ['settings', 2], ['money', 0], ['orders', 0]]) {
        const { page, context, problems } = await open(width, lang, `/layla/dashboard?tab=${tab}`);
        await page.locator('main h1, main h2').first().waitFor();
        const labels = await page.locator('.ld-nav a').allInnerTexts();
        assert.equal(labels.length, 3, `${lang} ${width}: three sections`); count++;
        assert.equal((await current(page)).trim(), labels[expected].trim(), `${lang} ${width} ${tab}: highlighted tab`); count++;
        assert.equal(await page.locator('main').getAttribute('data-tab'), ['chats', 'customers', 'settings'][expected]); count++;
        assert.equal(await noOverflow(page), true, `${lang} ${width} ${tab}: overflow`); count++;
        assert.deepEqual(await axe(page), [], `${lang} ${width} ${tab}: axe`); count++;
        assert.deepEqual(problems, [], `${lang} ${width} ${tab}: no page errors or refused calls`); count++;
        if (width === 320) await page.screenshot({ path: `${OUT}/${tab}-${lang}-${width}.png`, fullPage: true });
        await context.close();
      }
    }
  }

  // 2. Gated controls are not shown to a Catalyst owner.
  {
    const { page, context } = await open(1440, 'en', '/layla/dashboard?tab=chats');
    await page.getByText('Salma Al Harthy').first().waitFor();
    assert.equal(await page.getByRole('button', { name: /export/i }).count(), 0, 'no export on Chats'); count++;
    await page.getByText('Salma Al Harthy').first().click();
    await page.locator('#ld-reply').waitFor();
    assert.equal(await page.getByText(/^Export$/).count(), 0, 'no export in a chat'); count++;
    await page.goto(`${BASE}/en/layla/dashboard?tab=customers`);
    await page.getByRole('heading', { name: 'Contacts' }).waitFor();
    assert.equal(await page.getByRole('button', { name: /import|export|download/i }).count(), 0, 'no import or export on Customers'); count++;
    await context.close();
  }

  // 3. Take a chat over, reply once (a double click queues one reply), hand it back.
  for (const lang of ['en', 'ar']) {
    const { page, context, problems } = await open(lang === 'en' ? 1440 : 320, lang, '/layla/dashboard?tab=chats');
    await page.getByText('Salma Al Harthy').first().click();
    const leave = page.getByRole('switch');
    await leave.waitFor();
    await leave.check();
    await page.waitForFunction(() => document.querySelector('[role="switch"]')?.checked === true);
    assert.equal(await leave.isChecked(), true, `${lang}: chat taken over`); count++;
    const text = `Owner reply ${lang}`;
    await page.locator('#ld-reply').fill(text);
    const send = page.locator('.ld-composer button[type="submit"]');
    await send.dblclick();
    await page.locator('.ld-messages').getByText(text).waitFor();
    assert.equal(await page.locator('.ld-messages').getByText(text).count(), 1, `${lang}: one reply in the thread`); count++;
    assert.equal(await page.locator('#ld-reply').inputValue(), '', `${lang}: composer cleared`); count++;
    const box = await send.boundingBox(), vh = page.viewportSize().height;
    assert.ok(box && box.y + box.height <= vh, `${lang}: send button is on screen and not covered`); count++;
    await leave.uncheck();
    await page.waitForFunction(() => document.querySelector('[role="switch"]')?.checked === false);
    assert.deepEqual(problems, [], `${lang}: no errors`); count++;
    await page.screenshot({ path: `${OUT}/thread-${lang}.png`, fullPage: false });
    await context.close();
  }

  // 4. Edit a customer's name, then delete the customer after confirming.
  {
    const { page, context, problems } = await open(1440, 'en', '/layla/dashboard?tab=customers');
    await page.getByText('عائشة الرواحي').first().click();
    await page.getByLabel('Name (your edit)').fill('Aisha (Ruwi)');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText('Aisha (Ruwi)').first().waitFor(); count++;
    await page.getByRole('button', { name: 'Delete contact' }).click();
    const confirm = page.getByRole('alertdialog');
    await confirm.waitFor(); count++;
    await confirm.getByRole('button', { name: /delete/i }).click();
    await page.getByRole('button', { name: /Aisha \(Ruwi\)/ }).waitFor({ state: 'detached' }); count++;
    assert.deepEqual(problems, [], 'customer edit/delete: no errors'); count++;
    await context.close();
  }
  console.log(`catalyst browser: ${count} assertions passed`);
} finally {
  await browser.close();
}
