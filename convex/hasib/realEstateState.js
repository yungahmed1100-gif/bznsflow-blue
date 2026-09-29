import { owned } from '../blueTenant.js';
import { ok, fail, bounded, REQUEST_ID, byRequest, clampLimit, settingsFor } from './shared.js';
import { isMinor } from './money.js';
import { createOrder } from './ordersState.js';
import { audit, workspaceContainsAccount } from './workspaceState.js';
import { businessTimezone } from './expensesState.js';
import { periodRange } from './period.js';

const DAY = 86400000;
const OPEN_STAGES = ['new', 'contacted', 'qualified', 'viewing', 'offer'];
const STAGES = [...OPEN_STAGES, 'won', 'lost'];
const publicRow = row => { const { _id, _seq, table, accountId, requestId, ...rest } = row; return { id: _id, ...rest }; };
const strings = (value, max = 10, length = 120) => Array.isArray(value) ? [...new Set(value.map(x => bounded(x, length)).filter(Boolean))].slice(0, max) : null;
const list = async (ctx, table, accountId, a, index = 'by_account_created') => {
  const page = await ctx.db.query(table).withIndex(index, q => q.eq('accountId', accountId)).order('desc').paginate({ numItems: clampLimit(a.limit, 200), cursor: a.cursor || null });
  return ok({ items: page.page.map(publicRow), cursor: page.isDone ? null : page.continueCursor });
};
const ownsActor = (ctx, actor, accountId) => workspaceContainsAccount(ctx, actor.workspace, accountId);
const qualified = row => row.areas.length && row.propertyTypes.length && isMinor(row.budgetMaxMinor) && row.budgetMaxMinor > 0
  && row.financeReadiness !== 'unknown' && row.decisionMakerReadiness !== 'unknown' && row.timeline !== 'unknown';

async function advanceOpportunity(ctx, tenant, actor, opportunityId, stage, now) {
  const row = await owned(ctx, opportunityId, tenant.accountId, 'realEstateOpportunities');
  if (!row || !OPEN_STAGES.includes(row.stage) || OPEN_STAGES.indexOf(stage) <= OPEN_STAGES.indexOf(row.stage)) return;
  await ctx.db.patch(row._id, { stage, version: row.version + 1, updatedAt: now });
  await ctx.db.insert('realEstateDealEvents', { accountId: tenant.accountId, opportunityId: row._id, fromStage: row.stage, toStage: stage,
    actorAccountId: actor.actorAccountId, actorRole: actor.role, at: now });
}

