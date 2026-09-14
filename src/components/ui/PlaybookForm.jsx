import React, { useState, useCallback } from 'react';
import { Icon } from './Icon';
import { INDUSTRIES } from '../../lib/industries';
import { PLAYBOOK_PDF } from '../../lib/constants';

// The playbook capture form, and the screen that replaces it on success.
//
// Lives apart from PlaybookModal because it now has two homes: the exit-intent
// popup, and /playbook — the page an ad can actually link to. Two copies of a
// form that fires the Meta `Lead` event is two places for that event to drift.
//
// Nothing here assumes a dialog. No autofocus, no scroll lock, no focus trap:
// those belong to the modal, and a form that grabbed focus on mount would make
// the landing page jump past its own headline the moment it loaded.

// Sits just under /api/lead's 30s function ceiling, so a slow-but-working
// request is never killed client-side and reported as a failure the server did
// not have. Apps Script is usually 2-3s; this is the cold-container worst case.
const SUBMIT_TIMEOUT_MS = 28000;

/**
 * @param {object} props
 * @param {object} props.t           strings for the active language
 * @param {'ar'|'en'} props.lang
 * @param {string} props.sourceCta   which surface this submission came from —
 *   written to the CRM sheet's "Source CTA" column, so the popup and the page
 *   can be told apart in the numbers.
 * @param {() => void} props.onSuccess
 * @param {(event: string) => void} [props.trackEvent]
 */
export function PlaybookForm({ t, lang = 'ar', sourceCta, onSuccess, trackEvent }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [industry, setIndustry] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | error

  const ar = lang === 'ar';

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      if (status === 'sending') return;
      setStatus('sending');

      try {
        const res = await fetch('/api/lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          // A bounded wait. Apps Script downloads the PDF before it replies, so
          // this is genuinely slow — but an unbounded await leaves the visitor
          // staring at a disabled button, which reads as a crash.
          signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
          body: JSON.stringify({
            playbook: true,
            name: name.trim(),
            email: email.trim(),
            industry,
            phone: phone.trim(),
            sourceCta,
            language: lang,
            // Carries fbclid and any UTMs straight through to the sheet, which
            // is what joins a row back to the ad that produced it.
            pageUrl: typeof window !== 'undefined' ? window.location.href : '',
          }),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data?.ok) {
          setStatus('error');
          return;
        }

        // Only on a response we could actually read. The old no-cors call fired
        // this on an opaque promise that resolved even when nothing had been
        // captured, which quietly poisoned the signal both ad sets bid against.
        trackEvent?.('PlaybookSubmit');

        // The row saved but the email did not. The success screen still hands
        // over the PDF, so the visitor is fine — this is for us.
        if (data.emailed === false) {
          console.error('[playbook] lead captured but the email failed to send');
        }

        onSuccess?.();
      } catch {
        // Timeout, offline, or a server error. Never a dead end: the failure
        // state still hands over the PDF.
        setStatus('error');
      }
    },
    [status, name, email, industry, phone, sourceCta, lang, trackEvent, onSuccess],
  );

  return (
    <>
      <form className="playbook-form" onSubmit={handleSubmit}>
        <div className="playbook-field">
          <label htmlFor="playbook-name">{t.playbook_name_label}</label>
          <input
            id="playbook-name" name="name" type="text" autoComplete="name" required
            maxLength={100}
            placeholder={t.playbook_name_ph}
            value={name} onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="playbook-field">
          <label htmlFor="playbook-email">{t.playbook_email_label}</label>
          <input
            id="playbook-email" name="email" type="email" autoComplete="email" required
            placeholder={t.playbook_email_ph}
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="playbook-field">
          <label htmlFor="playbook-industry">{t.auth_industry_label}</label>
          {/* The same list /signin offers and api/_lib/auth.js validates
              against. The slugs are stable identifiers written to the CRM
              sheet — see the header of src/lib/industries.js. */}
          <select
            id="playbook-industry" name="industry" required
            value={industry} onChange={(e) => setIndustry(e.target.value)}
          >
            <option value="" disabled>{t.auth_industry_ph}</option>
            {INDUSTRIES.map((s) => (
              <option key={s.id} value={s.id}>{ar ? s.ar : s.en}</option>
            ))}
          </select>
        </div>

        <div className="playbook-field">
          <label htmlFor="playbook-phone">{t.auth_phone_label}</label>
          {/* No country selector beside it, unlike /signin: this form is met by
              someone who is halfway out of the page, and a 240-entry dropdown
              is a reason to leave. The dial code is typed, and the server
              keeps the digits rather than rejecting an unexpected shape. */}
          <input
            id="playbook-phone" name="phone" type="tel" required
            autoComplete="tel" inputMode="tel" maxLength={20}
            placeholder={t.playbook_phone_ph}
            value={phone} onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        <button type="submit" className="btn btn-primary btn-large playbook-submit" disabled={status === 'sending'}>
          <Icon name="mail" size={18} />
          <span>{status === 'sending' ? t.playbook_sending : t.playbook_cta}</span>
        </button>
      </form>

      {status === 'error' && (
        <p className="playbook-error" role="alert">
          {t.chat_error}{' '}
          <a href={PLAYBOOK_PDF} target="_blank" rel="noopener noreferrer">
            {t.playbook_download}
          </a>
        </p>
      )}

      <p className="playbook-privacy">{t.playbook_privacy}</p>
    </>
  );
}

/**
 * What replaces the form once it is sent. Shared so the popup and the page
 * cannot disagree about whether the PDF is still offered; `children` is where
 * the page adds the next step the popup has no room for.
 */
export function PlaybookSuccess({ t, titleId, children }) {
  return (
    <div className="playbook-success">
      <Icon name="check" size={28} />
      <h2 id={titleId} className="playbook-success-title">{t.playbook_success_title}</h2>
      <p className="playbook-sub">{t.playbook_success_sub}</p>
      <a href={PLAYBOOK_PDF} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-large">
        <Icon name="feather" size={18} />
        <span>{t.playbook_download}</span>
      </a>
      {children}
    </div>
  );
}
