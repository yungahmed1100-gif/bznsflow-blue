#!/usr/bin/env node
/**
 * propose-owner-questions.mjs — draft sector-specific placeholder examples for
 * the guided-setup ladder, using the local model.
 *
 *   node scripts/propose-owner-questions.mjs                    every sector
 *   node scripts/propose-owner-questions.mjs --sector dental
 *   node scripts/propose-owner-questions.mjs --field hours
 *
 * Writes work/eval/proposals/owner-questions/<sector>.json — SCRATCH, ignored.
 *
 * WHY THIS EXISTS. src/lib/owner-questions.js keys its copy by ARCHETYPE, so
 * three question sets cover all 23 sectors and the wording cannot drift apart.
 * That is right for the questions. It is a compromise for the `example`
 * placeholders: `booking` spans dental, legal, fitness and automotive, so the
 * examples had to be written sector-neutral — "First visit 15 OMR, main service
 * from 25 OMR" — because an example naming "whitening" tells a law firm this
 * product does not understand it.
 *
 * Sector-specific examples would be better, and that is 23 × 4 × 2 = 184 short
 * bilingual strings: a genuine authoring load and a poor use of a person's first
 * draft. So the model drafts; a person promotes.
 *
 * It never writes src/. Placeholder text is customer-facing Arabic copy, which
 * is exactly the category that must not be auto-committed — and a placeholder
 * that quietly asserts something false about a business is worse than a plain
 * one. Same rule as scripts/propose-eval-questions.mjs.
 *
 * Environment: OLLAMA_HOST, OLLAMA_MODEL (see scripts/lib/ollama.mjs).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INDUSTRIES } from '../src/lib/industries.js';
import { prefillFor } from '../src/lib/sector-prefill.generated.js';
import { DEFAULT_ARCHETYPE, FIELD_RUNGS, questionsFor } from '../src/lib/owner-questions.js';
import { chat, host, installed, model, parseList, reachable } from './lib/ollama.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(resolve(ROOT, process.env.EVAL_OUT || 'work/eval'), 'proposals', 'owner-questions');

function fail(msg) {
  console.error(`\n✖ propose-owner-questions: ${msg}\n`);
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
};

const onlySector = flag('sector');
const onlyField = flag('field');
if (onlySector && !INDUSTRIES.some((i) => i.id === onlySector)) fail(`unknown sector "${onlySector}".`);
if (onlyField && !FIELD_RUNGS.includes(onlyField)) fail(`unknown field "${onlyField}". One of: ${FIELD_RUNGS.join(', ')}`);

const ASKING = {
  services: 'what the business offers, listed by name',
  prices: 'what its main services or items cost, with real-looking numbers in Omani rials (OMR)',
  hours: 'which days and times it is open, including the days it is closed',
  location: 'where it is and which areas it covers',
};

async function propose(sector, label, archetype, field, lang) {
  const bank = questionsFor(archetype);
  const askedEn = bank[field].question.en;
  const neutral = bank[field].example.en;
  const reply = await chat([
    { role: 'user', content:
`A business owner in Oman running this kind of business: ${label.en} (${label.ar}).

They are asked: "${askedEn}"

Write 4 different one-line example answers they might plausibly give, describing ${ASKING[field]}.
Write them ${lang === 'ar' ? 'in natural Gulf Arabic, Arabic script only, using Arabic-Indic numerals (٠١٢٣٤٥٦٧٨٩)' : 'in plain English'}.

These are PLACEHOLDER examples shown in a form to suggest the shape of a good answer.
Keep each under 14 words, concrete and specific to this kind of business.
For reference, the current generic example is: "${neutral}"

One per line, numbered 1. to 4. No preamble, no explanation, no commentary.` },
  ], { numPredict: 200 });
  return parseList(reply, { max: 4, maxChars: 160 }).map((text) => ({ sector, archetype, field, lang, text }));
}

if (!(await reachable())) {
  fail(`no Ollama server at ${host()}.\n` +
    '  Start Ollama on the host, or point OLLAMA_HOST somewhere else.\n' +
    '  Nothing else in the onboarding work needs a model: the ladder, its tests\n' +
    '  and `npm run check:onboarding-coverage` all run offline.');
}

const have = await installed();
if (!have.some((n) => n === model() || n.startsWith(`${model()}:`))) {
  fail(`model "${model()}" is not installed on ${host()}.\n  Installed: ${have.join(', ') || '(none)'}`);
}

const sectors = INDUSTRIES.filter((i) => (onlySector ? i.id === onlySector : true));
const fields = FIELD_RUNGS.filter((f) => (onlyField ? f === onlyField : true));

console.log(`\npropose-owner-questions: ${model()} at ${host()}`);
console.log(`  ${sectors.length} sector(s) × ${fields.length} field(s) × 2 languages\n`);

mkdirSync(OUT_DIR, { recursive: true });
let written = 0;

for (const { id, en, ar } of sectors) {
  const archetype = prefillFor(id).archetype || DEFAULT_ARCHETYPE;
  const rows = [];
  for (const field of fields) {
    for (const lang of ['en', 'ar']) {
      process.stdout.write(`  ${id} · ${archetype} · ${field} · ${lang} … `);
      try {
        const batch = await propose(id, { en, ar }, archetype, field, lang);
        rows.push(...batch);
        console.log(`${batch.length}`);
      } catch (error) {
        // One failed cell must not lose the sectors already generated.
        console.log(`failed (${error.message.slice(0, 60)})`);
      }
    }
  }
  if (!rows.length) continue;
  writeFileSync(join(OUT_DIR, `${id}.json`), `${JSON.stringify({
    sector: id, archetype, model: model(), generatedAt: new Date().toISOString(),
    note: 'CANDIDATES ONLY. These are placeholder examples, not facts. Read every line, '
      + 'then promote the good ones into src/lib/owner-questions.js by hand.',
    rows,
  }, null, 2)}\n`);
  written += rows.length;
}

console.log(`\n✓ propose-owner-questions: ${written} candidate(s) in ${OUT_DIR.replace(`${ROOT}/`, '')}/`);
console.log('  Review them, then promote by hand. Nothing here is committed automatically.\n');
