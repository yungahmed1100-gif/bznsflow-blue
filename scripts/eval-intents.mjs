#!/usr/bin/env node
/**
 * eval-intents.mjs — score Layla's intent routers against the labelled set.
 *
 *   node scripts/eval-intents.mjs                 report to work/eval/
 *   node scripts/eval-intents.mjs --gate          exit 1 below the macro-F1 floor
 *   node scripts/eval-intents.mjs --min=0.75      move the floor
 *   node scripts/eval-intents.mjs --quiet         write files, print only the summary
 *
 * Inputs
 *   config/eval-questions.js          the hand-reviewed labels
 *   api/_lib/layla/domain.js          classify()      — what production uses
 *   api/_lib/layla/rag-engine.js      classifyIntent() — the RAG-era router
 *
 * No model and no network. Once the labels exist, scoring a regex router is pure
 * computation, so this runs in CI and on a laptop with the desktop switched off.
 *
 * The 0.90 floor is not invented here — docs/blue-rag-engine.md sets "intent
 * macro-F1 >=0.90 per sector" as a release gate. It is OFF by default because
 * today's score is far below it (twelve sector-pack intents have no rule at
 * all), and a gate that fails on the day it lands is a gate someone deletes in
 * its first week. Record the baseline, then raise the floor deliberately.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify } from '../api/_lib/layla/domain.js';
import { classifyIntent } from '../api/_lib/layla/rag-engine.js';
import { CLASSIFY_INTENTS, QUESTIONS } from '../config/eval-questions.js';
import { SECTOR_PACKS } from '../config/layla-sector-packs.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// resolve, not join: EVAL_OUT may be an absolute path (a temp dir under test),
// and join would happily graft it onto ROOT and write somewhere nobody looks.
const OUT_DIR = resolve(ROOT, process.env.EVAL_OUT || 'work/eval');

function fail(msg) {
  console.error(`\n✖ eval-intents: ${msg}\n`);
  process.exit(1);
}

const args = process.argv.slice(2);
const gate = args.includes('--gate');
const quiet = args.includes('--quiet');
const minF1 = Number((args.find((a) => a.startsWith('--min=')) || '--min=0.90').slice(6));
if (!Number.isFinite(minF1) || minF1 < 0 || minF1 > 1) fail('--min must be between 0 and 1.');

// --- label sanity -----------------------------------------------------------
// A mislabelled row moves the score silently, which is worse than no score.
const known = new Set(CLASSIFY_INTENTS);
for (const [i, row] of QUESTIONS.entries()) {
  if (!row?.text?.trim()) fail(`row ${i} has no text.`);
  if (!known.has(row.intent)) {
    fail(`row ${i} ("${row.text}") expects "${row.intent}", which classify() can never return.\n` +
      `  Valid intents: ${CLASSIFY_INTENTS.join(', ')}`);
  }
}

// --- vocabularies -----------------------------------------------------------
// The two routers disagree, so a head-to-head needs one shared alphabet.
// classify() splits hours from location and says `prices`; classifyIntent()
// merges them into `hours_location` and says `price`. Collapsing to the coarser
// of the two is the only comparison that does not simply punish the finer
// router for being more specific.
const coarse = (intent) => ({ hours: 'hours_location', location: 'hours_location', price: 'prices' })[intent] || intent;

const rows = QUESTIONS.map((row) => {
  const production = classify(row.text);
  const rag = classifyIntent(row.text).intent;
  return {
    ...row,
    production,
    rag,
    strictHit: production === row.intent,
    coarseHit: coarse(production) === coarse(row.intent),
    ragHit: coarse(rag) === coarse(row.intent),
  };
});

// --- metrics ----------------------------------------------------------------
/** Per-label precision/recall/F1 plus the unweighted mean across labels.
 *  Macro rather than micro on purpose: the rare intents (optout, injection) are
 *  the ones with the worst consequences, and micro-averaging hides them behind
 *  whichever intent happens to have the most rows. */
function score(items, expected, predicted) {
  const labels = [...new Set(items.map(expected))].sort();
  const per = labels.map((label) => {
    const tp = items.filter((r) => expected(r) === label && predicted(r) === label).length;
    const fp = items.filter((r) => expected(r) !== label && predicted(r) === label).length;
    const fn = items.filter((r) => expected(r) === label && predicted(r) !== label).length;
    const precision = tp + fp ? tp / (tp + fp) : 0;
    const recall = tp + fn ? tp / (tp + fn) : 0;
    return { label, support: tp + fn, tp, fp, fn, precision, recall,
      f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0 };
  });
  const correct = items.filter((r) => expected(r) === predicted(r)).length;
  return {
    total: items.length,
    accuracy: items.length ? correct / items.length : 0,
    macroF1: per.length ? per.reduce((sum, p) => sum + p.f1, 0) / per.length : 0,
    per,
  };
}

const strict = score(rows, (r) => r.intent, (r) => r.production);
const head = {
  production: score(rows, (r) => coarse(r.intent), (r) => coarse(r.production)),
  rag: score(rows, (r) => coarse(r.intent), (r) => coarse(r.rag)),
};

// The metric the compound-question defect lives in: routed to `unknown` when
// the label says otherwise, i.e. Layla said "I don't have confirmed information"
// about something she was told.
const fellThrough = rows.filter((r) => r.production === 'unknown' && r.intent !== 'unknown');
const fallthroughRate = rows.length ? fellThrough.length / rows.length : 0;

