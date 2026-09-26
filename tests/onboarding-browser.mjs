// Browser verification for the guided-setup ladder.
//
//   npm run test:onboarding-browser -- http://localhost:5199
//
// Deliberately NOT a *.test.mjs file: it needs a running dev server, so it sits
// on an opt-in script like tests/layla-meta-browser.mjs and the other browser
// suites rather than inside `npm test`.
//
// The assertion that matters most is #5. Everything else here is convenience;
// that one is the product's core guarantee, checked in a real browser rather
// than inferred from unit tests: the ladder DRAFTS facts into the form and
// leaves them unconfirmed, and only the customer ticking the box by hand makes
// them usable. api/_lib/layla/review-profile.js:6 refuses any profile without
// reviewed === true, and this proves the UI cannot route around it.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.argv[2] || 'http://localhost:5199';
const browser = await chromium.launch();
let checks = 0;

for (const [lang, url, open, next, skipLabel] of [
  ['en', `${BASE}/en/layla/setup`, 'Guide me through it', 'Next', 'Skip this'],
  ['ar', `${BASE}/layla/setup`, 'أرشدني خطوة بخطوة', 'التالي', 'تخطّي'],
]) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle' });

  // 1. The lane is present and starts collapsed behind one button.
  const launch = page.getByRole('button', { name: open });
  await launch.waitFor({ timeout: 15000 });
  checks++;

  // 2. Onboarding asks only for the core facts (name, type, summary, team
  // contact, one confirmation). Prices, hours, FAQs and the catalog live in
  // Dashboard → Business, so the first step stays short.
  const controls = await page.locator('form input, form textarea, form select').count();
  assert.ok(controls >= 6 && controls <= 9, `${lang}: expected only the core fields, saw ${controls} controls`);
  checks++;

  // Required identity fields stay in the primary path. They must not be hidden
  // inside the optional direct-edit disclosure, or native validation can block
  // a guided customer with no visible field to fix.
  await page.getByLabel(lang === 'ar' ? 'اسم النشاط' : 'Business name').waitFor();
  await page.getByLabel(lang === 'ar' ? 'ما مجال نشاطك؟' : 'What does your business do?').waitFor();
  await page.getByLabel(lang === 'ar' ? 'ملخص الخدمات' : 'Short service summary').waitFor();
  checks += 3;

  // 3. Opening it asks ONE question.
  await launch.click();
  const textareas = page.locator('section.layla-answer textarea');
  await textareas.first().waitFor();
  assert.equal(await textareas.count(), 1, `${lang}: a field rung must ask one thing at a time`);
  checks++;

  // 4. Answering writes through to the real profile field.
  const typed = lang === 'ar' ? 'تنظيف وتبييض الأسنان' : 'Cleaning and whitening';
  await textareas.first().fill(typed);
  await page.getByRole('button', { name: next }).click();
  await page.waitForFunction(
    (t) => [...document.querySelectorAll('form textarea')].some((el) => el.value === t),
    typed, { timeout: 5000 },
  );
  checks++;

  // 5. THE INVARIANT: a ladder-filled profile is never a confirmed profile.
  const confirm = page.locator('label.layla-check input[type=checkbox]');
  assert.equal(await confirm.isChecked(), false, `${lang}: the ladder must not confirm facts`);
  // The submit button carries no explicit type (it defaults to submit inside a
  // form), so match it by its accessible name instead of the attribute.
  const submit = page.getByRole('button', { name: lang === 'ar' ? 'احفظ وتابع' : 'Save and continue' });
  assert.equal(await submit.isDisabled(), true, `${lang}: submit must stay disabled until confirmed`);
  checks += 2;

  // 6. Ticking it by hand is what enables submission.
  await confirm.check();
  assert.equal(await submit.isDisabled(), false, `${lang}: confirming should enable submit`);
  checks++;

  // 7. Skipping advances rather than trapping the customer.
  await page.getByRole('button', { name: skipLabel }).click();
  await page.locator('section.layla-answer textarea').first().waitFor();
  checks++;

  // (The Enter-in-an-optional-field guard moved with the FAQs to the
  // dashboard's Business tab; tests/layla-dashboard-browser.mjs covers it.)

  assert.deepEqual(errors, [], `${lang}: console errors: ${errors.join(' | ')}`);
  checks++;
  console.log(`  ✓ ${lang}: guided setup opens, fills the form, and leaves it unconfirmed`);
  await page.close();

  // 9. Coming back from Instagram with a failure explains it in the page's language.
  const back = await browser.newPage();
  await back.goto(`${url}?instagram=connection_failed&reason=asset_in_use`, { waitUntil: 'networkidle' });
  const alert = back.getByRole('alert').filter({ hasText: lang === 'ar' ? 'حساب إنستغرام هذا مرتبط' : 'This Instagram account is already connected' });
  await alert.waitFor({ timeout: 10000 });
  checks++;
  // An unknown reason never leaks into the page; the generic message shows instead.
  await back.goto(`${url}?instagram=connection_failed&reason=%3Cscript%3E`, { waitUntil: 'networkidle' });
  await back.getByRole('alert').filter({ hasText: lang === 'ar' ? 'تعذّر إكمال ربط إنستغرام' : 'Instagram connection could not finish' }).waitFor({ timeout: 10000 });
  checks++;
  await back.close();
}

await browser.close();
console.log(`\n✓ guided-check: ${checks} assertions passed in both languages\n`);