async function opportunitySave(ctx, tenant, actor, a, now) {
  const w = a.workflow || {}, accountId = tenant.accountId;
  let row = a.opportunityId ? await owned(ctx, a.opportunityId, accountId, 'realEstateOpportunities') : null;
  if (a.opportunityId && !row) return fail('opportunity_not_found');
  if (row && row.version !== a.version) return fail('opportunity_conflict');
  if (!row) {
    if (!REQUEST_ID.test(a.requestId || '')) return fail('invalid_request');
    const replay = await byRequest(ctx, 'realEstateOpportunities', accountId, a.requestId);
    if (replay) return ok(publicRow(replay));
  }
  const contactId = w.contactId || row?.contactId;
  if (!await owned(ctx, contactId, accountId, 'blueContacts')) return fail('contact_not_found');
  const need = w.need ?? row?.need ?? 'buy';
  if (!['buy', 'rent', 'sell', 'invest'].includes(need)) return fail('invalid_opportunity');
  if (!row) {
    const open = await ctx.db.query('realEstateOpportunities').withIndex('by_contact_stage', q => q.eq('contactId', contactId)).take(20);
    const existing = open.find(x => x.need === need && OPEN_STAGES.includes(x.stage));
    if (existing) row = existing;
  }
  const assignedAccountId = w.assignedAccountId ?? row?.assignedAccountId;
  if (assignedAccountId && !await ownsActor(ctx, actor, assignedAccountId)) return fail('invalid_assignment');
  const data = {
    contactId, ...(w.conversationId ?? row?.conversationId ? { conversationId: w.conversationId ?? row.conversationId } : {}),
    source: bounded(w.source ?? row?.source ?? 'manual', 40), need,
    areas: strings(w.areas ?? row?.areas ?? [], 10, 100), propertyTypes: strings(w.propertyTypes ?? row?.propertyTypes ?? [], 10, 60),
    budgetMinMinor: w.budgetMinMinor ?? row?.budgetMinMinor ?? 0, budgetMaxMinor: w.budgetMaxMinor ?? row?.budgetMaxMinor ?? 0,
    ...(Number.isSafeInteger(w.bedrooms ?? row?.bedrooms) ? { bedrooms: w.bedrooms ?? row.bedrooms } : {}),
    financeReadiness: bounded(w.financeReadiness ?? row?.financeReadiness ?? 'unknown', 40),
    decisionMakerReadiness: bounded(w.decisionMakerReadiness ?? row?.decisionMakerReadiness ?? 'unknown', 40),
    timeline: bounded(w.timeline ?? row?.timeline ?? 'unknown', 80), mustHaves: strings(w.mustHaves ?? row?.mustHaves ?? [], 20, 120),
    ...(assignedAccountId ? { assignedAccountId } : {}), nextAction: bounded(w.nextAction ?? row?.nextAction, 200) || undefined,
    firstInboundAt: w.firstInboundAt ?? row?.firstInboundAt ?? now,
    ...(Number.isSafeInteger(w.replyQueuedAt ?? row?.replyQueuedAt) ? { replyQueuedAt: w.replyQueuedAt ?? row.replyQueuedAt } : {}),
    ...(Number.isSafeInteger(w.providerSubmittedAt ?? row?.providerSubmittedAt) ? { providerSubmittedAt: w.providerSubmittedAt ?? row.providerSubmittedAt } : {}),
    ...(Number.isSafeInteger(w.deliveredAt ?? row?.deliveredAt) ? { deliveredAt: w.deliveredAt ?? row.deliveredAt } : {}),
    ...(bounded(w.lostReason ?? row?.lostReason, 200) ? { lostReason: bounded(w.lostReason ?? row.lostReason, 200) } : {}),
    version: (row?.version || 0) + 1, updatedAt: now,
  };
  if (!data.source || !data.areas || !data.propertyTypes || !data.mustHaves || !isMinor(data.budgetMinMinor) || !isMinor(data.budgetMaxMinor) || data.budgetMinMinor > data.budgetMaxMinor) return fail('invalid_opportunity');
  let stage = w.stage ?? row?.stage ?? 'new';
  if (!STAGES.includes(stage) || (stage === 'lost' && !data.lostReason)) return fail('invalid_opportunity');
  if (stage === 'qualified' && !qualified(data)) return fail('qualification_incomplete');
  if (OPEN_STAGES.includes(stage) && qualified(data) && ['new', 'contacted'].includes(stage)) stage = 'qualified';
  data.stage = stage;
  const priorStage = row?.stage;
  let id;
  if (row) { await ctx.db.patch(row._id, data); id = row._id; }
  else id = await ctx.db.insert('realEstateOpportunities', { ...data, accountId, requestId: a.requestId, createdAt: now });
  if (priorStage !== stage) await ctx.db.insert('realEstateDealEvents', { accountId, opportunityId: id, ...(priorStage ? { fromStage: priorStage } : {}), toStage: stage, actorAccountId: actor.actorAccountId, actorRole: actor.role, ...(data.lostReason ? { reason: data.lostReason } : {}), at: now });
  await audit(ctx, tenant, actor, row ? 'opportunity_updated' : 'opportunity_created', 'opportunity', id, now);
  return ok(publicRow(await ctx.db.get(id)));
}

async function generateMatches(ctx, tenant, actor, a, now) {
  const opportunity = await owned(ctx, a.opportunityId, tenant.accountId, 'realEstateOpportunities');
  if (!opportunity) return fail('opportunity_not_found');
  if (!qualified(opportunity)) return fail('qualification_incomplete');
  const settings = await settingsFor(ctx, tenant.accountId), freshnessMs = (settings.listingFreshnessDays ?? 30) * DAY;
  const properties = await ctx.db.query('hasibProperties').withIndex('by_account_created', q => q.eq('accountId', tenant.accountId)).order('desc').take(500);
  const tx = opportunity.need === 'rent' ? 'rent' : 'sale';
  const candidates = properties.filter(p => p.availability === 'available' && p.verificationAt >= now - freshnessMs && p.authorityStatus === 'confirmed'
    && (!p.transactionType || p.transactionType === tx) && (!p.propertyType || opportunity.propertyTypes.includes(p.propertyType))
    && (!p.area || opportunity.areas.some(area => area.toLowerCase() === p.area.toLowerCase()))
    && p.askingPriceMinor >= opportunity.budgetMinMinor && p.askingPriceMinor <= opportunity.budgetMaxMinor
    && (!opportunity.bedrooms || !p.bedrooms || p.bedrooms >= opportunity.bedrooms));
  const existing = await ctx.db.query('realEstateMatches').withIndex('by_opportunity', q => q.eq('opportunityId', opportunity._id)).take(500);
  const rows = [];
  for (const property of candidates) {
    let match = existing.find(x => x.propertyId === property._id);
    const reasons = ['transaction', 'area', 'budget', ...(opportunity.bedrooms ? ['bedrooms'] : [])];
    if (!match) match = await ctx.db.get(await ctx.db.insert('realEstateMatches', { accountId: tenant.accountId, opportunityId: opportunity._id, propertyId: property._id, state: 'suggested', score: reasons.length, reasons, createdAt: now, updatedAt: now }));
    rows.push(publicRow(match));
  }
  await audit(ctx, tenant, actor, 'matches_generated', 'opportunity', opportunity._id, now, String(rows.length));
  return ok({ items: rows });
}

