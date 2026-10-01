import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { convexMemory } from './helpers/convex-memory.mjs';
import { executeProperty } from '../convex/hasib/propertyState.js';
import { executeRealEstate } from '../convex/hasib/realEstateState.js';
import { executeTeam, workspaceForManager } from '../convex/hasib/workspaceState.js';
import { hasibPack } from '../config/hasib-packs.js';
import { registerPhoto, sweepOrphanPhotos } from '../convex/hasib/photosState.js';
import { capabilitiesFor } from '../convex/hasib/capabilities.js';
import { buildRealEstateSubmission } from '../src/lib/hasib/realEstateForms.js';

const value = result => { assert.equal(result.ok, true, result.reason); return result.value; };

test('real-estate form payloads normalize currency and comma-separated fields', () => {
  const property = buildRealEstateSubmission('property', {
    label: 'Qurum Villa', transactionType: 'sale', price: '125000.500', features: 'pool, garden, pool', bedrooms: '3', bathrooms: '4', sizeSqm: '350',
  }, { requestId: 'request-1', now: 1234, propertyPhotos: [{ id: 'photo-1' }] });
  assert.equal(property.operation, 'property_save');
  assert.equal(property.body.workflow.askingPriceMinor, 125000500);
  assert.deepEqual(property.body.workflow.features, ['pool', 'garden', 'pool']);
  assert.deepEqual(property.body.workflow.photoIds, ['photo-1']);
  assert.equal(property.body.workflow.verificationAt, undefined, 'saving a listing never verifies it');

  const opportunity = buildRealEstateSubmission('opportunity', {
    contactId: 'contact-1', need: 'buy', areas: 'Qurum, Madinat Al Sultan Qaboos', propertyTypes: 'villa, townhouse', budgetMin: '100000', budgetMax: '150000',
    bedrooms: '3', financeReadiness: 'cash', decisionMakerReadiness: 'ready', timeline: '30 days', mustHaves: 'garden, parking', assignedAccountId: '',
  }, { requestId: 'request-2' });
  assert.deepEqual(opportunity.body.workflow.areas, ['Qurum', 'Madinat Al Sultan Qaboos']);
  assert.deepEqual(opportunity.body.workflow.propertyTypes, ['villa', 'townhouse']);
  assert.equal(opportunity.body.workflow.budgetMaxMinor, 150000000);
  assert.equal(opportunity.body.workflow.assignedAccountId, undefined);
});
async function fixture() {
  const m = convexMemory();
  const managerId = await m.db.insert('accounts', { email: 'manager@example.com', role: 'customer', createdAt: m.now() });
  const workspace = await workspaceForManager(m.ctx, managerId, m.now());
  const tenant = { accountId: managerId, pack: hasibPack('real-estate'), row: {} };
  const actor = { workspace, role: 'manager', actorAccountId: managerId };
  tenant.actor = actor;
  const contactId = await m.db.insert('blueContacts', { accountId: managerId, state: 'active' });
  return { m, managerId, workspace, tenant, actor, contactId };
}

