// The matcher for config/intent-lexicon.js.
//
// Three surfaces, one authored term list:
//
//   FOLDED   normalizeText output — Arabic with articles attached, English
//            lowercased, punctuation gone. Arabic terms match as substrings
//            here so `سعر` finds `السعر`; English terms match with a leading
//            boundary and a free suffix so `rate` finds "rates" but not
//            "accurate".
//
//   SKELETON the consonant fold from vectorize.js, which is what makes Arabizi
//            work. Every ARABIC term is pushed through it at module load, so
//            `سعر` also matches `se3r` and `تفتح` also matches `tiftahoon`
//            without anyone authoring Latin-script Arabic by hand. English
//            terms are NOT folded — see the note at COMPILED.
//
// Skeleton terms shorter than three characters are DROPPED. `دوام` folds to
// `dm`, and a two-character substring matches far too much — the skeleton is a
// recall device and it has to stay subordinate to the exact surfaces, which is
// also why it is consulted per intent only where nothing exact matched.

import { ADVICE_FRAMES, INTENT_TERMS, PRECEDENCE } from '../../../config/intent-lexicon.js';
import { romanize, skeleton } from './vectorize.js';
import { normalizeText } from '../../../config/layla-qualification.js';

/** Shortest skeleton term worth matching. Below this the fold is ambiguous. */
export const MIN_SKELETON = 3;

