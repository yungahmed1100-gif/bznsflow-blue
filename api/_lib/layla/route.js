// Layla's intent router.
//
// THE PROBLEM THIS SOLVES. classify() in domain.js is eleven regexes, and the
// `services` rule knows five words. So a customer who asks about the THING
// rather than the CATEGORY — "what is on your menu?", "ما العلاجات التي
// تقدمونها؟", "what properties do you have?" — fell through to `unknown` and
// Layla replied "I don't have confirmed information about that" to a question
// whose answer was sitting in the tenant's profile. That was 24 of 29 misroutes
// in the labelled set, and no amount of added vocabulary fixes it: the nouns
// are an open set across 23 sectors and four language modes.
//
// THE SHAPE OF THE FIX. Two axes, not one longer regex.
//
//   INTENT — how much / when / where / what have you got. A small CLOSED
//   vocabulary, authored once in config/intent-lexicon.js and matched through
//   the folding pipeline, so one stem covers Arabic's attached articles and
//   inflections instead of enumerating surface forms. This is also where
//   Arabizi is won: the skeleton fold in vectorize.js puts `mata tiftahoon`
//   and `متى تفتحون` on the same consonants, which no Latin-script regex can.
//
//   Two LEARNED classifiers were built for this axis first and both were
//   measured and deleted — nearest neighbour over TF-IDF character n-grams at
//   56.8% leave-one-out, then Naive Bayes at 67.8%, against regexes already
//   scoring 79.9%. config/intent-lexicon.js records why, and it is the most
//   useful thing in this change to have written down.
//
//   VOCABULARY — that "treatments" means services for a dentist and "flavours"
//   means services for a cake shop. An OPEN set, and authored nowhere, because
//   THE TENANT ALREADY GAVE US THEIR OWN WORDS AT ONBOARDING. A dentist's
//   profile says "consultations, treatments, prices and reception support". So
//   the question is scored against the tenant's own approved field text, which
//   generalises to a sector nobody has thought of yet and needs no maintenance.
//
// WHY THIS CANNOT MAKE TODAY'S ANSWERS WORSE. The new layers are consulted
// ONLY where the regexes already returned `unknown`. Every question that
// routes correctly today takes the identical path and gets the identical
// answer; the layers below can only convert a refusal into an answer. That is
// a property of the control flow, not a claim about the scores, and
// tests/intent-routing.test.mjs pins it over the whole labelled set.
//
// WHAT IS DELIBERATELY NOT HERE. No LLM and no embedding call: answer() still
// returns profile[intent] verbatim, so the router chooses WHICH approved fact
// to send and can never author one. And FAQ matching is still exact string
// equality in review-profile.js — the vectorizer below is what will fix that,
// but changing the answer path is a separate measured step, so there is no
// half-wired FAQ code in here.

import { classifyWithGuard } from './guards.js';
import { asksForAdvice, lexiconIntent } from './lexicon.js';
import { buildIdf, cosine, features, weigh } from './vectorize.js';
import { EXEMPLARS } from '../../../config/intent-exemplars.js';
import { INDUSTRIES } from '../../../src/lib/industries.js';
import { prefillFor } from '../../../src/lib/sector-prefill.generated.js';

/** The four intents that read a profile field. The only ones a narrow medical
 *  guard may be overridden by, and the only ones the tenant's own text can
 *  vote for. */
export const FIELD_INTENTS = ['prices', 'hours', 'location', 'services'];
const CATALOGUE = new Set(FIELD_INTENTS);

/**
 * Decision thresholds for the profile layer, on SPARSE TF-IDF COSINE.
 *
 * NOT the 0.72 in docs/blue-rag-engine.md. That figure is for DENSE EMBEDDING
 * cosine — a space where two unrelated sentences still score ~0.6 because
 * every dimension is active. Sparse character-n-gram cosine lives somewhere
 * else entirely: a confident match here is 0.1–0.4 and an unrelated pair is
 * ~0.01, so carrying 0.72 across would reject every true match and silently
 * switch the layer off. Thresholds never transfer between similarity metrics.
 * These were chosen by scripts/calibrate-router.mjs, which is forbidden from
 * reading the evaluation set.
 */
