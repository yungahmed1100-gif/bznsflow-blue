// The owner dashboard's map: eight plain sections, some with a few views inside.
// Old `?tab=` links (insights, expenses, contacts, broadcast, channels, business)
// keep working by landing on the section and view that now holds them.

const VIEWS = {
  stock: ['products', 'services'],
  money: ['insights', 'expenses'],
  customers: ['contacts', 'broadcast'],
  settings: ['channels', 'business'],
};
const ALIASES = {
  insights: ['money', 'insights'], expenses: ['money', 'expenses'],
  contacts: ['customers', 'contacts'], broadcast: ['customers', 'broadcast'],
  channels: ['settings', 'channels'], business: ['settings', 'business'],
};
export const SECTION_ORDER = ['today', 'chats', 'orders', 'stock', 'service', 'money', 'customers', 'team', 'settings'];

/**
 * @param {{ modules: string[], setupRequired: boolean } | null} hasib the Hasib overview, or null when Hasib is off
 * @returns {{ sections: string[], views: Record<string, string[]> }}
 */
export function dashboardMap(hasib, capabilities = { broadcasts: true, money: true }) {
  const on = m => !!hasib && !hasib.setupRequired && hasib.modules.includes(m);
  const clinic = hasib?.pack?.id === 'clinic' && !hasib.setupRequired;
  const construction = hasib?.pack?.id === 'construction' && !hasib.setupRequired;
  const automotive = hasib?.pack?.id === 'automotive' && !hasib.setupRequired;
  const views = {
    stock: construction || automotive ? [] : on('stock') ? VIEWS.stock : ['services'],
    money: construction || automotive ? [] : VIEWS.money.filter(on),
    customers: clinic ? ['contacts'] : capabilities.broadcasts ? VIEWS.customers : ['contacts'],
    settings: construction ? [] : VIEWS.settings,
  };
  const has = {
    today: !!hasib, chats: !clinic, orders: on('orders'), stock: on('stock'), service: on('repairs'),
    money: (construction || automotive ? on('insights') : views.money.length > 0) && capabilities.money !== false, customers: true,
    team: !!hasib && ['real-estate','clinic','construction','automotive'].includes(hasib.pack?.id) && hasib.workspaceRole === 'manager', settings: hasib?.workspaceRole !== 'employee',
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
  if (views.length === 0) return { tab, view: null };
  const wanted = aliasView || requestedView;
  return { tab, view: views.includes(wanted) ? wanted : views[0] };
}
