import React from 'react';

const ITEMS = [
  ['broadcast', 'M4 10v4h3l5 4V6L7 10H4zm12.5 2a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z'],
  ['chats', 'M4 4h16v12H7l-3 3V4zm3 4v2h10V8H7zm0 3v2h7v-2H7z'],
  ['contacts', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5z'],
];

/** Fixed start-side rail on desktop; a top tab bar on phones. Order: Broadcast, Chats, Contacts. */
export function DashboardNav({ s, tab, onSelect }) {
  return (
    <nav className="ld-nav" aria-label={s.t('nav')}>
      <ul>
        {ITEMS.map(([id, path]) => (
          <li key={id}>
            <a href={`?tab=${id}`} aria-current={tab === id ? 'page' : undefined} onClick={e => { e.preventDefault(); onSelect(id); }}>
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d={path} fill="currentColor" /></svg>
              <span>{s.t(id)}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
