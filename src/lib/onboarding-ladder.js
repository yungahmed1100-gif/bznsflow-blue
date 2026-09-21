// The guided-setup ladder: one question at a time, each answer in the
// customer's own words.
//
// Pure — no React, no fetch, no storage — so the whole flow is unit-testable
// the way api/_lib/layla/domain.js is. The component that renders it is a thin
// shell over `nextRung`.
//
// WHY A LADDER. Step 0 asks for four free-text fields and up to twelve FAQ
// pairs in one form, most of them blank textareas a business owner must compose
// from nothing. Asking one focused question at a time, with a real example of
// what a good answer looks like, is the whole idea.
//
// WHY THE ANSWERS ARE STORED VERBATIM. `answer()` in domain.js returns
// profile[intent] WORD FOR WORD. The customer's own sentence is therefore not
// a rough input to be cleaned up — it IS the reply Layla will send. Paraphrasing
// it would make the answer worse, and inventing any of it would break the one
// guarantee this product rests on.
//
// WHY THE BRANCHING IS DUMB. It branches only on sector archetype and on which
// fields are still empty. Reading an answer's content to skip ahead ("did they
// mention a price?") is classify()-shaped regex work, and the eval harness
// measured how poorly that generalises across Arabic dialects. Reliable beats
// clever here.

import { prefillFor } from './sector-prefill.generated.js';
import { DEFAULT_ARCHETYPE, FAQ_COPY, FAQ_TARGET, FIELD_RUNGS, REVIEW_COPY, questionsFor }
  from './owner-questions.js';

/**
 * The real limits from api/_lib/layla/review-profile.js. Duplicated here on
 * purpose: this module clamps so the server never has to reject, and a mismatch
 * is caught by tests/onboarding-ladder.test.mjs asserting a completed ladder
 * passes validateReviewProfile.
 */
export const LIMITS = { field: 350, faqQuestion: 200, faqAnswer: 700 };

/** Trim and clamp one answer to what the profile contract accepts. */
export const clamp = (value, limit) => String(value ?? '').trim().slice(0, limit);

/** A fresh ladder for one sector. `skipped` is a list of rung ids. */
export function createLadder(sectorId, lang = 'en') {
  const { archetype, questions } = prefillFor(sectorId, lang);
  return {
    sector: sectorId,
    lang: lang === 'ar' ? 'ar' : 'en',
    archetype: archetype || DEFAULT_ARCHETYPE,
    answers: {},
    faqs: [],
    skipped: [],
    // The archetype examples are sector-neutral by design, but `services` has a
    // per-sector description already authored and drift-gated, so use it where
    // specificity actually helps. Never a default value — only a placeholder.
    serviceExample: prefillFor(sectorId, lang).service || '',
    // The FAQ suggestions already shown as chips in onboarding, reused so the
    // ladder and the form offer the same wording rather than two vocabularies.
    faqSuggestions: Array.isArray(questions) ? questions : [],
  };
}

const isSkipped = (state, id) => state.skipped.includes(id);
const isAnswered = (state, field) => !!clamp(state.answers[field], LIMITS.field);

/**
 * The next question, or null when the ladder is finished.
 *
 * Field rungs come first, in FIELD_RUNGS order, then FAQ pairs up to
 * FAQ_TARGET, then a review rung. Every rung is optional: skipping always
 * advances, so the ladder terminates from any state.
 *
 * @returns {{id:string,kind:'field'|'faq'|'review',field?:string,question:string,
 *   help:string,example?:string,suggestions?:string[],limit:number}|null}
 */
export function nextRung(state) {
  const ar = state.lang === 'ar';
  const pick = (pair) => (ar ? pair.ar : pair.en);
  const bank = questionsFor(state.archetype);

  for (const field of FIELD_RUNGS) {
    if (isAnswered(state, field) || isSkipped(state, field)) continue;
    const copy = bank[field];
    return {
      id: field,
      kind: 'field',
      field,
      question: pick(copy.question),
      help: pick(copy.help),
      example: field === 'services' && state.serviceExample ? state.serviceExample : pick(copy.example),
      limit: LIMITS.field,
    };
  }

  if (state.faqs.length < FAQ_TARGET && !isSkipped(state, 'faqs')) {
    const used = new Set(state.faqs.map((f) => f.question));
    return {
      id: `faq:${state.faqs.length}`,
      kind: 'faq',
      question: pick(FAQ_COPY.question),
      help: pick(FAQ_COPY.help),
      answerQuestion: pick(FAQ_COPY.answerQuestion),
      answerHelp: pick(FAQ_COPY.answerHelp),
      suggestions: state.faqSuggestions.filter((q) => !used.has(q)),
      limit: LIMITS.faqQuestion,
      answerLimit: LIMITS.faqAnswer,
    };
  }

  if (!isSkipped(state, 'review')) {
    return { id: 'review', kind: 'review', question: pick(REVIEW_COPY.question), help: pick(REVIEW_COPY.help), limit: 0 };
  }
  return null;
}

/** Record a field answer. An empty value is a skip, never a stored blank. */
export function answerField(state, field, value) {
  if (!FIELD_RUNGS.includes(field)) return state;
  const text = clamp(value, LIMITS.field);
  if (!text) return skip(state, field);
  return { ...state, answers: { ...state.answers, [field]: text }, skipped: state.skipped.filter((id) => id !== field) };
}

/** Record one FAQ pair. Both halves are required — a question with no answer is not an FAQ. */
export function answerFaq(state, question, answer) {
  const q = clamp(question, LIMITS.faqQuestion);
  const a = clamp(answer, LIMITS.faqAnswer);
  if (!q || !a) return state;
  if (state.faqs.some((f) => f.question === q)) return state;
  return { ...state, faqs: [...state.faqs, { question: q, answer: a }] };
}

/** Skip a rung. Always advances, which is what makes the ladder total. */
export function skip(state, id) {
  return isSkipped(state, id) ? state : { ...state, skipped: [...state.skipped, id] };
}

/** How far along the ladder is, for a progress indicator. */
export function progress(state) {
  const total = FIELD_RUNGS.length + 1;
  const done = FIELD_RUNGS.filter((f) => isAnswered(state, f) || isSkipped(state, f)).length
    + (state.faqs.length >= FAQ_TARGET || isSkipped(state, 'faqs') ? 1 : 0);
  return { done: Math.min(done, total), total };
}

/**
 * The profile patch this ladder produces.
 *
 * `reviewed: false` is not negotiable. Every existing setProfile call site in
 * onboarding sets it, api/_lib/layla/review-profile.js:6 refuses any profile
 * without `reviewed === true`, and domain.js:60 refuses to send for one. The
 * ladder drafts; the customer confirms. Anything else would let someone ship
 * facts they never read.
 *
 * Only non-empty fields are returned, so a skipped rung never overwrites
 * something the customer typed directly into the form.
 */
export function toProfilePatch(state) {
  const patch = { reviewed: false };
  for (const field of FIELD_RUNGS) {
    const text = clamp(state.answers[field], LIMITS.field);
    if (text) patch[field] = text;
  }
  if (state.faqs.length) patch.faqs = state.faqs.map((f) => ({ question: f.question, answer: f.answer }));
  return patch;
}