async function matchUpdate(ctx, tenant, actor, a, now) {
  const row = await owned(ctx, a.matchId, tenant.accountId, 'realEstateMatches');
  if (!row) return fail('match_not_found');
  if (!['suggested', 'interested', 'rejected'].includes(a.status)) return fail('invalid_match');
  await ctx.db.patch(row._id, { state: a.status, updatedAt: now });
  await audit(ctx, tenant, actor, 'match_updated', 'match', row._id, now, a.status);
  return ok(publicRow(await ctx.db.get(row._id)));
}

async function viewingSave(ctx, tenant, actor, a, now) {
  const w = a.workflow || {};
  let row = a.viewingId ? await owned(ctx, a.viewingId, tenant.accountId, 'realEstateViewings') : null;
  if (a.viewingId && !row) return fail('viewing_not_found');
  if (row && row.version !== a.version) return fail('viewing_conflict');
  if (!row) { const replay = await byRequest(ctx, 'realEstateViewings', tenant.accountId, a.requestId); if (replay) return ok(publicRow(replay)); }
  const opportunityId = w.opportunityId ?? row?.opportunityId, propertyId = w.propertyId ?? row?.propertyId;
  if (!await owned(ctx, opportunityId, tenant.accountId, 'realEstateOpportunities')) return fail('opportunity_not_found');
  if (!await owned(ctx, propertyId, tenant.accountId, 'hasibProperties')) return fail('property_not_found');
  const status = w.status ?? row?.status ?? 'requested', scheduledAt = w.scheduledAt ?? row?.scheduledAt;
  if (!['requested', 'approved', 'confirmed', 'completed', 'missed', 'cancelled'].includes(status) || !Number.isSafeInteger(scheduledAt)) return fail('invalid_viewing');
  const data = { opportunityId, propertyId, status, scheduledAt, ...(bounded(w.outcome ?? row?.outcome, 500) ? { outcome: bounded(w.outcome ?? row.outcome, 500) } : {}), ...(bounded(w.nextAction ?? row?.nextAction, 200) ? { nextAction: bounded(w.nextAction ?? row.nextAction, 200) } : {}), version: (row?.version || 0) + 1, updatedAt: now };
  if (status === 'completed' && !data.outcome) return fail('viewing_outcome_required');
  let id; if (row) { await ctx.db.patch(row._id, data); id = row._id; } else id = await ctx.db.insert('realEstateViewings', { ...data, accountId: tenant.accountId, requestId: a.requestId, createdAt: now });
  if (status !== 'cancelled') await advanceOpportunity(ctx, tenant, actor, opportunityId, 'viewing', now);
  await audit(ctx, tenant, actor, row ? 'viewing_updated' : 'viewing_created', 'viewing', id, now);
  return ok(publicRow(await ctx.db.get(id)));
}

async function offerSave(ctx, tenant, actor, a, now) {
  const w = a.workflow || {};
  let row = a.offerId ? await owned(ctx, a.offerId, tenant.accountId, 'realEstateOffers') : null;
  if (a.offerId && !row) return fail('offer_not_found');
  if (row && row.version !== a.version) return fail('offer_conflict');
  if (!row) { const replay = await byRequest(ctx, 'realEstateOffers', tenant.accountId, a.requestId); if (replay) return ok(publicRow(replay)); }
  const opportunityId = w.opportunityId ?? row?.opportunityId, propertyId = w.propertyId ?? row?.propertyId;
  if (!await owned(ctx, opportunityId, tenant.accountId, 'realEstateOpportunities')) return fail('opportunity_not_found');
  if (!await owned(ctx, propertyId, tenant.accountId, 'hasibProperties')) return fail('property_not_found');
  const amountMinor = w.amountMinor ?? row?.amountMinor, terms = bounded(w.terms ?? row?.terms, 2000), requested = w.status ?? row?.status ?? 'draft';
  if (!isMinor(amountMinor) || !terms || !['draft', 'approved', 'presented', 'countered', 'accepted', 'rejected', 'withdrawn'].includes(requested) || w.status === 'approved') return fail('invalid_offer');
  if (requested !== 'draft' && row?.status === 'draft') return fail('offer_approval_required');
  const data = { opportunityId, propertyId, amountMinor, terms, status: requested, version: (row?.version || 0) + 1, updatedAt: now };
  let id; if (row) { await ctx.db.patch(row._id, data); id = row._id; } else id = await ctx.db.insert('realEstateOffers', { ...data, accountId: tenant.accountId, requestId: a.requestId, createdAt: now });
  if (!['rejected', 'withdrawn'].includes(requested)) await advanceOpportunity(ctx, tenant, actor, opportunityId, 'offer', now);
  await audit(ctx, tenant, actor, row ? 'offer_updated' : 'offer_created', 'offer', id, now);
  return ok(publicRow(await ctx.db.get(id)));
}

