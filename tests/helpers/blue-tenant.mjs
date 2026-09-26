import { randomUUID } from 'node:crypto';
import { executeMessaging } from '../../convex/blueMessagingState.js';
import { executeDashboard } from '../../convex/blueDashboardState.js';
import { executeAudience } from '../../convex/blueAudienceState.js';
import { executeCampaigns, executeCampaignWorker, maintainCampaigns } from '../../convex/blueCampaignState.js';
import { convexMemory, SECRET, APP } from './convex-memory.mjs';

export const profileFor = (sector = 'Real estate') => ({ businessName: 'Blue Studio', sector, services: 'Villas and apartments', prices: 'From 500 OMR', hours: '9–5', location: 'Muscat', humanContact: 'team@example.com', reviewed: true });

/** Seed one verified, connected, approved and activated tenant. */
export async function seedTenant(m, { name = 'a', sector = 'Real estate', phone = '5678', waba = '1234', sender = '96890000000' } = {}) {
  const accountId = await m.db.insert('accounts', { email: `${name}@example.com`, role: 'customer', createdAt: m.now() });
  const sessionHash = name.charCodeAt(0).toString(16).padStart(2, '0').repeat(32);
  const integration = { id: randomUUID(), app: APP, waba, phone, sender, path: 'new_number', credential: { v: 1, iv: 'x', data: 'x', tag: 'x' } };
  const rowId = await m.db.insert('blueReviewSessions', { accountId, sessionHash, expiresAt: 1e15, status: 'connected', profile: profileFor(sector), profileVersion: 1,
    checkedAt: m.now(), connectionChecks: { routing: true, registered: true, path: true }, integration, phone, waba, createdAt: m.now(), updatedAt: m.now(), attempts: 0 });
  await m.db.patch(accountId, { draftHash: sessionHash });
  return { accountId, sessionHash, integration, rowId };
}

export function blueHarness() {
  const m = convexMemory();
  const withSecret = args => ({ hashSecret: SECRET, workerFunction: 'dispatch', ...args });
  const messaging = (operation, args = {}) => executeMessaging(m.ctx, withSecret({ operation, ...args }), m.now());
  const dashboard = (operation, args = {}) => executeDashboard(m.ctx, withSecret({ operation, ...args }), m.now());
  const audience = (operation, args = {}) => executeAudience(m.ctx, withSecret({ operation, ...args }), m.now());
  const campaigns = (operation, args = {}) => executeCampaigns(m.ctx, withSecret({ operation, ...args }), m.now());
  const worker = (operation, args = {}) => executeCampaignWorker(m.ctx, withSecret({ operation, ...args }), m.now());
  const maintain = () => maintainCampaigns(m.ctx, withSecret({}), m.now());
  const enable = async () => {
    await m.db.insert('blueMessagingSettings', { key: 'global', enabled: true });
    await m.db.insert('blueMessagingSettings', { key: 'broadcast', enabled: true });
  };
  const inbound = (tenant, { id = randomUUID(), from = '96891111111', text = 'Hello', reply = 'Thanks', intent = 'services', profileName, handoff = false } = {}) =>
    messaging('ingest', { integrationId: tenant.integration.id, events: [{ kind: 'message', id, from, at: m.now(), text, reply, intent, handoff, ...(profileName ? { profileName } : {}) }] });
  return { m, messaging, dashboard, audience, campaigns, worker, maintain, enable, inbound };
}
