import React from 'react';
import { hasibPack } from '../../../config/hasib-packs';

// One icon per section, in the order the owner meets them.
const ICONS = {
  today: 'M12 3l9 8h-3v9h-5v-6h-2v6H6v-9H3l9-8z',
  chats: 'M4 4h16v12H7l-3 3V4zm3 4v2h10V8H7zm0 3v2h7v-2H7z',
  orders: 'M6 2h12l2 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6l2-4zm0 4h12l-1-2H7L6 6zm2 5v2h8v-2H8zm0 4v2h5v-2H8z',
  stock: 'M12 2 3 7v10l9 5 9-5V7l-9-5zm0 2.3L18.6 8 12 11.7 5.4 8 12 4.3zM5 9.7l6 3.4v6.6l-6-3.3V9.7zm8 10v-6.6l6-3.4v6.7l-6 3.3z',
  service: 'M22.7 19.3 13.6 10.2a6 6 0 0 0-7.8-7.8l3.9 3.9-2.8 2.8-3.9-3.9a6 6 0 0 0 7.8 7.8l9.1 9.1a1 1 0 0 0 1.4 0l1.4-1.4a1 1 0 0 0 0-1.4z',
  money: 'M3 6h18v12H3V6zm2 2v8h14V8H5zm7 1.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM6 9h2v2H6V9zm10 4h2v2h-2v-2z',
  customers: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5z',
  team: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8-1a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM8 13c-3.3 0-6 1.7-6 4v2h12v-2c0-2.3-2.7-4-6-4zm8-.5c-.8 0-1.5.1-2.2.3 1.4 1 2.2 2.4 2.2 4.2v2h6v-2c0-2.5-2.7-4.5-6-4.5z',
  settings: 'M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3.3h-4L10.7 6a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1l.3 2.6h4l.3-2.6a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5-2.1-1.6zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z',
};
const HASIB_LABELS = new Set(['orders', 'stock', 'service']);

/** Fixed start-side rail on desktop; a scrollable top bar on phones. */
export function DashboardNav({ s, h, sections, tab, onSelect, badges = {}, packId }) {
  const pack = hasibPack(packId);
  const label = id => id === 'team' ? (s.ar ? 'الفريق' : 'Team') : packId && ['orders', 'stock'].includes(id) ? pack.ownerUi[id === 'orders' ? 'work' : 'stock'][s.ar ? 'ar' : 'en'] : (HASIB_LABELS.has(id) ? h.t(id) : s.t(id));
  return (
    <nav className={`ld-nav ${sections.length > 4 ? 'has-hasib' : ''}`} aria-label={s.t('nav')}>
      <ul>
        {sections.map(id => (
          <li key={id}>
            <a href={`?tab=${id}`} aria-current={tab === id ? 'page' : undefined} onClick={e => { e.preventDefault(); onSelect(id); }}>
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d={ICONS[id]} fill="currentColor" /></svg>
              <span>{label(id)}</span>
              {badges[id] > 0 && <span className="ld-nav-badge" aria-label={h.t('laylaWaitingTile')}>{badges[id]}</span>}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
