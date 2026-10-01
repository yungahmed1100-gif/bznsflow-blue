// Phase 4: the dashboard map and old links.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardMap, resolveTab } from '../src/lib/dashboard/navigation.js';

const retail = { modules: ['orders', 'stock', 'expenses', 'insights'], setupRequired: false };
const tech = { modules: ['orders', 'stock', 'expenses', 'insights', 'serials', 'repairs', 'tradeIns'], setupRequired: false };
const construction = { modules: ['orders', 'stock', 'expenses', 'insights'], setupRequired: false, pack: { id: 'construction' }, workspaceRole: 'manager' };
const automotive = { modules: ['orders', 'stock', 'expenses', 'insights'], setupRequired: false, pack: { id: 'automotive' }, workspaceRole: 'manager' };

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

test('construction owns its dedicated sections without generic product, expense, or channel sub-tabs', () => {
  const map = dashboardMap(construction);
  assert.deepEqual(map.views.stock, []);
  assert.deepEqual(map.views.money, []);
  assert.deepEqual(map.views.settings, []);
  assert.ok(map.sections.includes('money'));
  assert.deepEqual(resolveTab('stock', 'products', map), { tab: 'stock', view: null });
});

test('automotive keeps the legacy stock URL and exposes its dedicated Money section', () => {
  const map = dashboardMap(automotive);
  assert.deepEqual(map.views.stock, []);
  assert.deepEqual(map.views.money, []);
  assert.ok(map.sections.includes('money'));
  assert.deepEqual(resolveTab('stock', 'products', map), { tab: 'stock', view: null });
  assert.deepEqual(resolveTab('money', null, map), { tab: 'money', view: null });
});

test('a dental clinic: the same sections, a clinic’s views, and old links still land', () => {
  const dental = { modules: ['orders', 'stock', 'expenses', 'insights'], setupRequired: false, pack: { id: 'dental' } };
  const map = dashboardMap(dental);
  assert.deepEqual(map.sections, ['today', 'chats', 'orders', 'stock', 'money', 'customers', 'team', 'settings'], 'dental has a front-desk team');
  assert.deepEqual(map.views.stock, ['services', 'products'], 'treatments first, then supplies');
  assert.deepEqual(map.views.customers, ['contacts'], 'no mass messaging to patients');
  assert.deepEqual(resolveTab('broadcast', null, map), { tab: 'customers', view: 'contacts' });
  assert.deepEqual(resolveTab('stock', null, map), { tab: 'stock', view: 'services' });
  assert.deepEqual(dashboardMap(retail).views.stock, ['products', 'services'], 'shops are unchanged');
  assert.deepEqual(dashboardMap(retail).views.customers, ['contacts', 'broadcast']);
});

test('Accounts and VAT appear in Settings once an industry is set', () => {
  assert.deepEqual(dashboardMap(retail).views.settings, ['channels', 'business', 'accounts']);
  assert.deepEqual(dashboardMap(null).views.settings, ['channels', 'business']);
  assert.deepEqual(dashboardMap({ modules: [], setupRequired: true }).views.settings, ['channels', 'business']);
});
