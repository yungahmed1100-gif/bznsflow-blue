import React, { useState } from 'react';
import { Seo } from '../components/ui/Seo';
import { Icon } from '../components/ui/Icon';
import { PlaybookForm, PlaybookSuccess } from '../components/ui/PlaybookForm';
import { getStrings } from '../i18n';
import { trackEvent } from '../lib/analytics';
import { CALENDAR_URL, WHATSAPP_URL } from '../lib/constants';
import '../styles/playbook.css';

// /playbook — the page an ad campaign can point at.
//
// The playbook used to be offered in exactly one place: an exit-intent popup on
// the home page, which has no URL. Paid traffic had nowhere to land that was
// about the thing the ad promised.
//
// A standalone page with its own small header, for the same reason SignIn.jsx
// and Privacy.jsx have one: NavBar takes eleven props of scroll and menu state
// owned by Home, and every one of its links is a hash anchor that only resolves
// on the home page.
//
// EVERY WORD HERE ALREADY EXISTED. The `playbook_*` keys were written for the
// popup and are a complete argument on their own — a problem, its cost, and what
// the document does about it. Reusing them means the page adds no claim the site
// does not already make, and introduces no Arabic that has not been read by a
// person (see ARABIC-REWRITE-BRIEF.md).

const FORM_ANCHOR = 'playbook-get';

/** The headline carries a <span class="mark">; page metadata cannot. */
const plain = (html) => String(html ?? '').replace(/<[^>]+>/g, '');

export default function Playbook({ lang = 'ar' }) {
  const t = getStrings(lang);
  const ar = lang === 'ar';
  const [done, setDone] = useState(false);

  return (
    <>
      <Seo
        lang={lang}
        path="/playbook"
        title={`${plain(t.playbook_title)} — BznsFlow`}
        description={t.playbook_solution}
      />

      <main className="pb-page" id="main-content">
        <header className="pb-nav">
          <a className="pb-brand" href={ar ? '/' : '/en'}>
            <img src="/logo.png" alt="BznsFlow" width="36" height="36" />
            <span>BznsFlow</span>
          </a>
          <div className="pb-nav-end">
            {/* Back to the site, landing on what it sells rather than the top of
                the home page. Labelled with the same string the main nav uses
                for that section, so the two agree and no new copy is invented. */}
            <a className="pb-services" href={ar ? '/#solutions' : '/en#solutions'}>
              <span>{t.nav_solution}</span>
              <Icon name="arrow-right" size={15} className="pb-services-arrow" aria-hidden="true" />
            </a>
            <a className="pb-lang" href={ar ? '/en/playbook' : '/playbook'}>
              <Icon name="globe" size={15} />
              <span>{ar ? 'English' : 'العربية'}</span>
            </a>
          </div>
        </header>

        <article className="pb-doc">
          <p className="section-label">{t.playbook_eyebrow}</p>
          <h1
            className="pb-title"
            dangerouslySetInnerHTML={{ __html: t.playbook_title }}
          ></h1>
          <p className="pb-lede">{t.playbook_sub}</p>

          {/* The form sits directly under the lede rather than at the foot of
              the page. Someone arriving from an ad has already read the offer
              once; making them scroll the whole argument to act on it is how a
              landing page loses the click it just paid for. */}
          <div className="pb-card" id={FORM_ANCHOR}>
            {done ? (
              <PlaybookSuccess t={t}>
                {/* The popup has no room for this. A lead magnet that ends at
                    the download wastes the one moment the visitor is warmest. */}
                <div className="pb-next">
                  <a className="btn btn-ghost" href={CALENDAR_URL} target="_blank" rel="noopener noreferrer">
                    <Icon name="calendar" size={18} />
                    <span>{t.auth_done_book}</span>
                  </a>
                  <a className="btn btn-ghost" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                    <Icon name="whatsapp" size={18} />
                    <span>{t.auth_done_whatsapp}</span>
                  </a>
                </div>
              </PlaybookSuccess>
            ) : (
              <PlaybookForm
                t={t}
                lang={lang}
                sourceCta="Playbook Page"
                trackEvent={trackEvent}
                onSuccess={() => setDone(true)}
              />
            )}
          </div>

          {/* Ruled rows rather than cards: three entries the eye can run down,
              which is what the headline's "three things" promises. */}
          <ol className="pb-problems">
            <li>{t.playbook_problem_1}</li>
            <li>{t.playbook_problem_2}</li>
            <li>{t.playbook_problem_3}</li>
          </ol>

          <p className="pb-cost">{t.playbook_cost}</p>
          <p className="pb-solution">{t.playbook_solution}</p>

          {!done && (
            <p className="pb-again">
              <a href={`#${FORM_ANCHOR}`}>{t.playbook_cta}</a>
            </p>
          )}
        </article>

        <footer className="pb-foot">
          <a href={ar ? '/privacy' : '/en/privacy'}>{t.footer_privacy}</a>
          <a href={ar ? '/' : '/en'}>{t.auth_back}</a>
        </footer>
      </main>
    </>
  );
}