async function approveOffer(ctx, tenant, actor, a, now) {
  if (actor.role !== 'manager') return fail('manager_required');
  const row = await owned(ctx, a.offerId, tenant.accountId, 'realEstateOffers');
  if (!row) return fail('offer_not_found');
  if (row.status !== 'draft' || row.version !== a.version) return fail(row.version !== a.version ? 'offer_conflict' : 'invalid_offer_transition');
  await ctx.db.patch(row._id, { status: 'approved', approvedBy: actor.actorAccountId, approvedAt: now, version: row.version + 1, updatedAt: now });
  await audit(ctx, tenant, actor, 'offer_approved', 'offer', row._id, now);
  return ok(publicRow(await ctx.db.get(row._id)));
}

async function complianceUpdate(ctx, tenant, actor, a, now) {
  if (actor.role !== 'manager') return fail('manager_required');
  const opportunity = await owned(ctx, a.opportunityId, tenant.accountId, 'realEstateOpportunities');
  if (!opportunity) return fail('opportunity_not_found');
  let row = await ctx.db.query('realEstateCompliance').withIndex('by_opportunity', q => q.eq('opportunityId', opportunity._id)).unique();
  if (row && row.version !== a.version) return fail('compliance_conflict');
  const w = a.workflow || {}, allowed = ['pending', 'confirmed', 'not_applicable'];
  const data = {}, confirmedAt = { ...(row?.confirmedAt || {}) };
  for (const key of ['identity', 'authority', 'financing', 'agreement', 'completion']) {
    const field = `${key}Status`, value = w[field] ?? row?.[field] ?? 'pending';
    if (!allowed.includes(value)) return fail('invalid_compliance');
    data[field] = value; if (value === 'confirmed' && !confirmedAt[key]) confirmedAt[key] = now;
  }
  Object.assign(data, { confirmedAt, version: (row?.version || 0) + 1, updatedAt: now });
  if (row) await ctx.db.patch(row._id, data); else row = await ctx.db.get(await ctx.db.insert('realEstateCompliance', { ...data, accountId: tenant.accountId, opportunityId: opportunity._id }));
  await audit(ctx, tenant, actor, 'compliance_updated', 'opportunity', opportunity._id, now);
  return ok(publicRow(await ctx.db.query('realEstateCompliance').withIndex('by_opportunity', q => q.eq('opportunityId', opportunity._id)).unique()));
}

async function closeDeal(ctx, tenant, actor, a, now) {
  if (actor.role !== 'manager') return fail('manager_required');
  const opportunity = await owned(ctx, a.opportunityId, tenant.accountId, 'realEstateOpportunities');
  if (!opportunity) return fail('opportunity_not_found');
  const existing = await ctx.db.query('realEstateCommissions').withIndex('by_opportunity', q => q.eq('opportunityId', opportunity._id)).unique();
  if (existing) return ok(publicRow(existing));
  const offer = await owned(ctx, a.offerId, tenant.accountId, 'realEstateOffers');
  if (!offer || offer.opportunityId !== opportunity._id || offer.status !== 'accepted') return fail('accepted_offer_required');
  const compliance = await ctx.db.query('realEstateCompliance').withIndex('by_opportunity', q => q.eq('opportunityId', opportunity._id)).unique();
  if (!compliance || ['identityStatus', 'authorityStatus', 'financingStatus', 'agreementStatus', 'completionStatus'].some(k => !['confirmed', 'not_applicable'].includes(compliance[k]))) return fail('compliance_incomplete');
  if (!isMinor(a.commissionMinor) || a.commissionMinor <= 0) return fail('commission_required');
  const charge = await createOrder(ctx, tenant, { requestId: `commission:${opportunity._id}`, channel: 'walk_in', contactId: opportunity.contactId, fulfilment: { type: 'in_store' }, lines: [{ name: 'Agency commission', qty: 1, unitPriceMinor: a.commissionMinor }] }, now, { internal: true });
  if (!charge.ok) return charge;
  const id = await ctx.db.insert('realEstateCommissions', { accountId: tenant.accountId, opportunityId: opportunity._id, orderId: charge.value.id, amountMinor: a.commissionMinor, status: 'due', createdAt: now, updatedAt: now });
  const property = await owned(ctx, offer.propertyId, tenant.accountId, 'hasibProperties');
  if (property) await ctx.db.patch(property._id, { availability: 'unavailable', version: property.version + 1, updatedAt: now });
  await ctx.db.patch(opportunity._id, { stage: 'won', version: opportunity.version + 1, updatedAt: now });
  await ctx.db.insert('realEstateDealEvents', { accountId: tenant.accountId, opportunityId: opportunity._id, fromStage: opportunity.stage, toStage: 'won', actorAccountId: actor.actorAccountId, actorRole: actor.role, at: now });
  await audit(ctx, tenant, actor, 'deal_closed', 'opportunity', opportunity._id, now);
  return ok(publicRow(await ctx.db.get(id)));
}