export const THRESHOLDS = Object.freeze({
  /** The tenant's own field text must reach this cosine to carry a route. */
  field: 0.060,
  /** …and must lead the runner-up field, which is what stops a question from
   *  landing on whichever field happens to be longest. */
  fieldMargin: 0.015,
  /** An opt-out inferred from vocabulary rather than an exact phrase must be a
   *  SHORT message. "stop sending me the wrong size" is a complaint, not an
   *  opt-out, and length is the cheapest reliable signal. A false opt-out
   *  silences a live customer permanently and invisibly — nobody reports the
   *  messages they stopped receiving — so this one errs toward not firing. */
  optoutMaxWords: 8,
  /** Minimum background IDF a feature needs to take part in the profile
   *  comparison. Arabic attaches `ال` and `و` to almost every noun, so the
   *  n-grams of those prefixes appear in nearly all ~240 background documents
   *  and score an IDF of ~1.0, while a real content n-gram scores ~5. Left in,
   *  they are most of the vector and the cosine measures grammar instead of
   *  meaning: "ما الأطباق في قائمتكم؟" came within 0.009 of being answered
   *  with a price list on the strength of shared `ال`. This is the standard
   *  max-df cut, expressed as a floor on IDF. */
  idfFloor: 2.0,
  /** Content features the question and the winning field must actually share.
   *
   *  The IDF floor above is what makes this necessary. Filtering out the
   *  ubiquitous n-grams leaves small vectors, and cosine over a small vector is
   *  loud: three nonsense words scored 0.112 against a price list — comfortably
   *  over the floor — on four accidental n-grams. A real match shares far more
   *  ("what is on your menu?" shares 11 with a restaurant's services text,
   *  "what flavours are available?" shares 23), so the count separates them
   *  where the cosine alone cannot. */
  minShared: 6,
});

/**
 * Background IDF for the profile layer.
 *
 * Every sector's service description in both languages plus every authored
 * exemplar: ~240 short documents of exactly the kind of text being compared.
 * Enough for "what", "ما", "do you" and "لديكم" to lose their weight on their
 * own, with no stop list in any language to maintain. Built once at import.
 */
const BACKGROUND_IDF = buildIdf([
  ...INDUSTRIES.flatMap(({ id }) => ['en', 'ar']
    .map((lang) => prefillFor(id, lang)?.service)
    .filter(Boolean)
    .map((text) => features(text))),
  ...Object.values(EXEMPLARS).flat().map(([text]) => features(text)),
]);

/**
 * Features that carry meaning: everything above the IDF floor.
 *
 * A feature the background corpus has never seen keeps its default weight of
 * 1 in `weigh`, which would put it below the floor and throw it away — but an
 * unseen n-gram is the most informative kind there is, since it can only have
 * come from the tenant's own vocabulary. So unseen features are kept and only
 * the demonstrably ubiquitous ones are dropped.
 */
function contentFeatures(text) {
  const kept = new Map();
  for (const [key, count] of features(text)) {
    const idf = BACKGROUND_IDF.get(key);
    if (idf === undefined || idf >= THRESHOLDS.idfFloor) kept.set(key, count);
  }
  return kept;
}

/**
 * Which of the tenant's own profile fields does this question sound like?
 *
 * This is the layer that needs no authoring and no sector list. It works
 * because onboarding already collected the tenant's vocabulary in their own
 * words, and it improves on its own every time a tenant writes a fuller
 * profile — the guided ladder in src/lib/onboarding-ladder.js exists to make
 * that happen.
 *
 * IDF comes from a BACKGROUND CORPUS, not from the four candidate fields.
 * Four documents cannot tell a function word from a content word, which is the
 * mistake that sank the first version of the intent layer: over a tiny corpus
 * every term looks equally rare, so the longest shared frame wins. The
 * background corpus here is every sector's service description in both
 * languages plus every authored exemplar — around 240 short documents of
 * exactly this kind of text, which is enough for "what", "ما", "do you" and
 * "لديكم" to fall away on their own.
 *
 * @returns {{intent: string, score: number, margin: number}|null}
 */
