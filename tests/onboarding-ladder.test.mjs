import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INDUSTRIES } from '../src/lib/industries.js';
import { prefillFor } from '../src/lib/sector-prefill.generated.js';
import { ARCHETYPES, DEFAULT_ARCHETYPE, FAQ_TARGET, FIELD_RUNGS, OWNER_QUESTIONS }
  from '../src/lib/owner-questions.js';
import { LIMITS, answerFaq, answerField, createLadder, nextRung, progress, skip, toProfilePatch }
  from '../src/lib/onboarding-ladder.js';
import { validateReviewProfile } from '../api/_lib/layla/review-profile.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Walk the ladder to the end, answering everything. Returns [state, rungIds]. */
function walk(sector, lang = 'en', { answer = () => 'a real answer from the owner' } = {}) {
  let state = createLadder(sector, lang);
  const seen = [];
  for (let guard = 0; guard < 50; guard++) {
    const rung = nextRung(state);
    if (!rung) return [state, seen];
    seen.push(rung.id);
    if (rung.kind === 'field') state = answerField(state, rung.field, answer(rung));
    else if (rung.kind === 'faq') state = answerFaq(state, `question ${state.faqs.length + 1}?`, 'the answer');
    else state = skip(state, rung.id);
  }
  throw new Error(`ladder did not terminate for ${sector}`);
}

// --- totality ---------------------------------------------------------------

test('the ladder terminates for every sector, answering everything', () => {
  for (const { id } of INDUSTRIES) {
    for (const lang of ['en', 'ar']) {
      const [, seen] = walk(id, lang);
      assert.ok(seen.length >= FIELD_RUNGS.length, `${id}/${lang} asked only ${seen.length} rungs`);
      assert.ok(seen.includes('review'), `${id}/${lang} never reached review`);
    }
  }
});

test('the ladder terminates for every sector when everything is skipped', () => {
  for (const { id } of INDUSTRIES) {
    let state = createLadder(id, 'ar');
    for (let guard = 0; guard < 50; guard++) {
      const rung = nextRung(state);
      if (!rung) break;
      state = skip(state, rung.kind === 'faq' ? 'faqs' : rung.id);
      if (guard === 49) throw new Error(`skipping did not terminate for ${id}`);
    }
    assert.equal(nextRung(state), null, `${id} still had a rung after skipping all`);
  }
});

test('a half-filled ladder resumes where it left off', () => {
  let state = createLadder('dental', 'en');
  state = answerField(state, 'services', 'Cleaning and whitening');
  const rung = nextRung(state);
  assert.equal(rung.field, 'prices', 'should move to the next unanswered field');
  state = skip(state, 'prices');
  assert.equal(nextRung(state).field, 'hours');
});

// --- the profile contract ---------------------------------------------------

test('every field rung maps to a real profile field', () => {
  // The ladder must not invent a field the server would drop or reject.
  const accepted = ['sector', 'services', 'prices', 'hours', 'location', 'humanContact'];
  for (const field of FIELD_RUNGS) assert.ok(accepted.includes(field), `${field} is not a profile field`);
});

test('a completed ladder produces a patch the server validator accepts', () => {
  const [state] = walk('cakes', 'ar');
  const patch = toProfilePatch(state);
  // The ladder never sets these two, so the form still supplies them.
  const submitted = { ...patch, sector: 'Cakes', humanContact: '+96899999999', reviewed: true };
  const validated = validateReviewProfile(submitted);
  assert.equal(validated.services, patch.services);
  assert.equal(validated.faqs.length, FAQ_TARGET);
});

test('the patch always arrives unreviewed, whatever was answered', () => {
  // The one invariant that cannot regress: drafted facts are never confirmed
  // facts. review-profile.js:6 refuses a profile without reviewed === true, and
  // the customer ticking the box is the only thing that sets it.
  const [full] = walk('dental', 'en');
  assert.equal(toProfilePatch(full).reviewed, false);
  assert.equal(toProfilePatch(createLadder('dental', 'en')).reviewed, false);
  let skippedAll = createLadder('cafe', 'ar');
  for (const field of FIELD_RUNGS) skippedAll = skip(skippedAll, field);
  assert.equal(toProfilePatch(skippedAll).reviewed, false);
});

test('a skipped rung never overwrites what the customer typed in the form', () => {
  // toProfilePatch omits empty fields, so spreading it over an existing profile
  // cannot blank a field the ladder was not told about.
  let state = createLadder('retail', 'en');
  state = answerField(state, 'services', 'Phones and accessories');
  state = skip(state, 'prices');
  const patch = toProfilePatch(state);
  assert.equal(patch.services, 'Phones and accessories');
  assert.ok(!('prices' in patch), 'a skipped field must be absent, not empty');
  assert.equal({ prices: 'typed by hand', ...patch }.prices, 'typed by hand');
});

test('over-long answers are clamped, not rejected', () => {
  const long = 'x'.repeat(5000);
  let state = createLadder('hvac', 'en');
  state = answerField(state, 'services', long);
  state = answerFaq(state, long, long);
  const patch = toProfilePatch(state);
  assert.equal(patch.services.length, LIMITS.field);
  assert.equal(patch.faqs[0].question.length, LIMITS.faqQuestion);
  assert.equal(patch.faqs[0].answer.length, LIMITS.faqAnswer);
  // And the clamped result must still satisfy the server.
  validateReviewProfile({ ...patch, sector: 'HVAC', humanContact: 'a@b.test', reviewed: true });
});