async function recordCommission(ctx, tenant, actor, a, now) {
  if (actor.role !== 'manager') return fail('manager_required');
  const row = await owned(ctx, a.commissionId, tenant.accountId, 'realEstateCommissions');
  if (!row) return fail('commission_not_found');
  if (!['due', 'paid'].includes(a.status)) return fail('invalid_commission');
  if (row.status === a.status) return ok(publicRow(row));
  await ctx.db.patch(row._id, { status: a.status, ...(a.status === 'paid' ? { paidAt: now } : { paidAt: undefined }), updatedAt: now });
  await audit(ctx, tenant, actor, 'commission_recorded', 'commission', row._id, now, a.status);
  return ok(publicRow(await ctx.db.get(row._id)));
}

async function draftSave(ctx, tenant, actor, a, now) {
  const w = a.workflow || {};
  let row = a.draftId ? await owned(ctx, a.draftId, tenant.accountId, 'realEstateDrafts') : null;
  if (a.draftId && !row) return fail('draft_not_found');
  if (row && row.version !== a.version) return fail('draft_conflict');
  const opportunityId = w.opportunityId ?? row?.opportunityId;
  if (!await owned(ctx, opportunityId, tenant.accountId, 'realEstateOpportunities')) return fail('opportunity_not_found');
  const text = bounded(w.text ?? row?.text, 4000), kind = w.kind ?? row?.kind ?? 'follow_up';
  if (!text || !['follow_up', 'viewing_confirmation', 'offer'].includes(kind)) return fail('invalid_draft');
  const data = { opportunityId, ...(w.conversationId ?? row?.conversationId ? { conversationId: w.conversationId ?? row.conversationId } : {}), kind, text, ...(bounded(w.templateId ?? row?.templateId, 80) ? { templateId: bounded(w.templateId ?? row.templateId, 80) } : {}), status: 'draft', version: (row?.version || 0) + 1, updatedAt: now };
  let id; if (row) { await ctx.db.patch(row._id, data); id = row._id; } else id = await ctx.db.insert('realEstateDrafts', { ...data, accountId: tenant.accountId, requestId: a.requestId, createdAt: now });
  await audit(ctx, tenant, actor, row ? 'draft_updated' : 'draft_created', 'draft', id, now);
  return ok(publicRow(await ctx.db.get(id)));
}

