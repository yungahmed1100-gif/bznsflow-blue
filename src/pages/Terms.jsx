import React from 'react';
import { LegalPage } from '../components/ui/LegalPage';
import { TERMS, TERMS_UPDATED_ISO } from '../content/terms';

// Terms of Service, rendered from src/content/terms.js. Registered with Meta as
// the app's Terms of Service URL, so it must stay public and prerendered.
export default function Terms({ lang = 'ar' }) {
  return <LegalPage lang={lang} path="/terms" doc={TERMS[lang === 'ar' ? 'ar' : 'en']} updatedIso={TERMS_UPDATED_ISO} />;
}
