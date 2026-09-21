// A deterministic lexical vectorizer, shared by everything in Layla that has
// to decide whether two pieces of text mean the same thing.
//
// No embedding model, no network, no vector table. Character n-grams over a
// folded Arabic/Latin surface, TF-IDF weighted, compared by cosine. At the
// sizes this actually runs on — one question against four profile fields and
// at most twelve FAQ questions — an exhaustive score is tens of microseconds,
// which is what the sub-500 ms p95 budget in docs/blue-rag-engine.md needs.
//
// Determinism is the whole point, not a side effect. A pure function of the
// text can be gated by scripts/eval-intents.mjs, reproduced from a transcript,
// and reasoned about in a review. An embedding API call can be none of those.
//
// WHY CHARACTER N-GRAMS AND NOT WORDS. Arabic is heavily inflected and typed
// without diacritics, so one concept arrives as many tokens: علاج، العلاج،
// العلاجات، علاجات are four surface forms of one word. A word-boundary match —
// which is exactly what classify()'s regexes are — has to enumerate the forms
// and will always miss one. A 3-gram over the folded form shares علا and لاج
// across all four at no cost, and the same mechanism absorbs typos and the
// English plural/gerund drift ("price"/"prices"/"pricing") for free.

import { normalizeText } from '../../../config/layla-qualification.js';

/**
 * Arabic letter → plain Latin. Not a transliteration standard and not meant to
 * be readable: it exists so that Arabic script and Arabizi (Arabic typed in
 * Latin letters) land in one comparable space. See `skeleton`.
 */
const ROMAN = {
  ا: 'a', ب: 'b', ت: 't', ث: 'th', ج: 'j', ح: 'h', خ: 'kh', د: 'd', ذ: 'th',
  ر: 'r', ز: 'z', س: 's', ش: 'sh', ص: 's', ض: 'd', ط: 't', ظ: 'z', ع: '3',
  غ: 'gh', ف: 'f', ق: 'q', ك: 'k', ل: 'l', م: 'm', ن: 'n', ه: 'h', و: 'w',
  ي: 'y', ء: '', ؤ: 'w', ئ: 'y', ى: 'y', ة: 'h', ٱ: 'a', ک: 'k', ی: 'y', گ: 'g', پ: 'p', چ: 'ch', ژ: 'zh',
};

/**
 * The Arabizi digit convention, folded to the same Latin letters ROMAN emits.
 * Gulf users type `7` for ح, `3` for ع, `8` for ق. ع keeps its digit because
 * there is no Latin letter for it and both sides agree on `3`.
 */
const ARABIZI_DIGITS = { 2: '', 3: '3', 5: 'kh', 6: 't', 7: 'h', 8: 'q', 9: 's' };

/**
 * Gulf pronunciation folded onto the letters `romanize` emits.
 *
 * ق is a hard `g` across the Gulf, so قهوة is typed `gahwa` and وقف is typed
 * `wagef` — while `romanize` produces `q` from the Arabic script. Without this
 * the two never meet. Applied to BOTH sides, so `غ` → `gh` → `qh` on the term
 * and on the message alike and nothing drifts apart.
 */
const DIALECT = { g: 'q' };

/** Keep letters, digits and single spaces. Punctuation carries no signal here
 *  and `؟` vs `?` would otherwise split every Arabic question in two. */
