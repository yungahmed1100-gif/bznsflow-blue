import React from 'react';

const ITEMS = [
  ['channels', 'M3 5h7v6H3zM14 13h7v6h-7zM9 9l7 6 1-2-7-6z'],
  ['broadcast', 'M4 10v4h3l5 4V6L7 10H4zm12.5 2a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z'],
  ['chats', 'M4 4h16v12H7l-3 3V4zm3 4v2h10V8H7zm0 3v2h7v-2H7z'],
  ['contacts', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5z'],
  ['business', 'M4 7h16v12H4zM9 4h6v3H9zM4 11h16v2H4z'],
];

// Hasib tabs appear only for modules the account's industry pack has made available.
const HASIB_ITEMS = [
  ['insights', 'M4 20V10h3v10H4zm6 0V4h3v16h-3zm6 0v-7h3v7h-3z'],
  ['orders', 'M6 2h12l2 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6l2-4zm0 4h12l-1-2H7L6 6zm2 5v2h8v-2H8zm0 4v2h5v-2H8z'],
  ['stock', 'M12 2 3 7v10l9 5 9-5V7l-9-5zm0 2.3L18.6 8 12 11.7 5.4 8 12 4.3zM5 9.7l6 3.4v6.6l-6-3.3V9.7zm8 10v-6.6l6-3.4v6.7l-6 3.3z'],
  ['expenses', 'M3 6h18v12H3V6zm2 2v8h14V8H5zm7 1.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM6 9h2v2H6V9zm10 4h2v2h-2v-2z'],
  ['service', 'M22.7 19.3 13.6 10.2a6 6 0 0 0-7.8-7.8l3.9 3.9-2.8 2.8-3.9-3.9a6 6 0 0 0 7.8 7.8l9.1 9.1a1 1 0 0 0 1.4 0l1.4-1.4a1 1 0 0 0 0-1.4z'],
];

/** Fixed start-side rail on desktop; a top tab bar on phones. */
export function DashboardNav({ s, tab, onSelect, hasib = null }) {
  const items = [...ITEMS.slice(0, 3), ...HASIB_ITEMS.filter(([id]) => hasib?.modules.includes(id)), ...ITEMS.slice(3)];
  const label = id => id === 'channels' ? (s.ar ? 'القنوات' : 'Channels') : hasib && HASIB_ITEMS.some(([x]) => x === id) ? hasib.h.t(id) : s.t(id);
  return (
    <nav className={`ld-nav ${hasib ? 'has-hasib' : ''}`} aria-label={s.t('nav')}>
      <ul>
        {items.map(([id, path]) => (
          <li key={id}>
            <a href={`?tab=${id}`} aria-current={tab === id ? 'page' : undefined} onClick={e => { e.preventDefault(); onSelect(id); }}>
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d={path} fill="currentColor" /></svg>
              <span>{label(id)}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
