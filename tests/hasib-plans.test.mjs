// Hasib is part of Ascend (and Apex). An account opens it only with an active plan
// grant; Layla-only (Catalyst) accounts never see it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { blueHarness, seedTenant } from './helpers/blue-tenant.mjs';
import { SECRET } from './helpers/convex-memory.mjs';
import { executeHasib } from '../convex/hasib/hasibState.js';
import { grantPlan, revokePlan, HASIB_PLANS } from '../convex/hasib/plans.js';

async function setup() {
  const h = blueHarness();
  await h.enable();
  await h.m.db.insert('blueMessagingSettings', { key: 'hasib', enabled: true });
  const a = await seedTenant(h.m, { name: 'a', sector: 'Technology & software' });
  const hasib = (operation, args = {}) => executeHasib(h.m.ctx, { operation, sessionHash: a.sessionHash, hashSecret: SECRET, ...args }, h.m.now());
  return { h, a, hasib };
}

test('Ascend and Apex include Hasib; Catalyst does not', () => {
  assert.deepEqual(HASIB_PLANS, ['ascend', 'apex']);
});

test('an account without a plan grant cannot open Hasib at all', async () => {
  const { hasib } = await setup();
  assert.equal((await hasib('overview')).reason, 'plan_required');
  assert.equal((await hasib('items')).reason, 'plan_required');
  assert.equal((await hasib('settings_update', { packId: 'retail' })).reason, 'plan_required');
});

test('granting Ascend by email with the retail pack opens Hasib directly, and Layla is untouched', async () => {
  const { h, a, hasib } = await setup();
  const r = await grantPlan(h.m.ctx, { email: ' A@Example.com ', plan: 'ascend', packId: 'retail', note: 'owner test account' }, h.m.now());
  assert.equal(r.ok, true, r.reason);
  const o = (await hasib('overview')).value;
  assert.equal(o.setupRequired, false);
  assert.equal(o.pack.id, 'retail');
  assert.equal(o.plan, 'ascend');
  assert.equal(h.m.table('blueReviewSessions').find(x => x._id === a.rowId).profile.sector, 'Technology & software');
  // Granting again updates in place instead of duplicating.
  await grantPlan(h.m.ctx, { email: 'a@example.com', plan: 'apex' }, h.m.now());
  assert.equal(h.m.table('blueEntitlements').filter(e => e.accountId === a.accountId).length, 1);
  assert.equal((await hasib('overview')).value.plan, 'apex');
  assert.equal((await hasib('overview')).value.pack.id, 'retail', 'a later grant without a pack keeps the chosen industry');
});

test('grants refuse unknown accounts, plans and packs; revoking closes Hasib but keeps data', async () => {
  const { h, hasib } = await setup();
  assert.equal((await grantPlan(h.m.ctx, { email: 'nobody@example.com', plan: 'ascend' }, h.m.now())).reason, 'account_not_found');
  assert.equal((await grantPlan(h.m.ctx, { email: 'a@example.com', plan: 'catalyst' }, h.m.now())).reason, 'invalid_plan');
  assert.equal((await grantPlan(h.m.ctx, { email: 'a@example.com', plan: 'ascend', packId: 'clinic' }, h.m.now())).reason, 'pack_not_live');
  await grantPlan(h.m.ctx, { email: 'a@example.com', plan: 'ascend', packId: 'retail' }, h.m.now());
  await hasib('expense_create', { requestId: '0b6f6c7e-8f4a-4d3b-9c2e-1a2b3c4d5e6f', category: 'rent', amountMinor: 1000, method: 'cash', paidOn: '2027-01-15' });
  assert.equal((await revokePlan(h.m.ctx, { email: 'a@example.com' }, h.m.now())).ok, true);
  assert.equal((await hasib('overview')).reason, 'plan_required');
  assert.equal(h.m.table('hasibExpenses').length, 1, 'revoking never deletes business records');
});