test('qualification deduplicates an open need and matching uses only fresh authorized inventory', async () => {
  const { m, tenant, actor, contactId } = await fixture();
  let property = value(await executeProperty(m.ctx, tenant, { operation: 'property_save', requestId: randomUUID(), workflow: { label: 'Qurum Villa', reference: 'RE-1', transactionType: 'sale', propertyType: 'villa', area: 'Qurum', location: 'Muscat', askingPriceMinor: 120000000, bedrooms: 3, authorityStatus: 'confirmed', availability: 'available' } }, m.now()));
  property = value(await executeProperty(m.ctx, tenant, { operation: 'property_verify', propertyId: property.id, version: property.version }, m.now()));
  const stale = value(await executeProperty(m.ctx, tenant, { operation: 'property_save', requestId: randomUUID(), workflow: { label: 'Stale Villa', transactionType: 'sale', propertyType: 'villa', area: 'Qurum', location: 'Muscat', askingPriceMinor: 110000000, bedrooms: 3, authorityStatus: 'confirmed', availability: 'available' } }, m.now()));
  value(await executeProperty(m.ctx, tenant, { operation: 'property_verify', propertyId: stale.id, version: stale.version }, m.now() - 31 * 86400000));
  const args = { operation: 'opportunity_save', requestId: randomUUID(), workflow: { contactId, source: 'whatsapp', need: 'buy', areas: ['Qurum'], propertyTypes: ['villa'], budgetMinMinor: 100000000, budgetMaxMinor: 130000000, bedrooms: 3, financeReadiness: 'ready', decisionMakerReadiness: 'ready', timeline: '30_days', mustHaves: ['garden'] } };
  const opportunity = value(await executeRealEstate(m.ctx, tenant, actor, args, m.now()));
  assert.equal(opportunity.stage, 'qualified');
  const duplicate = value(await executeRealEstate(m.ctx, tenant, actor, { ...args, requestId: randomUUID() }, m.now()));
  assert.equal(duplicate.id, opportunity.id);
  const matches = value(await executeRealEstate(m.ctx, tenant, actor, { operation: 'match_generate', opportunityId: opportunity.id }, m.now()));
  assert.deepEqual(matches.items.map(x => x.propertyId), [property.id]);
  const summary = value(await executeRealEstate(m.ctx, tenant, actor, { operation: 'real_estate_overview' }, m.now()));
  assert.equal(summary.pipeline.qualified, 1);
  assert.deepEqual(summary.listings, { available: 2, reserved: 0, unavailable: 0, verifiedFresh: 1, stale: 1 });
  assert.deepEqual(summary.viewings, { today: 0, upcoming: 0, outcomeMissing: 0 });
  assert.deepEqual(summary.offers, { draft: 0, approvalPending: 0, active: 0, accepted: 0 });
  assert.deepEqual(summary.approvals, { offers: 0, drafts: 0, total: 0 });
});

test('viewings are durable records and employees cannot approve offers or close', async () => {
  const { m, tenant, actor, contactId, workspace } = await fixture();
  const employeeId = await m.db.insert('accounts', { email: 'employee@example.com', role: 'customer', createdAt: m.now() });
  await m.db.insert('ascendWorkspaceMembers', { workspaceId: workspace._id, accountId: employeeId, email: 'employee@example.com', status: 'active', invitedAt: m.now(), activatedAt: m.now(), updatedAt: m.now() });
  const employee = { workspace, role: 'employee', actorAccountId: employeeId };
  const property = value(await executeProperty(m.ctx, tenant, { operation: 'property_save', requestId: randomUUID(), workflow: { label: 'Flat', location: 'Bosher', askingPriceMinor: 50000000, availability: 'available' } }, m.now()));
  const opportunity = value(await executeRealEstate(m.ctx, tenant, actor, { operation: 'opportunity_save', requestId: randomUUID(), workflow: { contactId, need: 'buy', areas: ['Bosher'], propertyTypes: ['flat'], budgetMinMinor: 0, budgetMaxMinor: 60000000, financeReadiness: 'cash', decisionMakerReadiness: 'ready', timeline: 'now', mustHaves: [] } }, m.now()));
  for (let i = 0; i < 2; i++) value(await executeRealEstate(m.ctx, tenant, employee, { operation: 'viewing_save', requestId: randomUUID(), workflow: { opportunityId: opportunity.id, propertyId: property.id, status: 'confirmed', scheduledAt: m.now() + i * 1000 } }, m.now()));
  assert.equal(m.table('realEstateViewings').length, 2);
  const offer = value(await executeRealEstate(m.ctx, tenant, employee, { operation: 'offer_save', requestId: randomUUID(), workflow: { opportunityId: opportunity.id, propertyId: property.id, amountMinor: 48000000, terms: 'Subject to inspection' } }, m.now()));
  assert.equal((await executeRealEstate(m.ctx, tenant, employee, { operation: 'offer_approve', offerId: offer.id, version: offer.version }, m.now())).reason, 'manager_required');
  assert.equal((await executeRealEstate(m.ctx, tenant, employee, { operation: 'deal_close', opportunityId: opportunity.id, offerId: offer.id, commissionMinor: 1000000 }, m.now())).reason, 'manager_required');
});

