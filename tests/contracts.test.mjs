// Cross-file contracts.
//
// Every check here guards a value that is correct in one file and has to agree
// with another file that cannot import it. That class of bug does not show up in
// unit tests of either side, does not break the build, and does not throw at
// runtime — it just quietly does the wrong thing.
//
// This file exists because that already happened: commit d5ec7b6 renamed the
// playbook PDF and apps-script/Code.gs kept fetching the old name. The fetch
// 404'd, a try/catch swallowed it, and every lead for weeks was written to the
// sheet while silently never receiving the email. `playbook assets` below is the
// check that would have caught it on the first `npm test`.

import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { INDUSTRIES } from '../src/lib/industries.js';
import { SECTOR_PACKS } from '../config/layla-sector-packs.js';
import { SECTOR_PREFILL, FREE_TEXT_SECTOR, prefillFor, isSectorDefaultService } from '../src/lib/sector-prefill.generated.js';

import { PLAYBOOK_PDF } from '../src/lib/constants.js';
import { PAGES } from '../src/routes-manifest.js';
import { MAX_CHARS } from '../api/_lib/guard.js';
import { CHAT_MAX_CHARS } from '../src/lib/chat.js';
import * as replies from '../api/_lib/replies.js';
import { PROVIDERS } from '../api/_lib/oidc.js';
import en from '../src/i18n/en.js';
import ar from '../src/i18n/ar.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log(`  ✓ ${name}`); pass++; }
  catch (e) { console.log(`  ✗ ${name}\n      ${e.message}`); fail++; }
};

console.log('\nplaybook assets');
t('the PDF the page offers actually exists in public/', () => {
  assert.ok(
    existsSync(join(root, 'public', PLAYBOOK_PDF)),
    `public${PLAYBOOK_PDF} is missing — the download link is dead`,
  );
});
t('api/lead.js emails the same PDF the page offers', () => {
  // api/lead.js cannot import from src/lib at the top of a bundled function
  // without dragging the module graph in, so it holds its own copy. This is what
  // keeps the two honest.
  const lead = read('api/lead.js');
  assert.ok(
    lead.includes(`'${PLAYBOOK_PDF}'`),
    `api/lead.js does not reference ${PLAYBOOK_PDF} — the email would attach a different file`,
  );
});
t('nothing fetches the retired email teaser', () => {
  // The email body used to be a public HTML file the Apps Script downloaded at
  // send time. It is gone, and the body is built in Code.gs instead. A single
  // surviving reference would put a 404 back in the send path — and a failed
  // teaser fetch throws, which means the lead saves and the email silently
  // never goes. That is the 2026 incident this whole file exists for.
  const sources = [
    'api/lead.js', 'api/_lib/mailer.js', 'apps-script/Code.gs', 'src/lib/constants.js',
  ].map(read).join('\n');
  assert.ok(
    !/bznsflow-email-teaser|teaserUrl|TEASER_URL/.test(sources),
    'a reference to the retired teaser survives — the playbook email would 404 again',
  );
  assert.ok(
    !existsSync(join(root, 'public', 'bznsflow-email-teaser.html')),
    'public/bznsflow-email-teaser.html is back — it was a public URL nobody was meant to open',
  );
});
t('the Apps Script fetches the PDF and nothing else', () => {
  // One fetch left in the send path. Anything more is a new way for the email
  // to fail on something other than its own attachment.
  const gs = read('apps-script/Code.gs');
  const fetches = [...gs.matchAll(/UrlFetchApp\.fetch\(\s*(\w+)/g)].map((m) => m[1]);
  assert.deepEqual(fetches, ['playbook'], `unexpected UrlFetchApp calls: ${fetches.join(', ')}`);
});
t('the Apps Script fallback URL points at a file that exists', () => {
  // Code.gs takes the URLs from /api/lead now, but keeps constants as a
  // fallback. A stale fallback is exactly what broke this before.
  const gs = read('apps-script/Code.gs');
  const m = gs.match(/var PLAYBOOK_URL\s*=\s*'([^']+)'/);
  assert.ok(m, 'PLAYBOOK_URL not found in Code.gs');
  const path = m[1].replace(/^https?:\/\/[^/]+/, '');
  assert.equal(path, PLAYBOOK_PDF, 'Code.gs fallback disagrees with src/lib/constants.js');
});
t('Meta legal URLs (/terms, /data-deletion) are prerendered routes in the sitemap', () => {
  // Registered in the Meta app as its Terms of Service and Data Deletion URLs.
  // A missing route turns into a 404 on Meta's review checks.
  const routes = read('src/routes.jsx');
  for (const page of ['terms', 'data-deletion']) {
    assert.ok(routes.includes(`path: '${page}'`), `src/routes.jsx has no '${page}' route`);
    assert.ok(routes.includes(`path: 'en/${page}'`), `src/routes.jsx has no 'en/${page}' route`);
    assert.ok(PAGES.some((p) => p.path === `/${page}`), `/${page} is missing from PAGES`);
  }
});
t('/playbook is a prerendered route AND is in the sitemap', () => {
  // The page paid traffic lands on. A route that exists but is missing from
  // PAGES gets no sitemap entry and no hreflang pair — invisible in a way that
  // costs money rather than breaking a build.
  const routes = read('src/routes.jsx');
  assert.ok(/path: 'playbook'/.test(routes), "src/routes.jsx has no 'playbook' route");
  assert.ok(/path: 'en\/playbook'/.test(routes), "src/routes.jsx has no 'en/playbook' route");
  assert.ok(
    PAGES.some((p) => p.path === '/playbook'),
    '/playbook is missing from PAGES — the campaign landing page would not be in the sitemap',
  );
});

