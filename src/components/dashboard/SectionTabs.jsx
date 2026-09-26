import React from 'react';

/** The few views inside one dashboard section, as links so each has its own URL. */
export function SectionTabs({ s, tab, views, view, onSelect }) {
  if (!views || views.length < 2) return null;
  return (
    <nav className="ld-section-tabs" aria-label={s.t('sectionViews')}>
      {views.map(v => (
        <a key={v} href={`?tab=${tab}&view=${v}`} aria-current={v === view ? 'page' : undefined} onClick={e => { e.preventDefault(); onSelect(tab, { view: v }); }}>{s.t(`view_${v}`)}</a>
      ))}
    </nav>
  );
}