export function fieldAffinity(text, profile) {
  const docs = FIELD_INTENTS
    .filter((field) => typeof profile?.[field] === 'string' && profile[field].trim())
    .map((field) => ({ id: field, text: profile[field] }));
  if (!docs.length) return null;
  const queryFeatures = contentFeatures(text);
  const query = weigh(queryFeatures, BACKGROUND_IDF);
  if (!query.size) return null;
  const ranked = docs
    .map((doc) => {
      const docFeatures = contentFeatures(doc.text);
      let shared = 0;
      for (const key of queryFeatures.keys()) if (docFeatures.has(key)) shared += 1;
      return { id: doc.id, shared, score: cosine(query, weigh(docFeatures, BACKGROUND_IDF)) };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const [top, second] = ranked;
  if (!top || top.score <= 0 || top.shared < THRESHOLDS.minShared) return null;
  return { intent: top.id, score: top.score, margin: top.score - (second?.score ?? 0), shared: top.shared };
}

/** Escape hatch. Set BLUE_INTENT_ROUTER_DISABLED=1 to fall straight back to
 *  the regexes with no redeploy of code — the router is new, and a way to turn
 *  a new thing off without shipping is worth the four lines. */
const disabled = () => process.env.BLUE_INTENT_ROUTER_DISABLED === '1';

/**
 * Route one inbound message to an intent.
 *
 * @param {string} text the customer's message
 * @param {object|null} profile the tenant's REVIEWED profile, for the
 *   vocabulary layer. Omitting it costs recall and nothing else.
 * @returns {{intent: string, via: string, score?: number, margin?: number, exemplar?: string}}
 *   `via` records which layer decided, so a misroute is diagnosable from the
 *   log line alone rather than by re-deriving it.
 */
export function route(text, profile = null) {
  const { intent, guard } = classifyWithGuard(String(text ?? ''));

  // Injection is never overridden by anything, at any score. A message trying
  // to talk Layla out of her instructions gets the refusal, full stop.
  if (guard === 'injection') return { intent: 'unknown', via: 'guard:injection' };

  // The regexes are precise where they fire. Anything they answer, they keep
  // answering — this is the line that makes the change non-regressive.
  if (intent !== 'unknown') return { intent, via: 'regex' };
  if (disabled()) return { intent: 'unknown', via: 'disabled' };

  const hit = lexiconIntent(text);
  if (hit) {
    // A medical guard may only be overridden when the message asks what the
    // BUSINESS offers and does not ask for advice about the SENDER.
    // "ما العلاجات التي تقدمونها؟" is a dentist's service list — `تقدمون` is
    // second person about the business. "ما العلاج المناسب لحالتي؟" carries
    // `لحالتي`, so the guard stays shut whatever else the message matches.
    const permitted = guard !== 'medical'
      || (CATALOGUE.has(hit.intent) && !asksForAdvice(text));
    const shortEnough = hit.intent !== 'optout'
      || String(text).trim().split(/\s+/).length <= THRESHOLDS.optoutMaxWords;
    if (permitted && shortEnough) {
      return { intent: hit.intent, via: 'lexicon', terms: hit.terms };
    }
  }

  // The tenant's own words. Deliberately NOT allowed to override a medical
  // guard: sharing vocabulary with the services blurb is not evidence about
  // intent, and "what treatment suits my condition" overlaps a dental services
  // list heavily while still being a question we must decline.
  if (guard !== 'medical') {
    const field = fieldAffinity(text, profile);
    if (field && field.score >= THRESHOLDS.field && field.margin >= THRESHOLDS.fieldMargin) {
      return { intent: field.intent, via: 'profile', score: field.score, margin: field.margin };
    }
  }

  return { intent: 'unknown', via: guard ? `guard:${guard}` : 'no_match' };
}
