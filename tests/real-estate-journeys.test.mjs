// Real Estate is the agency pack on Ascend: properties, a deal pipeline
// (opportunity → viewing → offer → compliance → close → commission), and a team
// of agents. These journeys run the real Convex state code for a manager and an
// invited agent, and pin down what each may do and see.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { blueHarness, seedTenant } from './helpers/blue-tenant.mjs';
import { SECRET } from './helpers/convex-memory.mjs';
import { executeHasib } from '../convex/hasib/hasibState.js';
import { grantPlan } from '../convex/hasib/plans.js';
import { dashboardMap } from '../src/lib/dashboard/navigation.js';

const DAY = 86400000;
const value = r => { assert.equal(r.ok, true, r.reason); return r.value; };
const refused = (r, reason) => { assert.equal(r.ok, false, `expected ${reason}`); assert.equal(r.reason, reason); };
const CHECKS = ['identity', 'authority', 'financing', 'agreement', 'completion'];

async function agency() {
  const h = blueHarness();
  await h.enable();
  await h.m.db.insert('blueMessagingSettings', { key: 'hasib', enabled: true });
  const a = await seedTenant(h.m, { name: 'a', sector: 'Real estate' });
  await h.messaging('activate', { sessionHash: a.sessionHash });
  value(await grantPlan(h.m.ctx, { email: 'a@example.com', plan: 'ascend', packId: 'real-estate' }, h.m.now()));
  const as = actorAccountId => (operation, args = {}) => executeHasib(h.m.ctx, { operation, sessionHash: a.sessionHash, hashSecret: SECRET, ...(actorAccountId ? { actorAccountId } : {}), ...args }, h.m.now());
  const manager = as(null);
  const invite = async email => {
    const team = value(await manager('team_invite', { email }));
    const id = await h.m.db.insert('accounts', { email, role: 'customer', createdAt: h.m.now() });
    await h.m.db.patch(team.id, { accountId: id, status: 'active', activatedAt: h.m.now() });
    return id;
  };
  const agentId = await invite('agent@example.com'), otherId = await invite('other@example.com');
  return { h, a, manager, agent: as(agentId), other: as(otherId), agentId, otherId };
}

async function customer(h, a, name = 'Aisha') {
  await h.inbound(a, { from: `9689${Math.floor(Math.random() * 1e7)}`, text: 'I am looking for a villa', profileName: name });
  return (await h.dashboard('contacts', { sessionHash: a.sessionHash })).value.items.find(c => c.name === name) || (await h.dashboard('contacts', { sessionHash: a.sessionHash })).value.items[0];
}
const villa = (run, extra = {}) => run('property_save', { requestId: randomUUID(), workflow: { label: 'Qurum Villa', reference: 'RE-1', transactionType: 'sale', propertyType: 'villa', area: 'Qurum', location: 'Qurum, Muscat', askingPriceMinor: 120000000, bedrooms: 4, authorityStatus: 'confirmed', availability: 'available', ...extra } });
const need = (run, contactId, extra = {}) => run('opportunity_save', { requestId: randomUUID(), workflow: { contactId, need: 'buy', areas: ['Qurum'], propertyTypes: ['villa'], budgetMinMinor: 100000000, budgetMaxMinor: 130000000, bedrooms: 3, financeReadiness: 'cash', decisionMakerReadiness: 'ready', timeline: '30 days', mustHaves: [], ...extra } });
const offerTo = async (run, opportunity, property, amountMinor = 115000000) => value(await run('offer_save', { requestId: randomUUID(), workflow: { opportunityId: opportunity.id, propertyId: property.id, amountMinor, terms: 'Cash, completion in 30 days' } }));

test('real estate on Ascend: the manager sees every section; an agent sees no Money, Team or Settings', async () => {
  const { manager, agent } = await agency();
  const m = value(await manager('overview'));
  assert.deepEqual(dashboardMap(m, m.capabilities).sections, ['today', 'chats', 'orders', 'stock', 'money', 'customers', 'team', 'settings']);
  const e = value(await agent('overview'));
  assert.deepEqual(dashboardMap(e, e.capabilities).sections, ['today', 'chats', 'orders', 'stock', 'customers']);
});

