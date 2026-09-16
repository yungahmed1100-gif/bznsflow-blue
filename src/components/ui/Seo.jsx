import React from 'react';
import { Head } from 'vite-react-ssg';
import { SITE, urlFor } from '../../routes-manifest';

// Blue is never indexed, whatever a page would otherwise ask for. This was
// written as `true ? noindex : index`, which reads as a live choice and is not
// one — the Green value is kept beside it so promoting the environment is a
// one-line change with the correct string already written down.
export const ROBOTS_BLUE = 'noindex, follow';
export const ROBOTS_GREEN = 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1';
export const ROBOTS = ROBOTS_BLUE;


// Per-page head: title, description, canonical, reciprocal hreflang (en/ar/
// x-default), OpenGraph/Twitter, and optional JSON-LD. Rendered into the static
// HTML at build time via vite-react-ssg's <Head>. Global tags (favicons, fonts,
// Organization/WebSite JSON-LD) stay in index.html and are copied to every page.
//
// Props:
//   lang     — 'ar' | 'en' (the locale of THIS prerendered page)
//   path     — the canonical (Arabic, unprefixed) path, e.g. '/' or '/pricing'
//   title, description — page-specific copy
//   ogImage  — absolute or root-relative image (defaults to og-image.jpg)
//   jsonLd   — array of schema.org objects to embed
//   noindex  — set true to keep a page out of the index
export function Seo({
  lang = 'en',
  path = '/',
  title,
  description,
  ogImage = `${SITE}/og-image.jpg`,
  jsonLd = [],
  noindex = false,
}) {
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const canonical = urlFor(path, lang);
  const enUrl = urlFor(path, 'en');
  const arUrl = urlFor(path, 'ar');
  const ogLocale = lang === 'ar' ? 'ar_AE' : 'en_US';
  const ogLocaleAlt = lang === 'ar' ? 'en_US' : 'ar_AE';

  return (
    <Head>
      <html lang={lang} dir={dir} />
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      {/* Always emitted, never conditional. Helmet can only dedupe tags it
          manages, so an "only when noindex" tag left the indexable pages with
          no robots directive at all once the copy in index.html was removed. */}
      <meta name="robots" content={ROBOTS} />

      {/* Reciprocal hreflang — English is the primary/default language
          (worldwide English-first targeting); Arabic is the alternate. */}
      <link rel="alternate" hrefLang="ar" href={arUrl} />
      <link rel="alternate" hrefLang="en" href={enUrl} />
      <link rel="alternate" hrefLang="x-default" href={enUrl} />

      {/* OpenGraph */}
      <meta property="og:url" content={canonical} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:locale" content={ogLocale} />
      <meta property="og:locale:alternate" content={ogLocaleAlt} />

      {/* Twitter */}
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />

      {/* JSON-LD */}
      {jsonLd.map((schema, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(schema)}
        </script>
      ))}
    </Head>
  );
}
