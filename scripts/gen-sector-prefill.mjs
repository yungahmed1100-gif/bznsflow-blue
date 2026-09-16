#!/usr/bin/env node
/**
 * gen-sector-prefill.mjs — compile the sector taxonomies into
 * src/lib/sector-prefill.generated.js
 *
 *   node scripts/gen-sector-prefill.mjs            regenerate
 *   node scripts/gen-sector-prefill.mjs --check    exit 1 if the committed file is stale
 *
 * Inputs
 *   src/lib/industries.js           → INDUSTRIES     the canonical id list and labels
 *   src/lib/layla-suggestions.js    → LAYLA_SUGGESTIONS  authored bilingual service text
 *   config/layla-sector-packs.js    → SECTOR_PACKS   archetype and routing vocabulary
 *
 * Why generate instead of importing the packs directly in the browser:
 * config/layla-sector-packs.js imports config/layla-qualification.js, so a
 * client-side import drags ~39 KB of server-only qualification config into an
 * app-page bundle. Onboarding needs three fields per sector, not the packs.
 *
 * The second, larger reason is drift. The same sector taxonomy is maintained in
 * three files, and nothing used to notice when they disagreed — a sector added
 * to INDUSTRIES with no pack behind it would reach a customer as an empty
 * suggestion. This generator fails the build on any mismatch, which is what
 * turns three hand-kept lists into one checked list.
 *
 * Output is deterministic — same input, byte-identical output — which is what
 * makes --check a real drift gate rather than a coin flip.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/lib/sector-prefill.generated.js');

/** Anything that stops the build gets thrown, never warned. A sector that
 *  silently loses its pre-fill degrades onboarding for one industry only,
 *  which is exactly the kind of gap nobody reports for months. */
function fail(msg) {
  console.error(`\n✖ gen-sector-prefill: ${msg}\n`);
  process.exit(1);
}

const load = async (rel) => import(pathToFileURL(join(ROOT, rel)).href);

const { INDUSTRIES } = await load('src/lib/industries.js');
const { LAYLA_SUGGESTIONS } = await load('src/lib/layla-suggestions.js');
const { SECTOR_PACKS } = await load('config/layla-sector-packs.js');

// ---------------------------------------------------------------------------
// Drift gate. `other` is the deliberate exception: it is a free-text escape
// hatch on the form, so it carries authored suggestion text but no sector pack.
// ---------------------------------------------------------------------------
const ids = INDUSTRIES.map((item) => item.id);
const FREE_TEXT = 'other';

if (!ids.includes(FREE_TEXT)) fail(`INDUSTRIES no longer contains the "${FREE_TEXT}" free-text option.`);
if (new Set(ids).size !== ids.length) fail('INDUSTRIES contains duplicate ids.');

const missingSuggestion = ids.filter((id) => !LAYLA_SUGGESTIONS[id]);
if (missingSuggestion.length) {
  fail(
    `these INDUSTRIES ids have no entry in src/lib/layla-suggestions.js: ${missingSuggestion.join(', ')}\n` +
      '  Add authored English and Arabic service text for each before building.'
  );
}

const orphanSuggestion = Object.keys(LAYLA_SUGGESTIONS).filter((id) => !ids.includes(id));
if (orphanSuggestion.length) {
  fail(`src/lib/layla-suggestions.js has entries for ids absent from INDUSTRIES: ${orphanSuggestion.join(', ')}`);
}

const missingPack = ids.filter((id) => id !== FREE_TEXT && !SECTOR_PACKS[id]);
if (missingPack.length) {
  fail(
    `these INDUSTRIES ids have no sector pack in config/layla-sector-packs.js: ${missingPack.join(', ')}\n` +
      '  Add each to the `labels` map there, or the sector reaches customers with no routing vocabulary.'
  );
}

const orphanPack = Object.keys(SECTOR_PACKS).filter((id) => !ids.includes(id));
if (orphanPack.length) {
  fail(`config/layla-sector-packs.js has packs for ids absent from INDUSTRIES: ${orphanPack.join(', ')}`);
}

// ---------------------------------------------------------------------------
// Rows. Every string here is copied from an authored source, never composed:
// onboarding shows these as editable drafts of a customer's own business facts,
// so inventing wording would put words in their mouth.
// ---------------------------------------------------------------------------

/** Arabic customer-question drafts.
 *
 * These were previously built at runtime inside `suggestionsFor()`, which meant
 * every Arabic sector got the same four generic questions — while English got
 * four hand-authored, sector-specific ones. Arabic is the primary language of
 * the site, so the primary experience carried the weaker copy.
 *
 * Materialising them here turns that into reviewable data: improving a sector's
 * Arabic questions is now an edit to a table rather than a change to a runtime
 * template nobody can see. The English rows stay authored in
 * layla-suggestions.js.
 *
 * DELIBERATE COPY CHANGE: the old runtime version interpolated the full Arabic
 * *service description* into the first question, producing e.g. "ما الخدمات
 * المتاحة في قوائم العقارات وأسئلة المشترين والمعاينات ومتابعة الوكلاء؟" — a
 * whole sentence folded into a question. It now interpolates the short sector
 * label from INDUSTRIES ("العقارات"), which is what that slot was always for.
 * Arabic output therefore differs from before, on purpose, and reads naturally.
 *
 * TODO(content): replace these four per sector with fully authored Arabic
 * questions matching the English set. Tracked in CLAIMS-LEDGER.md.
 */
