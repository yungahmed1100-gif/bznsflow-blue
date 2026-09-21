#!/usr/bin/env node
/**
 * check-lexicon.mjs — fail the build on a lexicon term that can never match.
 *
 *   node scripts/check-lexicon.mjs
 *
 * WHY THIS IS A BUILD GATE AND NOT A CODE REVIEW. config/intent-lexicon.js is
 * matched against FOLDED text: NFKC, lowercased, أإآ→ا, ى→ي, ة→ه, diacritics
 * and tatweel stripped, punctuation gone. A term authored in any other form —
 * `شكوى` instead of `شكوي`, `Hours` instead of `hours`, `كم سعر؟` with the
 * question mark still on it — is not an error. It compiles, it runs, and it
 * silently never fires. The routing quietly gets worse and the eval score
 * drops by one row that nobody can explain.
 *
 * That is exactly the failure mode a gate is for, and the file it guards is
 * meant to be edited by whoever knows the Arabic rather than whoever knows the
 * JavaScript. This tells them, at build time, in one line, what to write
 * instead.
 *
 * Checks, in order of how quietly each one fails:
 *   1. every term is already in its folded form
 *   2. no term is empty, or so short it would match half the language
 *   3. every intent is one classify() can actually return
 *   4. every intent has a precedence rank, and PRECEDENCE has no strays
 *   5. no term is duplicated within an intent
 *   6. no term appears under two different intents, where precedence would
 *      silently decide which one wins
 *   7. every Arabic-script term is Arabic and every English term is Latin,
 *      because a term in the wrong group gets the wrong matching rule
 */

import { ADVICE_FRAMES, INTENT_TERMS, PRECEDENCE } from '../config/intent-lexicon.js';
import { fold } from '../api/_lib/layla/lexicon.js';
import { CLASSIFY_INTENTS } from '../config/eval-questions.js';

/** Shortest term worth having. Two characters matches far too much in either
 *  language, and in Arabic it matches part of almost every word. */
const MIN_TERM = 3;

const problems = [];
const note = (message) => problems.push(message);

const hasArabic = (text) => /[؀-ۿ]/.test(text);
const hasLatin = (text) => /[a-z]/i.test(text);

let terms = 0;
const seen = new Map();

for (const [intent, groups] of Object.entries(INTENT_TERMS)) {
  if (!CLASSIFY_INTENTS.includes(intent)) {
    note(`intent "${intent}" is not one classify() can return. Valid: ${CLASSIFY_INTENTS.join(', ')}`);
  }
  if (!PRECEDENCE.includes(intent)) note(`intent "${intent}" has no rank in PRECEDENCE`);

  const unknownGroups = Object.keys(groups).filter((key) => !['ar', 'en', 'exactOnly'].includes(key));
  if (unknownGroups.length) note(`intent "${intent}" has unknown group(s): ${unknownGroups.join(', ')}`);

  const withinIntent = new Set();
  for (const [group, list] of Object.entries(groups)) {
    for (const term of list) {
      terms += 1;
      if (typeof term !== 'string' || !term.trim()) { note(`${intent}.${group} has an empty term`); continue; }
      const folded = fold(term);
      if (folded !== term.toLowerCase()) {
        note(`${intent}.${group} term "${term}" is not folded — write "${folded}"`);
      }
      if (folded.length < MIN_TERM) {
        note(`${intent}.${group} term "${term}" is ${folded.length} character(s); ${MIN_TERM} is the minimum`);
      }
      if (withinIntent.has(folded)) note(`${intent} lists "${term}" more than once`);
      withinIntent.add(folded);

      const owner = seen.get(folded);
      if (owner && owner !== intent) {
        note(`term "${term}" appears under both "${owner}" and "${intent}" — ` +
          'precedence would decide silently. Make one of them more specific.');
      }
      seen.set(folded, intent);

      // `ar` and `exactOnly` are matched as bare substrings; `en` gets a word
      // boundary and an inflectional suffix. A term in the wrong group is
      // matched by the wrong rule, which is another silent miss.
      if (group === 'en' && hasArabic(term)) note(`${intent}.en term "${term}" is Arabic — move it to .ar`);
      if ((group === 'ar' || group === 'exactOnly') && !hasArabic(term) && hasLatin(term)) {
        note(`${intent}.${group} term "${term}" is Latin — move it to .en`);
      }
    }
  }
}

for (const intent of PRECEDENCE) {
  if (!INTENT_TERMS[intent]) note(`PRECEDENCE ranks "${intent}", which has no terms`);
}

for (const [group, list] of Object.entries(ADVICE_FRAMES)) {
  for (const frame of list) {
    terms += 1;
    const folded = fold(frame);
    if (folded !== frame.toLowerCase()) note(`ADVICE_FRAMES.${group} "${frame}" is not folded — write "${folded}"`);
    if (folded.length < MIN_TERM) note(`ADVICE_FRAMES.${group} "${frame}" is too short`);
  }
}

if (problems.length) {
  console.error(`\n✖ check-lexicon: ${problems.length} problem(s) in config/intent-lexicon.js\n`);
  for (const problem of problems) console.error(`  · ${problem}`);
  console.error('\n  Terms are matched against FOLDED text. Author the folded form or the term');
  console.error('  compiles, runs, and never fires — see the header of this script.\n');
  process.exit(1);
}

const intents = Object.keys(INTENT_TERMS).length;
console.log(`✓ check-lexicon: in sync — ${terms} terms across ${intents} intents, all folded and unambiguous.`);
