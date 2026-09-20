#!/usr/bin/env node
/**
 * propose-eval-questions.mjs — draft candidate eval questions with the local model.
 *
 *   node scripts/propose-eval-questions.mjs                      every sector
 *   node scripts/propose-eval-questions.mjs --sector dental      one sector
 *   node scripts/propose-eval-questions.mjs --intent prices       one intent
 *   node scripts/propose-eval-questions.mjs --lang ar --count 12
 *
 * Writes work/eval/proposals/<sector>.json — SCRATCH, git-ignored.
 *
 * It never writes config/eval-questions.js. A person reads the proposals and
 * promotes the ones that are right, because a mislabelled question does not
 * fail loudly, it quietly moves the score — and a score you cannot trust is
 * worse than no score. This mirrors the repo's existing split between authored
 * input (src/lib/layla-suggestions.js) and generated output
 * (src/lib/sector-prefill.generated.js).
 *
 * Environment
 *   OLLAMA_HOST    default http://192.168.100.4:11434
 *   OLLAMA_MODEL   default layla-ar
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INDUSTRIES } from '../src/lib/industries.js';
import { SECTOR_PACKS } from '../config/layla-sector-packs.js';
import { CLASSIFY_INTENTS, LANGS, QUESTIONS } from '../config/eval-questions.js';
import { chat, host, installed, model, parseList, reachable } from './lib/ollama.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// resolve, not join: EVAL_OUT may be absolute.
const OUT_DIR = join(resolve(ROOT, process.env.EVAL_OUT || 'work/eval'), 'proposals');

function fail(msg) {
  console.error(`\n✖ propose-eval-questions: ${msg}\n`);
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};

const onlySector = flag('sector');
const onlyIntent = flag('intent');
const onlyLang = flag('lang');
const count = Number(flag('count', '10'));

if (onlySector && !INDUSTRIES.some((i) => i.id === onlySector)) fail(`unknown sector "${onlySector}".`);
if (onlyIntent && !CLASSIFY_INTENTS.includes(onlyIntent)) fail(`unknown intent "${onlyIntent}". One of: ${CLASSIFY_INTENTS.join(', ')}`);
if (onlyLang && !LANGS.includes(onlyLang)) fail(`unknown lang "${onlyLang}". One of: ${LANGS.join(', ')}`);
if (!Number.isInteger(count) || count < 1 || count > 50) fail('--count must be 1-50.');

// Only the field-backed intents are worth generating per sector — the rest
// (greeting, optout, handoff, injection) are sector-independent and already
// covered once, globally, by hand.
const TARGET_INTENTS = ['prices', 'services', 'hours', 'location'];

const BRIEF = {
  prices: { en: 'asking what something costs', ar: 'يسأل عن السعر أو التكلفة' },
  services: { en: 'asking what the business offers', ar: 'يسأل عن الخدمات أو المنتجات المتاحة' },
  hours: { en: 'asking when the business is open', ar: 'يسأل عن مواعيد العمل' },
  location: { en: 'asking where the business is', ar: 'يسأل عن الموقع أو العنوان' },
};

const MODE = {
  ar: 'in Modern Standard Arabic or natural Gulf dialect, Arabic script only',
  en: 'in English',
  mixed: 'mixing Arabic script and English words in one sentence, as Gulf WhatsApp users really write',
  arabizi: 'in Arabizi — Arabic written with Latin letters and digits, e.g. "bkam", "wen", "shu", "3endkom"',
};

async function propose(sector, label, intent, lang) {
  const pack = SECTOR_PACKS[sector];
  const domain = pack ? `${label.en} (${label.ar})` : label.en;
  const reply = await chat([
    { role: 'user', content:
`Write ${count} short, different messages a real customer might send on WhatsApp to a business in this field: ${domain}.

Every message must be someone ${BRIEF[intent].en} — ${BRIEF[intent].ar}.
Write them ${MODE[lang]}.

Rules: one message per line, numbered 1. to ${count}. No preamble, no explanation, no translation, no commentary. Each under 15 words. Use wording specific to this field, not generic.` },
  ], { numPredict: 60 + count * 24 });

  const existing = new Set(QUESTIONS.map((q) => q.text.trim().toLowerCase()));
  return parseList(reply, { max: count })
    .filter((text) => !existing.has(text.toLowerCase()))
    .map((text) => ({ sector, intent, lang, text }));
}

if (!(await reachable())) {
  fail(`no Ollama server at ${host()}.\n` +
    '  Start Ollama on the host, or point OLLAMA_HOST somewhere else.\n' +
    '  This script is the only part of the harness that needs a model —\n' +
    '  `npm run eval:intents` scores the existing labels with no network at all.');
}

const have = await installed();
if (!have.some((n) => n === model() || n.startsWith(`${model()}:`))) {
  fail(`model "${model()}" is not installed on ${host()}.\n` +
    `  Installed: ${have.join(', ') || '(none)'}\n` +
    `  Pull it, or set OLLAMA_MODEL to one of the above.`);
}

const sectors = INDUSTRIES.filter((i) => (onlySector ? i.id === onlySector : true));
const intents = TARGET_INTENTS.filter((i) => (onlyIntent ? i === onlyIntent : true));
const langs = LANGS.filter((l) => (onlyLang ? l === onlyLang : true));

if (!intents.length) fail(`intent "${onlyIntent}" is not generated per sector. Generated: ${TARGET_INTENTS.join(', ')}`);

console.log(`\npropose-eval-questions: ${model()} at ${host()}`);
console.log(`  ${sectors.length} sector(s) × ${intents.length} intent(s) × ${langs.length} lang(s), ${count} each\n`);

mkdirSync(OUT_DIR, { recursive: true });
let written = 0;

for (const { id, en, ar } of sectors) {
  const rows = [];
  for (const intent of intents) {
    for (const lang of langs) {
      process.stdout.write(`  ${id} · ${intent} · ${lang} … `);
      try {
        const batch = await propose(id, { en, ar }, intent, lang);
        rows.push(...batch);
        console.log(`${batch.length} new`);
      } catch (error) {
        // One failed cell must not lose the sectors already generated.
        console.log(`failed (${error.message.slice(0, 60)})`);
      }
    }
  }
  if (!rows.length) continue;
  const file = join(OUT_DIR, `${id}.json`);
  writeFileSync(file, `${JSON.stringify({
    sector: id, model: model(), generatedAt: new Date().toISOString(),
    note: 'CANDIDATES ONLY. Review each line, then paste the good ones into config/eval-questions.js.',
    rows,
  }, null, 2)}\n`);
  written += rows.length;
}

console.log(`\n✓ propose-eval-questions: ${written} candidate(s) in ${OUT_DIR.replace(`${ROOT}/`, '')}/`);
console.log('  Review them, then promote the good ones into config/eval-questions.js by hand.\n');
