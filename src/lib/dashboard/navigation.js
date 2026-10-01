// The owner dashboard's map: eight plain sections, some with a few views inside.
// Section ids never change by industry; only labels and views do (a clinic's Orders read as Visits).
// Old `?tab=` links (insights, expenses, contacts, broadcast, channels, business)
// keep working by landing on the section and view that now holds them.

const VIEWS = {
  stock: ['products', 'services'],
  money: ['insights', 'expenses'],
  customers: ['contacts', 'broadcast'],
  settings: ['channels', 'business', 'accounts'],
};
const ALIASES = {
  insights: ['money', 'insights'], expenses: ['money', 'expenses'],
  contacts: ['customers', 'contacts'], broadcast: ['customers', 'broadcast'],
  channels: ['settings', 'channels'], business: ['settings', 'business'],
};
export const SECTION_ORDER = ['today', 'chats', 'orders', 'stock', 'service', 'money', 'customers', 'settings'];

/**
 * @param {{ modules: string[], setupRequired: boolean, pack?: { id: string } } | null} hasib the Hasib overview, or null when Hasib is off
 * @returns {{ sections: string[], views: Record<string, string[]> }}
 */
export function dashboardMap(hasib) {
  const on = m => !!hasib && !hasib.setupRequired && hasib.modules.includes(m);
  // A clinic: Services leads with its treatments (products are its supplies); Patients is one list, no mass messaging.
  const clinic = on('orders') && hasib.pack?.id === 'dental';
  const views = {
    stock: on('stock') ? (clinic ? ['services', 'products'] : VIEWS.stock) : ['services'],
    money: VIEWS.money.filter(on),
    customers: clinic ? ['contacts'] : VIEWS.customers,
    // Accounts and VAT belong to Hasib's money, so they appear once an industry is set.
    settings: on('orders') ? VIEWS.settings : VIEWS.settings.filter(v => v !== 'accounts'),
  };
  const has = {
    today: !!hasib, chats: true, orders: on('orders'), stock: on('stock'), service: on('repairs'),
    money: views.money.length > 0, customers: true, settings: true,
  };
  return { sections: SECTION_ORDER.filter(id => has[id]), views };
}

/** The section and view to show for a URL, falling back to the home section. */
export function resolveTab(requestedTab, requestedView, map) {
  const [aliasTab, aliasView] = ALIASES[requestedTab] || [];
  const tab = aliasTab || requestedTab;
  const home = map.sections[0] === 'today' ? 'today' : 'chats';
  if (!map.sections.includes(tab)) return { tab: home, view: null };
  const views = map.views[tab];
  if (!views) return { tab, view: null };
  const wanted = aliasView || requestedView;
  return { tab, view: views.includes(wanted) ? wanted : views[0] };
}