console.log('\ncanned chat replies');
t('every replies.* referenced in api/ resolves to a non-empty string', () => {
  // A typo yields `undefined` as the visitor-facing reply text, which is the
  // exact failure replies.js warns about in its own header.
  const sources = ['api/chat.js', 'api/_lib/guard.js'].map(read).join('\n');
  const referenced = [...sources.matchAll(/\breplies\.([A-Z_][A-Z0-9_]*)/g)].map((m) => m[1]);
  assert.ok(referenced.length > 0, 'found no replies.* references — did the regex break?');

  for (const key of new Set(referenced)) {
    assert.equal(typeof replies[key], 'string', `replies.${key} is not a string`);
    assert.ok(replies[key].length > 0, `replies.${key} is empty`);
  }
});

console.log('\ntranslations');
t('en and ar carry exactly the same keys', () => {
  // A key present in one language renders as `undefined` in the other — visible
  // to the visitor, invisible to the build.
  const onlyEn = Object.keys(en).filter((k) => !(k in ar));
  const onlyAr = Object.keys(ar).filter((k) => !(k in en));
  assert.deepEqual(onlyEn, [], `missing from ar.js: ${onlyEn.join(', ')}`);
  assert.deepEqual(onlyAr, [], `missing from en.js: ${onlyAr.join(', ')}`);
});
t('no translation value is empty', () => {
  for (const [k, v] of Object.entries({ ...en, ...ar })) {
    assert.ok(String(v).trim().length > 0, `empty translation: ${k}`);
  }
});

console.log('\nclient/server limits');
t('the chat character cap matches on both sides', () => {
  // src/lib/chat.js truncates before sending; api/_lib/guard.js rejects on
  // receipt. If the client's cap is the larger of the two, a visitor can type a
  // message the page accepts and the server silently refuses.
  //
  // Both values are imported rather than read out of the source, so this keeps
  // working however either side chooses to express the number.
  assert.equal(CHAT_MAX_CHARS, MAX_CHARS, 'client and server disagree on the message cap');
});

console.log('\nroutes and the sitemap');
t('/signin is noindex and absent from the sitemap', () => {
  const manifest = read('src/routes-manifest.js');
  assert.ok(!manifest.includes('signin'), '/signin must stay out of PAGES');
  assert.ok(read('src/pages/SignIn.jsx').includes('noindex'), 'SignIn must render <Seo noindex>');
});

