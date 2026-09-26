import { useEffect, useMemo, useRef, useState } from 'react';
import {
  answerFaq, answerField, createLadder, nextRung, progress, skip, toProfilePatch,
} from '../../lib/onboarding-ladder.js';

/**
 * Guided setup — the staircase lane above the step-0 form.
 *
 * Asks one question at a time and writes each answer straight into the profile,
 * so the customer watches the form fill in rather than facing four blank
 * textareas and a collapsed FAQ section.
 *
 * Four constraints that are load-bearing, not stylistic:
 *
 *  1. STRICTLY ADDITIVE. It renders above the existing fields and removes,
 *     reorders and hides nothing. A customer who ignores it types exactly as
 *     they do today, so the screens a Meta reviewer walked through are intact.
 *  2. LOCAL STATE ONLY. convex/reviewState.js:35 refuses save_progress to any
 *     step but 0 until profile.reviewed is true, so a pre-profile conversational
 *     step cannot be a journeyStep. This lives inside step 0 and touches no API.
 *  3. EVERY WRITE IS UNREVIEWED. onApply must re-set reviewed:false, as all
 *     twelve existing setProfile sites do. The ladder drafts; the customer
 *     confirms with the checkbox. Never both.
 *  4. type="button" ON EVERY BUTTON. This subtree is inside a <form> whose
 *     submit handler is saveBusiness; a bare button would submit the profile.
 *
 * It also makes no catalog_* calls, so it works for a signed-out visitor —
 * those actions throw sign_in_required (api/_lib/layla/review-api.js:240-249).
 */
export function GuidedSetup({ lang = 'en', sectorId, busy = false, onApply, onDone }) {
  const ar = lang === 'ar';
  const tr = (en, arabic) => (ar ? arabic : en);

  const [ladder, setLadder] = useState(() => createLadder(sectorId, lang));
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [faqAnswer, setFaqAnswer] = useState('');
  const inputRef = useRef(null);

  // Sector picks the archetype, which picks every remaining question, so a
  // sector change has to rebuild the ladder rather than carry stale wording.
  useEffect(() => { setLadder(createLadder(sectorId, lang)); setDraft(''); setFaqAnswer(''); }, [sectorId, lang]);

  const rung = useMemo(() => (open ? nextRung(ladder) : null), [open, ladder]);
  const { done, total } = progress(ladder);

  // Move focus to each new question so the flow is usable from the keyboard
  // and announced by a screen reader.
  useEffect(() => { if (open && rung && rung.kind !== 'review') inputRef.current?.focus(); }, [open, rung]);

  function commit(next) {
    setLadder(next);
    onApply(toProfilePatch(next));
    setDraft('');
    setFaqAnswer('');
  }

  function submitField() {
    if (!rung || rung.kind !== 'field') return;
    commit(answerField(ladder, rung.field, draft));
  }

  function submitFaq() {
    if (!rung || rung.kind !== 'faq') return;
    if (!draft.trim() || !faqAnswer.trim()) return;
    commit(answerFaq(ladder, draft, faqAnswer));
  }

  function skipRung() {
    if (!rung) return;
    commit(skip(ladder, rung.kind === 'faq' ? 'faqs' : rung.id));
  }

  function finish() {
    setOpen(false);
    onDone?.();
  }

  if (!open) {
    return <section className="layla-answer layla-guided-panel" aria-labelledby="guided-heading">
      <h3 id="guided-heading">{tr('Not sure what to write?', 'غير متأكد ماذا تكتب؟')}
        <span className="layla-chip layla-chip--recommended">{tr('Recommended', 'موصى به')}</span></h3>
      <p>{tr('Answer a few short questions in your own words — Arabic or English — and we will fill this form in for you. You can still edit everything afterwards.',
        'أجب عن أسئلة قصيرة بكلماتك — بالعربية أو الإنجليزية — وسنملأ هذه الاستمارة لك. يمكنك تعديل كل شيء بعدها.')}</p>
      <button type="button" className="layla-primary" disabled={busy} onClick={() => setOpen(true)}>
        {done > 0
          ? tr('Continue the guided setup', 'متابعة الإعداد الموجّه')
          : tr('Guide me through it', 'أرشدني خطوة بخطوة')}
      </button>
      <p className="layla-guided-or">{tr('Or fill in the boxes below yourself.', 'أو املأ الخانات أدناه بنفسك.')}</p>
    </section>;
  }

  if (!rung) {
    return <section className="layla-answer layla-guided-panel layla-guided-done" aria-labelledby="guided-heading">
      <h3 id="guided-heading">{tr('All done', 'تم')}</h3>
      <p>{tr('Your answers are in the form below. Read them through, then confirm at the bottom.',
        'إجاباتك موجودة في الاستمارة بالأسفل. راجعها ثم أكّد في الأسفل.')}</p>
      <button type="button" className="layla-primary" onClick={finish}>{tr('Close', 'إغلاق')}</button>
    </section>;
  }

  return <section className="layla-answer layla-guided-panel" aria-labelledby="guided-heading">
    <h3 id="guided-heading">{tr('Guided setup', 'الإعداد الموجّه')}</h3>
    <div className="layla-guided-progress" style={{ '--total': total }} role="progressbar"
      aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}
      aria-label={tr('Guided setup progress', 'تقدّم الإعداد الموجّه')}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} data-done={i < done ? '' : undefined} data-current={i === done ? '' : undefined} />
      ))}
    </div>
    <p className="layla-field-help" aria-live="polite">
      {tr(`Question ${Math.min(done + 1, total)} of ${total}`, `السؤال ${Math.min(done + 1, total)} من ${total}`)}
    </p>

    {rung.kind === 'review'
      ? <>
        <p>{rung.question}</p>
        <small className="layla-field-help">{rung.help}</small>
        <button type="button" className="layla-primary" onClick={finish}>{tr('Looks right', 'تبدو صحيحة')}</button>
      </>
      : <>
        <label>{rung.question}
          <textarea
            ref={inputRef}
            dir="auto"
            rows={3}
            maxLength={rung.limit}
            value={draft}
            placeholder={rung.example || ''}
            onChange={(e) => setDraft(e.target.value)}
          />
        </label>
        <small className="layla-field-help">{rung.help}</small>

        {rung.kind === 'faq' && <>
          {!!rung.suggestions?.length && <div className="layla-quick-questions">
            {rung.suggestions.slice(0, 4).map((q) => (
              <button key={q} type="button" className="layla-secondary" disabled={busy} onClick={() => setDraft(q)}>{q}</button>
            ))}
          </div>}
          <label>{rung.answerQuestion}
            <textarea
              dir="auto"
              rows={3}
              maxLength={rung.answerLimit}
              value={faqAnswer}
              onChange={(e) => setFaqAnswer(e.target.value)}
            />
          </label>
          <small className="layla-field-help">{rung.answerHelp}</small>
        </>}

        <button
          type="button"
          className="layla-primary"
          disabled={busy || (rung.kind === 'faq' ? !draft.trim() || !faqAnswer.trim() : !draft.trim())}
          onClick={rung.kind === 'faq' ? submitFaq : submitField}
        >{tr('Next', 'التالي')}</button>
        <button type="button" className="layla-secondary" disabled={busy} onClick={skipRung}>
          {rung.kind === 'faq' ? tr('No more questions', 'لا أسئلة أخرى') : tr('Skip this', 'تخطّي')}
        </button>
      </>}

    <button type="button" className="layla-secondary" disabled={busy} onClick={() => setOpen(false)}>
      {tr('I will type it myself', 'سأكتبها بنفسي')}
    </button>
  </section>;
}
