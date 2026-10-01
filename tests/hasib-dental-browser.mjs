// End-to-end for the dental pack against the real-logic demo:
//   npm run build && node scripts/hasib-demo.mjs 5312 --pack=dental & node tests/hasib-dental-browser.mjs http://localhost:5312
// Add a receptionist pass with a second demo signed in as an invited employee:
//   node scripts/hasib-demo.mjs 5313 --pack=dental --role=employee & node tests/hasib-dental-browser.mjs http://localhost:5312 http://localhost:5313
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createStrings } from '../src/lib/dashboard/strings.js';
import { createHasibStrings } from '../src/lib/hasib/strings.js';

const BASE = process.argv[2] || 'http://localhost:5312';
const STAFF_BASE = process.argv[3] || null;
const OUT = process.env.HASIB_DENTAL_OUT || 'work/hasib-dental-browser';
await mkdir(OUT, { recursive: true });
const api = (action, body = {}) => fetch(`${BASE}/api/layla-meta?surface=hasib`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...body }) }).then(r => r.json());
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const axe = async (page, scope = '.ld') => (await new AxeBuilder({ page }).include(scope).analyze()).violations.filter(v => ['critical', 'serious'].includes(v.impact)).map(v => `${v.id}: ${v.nodes.map(n => n.target).join(', ')}`);
const words = lang => ({ s: createStrings(lang, 'dental'), h: createHasibStrings(lang, 'dental') });
// The seven approved tabs plus Team, in the clinic's own words.
const team = lang => (lang === 'ar' ? 'الفريق' : 'Team');
const tabs = lang => { const { s, h } = words(lang); return [s.t('today'), s.t('chats'), h.t('orders'), h.t('stock'), s.t('money'), s.t('customers'), team(lang), s.t('settings')]; };
// The front desk: no Money, Team or Settings.
const staffTabs = lang => { const { s, h } = words(lang); return [s.t('today'), s.t('chats'), h.t('orders'), h.t('stock'), s.t('customers')]; };