console.log('\nsocial sign-in wiring');
t('every provider in the registry has a button label in both languages', () => {
  for (const id of Object.keys(PROVIDERS)) {
    const key = `auth_oauth_${id}`;
    assert.ok(en[key], `en.js is missing ${key}`);
    assert.ok(ar[key], `ar.js is missing ${key}`);
  }
});
t('every ?e= code the callback can emit has a message', () => {
  // The handlers redirect with reason codes and the page looks each one up in
  // OAUTH_ERRORS. Nothing links the two, so a new branch in the API silently
  // degrades to the generic "something went wrong" — which is exactly the
  // failure this file was written to catch.
  const emitted = new Set();
  for (const file of ['api/auth-oauth.js', 'api/auth-callback.js']) {
    for (const m of read(file).matchAll(/\bback\('([a-z_]+)'\)|\?e=([a-z_]+)/g)) {
      emitted.add(m[1] || m[2]);
    }
  }
  assert.ok(emitted.size > 0, 'expected to find some reason codes to check');

  const page = read('src/pages/SignIn.jsx');
  const mapped = new Set(
    [...page.matchAll(/^\s{2}([a-z_]+):\s*'(auth_err_[a-z_]+)',/gm)].map((m) => m[1]),
  );

  for (const code of emitted) {
    assert.ok(mapped.has(code), `SignIn.jsx OAUTH_ERRORS has no entry for '${code}'`);
  }
});
t('every message OAUTH_ERRORS points at exists in both languages', () => {
  const page = read('src/pages/SignIn.jsx');
  for (const [, key] of page.matchAll(/^\s{2}[a-z_]+:\s*'(auth_err_[a-z_]+)',/gm)) {
    assert.ok(en[key], `en.js is missing ${key}`);
    assert.ok(ar[key], `ar.js is missing ${key}`);
  }
});
t('every cookie the server can set is disclosed in COOKIES.md', () => {
  // COOKIES.md states its own rule — "an unlisted cookie is an undisclosed
  // one". This makes that rule enforceable instead of aspirational.
  const doc = read('COOKIES.md');
  for (const [, name] of read('api/_lib/cookies.js')
    .matchAll(/^export const \w*COOKIE\s*=\s*'([^']+)'/gm)) {
    assert.ok(doc.includes(`\`${name}\``), `COOKIES.md does not document ${name}`);
  }
});
t('every env var the API reads is listed in .env.example', () => {
  // Scans ALL of api/ and ops/, not the three OAuth files it used to. That
  // narrow scope is why .env.example drifted to 20 undocumented variables while
  // this test stayed green — including OPENAI_API_KEY, which the chat backend
  // cannot run without, and every LAYLA_META_* value.
  const example = read('.env.example');
  const seen = new Set();
  const walk = (dir) => readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]);
  const sources = [...walk('api'), ...walk('ops')].filter((f) => f.endsWith('.js') || f.endsWith('.mjs'));

  for (const file of sources) {
    // `process.env.X`, and the `{ env = process.env }` injection style the Blue
    // modules use, which reads `env.X` with no `process.` prefix. Either capture
    // group may be undefined depending on which branch matched.
    for (const match of read(file).matchAll(/\benv(?:\.([A-Z0-9_]{2,})|\['([A-Z0-9_]{2,})'\])/g)) {
      seen.add(match[1] || match[2]);
    }
  }
  // The registry names its env vars as strings rather than property accesses.
  for (const p of Object.values(PROVIDERS)) { seen.add(p.idEnv); seen.add(p.secretEnv); }
  // Supplied by the platform, not by an operator, so not template material.
  const platform = /^(VERCEL|CI|NODE_ENV|AWS_|npm_)/;

  const missing = [...seen].filter((name) => !platform.test(name) && !new RegExp(`^${name}=`, 'm').test(example)).sort();
  assert.equal(missing.length, 0, `.env.example is missing: ${missing.join(', ')}`);
});
t('both new functions declare a maxDuration', () => {
  const vercel = JSON.parse(read('vercel.json'));
  for (const fn of ['api/auth-oauth.js', 'api/auth-callback.js']) {
    assert.ok(vercel.functions?.[fn]?.maxDuration, `vercel.json does not configure ${fn}`);
  }
});

// ── the sector taxonomy ────────────────────────────────────────────────────
// The same sector list is maintained in three files that cannot import each
// other across the client/server line. A sector present in one and missing from
// another reaches a customer as an empty suggestion for one industry only —
// which is why it went unnoticed long enough to need a check.
t('every industry has sector pre-fill in both languages', () => {
  for (const { id } of INDUSTRIES) {
    const row = SECTOR_PREFILL[id];
    assert.ok(row, `src/lib/sector-prefill.generated.js has no row for industry "${id}"`);
    assert.ok(row.services.en.trim(), `sector "${id}" has no English service summary`);
    assert.ok(row.services.ar.trim(), `sector "${id}" has no Arabic service summary`);
    assert.ok(row.questions.en.length, `sector "${id}" has no English question drafts`);
    assert.equal(row.questions.ar.length, row.questions.en.length, `sector "${id}" question counts differ between languages`);
  }
  assert.equal(Object.keys(SECTOR_PREFILL).length, INDUSTRIES.length, 'sector-prefill has rows for ids absent from INDUSTRIES');
});

