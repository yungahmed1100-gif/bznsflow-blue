import React, { useState, useRef, useEffect } from 'react';
import { Icon } from './Icon';
import { PlaybookForm, PlaybookSuccess } from './PlaybookForm';

// The playbook prompt, shown when a visitor is about to leave the home page;
// see hooks/useExitIntent.js for how that moment is detected.
//
// This file owns only what is genuinely modal — the overlay, the dialog role,
// the focus trap and the scroll lock. The fields, the submit and the success
// screen live in PlaybookForm, which /playbook renders too. Before that split
// the popup was the site's only email capture; now it is one of two, and they
// have to stay identical, because both fire the same `Lead` event.

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function PlaybookModal({ t, lang = 'ar', open, onClose, trackEvent }) {
  const [done, setDone] = useState(false);
  const panelRef = useRef(null);
  const previouslyFocused = useRef(null);

  // Focus management + ESC + focus trap. Unlike the chat panel (which is
  // aria-modal="false" because it never blocks the page), this one does block,
  // so keyboard users must not be able to tab out into dead content behind it.
  useEffect(() => {
    if (!open) return undefined;

    previouslyFocused.current = document.activeElement;
    const panel = panelRef.current;
    panel?.querySelector(FOCUSABLE)?.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    // Same scroll-lock approach the mobile menu already uses in Home.jsx.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="playbook-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="playbook-card playbook-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="playbook-title"
        ref={panelRef}
      >
        <button type="button" className="playbook-close" onClick={onClose} aria-label={t.playbook_close}>
          <Icon name="close" size={18} />
        </button>

        {done ? (
          <PlaybookSuccess t={t} titleId="playbook-title" />
        ) : (
          <>
            <div className="section-label">{t.playbook_eyebrow}</div>
            <h2
              id="playbook-title"
              className="playbook-title"
              dangerouslySetInnerHTML={{ __html: t.playbook_title }}
            ></h2>
            <p className="playbook-sub">{t.playbook_sub}</p>

            <ul className="playbook-problems">
              <li>{t.playbook_problem_1}</li>
              <li>{t.playbook_problem_2}</li>
              <li>{t.playbook_problem_3}</li>
            </ul>

            <p className="playbook-cost">{t.playbook_cost}</p>
            <p className="playbook-solution">{t.playbook_solution}</p>

            <PlaybookForm
              t={t}
              lang={lang}
              sourceCta="Playbook Popup"
              trackEvent={trackEvent}
              onSuccess={() => setDone(true)}
            />
          </>
        )}
      </div>
    </div>
  );
}
