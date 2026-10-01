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
const TEAM_PACKS = ['retail', 'retail-tech', 'dental', 'real-estate', 'clinic', 'construction', 'automotive'];
export const SECTION_ORDER = ['today', 'chats', 'orders', 'stock', 'service', 'money', 'customers', 'team', 'settings'];

/**
 * @param {{ modules: string[], setupRequired: boolean, pack?: { id: string } } | null} hasib the Hasib overview, or null when Hasib is off
 * @param {Record<string, boolean>} [capabilities]
 * @param {'manager' | 'employee'} [role] the role from the main overview, used until the Hasib overview arrives
 * @returns {{ sections: string[], views: Record<string, string[]> }}
 */
export function dashboardMap(hasib, capabilities = { broadcasts: true, money: true }, role = 'manager') {
  // The main overview already knows the role, so an employee never sees Settings flash while Hasib loads.
  const workspaceRole = hasib?.workspaceRole ?? role;
  const on = m => !!hasib && !hasib.setupRequired && hasib.modules.includes(m);
  const clinic = hasib?.pack?.id === 'clinic' && !hasib.setupRequired;
  // Dental: Services leads with its treatments (products are its supplies); Patients is one list, no mass messaging.
  const dental = on('orders') && hasib?.pack?.id === 'dental';
  const construction = hasib?.pack?.id === 'construction' && !hasib.setupRequired;
  const automotive = hasib?.pack?.id === 'automotive' && !hasib.setupRequired;
  // Real Estate's Properties is one listings screen, not products and services.
  const realEstate = hasib?.pack?.id === 'real-estate' && !hasib.setupRequired;
  // Services are edited in Business details, which is the manager's.
  const managerViews = list => list.filter(v => v !== 'services' || workspaceRole !== 'employee');
  const views = {
    stock: construction || automotive || realEstate ? [] : on('stock') ? managerViews(dental ? ['services', 'products'] : VIEWS.stock) : ['services'],
    money: construction || automotive ? [] : VIEWS.money.filter(on),
    customers: clinic || dental ? ['contacts'] : capabilities.broadcasts ? VIEWS.customers : ['contacts'],
    // Accounts and VAT belong to Hasib's money, so they appear once an industry is set.
    settings: construction ? [] : on('orders') ? VIEWS.settings : VIEWS.settings.filter(v => v !== 'accounts'),
  };
  const has = {
    today: !!hasib, chats: !clinic, orders: on('orders'), stock: on('stock'), service: on('repairs'),
    money: (construction || automotive ? on('insights') : views.money.length > 0) && capabilities.money !== false, customers: true,
    team: !!hasib && TEAM_PACKS.includes(hasib.pack?.id) && workspaceRole === 'manager', settings: workspaceRole !== 'employee',
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