t('every industry except the free-text one has a sector pack', () => {
  for (const { id } of INDUSTRIES) {
    if (id === FREE_TEXT_SECTOR) {
      assert.equal(SECTOR_PREFILL[id].archetype, null, 'the free-text sector must not claim a pack archetype');
      continue;
    }
    assert.ok(SECTOR_PACKS[id], `config/layla-sector-packs.js has no pack for industry "${id}"`);
    assert.equal(SECTOR_PREFILL[id].archetype, SECTOR_PACKS[id].archetype, `sector "${id}" archetype disagrees with its pack`);
  }
});

t('the committed pre-fill file is not stale', () => {
  // The generator is deterministic, so regenerating into memory and comparing is
  // the whole drift check. Without this, an edit to layla-suggestions.js or the
  // packs ships nothing until someone remembers to regenerate.
  const generated = execFileSync(process.execPath, [join(root, 'scripts/gen-sector-prefill.mjs'), '--check'], { encoding: 'utf8' });
  assert.match(generated, /in sync/, 'run `npm run gen:sector-prefill` and commit the result');
});

t('pre-filled service text is recognised as a default, customer text is not', () => {
  // This guard is what stops a sector change from overwriting words the customer
  // typed, and what lets review warn that a summary was never edited.
  assert.equal(isSectorDefaultService(''), true, 'blank text must count as a default');
  assert.equal(isSectorDefaultService('   '), true, 'whitespace must count as a default');
  assert.equal(isSectorDefaultService(SECTOR_PREFILL.dental.services.en), true, 'an English default must be recognised');
  assert.equal(isSectorDefaultService(SECTOR_PREFILL.dental.services.ar), true, 'an Arabic default must be recognised');
  assert.equal(isSectorDefaultService('We do same-day crowns and open on Saturdays'), false, 'customer-authored text must never be treated as a default');
});

t('the Blue build is never indexable', () => {
  // The review deployment is publicly reachable. If it were indexed it would
  // compete with www.bznsflowai.com for the same copy, and Meta's reviewer link
  // would turn up in search. vercel.json also sends X-Robots-Tag, but a header
  // and a meta tag are set in different files and only one of them survives a
  // promotion — so pin the tag too.
  // Read as source: Node cannot import .jsx, and the same constraint is why the
  // other checks in this file read files rather than importing them.
  const seo = read('src/components/ui/Seo.jsx');
  const blue = seo.match(/ROBOTS_BLUE = '([^']+)'/)?.[1];
  const green = seo.match(/ROBOTS_GREEN = '([^']+)'/)?.[1];
  const active = seo.match(/export const ROBOTS = (\w+);/)?.[1];
  assert.ok(blue && green && active, 'Seo.jsx no longer declares the robots constants this check reads');
  assert.equal(active, 'ROBOTS_BLUE', 'Seo.jsx must emit the Blue robots value');
  assert.match(blue, /^noindex\b/, 'Blue must emit noindex');
  assert.match(green, /^index\b/, 'the Green value kept alongside it must still be the indexable one');
  assert.ok(seo.includes('content={ROBOTS}'), 'the robots meta tag must render the ROBOTS constant');

  const vercel = JSON.parse(read('vercel.json'));
  const header = vercel.headers?.flatMap((h) => h.headers).find((h) => h.key === 'X-Robots-Tag');
  assert.ok(header, 'vercel.json must send X-Robots-Tag on Blue');
  assert.match(header.value, /noindex/, 'the X-Robots-Tag header must agree with the meta tag');
});

t('prefillFor falls back to the free-text sector for an unknown id', () => {
  const unknown = prefillFor('not-a-real-sector', 'en');
  assert.equal(unknown.service, SECTOR_PREFILL[FREE_TEXT_SECTOR].services.en);
  assert.equal(prefillFor('dental', 'ar').service, SECTOR_PREFILL.dental.services.ar, 'Arabic must not fall back to English');
});

console.log(`\n${fail ? '✗' : '✓'} contracts: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
