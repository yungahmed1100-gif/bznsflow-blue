import React, { Suspense, lazy } from 'react';
import { RootLayout } from './layouts/RootLayout';
import Home from './pages/Home';

// Lazily loaded, unlike Home. The sign-in page carries its own stylesheet and a
// ~240-entry country list, and a static import puts all of that in the shared
// chunk every home-page visitor downloads — to render a page most of them never
// open. Home stays eager: it IS the landing page, so deferring it would only add
// a round trip to the critical path.
const LaylaPilot = lazy(() => import('./pages/LaylaPilot'));
const LaylaOnboarding = lazy(() => import('./pages/LaylaOnboarding'));
const LaylaDashboard = lazy(() => import('./pages/LaylaDashboard'));
const SignIn = lazy(() => import('./pages/SignIn'));

// Same reasoning: its own stylesheet plus several thousand words of bilingual
// content have no business in the chunk a home-page visitor downloads.
const Privacy = lazy(() => import('./pages/Privacy'));
const Terms = lazy(() => import('./pages/Terms'));
const DataDeletion = lazy(() => import('./pages/DataDeletion'));

// The playbook landing page. Lazy for the same reason, and harmless for paid
// traffic: it is prerendered, so an ad click gets the full HTML immediately and
// the chunk only matters once the visitor types into the form.
const Playbook = lazy(() => import('./pages/Playbook'));

// `null` rather than a spinner. The prerendered HTML already contains the fully
// rendered page, so this fallback is only ever visible during a client-side
// navigation to /signin — where a flash of spinner is worse than nothing.
const deferred = (node) => <Suspense fallback={null}>{node}</Suspense>;

// Route table consumed by vite-react-ssg (React Router v6 data-router shape).
// Static paths are auto-discovered and prerendered to dist/<path>/index.html.
//
// Arabic is the primary language at '/'; English mirrors under '/en'.
// (The old /ar URL 301-redirects to / via vercel.json.)
export const routes = [
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <Home lang="ar" /> },
      { path: 'en', element: <Home lang="en" /> },
      // Deliberately absent from PAGES in routes-manifest.js, so the sitemap
      // does not advertise it — it is <Seo noindex> for the same reason.
      { path: 'owner/layla', element: deferred(<LaylaPilot />) },
      { path: 'layla/review', element: deferred(<LaylaOnboarding lang="ar" reviewMode />) },
      { path: 'en/layla/review', element: deferred(<LaylaOnboarding lang="en" reviewMode />) },
      { path: 'layla/setup', element: deferred(<LaylaOnboarding lang="ar" />) },
      { path: 'en/layla/setup', element: deferred(<LaylaOnboarding lang="en" />) },
      // Authenticated owner dashboard. Noindex and absent from PAGES, like setup;
      // the prerendered shell holds no customer data and loads it client-side.
      { path: 'layla/dashboard', element: deferred(<LaylaDashboard lang="ar" />) },
      { path: 'en/layla/dashboard', element: deferred(<LaylaDashboard lang="en" />) },
      { path: 'signin', element: deferred(<SignIn lang="ar" />) },
      { path: 'en/signin', element: deferred(<SignIn lang="en" />) },
      // Indexable, unlike /signin — Google and LinkedIn both show this URL to
      // users on their consent screens, and a noindex privacy policy reads as
      // evasive. Listed in PAGES so the sitemap carries it.
      { path: 'privacy', element: deferred(<Privacy lang="ar" />) },
      { path: 'en/privacy', element: deferred(<Privacy lang="en" />) },
      // Registered with Meta as the app's Terms and Data Deletion URLs, so they
      // are public and indexable like the privacy policy.
      { path: 'terms', element: deferred(<Terms lang="ar" />) },
      { path: 'en/terms', element: deferred(<Terms lang="en" />) },
      { path: 'data-deletion', element: deferred(<DataDeletion lang="ar" />) },
      { path: 'en/data-deletion', element: deferred(<DataDeletion lang="en" />) },
      // Also indexable and also in PAGES: this is the destination for paid
      // traffic, and a campaign landing page missing from the sitemap is a
      // silent, expensive mistake.
      { path: 'playbook', element: deferred(<Playbook lang="ar" />) },
      { path: 'en/playbook', element: deferred(<Playbook lang="en" />) },
    ],
  },
];