// Per-sector, over rows whose correct answer is sector-specific.
const sectors = [...new Set(rows.filter((r) => r.sector).map((r) => r.sector))].sort();
const perSector = sectors.map((sector) => {
  const items = rows.filter((r) => r.sector === sector);
  const s = score(items, (r) => r.intent, (r) => r.production);
  return { sector, total: items.length, accuracy: s.accuracy, macroF1: s.macroF1 };
});

// Which declared sector-pack intents the production router cannot express at
// all. Computed, never asserted — it changes whenever a pack or a rule changes.
const packIntents = [...new Set(Object.values(SECTOR_PACKS).flatMap((p) => p.intents))].sort();
const expressible = new Set(CLASSIFY_INTENTS.map(coarse));
const unroutable = packIntents.filter((i) => !expressible.has(coarse(i)));

// Per language mode. A router tuned on clean MSA and clean English scores well
// here and fails on real Gulf WhatsApp traffic, which is full of both mixed
// script and Arabizi — so the modes are reported separately, never pooled.
const byLang = [...new Set(rows.map((r) => r.lang))].sort().map((lang) => {
  const items = rows.filter((r) => r.lang === lang);
  return { lang, total: items.length, accuracy: score(items, (r) => r.intent, (r) => r.production).accuracy };
});

// --- report -----------------------------------------------------------------
const pct = (n) => `${(n * 100).toFixed(1)}%`;
const bar = (n) => '█'.repeat(Math.round(n * 20)).padEnd(20, '·');

const md = [
  '# Layla intent routing — evaluation',
  '',
  `Generated by \`scripts/eval-intents.mjs\` · ${rows.length} labelled questions · ${sectors.length} sectors`,
  '',
  '## Headline',
  '',
  '| Metric | Value |',
  '|---|---|',
  `| \`classify()\` accuracy (strict) | **${pct(strict.accuracy)}** |`,
  `| \`classify()\` macro-F1 (strict) | **${pct(strict.macroF1)}** |`,
  `| Fell through to \`unknown\` | **${pct(fallthroughRate)}** (${fellThrough.length} of ${rows.length}) |`,
  `| Release gate (docs/blue-rag-engine.md) | macro-F1 ≥ ${pct(minF1)} |`,
  '',
  '## Head to head, coarse vocabulary',
  '',
  'Scored with `hours`/`location` collapsed and `price`/`prices` unified, since the',
  'two routers use different names for the same intents.',
  '',
  '| Router | Accuracy | Macro-F1 |',
  '|---|---|---|',
  `| \`classify()\` — production | ${pct(head.production.accuracy)} | ${pct(head.production.macroF1)} |`,
  `| \`classifyIntent()\` — rag-engine | ${pct(head.rag.accuracy)} | ${pct(head.rag.macroF1)} |`,
  '',
  '## Per intent (strict)',
  '',
  '| Intent | Support | Precision | Recall | F1 | |',
  '|---|--:|--:|--:|--:|---|',
  ...strict.per.map((p) => `| \`${p.label}\` | ${p.support} | ${pct(p.precision)} | ${pct(p.recall)} | ${pct(p.f1)} | \`${bar(p.f1)}\` |`),
  '',
  '## Per language',
  '',
  '| Mode | Questions | Accuracy |',
  '|---|--:|--:|',
  ...byLang.map((l) => `| ${l.lang} | ${l.total} | ${pct(l.accuracy)} |`),
  '',
  '## Unroutable sector-pack intents',
  '',
  `The packs declare ${packIntents.length} distinct intents. \`classify()\` cannot express ` +
    `**${unroutable.length}** of them, so every question of these kinds scores zero recall:`,
  '',
  ...(unroutable.length ? unroutable.map((i) => `- \`${i}\``) : ['- (none)']),
  '',
  '## Misroutes',
  '',
  ...(rows.filter((r) => !r.strictHit).length
    ? ['| Expected | Got | Lang | Question | Note |', '|---|---|---|---|---|',
      ...rows.filter((r) => !r.strictHit).map((r) =>
        `| \`${r.intent}\` | \`${r.production}\` | ${r.lang} | ${r.text.replace(/\|/g, '\\|')} | ${r.note || ''} |`)]
    : ['Every labelled question routed correctly.']),
  '',
].join('\n');

mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const jsonPath = join(OUT_DIR, `intents-${stamp}.json`);
const mdPath = join(OUT_DIR, 'intents-latest.md');
writeFileSync(jsonPath, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  totals: { questions: rows.length, sectors: sectors.length },
  strict, headToHead: head, fallthroughRate, perSector, byLang, unroutable, packIntents,
  misroutes: rows.filter((r) => !r.strictHit).map(({ intent, production, lang, sector, text, note }) =>
    ({ expected: intent, got: production, lang, sector, text, note })),
}, null, 2)}\n`);
writeFileSync(mdPath, md);

if (!quiet) console.log(`\n${md}`);
console.log(`✓ eval-intents: ${rows.length} questions · accuracy ${pct(strict.accuracy)} · ` +
  `macro-F1 ${pct(strict.macroF1)} · unknown fall-through ${pct(fallthroughRate)}`);
console.log(`  report  ${mdPath.replace(`${ROOT}/`, '')}`);
console.log(`  data    ${jsonPath.replace(`${ROOT}/`, '')}\n`);

if (gate && strict.macroF1 < minF1) {
  fail(`macro-F1 ${pct(strict.macroF1)} is below the ${pct(minF1)} gate.\n` +
    `  See ${mdPath.replace(`${ROOT}/`, '')} for the misroutes.`);
}
if (!existsSync(jsonPath)) fail('report was not written.');