async function approveDraft(ctx, tenant, actor, a, now) {
  if (actor.role !== 'manager') return fail('manager_required');
  const row = await owned(ctx, a.draftId, tenant.accountId, 'realEstateDrafts');
  if (!row) return fail('draft_not_found');
  if (row.status !== 'draft' || row.version !== a.version) return fail(row.version !== a.version ? 'draft_conflict' : 'invalid_draft_transition');
  const conversation = row.conversationId ? await owned(ctx, row.conversationId, tenant.accountId, 'blueConversations') : null;
  const opportunity = await owned(ctx, row.opportunityId, tenant.accountId, 'realEstateOpportunities');
  const windowOpen = !!conversation?.lastInbound && conversation.lastInbound + DAY > now;
  let status = 'template_required';
  if (conversation?.optout) status = 'blocked';
  else if (windowOpen && tenant.row?.integration?.id === conversation.integrationId) {
    const pending = await ctx.db.query('blueMessages').withIndex('by_integration_status', q => q.eq('integrationId', conversation.integrationId).eq('status', 'queued')).take(100);
    for (const job of pending) if (job.conversationId === conversation._id) await ctx.db.patch(job._id, { status: 'blocked', reason: 'manager_approved_follow_up' });
    const version = (conversation.version || 0) + 1;
    await ctx.db.patch(conversation._id, { takeover: true, version, updatedAt: now });
    const messageId = await ctx.db.insert('blueMessages', { key: `real-estate-draft:${row._id}`, integrationId: conversation.integrationId, accountId: tenant.accountId,
      conversationId: conversation._id, conversationVersion: version, profileVersion: tenant.row.profileVersion || 1, realEstateOpportunityId: row.opportunityId,
      realEstateDraftId: row._id, direction: 'out', text: row.text, at: now, expiresAt: now + 30 * DAY, textExpiresAt: now + 30 * DAY,
      status: pending.length >= 100 ? 'blocked' : 'queued', manual: true, handoff: false, ...(pending.length >= 100 ? { reason: 'queue_limit' } : {}) });
    if (pending.length < 100 && tenant.workerFunction) await ctx.scheduler.runAfter(0, tenant.workerFunction, { jobId: messageId });
    status = pending.length >= 100 ? 'blocked' : 'queued';
  } else if (row.templateId && conversation && opportunity) {
    const template = await ctx.db.query('blueTemplates').withIndex('by_account_template', q => q.eq('accountId', tenant.accountId).eq('templateId', row.templateId)).unique();
    const contact = await owned(ctx, opportunity.contactId, tenant.accountId, 'blueContacts');
    if (template?.integrationId === conversation.integrationId && template.status === 'APPROVED' && template.category === 'UTILITY' && template.sendable && template.variables.length === 0
      && contact?.state === 'active' && !contact.optout && contact.waId && contact.numberHash && tenant.row?.integration?.id === conversation.integrationId) {
      const campaignId = await ctx.db.insert('blueCampaigns', { accountId: tenant.accountId, integrationId: conversation.integrationId, requestId: `real-estate-draft:${row._id}`,
        name: template.name, origin: 'chat', template: { templateId: template.templateId, name: template.name, language: template.language, category: template.category,
          parameterFormat: template.parameterFormat, body: template.body, ...(template.header ? { header: template.header } : {}), ...(template.footer ? { footer: template.footer } : {}) },
        mapping: [], status: 'processing', scheduledAt: now, timezone: 'Asia/Muscat', recipientCount: 1, createdAt: now, updatedAt: now, startedAt: now });
      const recipientId = await ctx.db.insert('blueCampaignRecipients', { campaignId, accountId: tenant.accountId, integrationId: conversation.integrationId,
        contactId: contact._id, realEstateDraftId: row._id, numberHash: contact.numberHash, waId: contact.waId, name: contact.ownerName || contact.profileName || '', parameters: [],
        status: 'queued', attempts: 0, nextAttemptAt: now, at: now, updatedAt: now, expiresAt: now + 30 * DAY });
      if (tenant.workerFunction) await ctx.scheduler.runAfter(0, tenant.workerFunction, { campaignJobId: recipientId });
      status = 'queued_template';
    }
  }
  await ctx.db.patch(row._id, { status, approvedBy: actor.actorAccountId, approvedAt: now, version: row.version + 1, updatedAt: now });
  if (status === 'template_required') await ctx.db.insert('realEstateTasks', { accountId: tenant.accountId, kind: 'template_required', entityType: 'draft', entityId: String(row._id), status: 'open', reason: 'Approved utility template required outside the WhatsApp service window', createdAt: now, updatedAt: now });
  await audit(ctx, tenant, actor, 'draft_approved', 'draft', row._id, now, status);
  return ok(publicRow(await ctx.db.get(row._id)));
}

async function ensureTask(ctx, accountId, kind, entityType, entityId, reason, now, dueAt) {
  const rows = await ctx.db.query('realEstateTasks').withIndex('by_entity', q => q.eq('entityType', entityType).eq('entityId', String(entityId))).take(30);
  if (rows.some(row => row.kind === kind && row.status === 'open')) return;
  await ctx.db.insert('realEstateTasks', { accountId, kind, entityType, entityId: String(entityId), status: 'open', reason, ...(dueAt ? { dueAt } : {}), createdAt: now, updatedAt: now });
}

