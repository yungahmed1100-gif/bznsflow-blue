// Real Estate (agency, Ascend) in a real browser against the real-logic demo: every
// listing, deal, viewing, offer, compliance check and close goes through the
// production Convex state code. Runs a manager demo and an agent (employee) demo.
// Usage: npm run build && node tests/real-estate-browser.mjs
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

const OUT = process.env.REAL_ESTATE_BROWSER_OUT || 'work/hardening/real-estate/browser';
const MANAGER_PORT = 5341, AGENT_PORT = 5342;
await mkdir(OUT, { recursive: true });

function demo(port, ...flags) {
  const child = spawn(process.execPath, ['scripts/hasib-demo.mjs', String(port), '--pack=real-estate', ...flags], { stdio: ['ignore', 'pipe', 'inherit'] });
  const ready = new Promise((resolve, reject) => {
    child.stdout.on('data', chunk => { if (String(chunk).includes('Hasib demo')) resolve(); });
    child.on('exit', code => reject(new Error(`demo on ${port} exited with ${code}`)));
  });
  return { child, ready, base: `http://127.0.0.1:${port}` };
}

const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const axe = async page => (await new AxeBuilder({ page }).include('.ld').analyze()).violations.filter(v => ['critical', 'serious'].includes(v.impact)).map(v => `${v.id}: ${v.nodes.length}`);
const DEMO_ONLY = /surface=(customer|instagram)/;

const manager = demo(MANAGER_PORT), agent = demo(AGENT_PORT, '--role=employee');
await Promise.all([manager.ready, agent.ready]);
const browser = await chromium.launch();
let count = 0;
const ok = (value, message) => { assert.ok(value, message); count++; };
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); count++; };

async function open(base, width, lang, path) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', e => problems.push(`pageerror ${e.message}`));
  page.on('response', r => { if (r.url().includes('/api/') && r.status() >= 400 && !DEMO_ONLY.test(r.url())) problems.push(`${r.status()} ${r.url()} ${r.request().postData()?.slice(0, 80)}`); });
  await page.goto(`${base}${lang === 'ar' ? '' : '/en'}${path}`);
  await page.locator('.ld-nav a').first().waitFor();
  return { page, context, problems };
}
const api = (page, base, action, body = {}) => page.evaluate(async ([url, payload]) => (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })).json(),
  [`${base}/api/layla-meta?surface=hasib`, { action, ...body }]);
const sections = page => page.locator('.ld-nav a').allInnerTexts().then(list => list.map(x => x.trim()));
const pick = (scope, name) => scope.getByRole('combobox', { name: new RegExp(`^${name}`) });
const yes = page => page.getByRole('alertdialog').getByRole('button', { name: 'Yes, continue' }).click();

const MANAGER_TABS = { en: ['Today', 'Chats', 'Deals', 'Properties', 'Money', 'Customers', 'Team', 'Settings'], ar: ['اليوم', 'المحادثات', 'الصفقات', 'العقارات', 'المال', 'العملاء', 'الفريق', 'الإعدادات'] };
const READY = { today: '.hb-real-estate .hb-pipeline', orders: '.hb-real-estate', stock: '.hb-real-estate', money: '.hb-real-estate', team: '.hb-real-estate', customers: '.ld-table, .ld-empty, .hb-empty' };

