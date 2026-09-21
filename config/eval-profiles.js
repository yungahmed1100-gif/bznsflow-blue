// Fixture tenant profiles for the intent evaluation.
//
// WHY THIS EXISTS. api/_lib/layla/route.js scores a question against the
// tenant's OWN approved profile text, because that is where the sector's
// vocabulary actually lives — a dentist's profile says "treatments", a cake
// shop's says "flavours", and neither word is authored anywhere in this repo's
// routing rules. Measuring that layer therefore needs a profile, and
// scripts/eval-intents.mjs previously scored classify() with none.
//
// These are FIXTURES, not labels. The labels stay in config/eval-questions.js.
// A fixture represents "a tenant who completed onboarding", which is the state
// the router runs in.
//
// THREE CHOICES THAT KEEP THE MEASUREMENT HONEST
//
// 1. `services` is the REAL production description from
//    src/lib/sector-prefill.generated.js — the same text a tenant sees
//    pre-filled at onboarding. Not written for this evaluation, and not
//    derived from the questions being scored.
//
// 2. `prices`, `hours` and `location` are GENERIC and IDENTICAL for all 23
//    sectors. This is deliberate and it makes the router's job harder, not
//    easier: there are no sector-flavoured price nouns to latch onto, so
//    "what is on your menu?" has to beat a plausible hours blurb and a
//    plausible price blurb on the strength of the services text alone. Giving
//    each sector a bespoke price line would have been authoring the answer.
//
// 3. `prefillFor(sector).questions` is NOT used, even though it is right
//    there. Those strings overlap config/eval-questions.js almost exactly —
//    dental's first suggested question IS one of the labelled rows — so using
//    them as fixture text would be scoring the router against its own input.
//    Only the `service` DESCRIPTION is used, which is a different string.
//
// WHAT THIS MEASUREMENT IS OPTIMISTIC ABOUT, stated plainly: the fixture
// assumes the tenant described their services in the words their customers
// use. Real profiles are patchier, so the profile layer's live recall will sit
// BELOW what this reports. That gap is not a flaw in the router — it is the
// argument for the guided onboarding ladder, which exists to make profiles
// fuller.

import { prefillFor } from '../src/lib/sector-prefill.generated.js';

/** Shared, deliberately sector-neutral text for the three non-services fields. */
export const GENERIC_FIELDS = {
  en: {
    prices: 'First consultation 15 OMR. Main items from 25 OMR. Payment by card or cash.',
    hours: 'Saturday to Thursday, 9am to 8pm. Closed Friday.',
    location: 'Al Khuwair, Muscat, near the main roundabout. Parking available.',
  },
  ar: {
    prices: 'الاستشارة الأولى ١٥ ريال. تبدأ الأصناف الرئيسية من ٢٥ ريال. الدفع بالبطاقة أو نقداً.',
    hours: 'من السبت إلى الخميس، من ٩ صباحاً حتى ٨ مساءً. الجمعة مغلق.',
    location: 'الخوير، مسقط، قرب الدوار الرئيسي. يتوفر موقف سيارات.',
  },
};

/**
 * A reviewed profile for one sector, as the router would see it in production.
 *
 * @param {string|null} sectorId an id from src/lib/industries.js
 * @param {'en'|'ar'} lang
 * @returns {{sector: string, services: string, prices: string, hours: string,
 *   location: string, humanContact: string, reviewed: true}|null}
 *   null when the row is not sector-specific, so the caller routes with no
 *   profile — which is what production does before onboarding completes.
 */
export function profileFor(sectorId, lang = 'en') {
  if (!sectorId) return null;
  const language = lang === 'ar' ? 'ar' : 'en';
  const prefill = prefillFor(sectorId, language);
  if (!prefill?.service) return null;
  return {
    sector: sectorId,
    services: prefill.service,
    ...GENERIC_FIELDS[language],
    humanContact: '+968 9000 0000',
    reviewed: true,
  };
}

/**
 * The profile to route a labelled row with.
 *
 * A row's `lang` can be `mixed` or `arabizi`, neither of which is a profile
 * language. Arabic script present means the Arabic profile; everything else,
 * including Arabizi, gets the English one — an Arabizi speaker is reading a
 * profile written in one of the two real languages, not in Arabizi.
 */
export function profileForRow(row) {
  if (!row?.sector) return null;
  const arabic = row.lang === 'ar' || /[؀-ۿ]/.test(row.text || '');
  return profileFor(row.sector, arabic ? 'ar' : 'en');
}
