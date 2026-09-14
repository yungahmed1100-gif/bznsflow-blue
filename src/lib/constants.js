// Site-wide shared constants.
export const CALENDAR_URL = 'https://calendar.app.google/KS48NKMVXPugQEhm6';
export const WHATSAPP_URL = 'https://wa.me/201036755930';

// Second conversion route, offered alongside WhatsApp wherever Layla closes —
// some visitors will not use WhatsApp, and a dead end there is a lost lead.
export const CONTACT_EMAIL = 'ahmed@bznsflowai.com';

/** mailto: link with an optional prefilled subject and body. */
export function mailtoLink(subject, body) {
  const params = [
    subject && `subject=${encodeURIComponent(subject)}`,
    body && `body=${encodeURIComponent(body)}`,
  ].filter(Boolean);
  return `mailto:${CONTACT_EMAIL}${params.length ? `?${params.join('&')}` : ''}`;
}

// ── Playbook lead magnet ────────────────────────────────────────────────────
// The single source of truth for this path. The form links the PDF for the
// instant download, and /api/lead passes its absolute URL to Apps Script so the
// email attaches the same file the page just offered.
//
// This exists because they drifted: d5ec7b6 renamed the PDF here and left
// apps-script/Code.gs fetching the old name. The fetch 404'd, the try/catch
// swallowed it, and leads were recorded while silently never being emailed.
// Renaming the file now breaks the build's own test rather than the mail.
export const PLAYBOOK_PDF = '/bznsflow-sme-operating-playbook.pdf';

// Language switcher entries. Arabic is the primary language at '/',
// English at '/en' — both are prerendered routes.
export const LANGUAGES = [
  { code: 'ar', code2: 'AR', label: 'عربي' },
  { code: 'en', code2: 'EN', label: 'English' },
];