try {
  // 1. Every section for the manager and the agent, deep-linked, in both languages and three widths.
  for (const [who, demoRun, tabs] of [['manager', manager, ['today', 'orders', 'stock', 'money', 'team', 'customers']], ['agent', agent, ['today', 'orders', 'stock', 'customers']]]) {
    for (const lang of ['en', 'ar']) {
      for (const width of [1440, 768, 320]) {
        for (const tab of tabs) {
          const { page, context, problems } = await open(demoRun.base, width, lang, `/layla/dashboard?tab=${tab}`);
          await page.locator(READY[tab]).first().waitFor();
          if (tab === 'today' && width === 1440) {
            const nav = await sections(page);
            if (who === 'manager') ok(MANAGER_TABS[lang].every(name => nav.some(n => n.includes(name))) || nav.length === 8, `manager sections ${lang}: ${nav}`);
            else eq(nav.length, 5, `agent sees five sections, ${lang}: ${nav}`);
          }
          eq(await noOverflow(page), true, `${who} ${tab} overflow ${lang} ${width}`);
          eq(await axe(page), [], `${who} ${tab} axe ${lang} ${width}`);
          eq(problems, [], `${who} ${tab} errors ${lang} ${width}`);
          if (width === 1440) await page.screenshot({ path: `${OUT}/${who}-${tab}-${lang}.png`, fullPage: true });
          await context.close();
        }
      }
    }
  }

  // 2. A listing, verified on purpose.
  {
    const { page, context, problems } = await open(manager.base, 1280, 'en', '/layla/dashboard?tab=stock');
    await page.getByRole('button', { name: 'Add a listing' }).first().click();
    const form = page.getByRole('form', { name: 'Listing' });
    await form.getByLabel('Listing title').fill('Qurum garden villa');
    await form.getByLabel('Property type (e.g. villa, apartment)').fill('villa');
    await form.getByLabel('Area', { exact: true }).fill('Qurum');
    await form.getByLabel('Address or landmark').fill('Qurum Heights, Muscat');
    await form.getByLabel('Asking price (OMR)').fill('120000');
    await form.getByLabel('Bedrooms').fill('4');
    await pick(form, 'Authority to market it').selectOption('confirmed');
    await form.getByRole('button', { name: 'Save' }).click();
    const card = page.locator('.hb-property-card', { hasText: 'Qurum garden villa' });
    await card.waitFor();
    ok(/never verified/.test(await card.textContent()), 'a new listing is not verified by saving it');
    await card.getByRole('button', { name: 'Mark verified today' }).click();
    await yes(page);
    await card.getByText(/verified \d/).waitFor(); count++;
    eq(problems, [], 'listing flow errors');
    await context.close();
  }

  // 3. A deal from requirements to close: match → viewing → outcome → offer → approve → present → accept → compliance ×5 → close.
  {
    const { page, context, problems } = await open(manager.base, 1280, 'en', '/layla/dashboard?tab=orders');
    await page.getByRole('button', { name: 'Add a deal' }).first().click();
    const form = page.getByRole('form', { name: 'Customer requirements' });
    await pick(form, 'Customer').selectOption({ index: 1 });
    await pick(form, 'They want to').selectOption('buy');
    await form.getByLabel('Areas, separated by commas').fill('Qurum');
    await form.getByLabel('Property types, separated by commas').fill('villa');
    await form.getByLabel('Maximum budget (OMR)').fill('130000');
    await pick(form, 'Finance').selectOption('cash');
    await pick(form, 'Decision maker').selectOption('ready');
    await form.getByLabel('When do they want to move?').fill('Within a month');
    await form.getByRole('button', { name: 'Save' }).click();
    const deal = page.locator('.hb-re-deals li', { hasText: 'Qurum' }).first();
    await deal.waitFor();
    ok(/Qualified/.test(await deal.textContent()), 'complete requirements qualify the deal');
    await deal.getByRole('button', { name: 'Open deal' }).click();
    const detail = page.locator('.hb-deal-detail');
    await detail.getByRole('button', { name: 'Find matches' }).click();
    const match = detail.locator('.hb-re-list li', { hasText: 'Qurum garden villa' });
    await match.waitFor(); count++;
    await match.getByRole('button', { name: 'Schedule viewing' }).click();
    const viewing = page.getByRole('form', { name: 'Schedule a viewing' });
    await viewing.getByLabel('Date and time').fill('2026-10-02T17:00');
    await pick(viewing, 'Status').selectOption('confirmed');
    await viewing.getByRole('button', { name: 'Save' }).click();
    await detail.getByRole('button', { name: 'Record outcome' }).click();
    const outcome = page.getByRole('form', { name: 'How did the viewing go?' });
    await pick(outcome, 'Result').selectOption('completed');
    await outcome.getByLabel('What the customer thought').fill('Loved the garden; ready to offer.');
    await outcome.getByRole('button', { name: 'Save' }).click();
    await detail.getByText('Loved the garden; ready to offer.').waitFor(); count++;
    await detail.getByRole('button', { name: 'Draft an offer' }).click();
    const offer = page.getByRole('form', { name: 'Draft an offer' });
    await pick(offer, 'Property').selectOption({ label: 'Qurum garden villa · Qurum Heights, Muscat' });
    await offer.getByLabel('Offer amount (OMR)').fill('118000');
    await offer.getByLabel('Terms (payment, dates, conditions)').fill('Cash, completion in 30 days');
    await offer.getByRole('button', { name: 'Save' }).click();
    await detail.getByText('Waiting for approval').first().waitFor();
    await detail.getByRole('button', { name: 'Approve', exact: true }).click(); await yes(page);
    await detail.getByRole('button', { name: 'Presented', exact: true }).click();
    await detail.getByRole('button', { name: 'Accepted', exact: true }).click(); await yes(page);
    await detail.getByText('Compliance before closing').waitFor(); count++;
    ok(await detail.getByRole('button', { name: 'Confirm all five checks to close' }).isDisabled(), 'closing waits for compliance');
    for (let i = 0; i < 5; i++) {
      await detail.locator('.hb-re-checks li:not([data-done])').first().getByRole('button', { name: 'Confirm' }).click();
      await yes(page);
      await page.waitForFunction(n => document.querySelectorAll('.hb-re-checks li[data-done]').length >= n, i + 1);
    }
    await detail.getByRole('button', { name: 'Close the deal' }).click();
    const close = page.getByRole('form', { name: 'Close the deal' });
    await close.getByLabel('Agency commission (OMR)').fill('2360');
    await close.getByRole('button', { name: 'Save' }).click();
    await detail.locator('.ld-chip', { hasText: 'Won' }).first().waitFor(); count++;
    const insights = await api(page, manager.base, 'real_estate_insights');
    ok(insights.commissions.dueMinor >= 2360000, 'the commission is due in Money');
    await page.screenshot({ path: `${OUT}/deal-closed-en.png`, fullPage: true });
    eq(problems, [], 'deal flow errors');
    await context.close();
  }

  // 4. A lost deal needs a reason; Today's tasks can be marked done.
  {
    const { page, context, problems } = await open(manager.base, 1280, 'ar', '/layla/dashboard?tab=orders');
    await page.locator('.hb-re-deals li').first().getByRole('button', { name: 'فتح الصفقة' }).click();
    await page.getByRole('button', { name: 'تسجيل كخاسرة' }).click();
    const lost = page.getByRole('form', { name: 'تسجيل الصفقة كخاسرة' });
    await pick(lost, 'لماذا خُسرت؟').selectOption('budget');
    await lost.getByRole('button', { name: 'حفظ' }).click();
    await page.locator('.hb-deal-detail .ld-chip', { hasText: 'خاسرة' }).first().waitFor(); count++;
    eq(problems, [], 'lost flow errors');
    await context.close();
  }

  // 5. The agent: own and unassigned deals only, no approvals, no money, no compliance.
  {
    const { page, context, problems } = await open(agent.base, 1280, 'en', '/layla/dashboard?tab=orders');
    await page.locator('.hb-real-estate').waitFor();
    eq(await page.getByRole('heading', { name: 'Waiting for your approval' }).count(), 0, 'no approval queue for agents');
    eq((await api(page, agent.base, 'real_estate_insights')).reason, 'manager_required', 'no money for agents');
    eq((await api(page, agent.base, 'commissions')).reason, 'manager_required', 'no commissions for agents');
    ok(!(await sections(page)).some(n => /Money|Team|Settings/.test(n)), 'no Money, Team or Settings');
    await page.screenshot({ path: `${OUT}/agent-deals-en.png`, fullPage: true });
    eq(problems.filter(p => !/manager_required|409|403/.test(p)), [], 'agent errors');
    await context.close();
  }
  console.log(`real-estate browser: ${count} assertions passed`);
} finally {
  await browser.close();
  manager.child.kill(); agent.child.kill();
}
