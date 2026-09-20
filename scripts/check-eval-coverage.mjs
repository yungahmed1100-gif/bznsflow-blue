#!/usr/bin/env node
/**
 * check-eval-coverage.mjs — the drift gate on config/eval-questions.js.
 *
 *   node scripts/check-eval-coverage.mjs        exit 1 on a coverage gap
 *
 * Run by `prebuild`, for the same reason gen-sector-prefill.mjs --check is: add
 * a sector to src/lib/industries.js and nothing reminds you it has no test
 * coverage, so its routing quality silently becomes unknown. A gap that
 * degrades one industry is exactly the kind nobody reports for months.
 *
 * What it deliberately does NOT gate on: the sector packs declare intents that
 * classify() has no rule for at all (appointment_info, reschedule, delivery_info
 * and more). Requiring a labelled question per pack intent would fail on day one
 * for a reason the label set cannot fix. scripts/eval-intents.mjs reports that
 * gap as a measurement instead.
 */

import { INDUSTRIES, INDUSTRY_IDS } from '../src/lib/industries.js';
import { CLASSIFY_INTENTS, GLOBAL_INTENTS, LANGS, PER_SECTOR_INTENTS, QUESTIONS }
  from '../config/eval-questions.js';

function fail(msg) {
  console.error(`\n✖ check-eval-coverage: ${msg}\n`);
  process.exit(1);
}

const known = new Set(CLASSIFY_INTENTS);
const problems = [];

// 1. Every label must be something classify() can actually return.
for (const row of QUESTIONS) {
  if (!row?.text?.trim()) problems.push(`a row has no text: ${JSON.stringify(row)}`);
  else if (!known.has(row.intent)) problems.push(`"${row.text}" expects unknown intent "${row.intent}"`);
  else if (!LANGS.includes(row.lang)) problems.push(`"${row.text}" has lang "${row.lang}"; expected one of ${LANGS.join(', ')}`);
  else if (row.sector != null && !INDUSTRY_IDS.has(row.sector)) problems.push(`"${row.text}" names sector "${row.sector}", which is not in src/lib/industries.js`);
}

// 2. Duplicate text scores the same row twice and quietly weights the metric.
const seen = new Map();
for (const row of QUESTIONS) {
  const key = row.text.trim();
  if (seen.has(key)) problems.push(`duplicate question text: "${key}"`);
  else seen.set(key, row);
}

// 3. Every sector needs its own wording for the field-backed intents, in both
//    languages. Generic templates would flatter a router that only matches the
//    literal word "services".
for (const { id } of INDUSTRIES) {
  for (const intent of PER_SECTOR_INTENTS) {
    for (const lang of ['ar', 'en']) {
      if (!QUESTIONS.some((r) => r.sector === id && r.intent === intent && r.lang === lang)) {
        problems.push(`sector "${id}" has no ${lang} question for intent "${intent}"`);
      }
    }
  }
}

// 4. The sector-independent intents need covering once overall.
for (const intent of GLOBAL_INTENTS) {
  if (!QUESTIONS.some((r) => r.intent === intent)) problems.push(`no question anywhere for intent "${intent}"`);
}

// 5. All four language modes must appear. docs/blue-rag-engine.md requires
//    Arabic, English, mixed-language and Arabizi coverage.
for (const lang of LANGS) {
  if (!QUESTIONS.some((r) => r.lang === lang)) problems.push(`no question in "${lang}" mode`);
}

if (problems.length) {
  fail(`${problems.length} coverage problem${problems.length === 1 ? '' : 's'} in config/eval-questions.js:\n` +
    problems.map((p) => `  · ${p}`).join('\n') +
    '\n\n  Add the missing rows by hand, or draft candidates with\n' +
    '  `npm run eval:propose` and promote the ones that are right.');
}

const sectors = new Set(QUESTIONS.filter((r) => r.sector).map((r) => r.sector));
console.log(`✓ check-eval-coverage: in sync — ${QUESTIONS.length} questions, ` +
  `${sectors.size} sectors, ${LANGS.length} language modes.`);