test('manager close is compliance-gated and creates one commission charge only', async () => {
  const { m, tenant, actor, contactId } = await fixture();
  const property = value(await executeProperty(m.ctx, tenant, { operation: 'property_save', requestId: randomUUID(), workflow: { label: 'Office', location: 'Muscat', askingPriceMinor: 90000000, availability: 'available' } }, m.now()));
  const opportunity = value(await executeRealEstate(m.ctx, tenant, actor, { operation: 'opportunity_save', requestId: randomUUID(), workflow: { contactId, need: 'buy', areas: ['Muscat'], propertyTypes: ['office'], budgetMinMinor: 0, budgetMaxMinor: 100000000, financeReadiness: 'cash', decisionMakerReadiness: 'ready', timeline: 'now', mustHaves: [] } }, m.now()));
  let offer = value(await executeRealEstate(m.ctx, tenant, actor, { operation: 'offer_save', requestId: randomUUID(), workflow: { opportunityId: opportunity.id, propertyId: property.id, amountMinor: 85000000, terms: 'Cash' } }, m.now()));
  offer = value(await executeRealEstate(m.ctx, tenant, actor, { operation: 'offer_approve', offerId: offer.id, version: offer.version }, m.now()));
  offer = value(await executeRealEstate(m.ctx, tenant, actor, { operation: 'offer_save', offerId: offer.id, version: offer.version, workflow: { status: 'presented' } }, m.now()));
  offer = value(await executeRealEstate(m.ctx, tenant, actor, { operation: 'offer_save', offerId: offer.id, version: offer.version, workflow: { status: 'accepted' } }, m.now()));
  assert.equal((await executeRealEstate(m.ctx, tenant, actor, { operation: 'deal_close', opportunityId: opportunity.id, offerId: offer.id, commissionMinor: 2000000 }, m.now())).reason, 'compliance_incomplete');
  let compliance;
  for (const kind of ['identity', 'authority', 'financing', 'agreement', 'completion']) compliance = value(await executeRealEstate(m.ctx, tenant, actor, { operation: 'compliance_update', opportunityId: opportunity.id, version: compliance?.version, kind, status: 'confirmed' }, m.now()));
  const first = value(await executeRealEstate(m.ctx, tenant, actor, { operation: 'deal_close', opportunityId: opportunity.id, offerId: offer.id, commissionMinor: 2000000 }, m.now()));
  const replay = value(await executeRealEstate(m.ctx, tenant, actor, { operation: 'deal_close', opportunityId: opportunity.id, offerId: offer.id, commissionMinor: 2000000 }, m.now()));
  assert.equal(replay.id, first.id);
  assert.equal(m.table('hasibOrders').length, 1);
  assert.equal(m.table('hasibOrders')[0].totalMinor, 2000000);
  assert.notEqual(m.table('hasibOrders')[0].totalMinor, property.askingPriceMinor);
  const due = value(await executeRealEstate(m.ctx, tenant, actor, { operation: 'real_estate_insights' }, m.now()));
  assert.equal(due.commissions.dueMinor, 2000000);
  value(await executeRealEstate(m.ctx, tenant, actor, { operation: 'commission_record', commissionId: first.id, status: 'paid' }, m.now()));
  const paid = value(await executeRealEstate(m.ctx, tenant, actor, { operation: 'real_estate_insights' }, m.now()));
  assert.equal(paid.commissions.paidMinor, 2000000);
  assert.equal(paid.offerToCloseRate, 100);
});

test('property photos and assignments must belong to the same workspace', async () => {
  const { m, tenant, actor } = await fixture();
  const ownPhoto = m.putFile(), foreignPhoto = m.putFile();
  value(await registerPhoto(m.ctx, tenant.accountId, { storageId: ownPhoto, photoCheck: 'ok' }, m.now()));
  const otherId = await m.db.insert('accounts', { email: 'other@example.com', role: 'customer', createdAt: m.now() });
  value(await registerPhoto(m.ctx, otherId, { storageId: foreignPhoto, photoCheck: 'ok' }, m.now()));
  const base = { operation: 'property_save', requestId: randomUUID(), workflow: { label: 'Owned listing', location: 'Muscat', askingPriceMinor: 1000, availability: 'available' } };
  assert.equal((await executeProperty(m.ctx, tenant, { ...base, workflow: { ...base.workflow, photoIds: [foreignPhoto] } }, m.now())).reason, 'invalid_photo');
  assert.equal((await executeProperty(m.ctx, tenant, { ...base, requestId: randomUUID(), workflow: { ...base.workflow, assignedAccountId: otherId } }, m.now())).reason, 'invalid_assignment');
  const saved = value(await executeProperty(m.ctx, tenant, { ...base, requestId: randomUUID(), workflow: { ...base.workflow, photoIds: [ownPhoto], assignedAccountId: actor.actorAccountId } }, m.now()));
  assert.deepEqual(saved.photoIds, [ownPhoto]);
  await sweepOrphanPhotos(m.ctx, m.now() + 25 * 3600000);
  assert.ok(await m.ctx.db.system.get(ownPhoto), 'the orphan sweeper retains a listing photo');
});