async function overview(ctx, tenant, actor, now) {
  const opportunities = await ctx.db.query('realEstateOpportunities').withIndex('by_account_created', q => q.eq('accountId', tenant.accountId)).order('desc').take(500);
  const properties = await ctx.db.query('hasibProperties').withIndex('by_account_created', q => q.eq('accountId', tenant.accountId)).order('desc').take(500);
  const viewings = await ctx.db.query('realEstateViewings').withIndex('by_account_date', q => q.eq('accountId', tenant.accountId)).take(500);
  const offers = await ctx.db.query('realEstateOffers').withIndex('by_account_created', q => q.eq('accountId', tenant.accountId)).order('desc').take(500);
  const drafts = await ctx.db.query('realEstateDrafts').withIndex('by_account_created', q => q.eq('accountId', tenant.accountId)).order('desc').take(500);
  const settings = await settingsFor(ctx, tenant.accountId), freshnessMs = (settings.listingFreshnessDays ?? 30) * DAY;
  const overdue = opportunities.filter(x => !x.providerSubmittedAt && now - x.firstInboundAt > 5 * 60000);
  for (const row of overdue) await ensureTask(ctx, tenant.accountId, 'first_response_overdue', 'opportunity', row._id, 'First response has not been provider-submitted within five minutes', now, row.firstInboundAt + 5 * 60000);
  for (const row of opportunities.filter(x => OPEN_STAGES.includes(x.stage) && x.lastAttemptAt && !x.providerSubmittedAt && now - x.lastAttemptAt > 2 * 3600000)) await ensureTask(ctx, tenant.accountId, 'second_attempt_overdue', 'opportunity', row._id, 'Second response attempt is overdue', now, row.lastAttemptAt + 2 * 3600000);
  for (const row of properties.filter(x => x.availability === 'available' && (!x.verificationAt || x.verificationAt < now - freshnessMs))) await ensureTask(ctx, tenant.accountId, 'stale_listing', 'property', row._id, 'Available listing needs fresh verification', now);
  for (const row of viewings.filter(x => x.scheduledAt < now && !['completed', 'missed', 'cancelled'].includes(x.status))) await ensureTask(ctx, tenant.accountId, 'viewing_outcome_missing', 'viewing', row._id, 'Viewing time passed without a recorded outcome', now);
  for (const row of offers.filter(x => ['approved', 'presented', 'countered'].includes(x.status) && now - row.updatedAt > 2 * 3600000)) await ensureTask(ctx, tenant.accountId, 'offer_unanswered', 'offer', row._id, 'Offer needs a recorded answer or next action', now);
  const tasks = await ctx.db.query('realEstateTasks').withIndex('by_account_status', q => q.eq('accountId', tenant.accountId).eq('status', 'open')).take(500);
  const today = periodRange('today', now, await businessTimezone(ctx, tenant.accountId));
  const stageOrder = ['new', 'contacted', 'qualified', 'viewing', 'offer', 'won', 'lost'];
  const pipeline = Object.fromEntries(stageOrder.map(stage => [stage, opportunities.filter(row => row.stage === stage).length]));
  const listingCounts = Object.fromEntries(['available', 'reserved', 'unavailable'].map(status => [status, properties.filter(row => row.availability === status).length]));
  const fresh = properties.filter(row => row.availability === 'available' && row.verificationAt && row.verificationAt >= now - freshnessMs).length;
  const viewingSummary = { today: viewings.filter(x => x.scheduledAt >= today.from && x.scheduledAt < today.to).length,
    upcoming: viewings.filter(x => x.scheduledAt >= now && !['completed', 'missed', 'cancelled'].includes(x.status)).length,
    outcomeMissing: viewings.filter(x => x.scheduledAt < now && !['completed', 'missed', 'cancelled'].includes(x.status)).length };
  const offerSummary = { draft: offers.filter(x => x.status === 'draft').length, approvalPending: offers.filter(x => x.status === 'draft').length,
    active: offers.filter(x => ['approved', 'presented', 'countered'].includes(x.status)).length, accepted: offers.filter(x => x.status === 'accepted').length };
  const approvalSummary = { offers: offerSummary.approvalPending, drafts: drafts.filter(x => x.status === 'draft').length,
    total: offerSummary.approvalPending + drafts.filter(x => x.status === 'draft').length };
  return ok({ workspaceRole: actor.role, counts: { opportunities: opportunities.filter(x => OPEN_STAGES.includes(x.stage)).length, unassigned: opportunities.filter(x => !x.assignedAccountId && OPEN_STAGES.includes(x.stage)).length,
    slaBreaches: overdue.length, staleListings: properties.filter(x => x.availability === 'available' && (!x.verificationAt || x.verificationAt < now - freshnessMs)).length,
    todayViewings: viewingSummary.today, tasks: tasks.length }, pipeline, listings: { ...listingCounts, verifiedFresh: fresh, stale: listingCounts.available - fresh },
    viewings: viewingSummary, offers: offerSummary, approvals: approvalSummary, tasks: tasks.map(publicRow) });
}

const rate = (numerator, denominator) => denominator ? Math.round(numerator * 1000 / denominator) / 10 : 0;
const tally = values => Object.entries(values.reduce((out, value) => ({ ...out, [value || 'unknown']: (out[value || 'unknown'] || 0) + 1 }), {}))
  .map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

