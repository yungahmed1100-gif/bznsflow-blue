#!/usr/bin/env node
/**
 * calibrate-router.mjs — choose the profile-layer thresholds in
 * api/_lib/layla/route.js, and check the lexicon against an independent corpus.
 *
 *   node scripts/calibrate-router.mjs
 *   node scripts/calibrate-router.mjs --json
 *
 * WHY THIS IS SEPARATE FROM THE EVALUATION. Picking a threshold by watching
 * the evaluation score move is the oldest way to produce a number that means
 * nothing: the reported accuracy then includes however many decisions were
 * tuned to those exact rows. So the two are kept apart by construction — this
 * script imports config/intent-exemplars.js and config/eval-profiles.js and
 * NEVER config/eval-questions.js, and scripts/eval-intents.mjs reports on the
 * labelled set at whatever thresholds this one chose.
 *
 * WHAT IT CALIBRATES. Only the profile layer has thresholds. The lexicon is
 * exact matching with a precedence order and has nothing to tune — which was
 * the point of choosing it: see the header of config/intent-lexicon.js for the
 * two learned classifiers that were built, measured at 56.8% and 67.8% under
 * leave-one-out, and deleted.
 *
 * THE SELECTION RULE, stated so it is auditable rather than eyeballed: take
 * the LOWEST threshold whose precision is at or above the target. Lowest,
 * because every point above that buys no precision and costs recall — and a
 * refusal Layla did not need to make is a customer told "I don't have
 * confirmed information" about something we knew.
 *
 * Precision is targeted high because the costs are asymmetric. An abstention
 * falls back to a polite refusal plus the human contact. A confident misroute
 * sends the WRONG approved fact — an opening-hours question answered with a
 * price list — and the customer has no way to know it was a mistake.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIELD_INTENTS, THRESHOLDS, fieldAffinity } from '../api/_lib/layla/route.js';
import { lexiconIntent } from '../api/_lib/layla/lexicon.js';
import { EXEMPLARS } from '../config/intent-exemplars.js';
import { profileFor } from '../config/eval-profiles.js';
import { INDUSTRIES } from '../src/lib/industries.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, process.env.EVAL_OUT || 'work/eval');
const asJson = process.argv.includes('--json');

/** Precision target for the profile layer. */
const TARGET = 0.90;
/** Below this many comparisons, print no recommendation. A threshold "chosen"
 *  from a handful of rows is a number with a decimal point and no evidence
 *  behind it, and it would be copied into route.js as though it had some. */
const MIN_SAMPLE = 40;
const pct = (n) => `${(n * 100).toFixed(1)}%`;

const EXEMPLAR_ROWS = Object.entries(EXEMPLARS)
  .flatMap(([intent, list]) => list.map(([text, lang]) => ({ intent, text, lang })));

// --- the lexicon, against a corpus it was not authored from -----------------
// The exemplars are an independent corpus by rule (tests/intent-routing.test.mjs
// asserts no overlap with the evaluation set). Routing them with the lexicon
// alone shows which authored phrasings the vocabulary does not reach yet — an
// authoring to-do list, not a score to optimise.
const lexicon = EXEMPLAR_ROWS.map((row) => {
  const hit = lexiconIntent(row.text);
  return { ...row, got: hit?.intent ?? null, terms: hit?.terms ?? [] };
});
const lexiconRight = lexicon.filter((r) => r.got === r.intent).length;
const lexiconMissed = lexicon.filter((r) => r.got === null);
const lexiconWrong = lexicon.filter((r) => r.got && r.got !== r.intent);

// --- the profile layer ------------------------------------------------------
// ONLY rows the lexicon does not already decide, because that is the only
// condition under which route() consults this layer at all. Scoring it on
// phrasings the lexicon handles measures a code path production never takes,
// and the first version of this script did exactly that and reported a
// meaningless 20.5%.
const fieldRows = [];
for (const row of EXEMPLAR_ROWS.filter((r) => FIELD_INTENTS.includes(r.intent) && !lexiconIntent(r.text))) {
  for (const { id } of INDUSTRIES) {
    for (const lang of ['en', 'ar']) {
      const hit = fieldAffinity(row.text, profileFor(id, lang));
      if (hit) fieldRows.push({ expected: row.intent, got: hit.intent, score: hit.score, margin: hit.margin, shared: hit.shared });
    }
  }
}

function curve(rows, floors, margins, shares) {
  const points = [];
  for (const floor of floors) {
    for (const margin of margins) {
      for (const minShared of shares) {
        const accepted = rows.filter((r) => r.score >= floor && r.margin >= margin && r.shared >= minShared);
        const right = accepted.filter((r) => r.got === r.expected).length;
        points.push({
          floor, margin, minShared,
          accepted: accepted.length,
          coverage: rows.length ? accepted.length / rows.length : 0,
          precision: accepted.length ? right / accepted.length : 1,
        });
      }
    }
  }
  return points;
}

