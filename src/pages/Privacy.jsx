import React from 'react';
import { LegalPage } from '../components/ui/LegalPage';
import { PRIVACY, PRIVACY_UPDATED_ISO, privacyTables } from '../content/privacy';

// The privacy policy, rendered from src/content/privacy.js.
//
// Unlike /signin this page IS indexable. Google and LinkedIn both display the
// privacy URL to users on their consent screens, and a noindex policy page
// looks evasive to anyone who goes looking for it.
export default function Privacy({ lang = 'ar' }) {
  const doc = PRIVACY[lang === 'ar' ? 'ar' : 'en'];
  const raw = privacyTables(lang);
  const tables = {
    processors: raw.processors,
    processorsHead: doc.processorsHead,
    cookies: raw.cookies,
    cookiesHead: doc.cookiesHead,
  };

  return <LegalPage lang={lang} path="/privacy" doc={doc} updatedIso={PRIVACY_UPDATED_ISO} tables={tables} />;
}