const foldText = (text) => String(text || '').normalize('NFKC')
  .replace(/[^\p{L}\p{N}\s]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/** The folded surface a term or a message is matched against. */
export const fold = (text) => normalizeText(foldText(text));

/** The skeleton surface as one string. */
export const skeletonize = (text) => skeleton(romanize(fold(text)));

/** The skeleton surface as words. */
export const skeletonTokens = (text) => skeletonize(text).split(' ').filter(Boolean);

/**
 * Arabic clitics, as they survive the fold, that may be stripped from the
 * front of a skeleton word before comparing.
 *
 * Only the definite article and the prepositions that carry it. These attach in
 * Arabic script and are written separately in Arabizi — `الموقع` is one word
 * and `el mawqe3` is two — which is the ONE difference this surface has to
 * forgive. Everything else that could precede a stem is meaningful.
 */
const CLITICS = ['', 'l', 'w', 'wl', 'll', 'bl', 'fl'];

/** A skeleton word with each admissible leading clitic removed. */
function stems(word) {
  return CLITICS
    .filter((clitic) => word.startsWith(clitic) && word.length - clitic.length >= MIN_SKELETON)
    .map((clitic) => word.slice(clitic.length));
}

/**
 * Does every word of a term's skeleton appear in the message's skeleton?
 *
 * WORD BY WORD, and the comparison of two words is deliberately narrow: strip
 * a leading clitic from either side, then require one to be a PREFIX of the
 * other. Prefix, not containment, and that distinction is the whole rule.
 *
 * And in ONE direction only: the message's word may have MORE letters than the
 * term, never fewer. Extra letters at the end are Arabic inflection and must be
 * forgiven — `tfth` (تفتح) has to reach `tfthn` (tiftahoon). A message word
 * that is SHORTER than the term is missing consonants the term requires, and
 * accepting that matched `احذفني` ("delete me", folding to `hthfn`) against
 * `بكم هذا` ("how much is this", folding to `bkm hth`) — a false opt-out on a
 * price question, which is the worst outcome this file can produce.
 *
 * A difference at the START is a letter that means something, and forgiving it
 * is how this went wrong twice more:
 *
 *   Containment either way let `trsl` (لا ترسل, "do not send") match `rsl`
 *   (ارسل, "send"), so "ارسل لي الموقع" — send me the location — matched an
 *   opt-out term. `optout` outranks everything, so a customer asking for
 *   directions would have been silenced permanently and invisibly.
 *
 *   Matching the skeleton as one space-free string straddled word boundaries:
 *   "how long have you been open?" folds to `hlnghvybnpn`, which contains the
 *   `hln` of `حولني` ("transfer me") — and `human` outranks `hours`, so an
 *   opening-hours question became a handoff.
 *
 * Short words (< MIN_SKELETON) must match EXACTLY, and they are never
 * optional. Skipping them was also tried: `اوقف الرسائل` folds to `qf` +
 * `lrsl`, and ignoring `qf` left `lrsl` alone to carry an opt-out.
 */
function skeletonMatches(termTokens, textTokens) {
  return termTokens.every((term) => (term.length >= MIN_SKELETON
    ? textTokens.some((word) => word.length >= MIN_SKELETON
      && stems(term).some((t) => stems(word).some((w) => w.startsWith(t))))
    : textTokens.includes(term)));
}

/**
 * English terms need a leading boundary and only an INFLECTIONAL suffix.
 *
 * The leading boundary stops `rate` matching "accurate". The restricted
 * suffix stops the opposite mistake: an unrestricted suffix let `fee` match
 * "feen" — Arabizi for فين, "where" — and routed a location question to
 * prices. So `fee` may become "fees" and `specialit` may become "speciality"
 * or "specialities", but neither may run into an unrelated word.
 *
 * Arabic gets no leading boundary at all, because its article and prepositions
 * attach: a boundary before `سعر` would never match `السعر`.
 */
const INFLECTION = '(?:s|es|d|ed|ing|y|ies)?';
const englishMatcher = (term) => new RegExp(
  `(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${INFLECTION}([^a-z0-9]|$)`, 'u');

// Compiled once at import. ~250 terms: a few hundred microseconds.
const COMPILED = Object.entries(INTENT_TERMS).map(([intent, groups]) => {
  // `exactOnly` terms are matched on the Arabic surface like any other and are
  // never folded onto the skeleton — see config/intent-lexicon.js for why each
  // one is there.
  const arabic = [...(groups.ar || []), ...(groups.exactOnly || [])].map(fold).filter(Boolean);
  const english = (groups.en || []).map((term) => ({ term, re: englishMatcher(fold(term)) }));
  // Skeletons of the ARABIC terms ONLY.
  //
  // Folding the English terms too was measured and removed. English is already
  // matched exactly on the Latin surface, so its skeletons add no recall — and
  // they add real noise, because the fold is lossy in a language that writes
  // its vowels. `address` folds to `drs`, `orders` folds to `rdrs`, and so
  // "do you stop taking orders at 5?" routed to `location` on a substring of a
  // word that has nothing to do with it. The Arabic skeletons earn their place
  // for the opposite reason: Arabizi has no other surface to match on.
  // A term is usable on this surface only if it has at least one word long
  // enough to carry meaning. `دوام` folds to the two letters `dm`, which would
  // match by accident far more often than on purpose.
  const skeletons = (groups.ar || [])
    .map((term) => ({ term, tokens: skeletonTokens(term) }))
    .filter(({ tokens }) => tokens.some((token) => token.length >= MIN_SKELETON));
  return { intent, arabic, english, skeletons };
});

const rank = (intent) => {
  const i = PRECEDENCE.indexOf(intent);
  return i === -1 ? PRECEDENCE.length : i;
};

/**
 * Every intent whose vocabulary appears in `text`, strongest first.
 *
 * Ranked by PRECEDENCE, with the distinct-term count only as a tie-break.
 *
 * That order matters and it was the other way round first. Ranking by count
 * meant "وين موقعكم ومتى تفتحون؟" matched two location terms and one hours
 * term and answered with the address — while the regexes, and the decision
 * already taken, both say hours outranks location and prices outranks
 * everything. Whichever word the customer happened to use twice is not
 * evidence about what they want, so precedence leads and the count breaks ties
 * between intents of equal rank.
 *
 * Distinct terms, not occurrences: "price price price" is not three times the
 * evidence.
 *
 * @returns {Array<{intent: string, count: number, terms: string[]}>}
 */
export function lexiconHits(text) {
  const folded = fold(text);
  if (!folded) return [];

  const words = skeletonTokens(text);
  const hits = [];
  for (const { intent, arabic, english, skeletons } of COMPILED) {
    const terms = new Set();
    for (const term of arabic) if (folded.includes(term)) terms.add(term);
    for (const { term, re } of english) if (re.test(folded)) terms.add(term);
    // Skeleton evidence is consulted per intent, only where that intent has no
    // exact hit — so `terms` explains the decision honestly instead of padding
    // the count with a fold of a term that already matched.
    //
    // Per intent, NOT globally. A real mixed-script message carries both kinds
    // of evidence at once: "bkam el service?" has an exact English `service`
    // and an Arabizi `bkm` from بكم, and gating the skeleton on there being no
    // exact hit ANYWHERE meant the price word was never seen and an Arabizi
    // price question answered with a service list.
    if (!terms.size) {
      for (const { term, tokens } of skeletons) if (skeletonMatches(tokens, words)) terms.add(`~${term}`);
    }
    if (terms.size) hits.push({ intent, count: terms.size, terms: [...terms] });
  }
  return hits.sort((a, b) => rank(a.intent) - rank(b.intent) || b.count - a.count);
}

/**
 * The single intent this message's vocabulary points at, or null.
 *
 * @returns {{intent: string, count: number, terms: string[]}|null}
 */
export function lexiconIntent(text) {
  return lexiconHits(text)[0] ?? null;
}

// Compiled once, same two surfaces as the intent terms.
const ADVICE_ARABIC = (ADVICE_FRAMES.ar || []).map(fold).filter(Boolean);
const ADVICE_ENGLISH = (ADVICE_FRAMES.en || []).map((term) => englishMatcher(fold(term)));

/**
 * Is this message asking for advice about the SENDER rather than about the
 * business? If so, api/_lib/layla/route.js leaves the medical guard shut.
 *
 * @returns {boolean}
 */
export function asksForAdvice(text) {
  const folded = fold(text);
  if (!folded) return false;
  return ADVICE_ARABIC.some((term) => folded.includes(term))
    || ADVICE_ENGLISH.some((re) => re.test(folded));
}