test('Today stays up while offers are live (the overview used to crash)', async () => {
  const { h, a, manager } = await agency();
  const who = await customer(h, a);
  const property = value(await villa(manager)); value(await manager('property_verify', { propertyId: property.id, version: property.version }));
  const deal = value(await need(manager, who.id));
  const offer = await offerTo(manager, deal, property);
  value(await manager('offer_approve', { offerId: offer.id, version: offer.version }));
  h.m.advance(3 * 3600000);
  const overview = value(await manager('real_estate_overview'));
  assert.equal(overview.offers.active, 1);
  assert.ok(overview.tasks.some(t => t.kind === 'offer_unanswered'), 'an unanswered offer becomes a task');
});

test('an agent sees only their own and unassigned deals, and cannot hand deals to others', async () => {
  const { h, a, manager, agent, agentId, otherId } = await agency();
  const c1 = await customer(h, a, 'Aisha'), c2 = await customer(h, a, 'Salim'), c3 = await customer(h, a, 'Maryam');
  const mine = value(await need(manager, c1.id, { assignedAccountId: agentId }));
  const theirs = value(await need(manager, c2.id, { assignedAccountId: otherId }));
  const open = value(await need(manager, c3.id));
  const seen = value(await agent('opportunities')).items.map(x => x.id).sort();
  assert.deepEqual(seen, [mine.id, open.id].sort());
  refused(await agent('deal_history', { opportunityId: theirs.id }), 'opportunity_not_found');
  refused(await agent('opportunity_save', { opportunityId: theirs.id, version: theirs.version, workflow: { nextAction: 'Call' } }), 'opportunity_not_found');
  refused(await agent('opportunity_save', { opportunityId: open.id, version: open.version, workflow: { assignedAccountId: otherId } }), 'invalid_assignment');
  value(await agent('opportunity_save', { opportunityId: open.id, version: open.version, workflow: { assignedAccountId: agentId } }));
  const counts = value(await agent('real_estate_overview')).counts;
  assert.equal(counts.opportunities, 2, 'Today counts only the agent’s deals');
  for (const op of ['commissions', 'real_estate_insights']) refused(await agent(op), 'manager_required');
  assert.ok(value(await agent('opportunities')).items.every(x => x.contactName), 'deals carry the customer’s name');
});

test('a deal moves forward step by step, is lost only with a reason, and is won only by closing', async () => {
  const { h, a, manager } = await agency();
  const who = await customer(h, a);
  let deal = value(await need(manager, who.id, { financeReadiness: 'unknown' }));
  assert.equal(deal.stage, 'new');
  deal = value(await manager('opportunity_stage', { opportunityId: deal.id, version: deal.version, status: 'contacted' }));
  assert.equal(deal.stage, 'contacted');
  refused(await manager('opportunity_stage', { opportunityId: deal.id, version: deal.version, status: 'new' }), 'invalid_stage_transition');
  refused(await manager('opportunity_stage', { opportunityId: deal.id, version: deal.version, status: 'won' }), 'invalid_stage_transition');
  refused(await manager('opportunity_stage', { opportunityId: deal.id, version: deal.version, status: 'lost' }), 'lost_reason_required');
  deal = value(await manager('opportunity_stage', { opportunityId: deal.id, version: deal.version, status: 'lost', reason: 'Bought elsewhere' }));
  assert.deepEqual([deal.stage, deal.lostReason], ['lost', 'Bought elsewhere']);
  const history = value(await manager('deal_history', { opportunityId: deal.id })).items.map(e => e.toStage);
  assert.deepEqual(history, ['new', 'contacted', 'lost']);
});