test('employee capability payload removes manager-only controls', () => {
  const employee = capabilitiesFor('ascend', 'employee');
  assert.equal(employee.realEstate, true);
  for (const key of ['money', 'insights', 'approvals', 'exports', 'imports', 'broadcasts', 'team', 'settings']) assert.equal(employee[key], false, key);
});

test('manager-approved follow-ups queue free text only in-window and utility templates outside it', async () => {
  const { m, tenant, actor, contactId } = await fixture();
  tenant.row = { integration: { id: 'integration-1' }, profileVersion: 1 };
  tenant.workerFunction = 'dispatch';
  await m.db.patch(contactId, { state: 'active', waId: '96890000000', numberHash: 'number-hash', optout: false });
  const opportunity = value(await executeRealEstate(m.ctx, tenant, actor, { operation: 'opportunity_save', requestId: randomUUID(), workflow: { contactId, need: 'buy', areas: ['Muscat'], propertyTypes: ['flat'], budgetMinMinor: 0, budgetMaxMinor: 100000, financeReadiness: 'cash', decisionMakerReadiness: 'ready', timeline: 'now', mustHaves: [] } }, m.now()));
  const inWindow = await m.db.insert('blueConversations', { accountId: tenant.accountId, integrationId: 'integration-1', lastInbound: m.now(), version: 0, optout: false });
  let draft = value(await executeRealEstate(m.ctx, tenant, actor, { operation: 'draft_save', requestId: randomUUID(), workflow: { opportunityId: opportunity.id, conversationId: inWindow, kind: 'follow_up', text: 'Would tomorrow work?' } }, m.now()));
  draft = value(await executeRealEstate(m.ctx, tenant, actor, { operation: 'draft_approve', draftId: draft.id, version: draft.version }, m.now()));
  assert.equal(draft.status, 'queued');
  assert.equal(m.table('blueMessages').at(-1).text, 'Would tomorrow work?');

  const outside = await m.db.insert('blueConversations', { accountId: tenant.accountId, integrationId: 'integration-1', lastInbound: m.now() - 2 * 86400000, version: 0, optout: false });
  await m.db.insert('blueTemplates', { accountId: tenant.accountId, integrationId: 'integration-1', templateId: 'viewing_utility', name: 'viewing_utility', language: 'en', category: 'UTILITY', status: 'APPROVED', parameterFormat: 'POSITIONAL', body: 'Your viewing is confirmed.', buttons: [], variables: [], sendable: true, syncedAt: m.now() });
  let templateDraft = value(await executeRealEstate(m.ctx, tenant, actor, { operation: 'draft_save', requestId: randomUUID(), workflow: { opportunityId: opportunity.id, conversationId: outside, kind: 'viewing_confirmation', text: 'Free text must not be sent', templateId: 'viewing_utility' } }, m.now()));
  templateDraft = value(await executeRealEstate(m.ctx, tenant, actor, { operation: 'draft_approve', draftId: templateDraft.id, version: templateDraft.version }, m.now()));
  assert.equal(templateDraft.status, 'queued_template');
  assert.equal(m.table('blueCampaignRecipients').at(-1).realEstateDraftId, templateDraft.id);
  assert.equal(m.table('blueMessages').some(row => row.text === 'Free text must not be sent'), false);
});

test('team limit and revocation invalidate employee sessions', async () => {
  const { m, tenant, actor } = await fixture();
  for (let i = 0; i < 5; i++) value(await executeTeam(m.ctx, tenant, actor, { operation: 'team_invite', email: `e${i}@example.com` }, m.now()));
  assert.equal((await executeTeam(m.ctx, tenant, actor, { operation: 'team_invite', email: 'six@example.com' }, m.now())).reason, 'team_limit');
  const member = m.table('ascendWorkspaceMembers')[0];
  const employeeId = await m.db.insert('accounts', { email: member.email, role: 'customer', createdAt: m.now() });
  await m.db.patch(member._id, { accountId: employeeId, status: 'active', activatedAt: m.now() });
  await m.db.insert('sessions', { accountId: employeeId, tokenHash: 'x', createdAt: m.now(), expiresAt: m.now() + 10000 });
  value(await executeTeam(m.ctx, tenant, actor, { operation: 'team_revoke', memberId: member._id }, m.now()));
  assert.equal(m.table('sessions').length, 0);
  assert.equal(m.table('ascendWorkspaceMembers')[0].status, 'revoked');
});