test('an empty answer is a skip, and a half FAQ is not stored', () => {
  let state = createLadder('legal', 'en');
  state = answerField(state, 'services', '   ');
  assert.ok(!('services' in toProfilePatch(state)), 'blank must not be stored');
  assert.equal(nextRung(state).field, 'prices', 'blank must advance');
  const before = state.faqs.length;
  state = answerFaq(state, 'a question?', '');
  state = answerFaq(state, '', 'an answer');
  assert.equal(state.faqs.length, before, 'a one-sided FAQ must not be stored');
});

test('duplicate FAQ questions are refused', () => {
  let state = createLadder('cafe', 'en');
  state = answerFaq(state, 'Do you deliver?', 'Yes, across Muscat.');
  state = answerFaq(state, 'Do you deliver?', 'A different answer.');
  assert.equal(state.faqs.length, 1);
  assert.equal(state.faqs[0].answer, 'Yes, across Muscat.');
});

// --- archetype routing ------------------------------------------------------

test('each sector gets its own archetype question set, from the generated data', () => {
  for (const { id } of INDUSTRIES) {
    const archetype = prefillFor(id).archetype || DEFAULT_ARCHETYPE;
    assert.ok(ARCHETYPES.includes(archetype), `${id} resolved to ${archetype}`);
    const state = createLadder(id, 'en');
    assert.equal(state.archetype, archetype);
    const rung = nextRung(state);
    assert.equal(rung.question, OWNER_QUESTIONS[archetype].services.question.en, `${id} got the wrong wording`);
  }
});

test('booking, catalog and project ask genuinely different questions', () => {
  const asked = ARCHETYPES.map((a) => OWNER_QUESTIONS[a].services.question.en);
  assert.equal(new Set(asked).size, ARCHETYPES.length, 'archetypes must not share wording');
  // Spot-check the real mapping rather than a hardcoded sector list.
  assert.equal(prefillFor('dental').archetype, 'booking');
  assert.equal(prefillFor('cafe').archetype, 'catalog');
  assert.equal(prefillFor('hvac').archetype, 'project');
  // `other` has no sector pack, so it must fall back rather than crash.
  assert.equal(createLadder('other', 'en').archetype, DEFAULT_ARCHETYPE);
  assert.equal(createLadder('not-a-sector', 'en').archetype, DEFAULT_ARCHETYPE);
});

test('every archetype has complete bilingual copy for every field rung', () => {
  for (const archetype of ARCHETYPES) {
    for (const field of FIELD_RUNGS) {
      const copy = OWNER_QUESTIONS[archetype]?.[field];
      assert.ok(copy, `${archetype}.${field} is missing`);
      for (const part of ['question', 'help', 'example']) {
        for (const lang of ['en', 'ar']) {
          assert.ok(copy[part]?.[lang]?.trim().length > 8, `${archetype}.${field}.${part}.${lang} too short`);
        }
      }
      assert.match(copy.question.ar, /[؀-ۿ]/, `${archetype}.${field} ar is not Arabic`);
      assert.doesNotMatch(copy.question.ar, /[a-z]{4,}/i, `${archetype}.${field} ar contains English`);
    }
  }
});

// --- language and progress --------------------------------------------------

test('Arabic and English ask the same rungs with different words', () => {
  const [, en] = walk('beauty', 'en');
  const [, ar] = walk('beauty', 'ar');
  assert.deepEqual(en, ar, 'the rung sequence must not depend on language');
  assert.notEqual(nextRung(createLadder('beauty', 'en')).question, nextRung(createLadder('beauty', 'ar')).question);
});

test('progress advances monotonically and never exceeds the total', () => {
  let state = createLadder('events', 'en');
  let last = -1;
  for (let guard = 0; guard < 50; guard++) {
    const { done, total } = progress(state);
    assert.ok(done >= last, `progress went backwards: ${last} -> ${done}`);
    assert.ok(done <= total, `progress ${done} exceeded total ${total}`);
    last = done;
    const rung = nextRung(state);
    if (!rung) break;
    state = rung.kind === 'field' ? answerField(state, rung.field, 'answer')
      : rung.kind === 'faq' ? answerFaq(state, `q${state.faqs.length}?`, 'a') : skip(state, rung.id);
  }
  assert.equal(progress(state).done, progress(state).total);
});

test('FAQ suggestions come from the sector and never repeat one already added', () => {
  const state = createLadder('dental', 'en');
  const first = nextRung(skip(skip(skip(skip(state, 'services'), 'prices'), 'hours'), 'location'));
  assert.equal(first.kind, 'faq');
  assert.ok(first.suggestions.length > 0, 'dental should suggest questions');
  const used = first.suggestions[0];
  const after = nextRung(answerFaq(
    skip(skip(skip(skip(state, 'services'), 'prices'), 'hours'), 'location'), used, 'an answer'));
  assert.ok(!after.suggestions.includes(used), 'a used suggestion must not be offered again');
});

// --- the coverage gate ------------------------------------------------------

test('the onboarding coverage gate passes and reports what it checked', () => {
  const out = execFileSync(process.execPath, [join(ROOT, 'scripts/check-onboarding-coverage.mjs')], { encoding: 'utf8' });
  assert.match(out, /in sync/);
  const counts = out.match(/(\d+) sectors, (\d+) archetypes/);
  assert.ok(counts, `unexpected output: ${out}`);
  assert.equal(Number(counts[1]), INDUSTRIES.length);
  assert.equal(Number(counts[2]), ARCHETYPES.length);
});