const strip = (text) => String(text || '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

/** Arabic script → Latin, passing Latin and digits through untouched. */
export function romanize(text) {
  let out = '';
  for (const ch of String(text || '')) {
    if (ch in ROMAN) out += ROMAN[ch];
    else if (/[a-z0-9\s]/.test(ch)) out += ch;
    else out += ' ';
  }
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * The consonant skeleton of a Latin string — the bridge that lets Arabizi meet
 * Arabic script.
 *
 * Arabic script writes long vowels with و and ي and omits short vowels
 * entirely; Arabizi writes all of them with a/e/i/o/u, inconsistently, because
 * there is no spelling standard. So `wen el mawqe3` and `ween al maw8i3` and
 * `وين الموقع` are one question typed three ways, and no amount of regex
 * covers the third. Dropping short vowels, dropping و/ي unless they open a
 * word, and collapsing doubled letters folds all three onto `wn l mq3`.
 *
 * Deliberately crude. It is a recall device, scored in its own feature
 * namespace (`s:`) alongside the unfolded ones, so when it over-folds — and it
 * does, `bat` and `bt` collapse together — the exact features still carry the
 * decision and the skeleton only breaks ties.
 */
export function skeleton(latin) {
  let folded = '';
  for (const ch of String(latin || '')) {
    folded += ch in ARABIZI_DIGITS ? ARABIZI_DIGITS[ch] : (DIALECT[ch] ?? ch);
  }
  let out = '';
  let wordStart = true;
  for (const ch of folded) {
    if (ch === ' ') { out += ' '; wordStart = true; continue; }
    const isShortVowel = 'aeiou'.includes(ch);
    const isLongVowel = (ch === 'w' || ch === 'y') && !wordStart;
    if (!isShortVowel && !isLongVowel) out += ch;
    wordStart = false;
  }
  return out.replace(/(.)\1+/g, '$1').replace(/\s+/g, ' ').trim();
}

/** Character n-gram range. 3 catches Arabic roots, 4 disambiguates them. */
const NGRAM_MIN = 3;
const NGRAM_MAX = 4;
/** Longer text is truncated rather than rejected: a rambling message should
 *  still route, and beyond this the n-grams stop adding signal. */
export const MAX_CHARS = 600;

/**
 * Raw feature counts for one piece of text, in three namespaces:
 *
 *   w:  whole words        — the strongest and most legible signal
 *   c:  char 3/4-grams     — morphology, plurals, typos
 *   s:  skeleton 3-grams   — the Arabizi ↔ Arabic bridge
 *
 * This is the ONLY featurizer. scripts/gen-intent-model.mjs trains through it
 * and api/_lib/layla/route.js serves through it, because train/serve feature
 * skew is the classic way a text classifier scores well offline and then fails
 * live, and the only reliable defence is having one implementation.
 *
 * @returns {Map<string, number>} feature → count
 */
export function features(text) {
  const base = strip(normalizeText(String(text || '').slice(0, MAX_CHARS)));
  const counts = new Map();
  if (!base) return counts;
  const add = (key) => counts.set(key, (counts.get(key) || 0) + 1);

  for (const word of base.split(' ')) if (word.length >= 2) add(`w:${word}`);

  const padded = ` ${base} `;
  for (let n = NGRAM_MIN; n <= NGRAM_MAX; n += 1) {
    for (let i = 0; i + n <= padded.length; i += 1) add(`c:${padded.slice(i, i + n)}`);
  }

  const bridge = ` ${skeleton(romanize(base))} `;
  for (let i = 0; i + 3 <= bridge.length; i += 1) add(`s:${bridge.slice(i, i + 3)}`);

  return counts;
}

/** Sublinear term frequency. One mention of "price" already means the question
 *  is about price; five mentions do not mean it five times as much.
 *  Exported so api/_lib/layla/intent-model.js weighs its counts identically —
 *  two different term-frequency curves in one router is a silent skew. */
export const tf = (count) => 1 + Math.log(count);

/**
 * Inverse document frequency over a small corpus, smoothed.
 *
 * Computed at call time from whatever documents are being compared, not
 * precomputed from a training corpus, because the documents here ARE the
 * corpus: one tenant's four profile fields and their FAQ list. That is what
 * makes a term like "prices" — which appears in almost every sector's service
 * description, so discriminates nothing — get downweighted automatically for
 * that tenant without anyone maintaining a stop list.
 *
 * @param {Array<Map<string, number>>} docs feature counts per document
 * @returns {Map<string, number>} feature → idf
 */
export function buildIdf(docs) {
  const df = new Map();
  for (const doc of docs) for (const key of doc.keys()) df.set(key, (df.get(key) || 0) + 1);
  const n = docs.length;
  const idf = new Map();
  for (const [key, count] of df) idf.set(key, Math.log((n + 1) / (count + 1)) + 1);
  return idf;
}

/**
 * L2-normalized TF-IDF vector. Normalizing is what makes cosine a similarity
 * and not a length contest — otherwise the longest profile field wins every
 * comparison regardless of what it says.
 *
 * @param {Map<string, number>} counts from `features`
 * @param {Map<string, number>} [idf] from `buildIdf`; absent means all-ones
 */
export function weigh(counts, idf) {
  const vector = new Map();
  let sumSquares = 0;
  for (const [key, count] of counts) {
    const value = tf(count) * (idf ? idf.get(key) ?? 1 : 1);
    if (!value) continue;
    vector.set(key, value);
    sumSquares += value * value;
  }
  if (!sumSquares) return vector;
  const norm = Math.sqrt(sumSquares);
  for (const [key, value] of vector) vector.set(key, value / norm);
  return vector;
}

/** Cosine similarity of two L2-normalized vectors, iterating the shorter one. */
export function cosine(a, b) {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [key, value] of small) {
    const other = large.get(key);
    if (other) dot += value * other;
  }
  return dot;
}

/**
 * Rank documents against a query, most similar first.
 *
 * @param {string} query
 * @param {Array<{id: string, text: string}>} docs
 * @returns {Array<{id: string, score: number}>} every doc, descending, ties by id
 */
export function rank(query, docs) {
  const bodies = docs.map((doc) => features(doc.text));
  const idf = buildIdf([...bodies, features(query)]);
  const q = weigh(features(query), idf);
  return docs
    .map((doc, i) => ({ id: doc.id, score: cosine(q, weigh(bodies[i], idf)) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