const arabicQuestions = (sectorLabelAr) => [
  `ما الخدمات المتاحة في ${sectorLabelAr}؟`,
  'كم تبلغ الأسعار؟',
  'ما مواعيد العمل والتوفر؟',
  'كيف أتواصل مع الفريق؟',
];

const rows = INDUSTRIES.map(({ id, ar: sectorLabelAr }) => {
  const suggestion = LAYLA_SUGGESTIONS[id];
  const pack = SECTOR_PACKS[id];
  if (!suggestion.en?.trim() || !suggestion.ar?.trim()) fail(`sector "${id}" is missing English or Arabic service text.`);
  if (!Array.isArray(suggestion.questions) || !suggestion.questions.length) fail(`sector "${id}" has no English question drafts.`);
  if (!sectorLabelAr?.trim()) fail(`sector "${id}" has no Arabic label in INDUSTRIES; the Arabic questions need it.`);

  return {
    id,
    // `other` has no pack; the form shows it a free-text sector box instead.
    archetype: pack?.archetype ?? null,
    services: { en: suggestion.en, ar: suggestion.ar },
    questions: { en: suggestion.questions, ar: arabicQuestions(sectorLabelAr) },
  };
});

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
const q = (value) => JSON.stringify(value);
const list = (values) => `[${values.map(q).join(', ')}]`;

function render(entries) {
  const body = entries
    .map(
      (row) =>
        `  ${/^[a-z][a-z0-9]*$/.test(row.id) ? row.id : q(row.id)}: {\n` +
        `    archetype: ${q(row.archetype)},\n` +
        `    services: { en: ${q(row.services.en)}, ar: ${q(row.services.ar)} },\n` +
        `    questions: {\n      en: ${list(row.questions.en)},\n      ar: ${list(row.questions.ar)},\n    },\n` +
        `  },`
    )
    .join('\n');

  return `// GENERATED FILE — do not edit by hand.
//
// Source of truth: src/lib/industries.js, src/lib/layla-suggestions.js and
// config/layla-sector-packs.js. Regenerate with \`npm run gen:sector-prefill\`;
// \`npm run prebuild\` fails if this file drifts from those three.
//
// Onboarding shows these as EDITABLE DRAFTS. Nothing here is a claim about a
// customer's business — a pre-filled field always arrives with the profile
// marked unreviewed, so the customer still confirms it before Layla uses it.

export const SECTOR_PREFILL = {
${body}
};

/** The free-text sector; it has no pack and shows a description box instead. */
export const FREE_TEXT_SECTOR = ${q(FREE_TEXT)};

/**
 * Pre-fill drafts for one sector, in one language.
 *
 * @param {string} sectorId an id from INDUSTRIES
 * @param {'en'|'ar'} [lang]
 * @returns {{ archetype: string|null, service: string, questions: string[] }}
 */
export function prefillFor(sectorId, lang = 'en') {
  const row = SECTOR_PREFILL[sectorId] || SECTOR_PREFILL[FREE_TEXT_SECTOR];
  const locale = lang === 'ar' ? 'ar' : 'en';
  return { archetype: row.archetype, service: row.services[locale], questions: row.questions[locale] };
}

/**
 * Is this service summary still untouched boilerplate?
 *
 * True for blank text and for any sector's suggested summary in either
 * language. Changing sector may replace a summary only while this holds — once
 * the customer has written a word of their own, their text is theirs, and a
 * later sector change must never silently discard it.
 *
 * It is also the signal that a summary has been accepted without being read:
 * a profile whose services text is still the sector default describes the
 * industry rather than the business.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function isSectorDefaultService(text) {
  const value = String(text || '').trim();
  if (!value) return true;
  return Object.values(SECTOR_PREFILL).some(
    (row) => row.services.en === value || row.services.ar === value
  );
}
`;
}

const out = render(rows);
const isCheck = process.argv.includes('--check');
const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : null;

if (isCheck) {
  if (current !== out) {
    fail(
      'src/lib/sector-prefill.generated.js is out of date with the sector sources.\n' +
        '  Run `npm run gen:sector-prefill` and commit the result.'
    );
  }
  console.log(`✓ gen-sector-prefill: in sync (${rows.length} sectors).`);
} else if (current === out) {
  console.log(`✓ gen-sector-prefill: already up to date (${rows.length} sectors).`);
} else {
  writeFileSync(OUT, out);
  const packed = rows.filter((row) => row.archetype).length;
  console.log(
    `✓ gen-sector-prefill: wrote src/lib/sector-prefill.generated.js — ` +
      `${rows.length} sectors, ${packed} with a pack, 1 free-text.`
  );
}