async function insights(ctx, tenant) {
  const accountId = tenant.accountId;
  const opportunities = await ctx.db.query('realEstateOpportunities').withIndex('by_account_created', q => q.eq('accountId', accountId)).take(2000);
  const viewings = await ctx.db.query('realEstateViewings').withIndex('by_account_date', q => q.eq('accountId', accountId)).take(2000);
  const offers = await ctx.db.query('realEstateOffers').withIndex('by_account_created', q => q.eq('accountId', accountId)).take(2000);
  const commissions = await ctx.db.query('realEstateCommissions').withIndex('by_account_created', q => q.eq('accountId', accountId)).take(2000);
  const properties = await ctx.db.query('hasibProperties').withIndex('by_account_created', q => q.eq('accountId', accountId)).take(2000);
  const qualifiedStages = new Set(['qualified', 'viewing', 'offer', 'won']);
  const completedViewingOpportunityIds = new Set(viewings.filter(row => row.status === 'completed').map(row => String(row.opportunityId)));
  const offeredOpportunityIds = new Set(offers.map(row => String(row.opportunityId)));
  const closed = opportunities.filter(row => row.stage === 'won');
  const responseTimes = opportunities.filter(row => Number.isSafeInteger(row.providerSubmittedAt) && Number.isSafeInteger(row.firstInboundAt) && row.providerSubmittedAt >= row.firstInboundAt)
    .map(row => row.providerSubmittedAt - row.firstInboundAt);
  const sourceGroups = new Map();
  for (const row of opportunities) {
    const group = sourceGroups.get(row.source) || { source: row.source, opportunities: 0, won: 0 };
    group.opportunities++; if (row.stage === 'won') group.won++;
    sourceGroups.set(row.source, group);
  }
  const unavailable = properties.filter(row => row.availability === 'unavailable' && row.updatedAt >= row.createdAt);
  return ok({
    commissions: { dueMinor: commissions.filter(row => row.status === 'due').reduce((sum, row) => sum + row.amountMinor, 0), paidMinor: commissions.filter(row => row.status === 'paid').reduce((sum, row) => sum + row.amountMinor, 0), records: commissions.length },
    averageFirstResponseMinutes: responseTimes.length ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length / 6000) / 10 : null,
    qualificationRate: rate(opportunities.filter(row => qualifiedStages.has(row.stage)).length, opportunities.length),
    viewingToOfferRate: rate([...completedViewingOpportunityIds].filter(id => offeredOpportunityIds.has(id)).length, completedViewingOpportunityIds.size),
    offerToCloseRate: rate(closed.filter(row => offeredOpportunityIds.has(String(row._id))).length, offeredOpportunityIds.size),
    sourceConversion: [...sourceGroups.values()].map(group => ({ ...group, rate: rate(group.won, group.opportunities) })).sort((a, b) => b.opportunities - a.opportunities || a.source.localeCompare(b.source)),
    lostReasons: tally(opportunities.filter(row => row.stage === 'lost').map(row => row.lostReason)),
    averageDaysOnMarket: unavailable.length ? Math.round(unavailable.reduce((sum, row) => sum + (row.updatedAt - row.createdAt), 0) / unavailable.length / DAY * 10) / 10 : null,
  });
}

export async function executeRealEstate(ctx, tenant, actor, a, now) {
  switch (a.operation) {
    case 'real_estate_overview': return overview(ctx, tenant, actor, now);
    case 'real_estate_insights': return insights(ctx, tenant);
    case 'opportunities': return list(ctx, 'realEstateOpportunities', tenant.accountId, a);
    case 'opportunity_save': return opportunitySave(ctx, tenant, actor, a, now);
    case 'matches': { const row = await owned(ctx, a.opportunityId, tenant.accountId, 'realEstateOpportunities'); if (!row) return fail('opportunity_not_found'); const rows = await ctx.db.query('realEstateMatches').withIndex('by_opportunity', q => q.eq('opportunityId', row._id)).take(200); return ok({ items: rows.map(publicRow) }); }
    case 'match_generate': return generateMatches(ctx, tenant, actor, a, now);
    case 'match_update': return matchUpdate(ctx, tenant, actor, a, now);
    case 'viewings': return list(ctx, 'realEstateViewings', tenant.accountId, a, 'by_account_date');
    case 'viewing_save': return viewingSave(ctx, tenant, actor, a, now);
    case 'offers': return list(ctx, 'realEstateOffers', tenant.accountId, a);
    case 'offer_save': return offerSave(ctx, tenant, actor, a, now);
    case 'offer_approve': return approveOffer(ctx, tenant, actor, a, now);
    case 'compliance_update': return complianceUpdate(ctx, tenant, actor, a, now);
    case 'deal_close': return closeDeal(ctx, tenant, actor, a, now);
    case 'commissions': return list(ctx, 'realEstateCommissions', tenant.accountId, a);
    case 'commission_record': return recordCommission(ctx, tenant, actor, a, now);
    case 'drafts': return list(ctx, 'realEstateDrafts', tenant.accountId, a);
    case 'draft_save': return draftSave(ctx, tenant, actor, a, now);
    case 'draft_approve': return approveDraft(ctx, tenant, actor, a, now);
    case 'real_estate_tasks': { const rows = await ctx.db.query('realEstateTasks').withIndex('by_account_status', q => q.eq('accountId', tenant.accountId).eq('status', a.status || 'open')).take(clampLimit(a.limit, 200)); return ok({ items: rows.map(publicRow) }); }
    case 'deal_history': { const opportunity = await owned(ctx, a.opportunityId, tenant.accountId, 'realEstateOpportunities'); if (!opportunity) return fail('opportunity_not_found'); const rows = await ctx.db.query('realEstateDealEvents').withIndex('by_opportunity', q => q.eq('opportunityId', opportunity._id)).take(200); return ok({ items: rows.map(publicRow) }); }
    default: return null;
  }
}