test('a viewing is confirmed, then completed with an outcome or missed — never reopened', async () => {
  const { h, a, manager, agent, agentId } = await agency();
  const who = await customer(h, a);
  const property = value(await villa(manager));
  const deal = value(await need(manager, who.id, { assignedAccountId: agentId }));
  let viewing = value(await agent('viewing_save', { requestId: randomUUID(), workflow: { opportunityId: deal.id, propertyId: property.id, scheduledAt: h.m.now() + DAY } }));
  assert.equal(viewing.status, 'requested');
  viewing = value(await agent('viewing_save', { viewingId: viewing.id, version: viewing.version, workflow: { status: 'confirmed' } }));
  refused(await agent('viewing_save', { viewingId: viewing.id, version: viewing.version, workflow: { status: 'completed' } }), 'viewing_outcome_required');
  viewing = value(await agent('viewing_save', { viewingId: viewing.id, version: viewing.version, workflow: { status: 'completed', outcome: 'Liked the garden; wants a second visit' } }));
  refused(await agent('viewing_save', { viewingId: viewing.id, version: viewing.version, workflow: { status: 'requested' } }), 'invalid_viewing_transition');
  const listed = value(await agent('viewings')).items.find(v => v.id === viewing.id);
  assert.deepEqual([listed.propertyLabel, !!listed.contactName], ['Qurum Villa', true], 'a viewing says which property and which customer');
});

test('an offer needs approval before it is presented, and an accepted offer is final', async () => {
  const { h, a, manager, agent, agentId } = await agency();
  const who = await customer(h, a);
  const property = value(await villa(manager));
  const deal = value(await need(manager, who.id, { assignedAccountId: agentId }));
  let offer = await offerTo(agent, deal, property);
  refused(await agent('offer_save', { offerId: offer.id, version: offer.version, workflow: { status: 'presented' } }), 'offer_approval_required');
  refused(await agent('offer_approve', { offerId: offer.id, version: offer.version }), 'manager_required');
  offer = value(await manager('offer_approve', { offerId: offer.id, version: offer.version }));
  offer = value(await agent('offer_save', { offerId: offer.id, version: offer.version, workflow: { status: 'presented' } }));
  offer = value(await agent('offer_save', { offerId: offer.id, version: offer.version, workflow: { status: 'countered', amountMinor: 118000000, terms: 'Seller counter: 118,000' } }));
  offer = value(await agent('offer_save', { offerId: offer.id, version: offer.version, workflow: { status: 'accepted' } }));
  refused(await agent('offer_save', { offerId: offer.id, version: offer.version, workflow: { status: 'draft' } }), 'invalid_offer_transition');
  refused(await agent('offer_save', { offerId: offer.id, version: offer.version, workflow: { status: 'withdrawn' } }), 'invalid_offer_transition');
  assert.equal(offer.propertyLabel, 'Qurum Villa');
});

test('compliance is confirmed one check at a time by the manager, and closing waits for all five', async () => {
  const { h, a, manager, agent } = await agency();
  const who = await customer(h, a);
  const property = value(await villa(manager));
  const deal = value(await need(manager, who.id));
  let offer = await offerTo(manager, deal, property);
  offer = value(await manager('offer_approve', { offerId: offer.id, version: offer.version }));
  offer = value(await manager('offer_save', { offerId: offer.id, version: offer.version, workflow: { status: 'presented' } }));
  offer = value(await manager('offer_save', { offerId: offer.id, version: offer.version, workflow: { status: 'accepted' } }));
  refused(await agent('compliance_update', { opportunityId: deal.id, kind: 'identity', status: 'confirmed' }), 'manager_required');
  refused(await manager('compliance_update', { opportunityId: deal.id, workflow: { identityStatus: 'confirmed', authorityStatus: 'confirmed', financingStatus: 'confirmed', agreementStatus: 'confirmed', completionStatus: 'confirmed' } }), 'invalid_compliance');
  let version;
  for (const check of CHECKS.slice(0, 4)) {
    const row = value(await manager('compliance_update', { opportunityId: deal.id, version, kind: check, status: check === 'financing' ? 'not_applicable' : 'confirmed' }));
    version = row.version;
    assert.ok(row.confirmedBy?.[check], `${check} records who confirmed it`);
  }
  refused(await manager('deal_close', { opportunityId: deal.id, offerId: offer.id, commissionMinor: 2400000 }), 'compliance_incomplete');
  value(await manager('compliance_update', { opportunityId: deal.id, version, kind: 'completion', status: 'confirmed' }));
  refused(await agent('deal_close', { opportunityId: deal.id, offerId: offer.id, commissionMinor: 2400000 }), 'manager_required');
  const commission = value(await manager('deal_close', { opportunityId: deal.id, offerId: offer.id, commissionMinor: 2400000 }));
  assert.equal(h.m.table('hasibProperties')[0].availability, 'unavailable');
  assert.equal(h.m.table('realEstateOpportunities').find(o => o._id === deal.id).stage, 'won');
  const order = h.m.table('hasibOrders').find(o => o._id === commission.orderId);
  value(await manager('payment_record', { requestId: randomUUID(), orderId: order._id, amountMinor: 2400000, method: 'bank_transfer' }));
  refused(await agent('payment_record', { requestId: randomUUID(), orderId: order._id, amountMinor: -2400000, method: 'bank_transfer' }), 'manager_required');
  value(await manager('commission_record', { commissionId: commission.id, status: 'paid' }));
  assert.equal(value(await manager('real_estate_insights')).commissions.paidMinor, 2400000);
});

