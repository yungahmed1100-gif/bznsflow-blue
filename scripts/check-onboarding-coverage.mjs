#!/usr/bin/env node
/**
 * check-onboarding-coverage.mjs — the drift gate on the guided-setup ladder.
 *
 *   node scripts/check-onboarding-coverage.mjs      exit 1 on a coverage gap
 *
 * Run by `prebuild`, for the same reason gen-sector-prefill.mjs --check is: add
 * a sector to src/lib/industries.js, or a rung to FIELD_RUNGS, and nothing
 * otherwise tells you the ladder will render an empty question for it. A gap
 * that silently degrades onboarding for one industry is exactly the kind
 * nobody reports for months.
 *
 * Questions are keyed by ARCHETYPE, not by sector, so the gate's real job is to
 * prove every sector resolves to an archetype that has complete bilingual copy
 * — and that the fields the ladder writes are fields the profile accepts.
 */

import { INDUSTRIES } from '../src/lib/industries.js';
import { prefillFor } from '../src/lib/sector-prefill.generated.js';
import { ARCHETYPES, DEFAULT_ARCHETYPE, FIELD_RUNGS, FAQ_COPY, OWNER_QUESTIONS, REVIEW_COPY }
  from '../src/lib/owner-questions.js';

function fail(msg) {
  console.error(`\n✖ check-onboarding-coverage: ${msg}\n`);
  process.exit(1);
}

// The scalar fields api/_lib/layla/review-profile.js will accept. A rung
// writing anything else would be silently dropped by the server.
const PROFILE_FIELDS = ['sector', 'services', 'prices', 'hours', 'location', 'humanContact'];

const problems = [];

// 1. Every rung must target a field the profile contract accepts.
for (const field of FIELD_RUNGS) {
  if (!PROFILE_FIELDS.includes(field)) problems.push(`rung "${field}" is not a profile field (${PROFILE_FIELDS.join(', ')})`);
}

// 2. Every archetype needs complete bilingual copy for every rung.
for (const archetype of ARCHETYPES) {
  const bank = OWNER_QUESTIONS[archetype];
  if (!bank) { problems.push(`archetype "${archetype}" has no question set`); continue; }
  for (const field of FIELD_RUNGS) {
    const copy = bank[field];
    if (!copy) { problems.push(`${archetype}.${field} is missing`); continue; }
    for (const part of ['question', 'help', 'example']) {
      for (const lang of ['en', 'ar']) {
        if (!copy[part]?.[lang]?.trim()) problems.push(`${archetype}.${field}.${part}.${lang} is empty`);
      }
    }
    // Arabic copy that is actually English is the failure mode a human reviewer
    // misses on a quick scan, so assert the script rather than trust it.
    if (copy.question?.ar && !/[؀-ۿ]/.test(copy.question.ar)) {
      problems.push(`${archetype}.${field}.question.ar contains no Arabic script`);
    }
  }
}

// 3. The shared copy blocks.
for (const [name, block] of [['FAQ_COPY', FAQ_COPY], ['REVIEW_COPY', REVIEW_COPY]]) {
  for (const [key, pair] of Object.entries(block)) {
    for (const lang of ['en', 'ar']) {
      if (!pair?.[lang]?.trim()) problems.push(`${name}.${key}.${lang} is empty`);
    }
  }
}

// 4. Every sector must resolve to an archetype that has a question set. This is
//    the check that fires when a sector is added: prefillFor falls back to the
//    free-text row, whose archetype is null, and the ladder then defaults — so
//    verify the default itself is complete rather than assuming it.
for (const { id } of INDUSTRIES) {
  const archetype = prefillFor(id).archetype || DEFAULT_ARCHETYPE;
  if (!ARCHETYPES.includes(archetype)) problems.push(`sector "${id}" resolves to unknown archetype "${archetype}"`);
  else if (!OWNER_QUESTIONS[archetype]) problems.push(`sector "${id}" resolves to "${archetype}", which has no questions`);
}

if (!ARCHETYPES.includes(DEFAULT_ARCHETYPE)) problems.push(`DEFAULT_ARCHETYPE "${DEFAULT_ARCHETYPE}" is not an archetype`);

if (problems.length) {
  fail(`${problems.length} coverage problem${problems.length === 1 ? '' : 's'} in src/lib/owner-questions.js:\n` +
    problems.map((p) => `  · ${p}`).join('\n') +
    '\n\n  Add the missing copy by hand, or draft candidates with\n' +
    '  `npm run onboarding:propose` and promote the ones that read well.');
}

console.log(`✓ check-onboarding-coverage: in sync — ${INDUSTRIES.length} sectors, ` +
  `${ARCHETYPES.length} archetypes, ${FIELD_RUNGS.length} rungs, 2 languages.`);