const FLOORS = Array.from({ length: 30 }, (_, i) => Number((0.02 + i * 0.01).toFixed(3)));
const MARGINS = [0, 0.005, 0.01, 0.015, 0.02, 0.04, 0.06];
const SHARES = [0, 2, 4, 6, 8, 10];

const viable = curve(fieldRows, FLOORS, MARGINS, SHARES)
  .filter((p) => p.precision >= TARGET && p.accepted > 0)
  .sort((a, b) => a.floor - b.floor || b.coverage - a.coverage || a.margin - b.margin);
const chosen = fieldRows.length >= MIN_SAMPLE ? (viable[0] ?? null) : null;

// Where the thresholds actually shipped sit on that curve.
const shipped = curve(fieldRows, [THRESHOLDS.field], [THRESHOLDS.fieldMargin], [THRESHOLDS.minShared])[0];

const summary = {
  generatedAt: new Date().toISOString(),
  lexicon: {
    rows: lexicon.length,
    routed: lexiconRight,
    accuracy: lexicon.length ? lexiconRight / lexicon.length : 0,
    unmatched: lexiconMissed.map(({ text, lang, intent }) => ({ text, lang, intent })),
    misrouted: lexiconWrong.map(({ text, lang, intent, got, terms }) => ({ text, lang, expected: intent, got, terms })),
  },
  profileLayer: { comparisons: fieldRows.length, target: TARGET, chosen, shipped: { ...THRESHOLDS, ...shipped } },
};

if (asJson) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log(`\ncalibrate-router: ${lexicon.length} exemplars, ${fieldRows.length} profile comparisons\n`);

  console.log('  LEXICON against the exemplar corpus (independent of the eval set)');
  console.log(`    reaches ${lexiconRight}/${lexicon.length} (${pct(summary.lexicon.accuracy)})`);
  console.log(`    ${lexiconMissed.length} phrasing(s) match no term at all:`);
  for (const r of lexiconMissed.slice(0, 12)) console.log(`      ${r.intent.padEnd(9)} ${r.lang.padEnd(8)} ${r.text}`);
  if (lexiconMissed.length > 12) console.log(`      … and ${lexiconMissed.length - 12} more`);
  if (lexiconWrong.length) {
    console.log(`    ${lexiconWrong.length} routed to the wrong intent:`);
    for (const r of lexiconWrong.slice(0, 12)) {
      console.log(`      ${r.intent.padEnd(9)} → ${String(r.got).padEnd(9)} ${r.lang.padEnd(8)} ${r.text}  [${r.terms.join(' ')}]`);
    }
  }

  console.log(`\n  PROFILE LAYER — ${fieldRows.length} comparisons, from the ${EXEMPLAR_ROWS.filter((r) => FIELD_INTENTS.includes(r.intent) && !lexiconIntent(r.text)).length} phrasing(s) the lexicon does not decide`);
  console.log('    READ THIS BEFORE TRUSTING THE NUMBER. The exemplars carry no sector nouns');
  console.log('    by rule, and sector nouns are exactly what this layer exists to route');
  console.log('    ("menu", "treatments", "flavours"). So these are generic phrasings against');
  console.log('    generic fixture fields — a lower bound, and a thin one. The layer\'s real');
  console.log('    evidence is the labelled set, where it decides a handful of rows correctly.');
  console.log('    An independent corpus of sector-noun questions is the missing measurement;');
  console.log('    `npm run eval:propose` is how to start building one.');
  if (fieldRows.length < MIN_SAMPLE) {
    console.log(`    ${fieldRows.length} comparisons is too few to recommend anything (needs ${MIN_SAMPLE}).`);
    console.log('    Keeping the shipped thresholds, which the labelled set supports.');
  } else if (chosen) {
    console.log(`    suggested   field ${chosen.floor}  margin ${chosen.margin}  minShared ${chosen.minShared}` +
      `  → precision ${pct(chosen.precision)}  coverage ${pct(chosen.coverage)}`);
  } else {
    console.log(`    NO threshold reaches ${pct(TARGET)} — the layer needs work, not a lower bar`);
  }
  console.log(`    shipped     field ${THRESHOLDS.field}  margin ${THRESHOLDS.fieldMargin}  minShared ${THRESHOLDS.minShared}` +
    `  → precision ${pct(shipped.precision)}  coverage ${pct(shipped.coverage)}`);
  console.log('\n  Thresholds are NOT read from here at runtime, on purpose: a serverless');
  console.log('  function should not depend on a calibration artifact, and a threshold');
  console.log('  change should show up in a diff. Copy them into route.js by hand.\n');
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'router-calibration.json'), `${JSON.stringify(summary, null, 2)}\n`);
