// Phase 4: the dashboard map and old links.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardMap, resolveTab } from '../src/lib/dashboard/navigation.js';

const retail = { modules: ['orders', 'stock', 'expenses', 'insights'], setupRequired: false };
const tech = { modules: ['orders', 'stock', 'expenses', 'insights', 'serials', 'repairs', 'tradeIns'], setupRequired: false };

test('Layla only: chats, customers and settings, with chats as home', () => {
  const map = dashboardMap(null);
  assert.deepEqual(map.sections, ['chats', 'customers', 'settings']);
  assert.deepEqual(resolveTab(null, null, map), { tab: 'chats', view: null });
  assert.deepEqual(resolveTab('orders', null, map), { tab: 'chats', view: null }, 'Hasib sections are not reachable');
});

test('retail shop: Today is home; Service is only for phone stores', () => {
  assert.deepEqual(dashboardMap(retail).sections, ['today', 'chats', 'orders', 'stock', 'money', 'customers', 'settings']);
  assert.deepEqual(dashboardMap(tech).sections, ['today', 'chats', 'orders', 'stock', 'service', 'money', 'customers', 'settings']);
  assert.deepEqual(resolveTab(null, null, dashboardMap(retail)), { tab: 'today', view: null });
  assert.deepEqual(resolveTab('service', null, dashboardMap(retail)), { tab: 'today', view: null });
});

test('old links land where their content lives now', () => {
  const map = dashboardMap(retail);
  for (const [old, where] of [['insights', ['money', 'insights']], ['expenses', ['money', 'expenses']], ['contacts', ['customers', 'contacts']], ['broadcast', ['customers', 'broadcast']], ['channels', ['settings', 'channels']], ['business', ['settings', 'business']]]) {
    assert.deepEqual(resolveTab(old, null, map), { tab: where[0], view: where[1] }, old);
  }
  assert.deepEqual(resolveTab('stock', 'services', map), { tab: 'stock', view: 'services' });
  assert.deepEqual(resolveTab('stock', 'nonsense', map), { tab: 'stock', view: 'products' });
});

test('before an industry is chosen, Today holds the setup and Stock keeps only services', () => {
  const map = dashboardMap({ modules: [], setupRequired: true });
  assert.deepEqual(map.sections, ['today', 'chats', 'customers', 'settings']);
  assert.deepEqual(resolveTab('insights', null, map), { tab: 'today', view: null });
});