// Each screen, and what shows it has rendered.
const SCREENS = [
  ['today', '/layla/dashboard?tab=today', '.hb-today .hb-needs'],
  ['chats', '/layla/dashboard?tab=chats', '.ld-chats'],
  ['visits', '/layla/dashboard?tab=orders', '.hb-order-table'],
  ['treatments', '/layla/dashboard?tab=stock&view=services', '.layla-workspace, .ld-state'], // the catalog editor's API is not in the local demo
  ['supplies', '/layla/dashboard?tab=stock&view=products', '.hb-stock-table'],
  ['money', '/layla/dashboard?tab=money', '.hb-money-summary dt'],
  ['patients', '/layla/dashboard?tab=customers', '.ld-table'],
  ['accounts', '/layla/dashboard?tab=settings&view=accounts', '.hb-accounts'],
];

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
  // Every screen, both languages, desktop to the smallest phone.
  for (const lang of ['en', 'ar']) {
    for (const width of [1440, 1024, 768, 375, 320]) {
      for (const [name, path, ready] of SCREENS) {
        const { page, context, errors } = await open(width, lang, path);
        await page.locator(ready).first().waitFor();
        if (name === 'today') {
          const nav = (await page.getByRole('navigation', { name: words(lang).s.t('nav') }).locator('a span:first-of-type').allTextContents()).map(x => x.trim());
          assert.deepEqual(nav, tabs(lang), `only the approved tabs, ${lang}`); count++;
        }
        assert.equal(await noOverflow(page), true, `${name} overflow ${lang} ${width}`); count++;
        assert.deepEqual(await axe(page), [], `${name} axe ${lang} ${width}`); count++;
        assert.deepEqual(errors, [], `${name} errors ${lang} ${width}`); count++;
        if (width === 1440 || width === 375) await page.screenshot({ path: `${OUT}/${name}-${lang}-${width}.png`, fullPage: true });
        await context.close();
      }
    }
  }

  // Supplies are only supplies; treatments are not stock.
  {
    const { page, context } = await open(1280, 'en', '/layla/dashboard?tab=stock&view=products');
    await page.locator('.hb-stock-table tbody th').first().waitFor();
    const rows = await page.locator('.hb-stock-table tbody th').allTextContents();
    assert.ok(rows.some(r => /gloves/i.test(r)) && !rows.some(r => /check-up|whitening|root canal/i.test(r)), 'supplies list holds no treatments'); count++;
    await context.close();
  }

  // Today → a patient's request → the chat shows only what Layla captured → Record visit → Money.
  {
    const before = await api('insights', { period: 'today' });
    const todayBefore = await api('today');
    const { page, context } = await open(1280, 'en', '/layla/dashboard?tab=today');
    const request = page.locator('.hb-need-list li', { hasText: 'Rawan Al Hosni' });
    assert.match(await request.textContent(), /Check-up · tomorrow at 5pm · Branch visit/); count++;
    await request.getByRole('button', { name: 'Open chat' }).click();
    const captured = page.locator('.ld-captured');
    await captured.waitFor();
    assert.match(await captured.textContent(), /Service\s*Check-up/); count++;
    assert.match(await captured.textContent(), /Consent\s*No marketing consent/); count++;
    await page.screenshot({ path: `${OUT}/chat-captured-en.png` });
    await captured.getByRole('button', { name: 'Record visit' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('.hb-lines tbody tr').first().waitFor();
    assert.match(await dialog.locator('.hb-lines').textContent(), /Check-up/, 'the captured treatment is on the visit'); count++;
    assert.match(await dialog.getByLabel('Visit date').inputValue(), /^\d{4}-\d{2}-\d{2}$/, 'the visit date comes from "tomorrow"'); count++;
    assert.equal(await dialog.getByLabel('Notes').count(), 0, 'a visit has no notes'); count++;
    assert.equal(await dialog.getByRole('radiogroup', { name: 'Fulfilment' }).count(), 0, 'no delivery choice'); count++;
    assert.deepEqual(await axe(page, '.ld-dialog'), [], 'visit composer axe'); count++;
    await page.screenshot({ path: `${OUT}/record-visit-en.png` });
    await dialog.getByRole('button', { name: 'Save visit' }).click();
    await page.locator('.ld-captured', { hasText: /Visit #\d+/ }).waitFor(); count++;
    const after = await api('insights', { period: 'today' });
    assert.equal(after.sales.revenueMinor - before.sales.revenueMinor, 10000, 'revenue moves by exactly the visit'); count++;
    const visit = (await api('orders', {})).items[0];
    await api('payment_record', { requestId: crypto.randomUUID(), orderId: visit.id, amountMinor: 10000, method: 'cash' });
    const todayAfter = await api('today');
    assert.equal(todayAfter.money.todayMinor - todayBefore.money.todayMinor, 10000, 'cash received moves by the payment'); count++;
    assert.equal(todayAfter.needsYou.requestsCount, todayBefore.needsYou.requestsCount - 1, 'the request is answered by the visit'); count++;
    await context.close();
  }

  // Old chat text is cleared after 24 hours; the captured details stay.
  {
    const { page, context } = await open(1280, 'ar', '/layla/dashboard?tab=chats');
    await page.locator('.ld-list li button, .ld-list li a').filter({ hasText: 'سارة الحبسية' }).first().click();
    await page.locator('.ld-captured').waitFor();
    assert.ok(await page.getByText('حُذف النص بعد 24 ساعة').first().isVisible()); count++;
    assert.match(await page.locator('.ld-captured').textContent(), /تنظيف وتلميع|الخدمة/); count++;
    await page.screenshot({ path: `${OUT}/chat-cleared-ar.png` });
    await context.close();
  }

  // Settings → Accounts and VAT saves, and the clinic stays a clinic.
  {
    const { page, context } = await open(1280, 'en', '/layla/dashboard?tab=settings&view=accounts');
    await page.getByLabel('VAT registered').check();
    await page.getByLabel('VAT rate (%)').fill('5');
    await page.getByRole('button', { name: 'Save settings' }).click();
    await page.getByText('Saved.').waitFor(); count++;
    const overview = await fetch(`${BASE}/api/layla-meta?surface=hasib`).then(r => r.json());
    assert.deepEqual([overview.settings.vatRegistered, overview.settings.vatRateBps, overview.pack.id], [true, 500, 'dental']); count++;
    await api('settings_update', { vat: { registered: false, rateBps: 500, pricesIncludeVat: false } });
    await context.close();
  }
  // The receptionist: visits at the clinic's prices, supplies without costs, no cash, setup or refunds.
  if (STAFF_BASE) {
    const staffOpen = async (width, lang, path) => {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(`${STAFF_BASE}${lang === 'ar' ? '' : '/en'}${path}`);
      return { page, context, errors };
    };
    for (const lang of ['en', 'ar']) {
      for (const width of [1440, 768, 320]) {
        const { page, context, errors } = await staffOpen(width, lang, '/layla/dashboard?tab=today');
        await page.locator('.hb-today .hb-needs').waitFor();
        const nav = (await page.getByRole('navigation', { name: words(lang).s.t('nav') }).locator('a span:first-of-type').allTextContents()).map(x => x.trim());
        assert.deepEqual(nav, staffTabs(lang), `receptionist tabs ${lang} ${width}`); count++;
        assert.equal(await page.locator('#hb-money-title').count(), 0, 'no cash figures on Today'); count++;
        assert.equal(await page.locator('.hb-setup, .hb-checklist').count(), 0, 'no setup checklist'); count++;
        assert.equal(await noOverflow(page), true, `receptionist overflow ${lang} ${width}`); count++;
        assert.deepEqual(await axe(page), [], `receptionist axe ${lang} ${width}`); count++;
        for (const path of ['/layla/dashboard?tab=orders', '/layla/dashboard?tab=stock&view=products', '/layla/dashboard?tab=customers']) {
          await page.goto(`${STAFF_BASE}${lang === 'ar' ? '' : '/en'}${path}`);
          await page.locator('.hb-order-table, .hb-stock-table, .ld-table').first().waitFor();
          assert.equal(await noOverflow(page), true, `receptionist ${path} overflow ${lang} ${width}`); count++;
          assert.deepEqual(await axe(page), [], `receptionist ${path} axe ${lang} ${width}`); count++;
        }
        assert.deepEqual(errors, [], `receptionist errors ${lang} ${width}`); count++;
        if (width === 1440) await page.screenshot({ path: `${OUT}/receptionist-${lang}.png`, fullPage: true });
        await context.close();
      }
    }
    {
      const staffApi = (action, body = {}) => fetch(`${STAFF_BASE}/api/layla-meta?surface=hasib`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...body }) }).then(r => r.json());
      const supplies = await staffApi('items', { kind: 'product' });
      assert.ok(supplies.items.length && supplies.items.flatMap(i => i.variants).every(v => v.costMinor === undefined), 'supply costs stay with the manager'); count++;
      const visit = (await staffApi('orders', {})).items.find(o => o.paidMinor > 0);
      if (visit) { assert.equal((await staffApi('payment_record', { requestId: crypto.randomUUID(), orderId: visit.id, amountMinor: -1000, method: 'cash' })).reason, 'manager_required', 'no refunds at the front desk'); count++; }
      const { page, context } = await staffOpen(1280, 'en', '/layla/dashboard?tab=orders&create=1');
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      assert.equal(await dialog.getByRole('button', { name: 'Other charge' }).count(), 0, 'no free-typed charges'); count++;
      await context.close();
    }
  }
  console.log(`hasib dental browser: ${count} assertions passed`);
} finally {
  await browser.close();
}
