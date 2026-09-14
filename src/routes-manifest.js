// Single source of truth for the site's prerendered routes.
// Read by: the SSG route table (src/routes.jsx), the sitemap generator
// (scripts/gen-sitemap.mjs), and the <Seo> hreflang logic.
//
// Arabic is the canonical/primary language (unprefixed). The English mirror is
// the same path under /en. The old /ar URLs 301-redirect to / (vercel.json).

export const SITE = 'https://www.bznsflowai.com';
export const LOCALES = ['ar', 'en'];

// Each page lists its canonical (Arabic, unprefixed) path. /en is derived.
// lastmod is explicit + deterministic so rebuilds don't churn the sitemap.
export const PAGES = [
  { path: '/', changefreq: 'weekly', priority: 1.0, lastmod: '2026-07-13' },
  // Low priority, rarely changes — but indexable and in the sitemap on
  // purpose: it is linked from Google's and LinkedIn's consent screens, and a
  // privacy policy that hides from search looks like it has something to hide.
  { path: '/privacy', changefreq: 'yearly', priority: 0.3, lastmod: '2026-09-10' },
  // The lead magnet's own page — where the ad campaign lands, and the only
  // URL that offers the playbook. Ranks second only to the home page because
  // it is the page most likely to be linked to from outside.
  { path: '/playbook', changefreq: 'monthly', priority: 0.8, lastmod: '2026-09-11' },
];

// Build the absolute URL for a given canonical path + locale.
export function urlFor(path, lang) {
  const prefix = lang === 'en' ? '/en' : '';
  if (path === '/') return `${SITE}${prefix || '/'}`;
  return `${SITE}${prefix}${path}`;
}
