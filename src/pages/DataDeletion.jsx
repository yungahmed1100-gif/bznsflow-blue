import React from 'react';
import { LegalPage } from '../components/ui/LegalPage';
import { DATA_DELETION, DATA_DELETION_UPDATED_ISO } from '../content/data-deletion';

// Data deletion instructions, rendered from src/content/data-deletion.js.
// Registered with Meta as the app's Data Deletion Instructions URL.
export default function DataDeletion({ lang = 'ar' }) {
  return <LegalPage lang={lang} path="/data-deletion" doc={DATA_DELETION[lang === 'ar' ? 'ar' : 'en']} updatedIso={DATA_DELETION_UPDATED_ISO} />;
}