test('a listing is verified on purpose, not by editing it; only fresh, verified listings are matched', async () => {
  const { h, a, manager } = await agency();
  const who = await customer(h, a);
  let property = value(await villa(manager));
  assert.equal(property.verificationAt, undefined, 'saving a listing does not verify it');
  const deal = value(await need(manager, who.id));
  assert.deepEqual(value(await manager('match_generate', { opportunityId: deal.id })).items, [], 'an unverified listing is not offered');
  property = value(await manager('property_verify', { propertyId: property.id, version: property.version }));
  assert.equal(property.verificationAt, h.m.now());
  const [match] = value(await manager('match_generate', { opportunityId: deal.id })).items;
  assert.deepEqual([match.propertyLabel, match.askingPriceMinor, match.location], ['Qurum Villa', 120000000, 'Qurum, Muscat'], 'a match is readable');
  h.m.advance(DAY);
  property = value(await manager('property_save', { propertyId: property.id, version: property.version, workflow: { askingPriceMinor: 119000000 } }));
  assert.equal(property.verificationAt, h.m.now() - DAY, 'an edit keeps the old verification date');
});

test('tasks close themselves when the problem is fixed, and can be resolved by hand', async () => {
  const { h, a, manager } = await agency();
  const property = value(await villa(manager));
  let overview = value(await manager('real_estate_overview'));
  const stale = overview.tasks.find(t => t.kind === 'stale_listing');
  assert.ok(stale, 'an unverified available listing is a task');
  value(await manager('property_verify', { propertyId: property.id, version: property.version }));
  overview = value(await manager('real_estate_overview'));
  assert.equal(overview.tasks.some(t => t.kind === 'stale_listing'), false, 'verifying closes the task');
  const who = await customer(h, a);
  const deal = value(await need(manager, who.id));
  const viewing = value(await manager('viewing_save', { requestId: randomUUID(), workflow: { opportunityId: deal.id, propertyId: property.id, scheduledAt: h.m.now() + 1000 } }));
  h.m.advance(DAY);
  overview = value(await manager('real_estate_overview'));
  const missing = overview.tasks.find(t => t.kind === 'viewing_outcome_missing');
  assert.ok(missing);
  value(await manager('real_estate_task_resolve', { taskId: missing.id, reason: 'Customer called; viewing moved' }));
  overview = value(await manager('real_estate_overview'));
  assert.equal(overview.tasks.some(t => t.id === missing.id), false);
  assert.ok(viewing.id);
});

test('the old enquiry model is retired; Today’s measures read the deal pipeline', async () => {
  const { h, a, manager } = await agency();
  const who = await customer(h, a);
  refused(await manager('enquiry_create', { requestId: randomUUID(), workflow: { contactId: who.id, location: 'Muscat', budgetMinor: 1 } }), 'invalid_action');
  value(await need(manager, who.id, { financeReadiness: 'unknown' }));
  const today = value(await manager('today'));
  const metric = id => today.industryMetrics.find(m => m.id === id)?.value;
  assert.equal(metric('enquiries_waiting'), 1, 'a new deal is waiting');
});
