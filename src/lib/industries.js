// The industry list behind the sign-in page's sector field.
//
// Shared by the page and by api/_lib/auth.js, which validates the submitted slug
// against it. One list is what stops the browser and the validator disagreeing
// about what counts as a valid sector.
//
// Slugs are stable identifiers, not labels: they are stored in the database and
// written to the CRM sheet, so renaming one silently splits a segment in the
// reporting. Add new sectors, do not rename existing ones.
//
// `other` is last and always stays last — it is the escape hatch, and a required
// dropdown without one just produces bad data from people who don't fit.

export const INDUSTRIES = [
  { id: 'real-estate',   en: 'Real estate',              ar: 'العقارات' },
  { id: 'dental',        en: 'Dental clinics',           ar: 'عيادات الأسنان' },
  { id: 'clinic',        en: 'Medical clinics',          ar: 'العيادات الطبية' },
  { id: 'hvac',          en: 'Air conditioning',         ar: 'التكييف' },
  { id: 'construction',  en: 'Construction',             ar: 'المقاولات' },
  { id: 'cakes',         en: 'Cakes',                    ar: 'الكيك' },
  { id: 'cafe',          en: 'Coffee & dessert',         ar: 'القهوة والحلويات' },
  { id: 'restaurant',    en: 'Restaurants',              ar: 'المطاعم' },

  { id: 'retail',        en: 'Retail & e-commerce',      ar: 'التجزئة والتجارة الإلكترونية' },
  { id: 'beauty',        en: 'Beauty & salons',          ar: 'التجميل والصالونات' },
  { id: 'fitness',       en: 'Fitness & wellness',       ar: 'اللياقة والعافية' },
  { id: 'education',     en: 'Education & training',     ar: 'التعليم والتدريب' },
  { id: 'automotive',    en: 'Automotive',               ar: 'السيارات' },
  { id: 'logistics',     en: 'Logistics & delivery',     ar: 'الشحن والتوصيل' },
  { id: 'travel',        en: 'Travel & hospitality',     ar: 'السفر والضيافة' },
  { id: 'events',        en: 'Events & weddings',        ar: 'المناسبات والأعراس' },
  { id: 'legal',         en: 'Legal services',           ar: 'الخدمات القانونية' },
  { id: 'finance',       en: 'Finance & accounting',     ar: 'المالية والمحاسبة' },
  { id: 'marketing',     en: 'Marketing & agencies',     ar: 'التسويق والوكالات' },
  { id: 'technology',    en: 'Technology & software',    ar: 'التقنية والبرمجيات' },
  { id: 'manufacturing', en: 'Manufacturing',            ar: 'التصنيع' },
  { id: 'cleaning',      en: 'Cleaning & facilities',    ar: 'النظافة وإدارة المرافق' },
  { id: 'other',         en: 'Something else',           ar: 'مجال آخر' },
];

// Layla business setup and Hasib share this complete catalog. Electronics is
// retained as the one existing Hasib-specific choice in addition to the 22
// named Setup sectors and the free-form escape hatch.
export const ELECTRONICS_INDUSTRY = { id: 'retail-tech', en: 'Electronics and phone store', ar: 'متجر الإلكترونيات والهواتف' };
export const BUSINESS_INDUSTRIES = Object.freeze([...INDUSTRIES.slice(0, -1), ELECTRONICS_INDUSTRY, INDUSTRIES.at(-1)]);
export function businessIndustryId(value) {
  return BUSINESS_INDUSTRIES.find(industry => industry.en === value || industry.ar === value)?.id || null;
}

/** Every valid slug, as a Set — the validator's only real question. */
export const INDUSTRY_IDS = new Set(INDUSTRIES.map((i) => i.id));
