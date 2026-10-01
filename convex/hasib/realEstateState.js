// Real Estate's deal pipeline: opportunity → viewing → offer → compliance → close → commission.
// Every move is checked against its state machine and recorded with who made it.
// Agents work their own and unassigned deals; approvals, compliance, closing and money are the manager's.
import { owned } from '../blueTenant.js';
import { ok, fail, bounded, REQUEST_ID, byRequest, settingsFor } from './shared.js';
import { isMinor } from './money.js';
import { createOrder } from './ordersState.js';
import { audit, workspaceContainsAccount } from './workspaceState.js';
import { DAY, OPEN_STAGES, publicRow, canSeeDeal, visibleOpportunity, readable, dealList, overview, resolveTask, insights } from './realEstateBoard.js';

const STAGES = [...OPEN_STAGES, 'won', 'lost'];
const NEEDS = ['buy', 'rent', 'sell', 'invest'];
const VIEWING_NEXT = { requested: ['confirmed', 'completed', 'missed', 'cancelled'], confirmed: ['completed', 'missed', 'cancelled'], completed: [], missed: [], cancelled: [] };
// Approval (draft → approved) is the manager's separate step, offer_approve.
const OFFER_NEXT = { draft: [], approved: ['presented', 'withdrawn'], presented: ['countered', 'accepted', 'rejected', 'withdrawn'], countered: ['countered', 'presented', 'accepted', 'rejected', 'withdrawn'], accepted: [], rejected: [], withdrawn: [] };
const COMPLIANCE_CHECKS = ['identity', 'authority', 'financing', 'agreement', 'completion'];
const COMPLIANCE_DONE = new Set(['confirmed', 'not_applicable']);
const MANAGER_ONLY = new Set(['real_estate_insights', 'commissions', 'commission_record', 'deal_close', 'offer_approve', 'draft_approve', 'compliance_update']);

const strings = (value, max = 10, length = 120) => Array.isArray(value) ? [...new Set(value.map(x => bounded(x, length)).filter(Boolean))].slice(0, max) : null;
const qualified = row => row.areas.length && row.propertyTypes.length && isMinor(row.budgetMaxMinor) && row.budgetMaxMinor > 0
  && row.financeReadiness !== 'unknown' && row.decisionMakerReadiness !== 'unknown' && row.timeline !== 'unknown';
const dealEvent = (ctx, tenant, actor, opportunityId, fromStage, toStage, now, reason) => ctx.db.insert('realEstateDealEvents', { accountId: tenant.accountId, opportunityId,
  ...(fromStage ? { fromStage } : {}), toStage, actorAccountId: actor.actorAccountId, actorRole: actor.role, ...(reason ? { reason } : {}), at: now });
const one = async (ctx, accountId, row) => (await readable(ctx, accountId, [row]))[0];

/** Moves a deal forward (never back) when a viewing or offer shows it has progressed. */
async function advanceOpportunity(ctx, tenant, actor, opportunityId, stage, now) {
  const row = await owned(ctx, opportunityId, tenant.accountId, 'realEstateOpportunities');
  if (!row || !OPEN_STAGES.includes(row.stage) || OPEN_STAGES.indexOf(stage) <= OPEN_STAGES.indexOf(row.stage)) return;
  await ctx.db.patch(row._id, { stage, version: row.version + 1, updatedAt: now });
  await dealEvent(ctx, tenant, actor, row._id, row.stage, stage, now);
}

/** Who a deal may be assigned to: the manager anyone in the workspace, an agent only themselves. */
async function assignmentAllowed(ctx, actor, accountId) {
  if (!accountId) return true;
  if (actor.role === 'employee') return String(accountId) === String(actor.actorAccountId);
  return workspaceContainsAccount(ctx, actor.workspace, accountId);
}

async function opportunitySave(ctx, tenant, actor, a, now) {
  const w = a.workflow || {}, accountId = tenant.accountId;
  let row = null;
  if (a.opportunityId) {
    row = await visibleOpportunity(ctx, tenant, actor, a.opportunityId);
    if (!row) return fail('opportunity_not_found');
    if (row.version !== a.version) return fail('opportunity_conflict');
    if (!OPEN_STAGES.includes(row.stage)) return fail('opportunity_closed');
  } else {
    if (!REQUEST_ID.test(a.requestId || '')) return fail('invalid_request');
    const replay = await byRequest(ctx, 'realEstateOpportunities', accountId, a.requestId);
    if (replay) return ok(await one(ctx, accountId, replay));
  }
  const contactId = row?.contactId || w.contactId;
  if (!await owned(ctx, contactId, accountId, 'blueContacts')) return fail('contact_not_found');
  const need = w.need ?? row?.need ?? 'buy';
  if (!NEEDS.includes(need)) return fail('invalid_opportunity');
  if (!row) {
    // One open deal per customer and need: a repeat enquiry updates it.
    const open = await ctx.db.query('realEstateOpportunities').withIndex('by_contact_stage', q => q.eq('contactId', contactId)).take(20);
    const existing = open.find(x => x.need === need && OPEN_STAGES.includes(x.stage));
    if (existing && !canSeeDeal(actor, existing)) return fail('opportunity_assigned_elsewhere');
    row = existing || null;
  }
  // A deal an agent creates is theirs unless they say otherwise.
  const assignedAccountId = w.assignedAccountId !== undefined ? (w.assignedAccountId || undefined) : row ? row.assignedAccountId : (actor.role === 'employee' ? actor.actorAccountId : undefined);
  if (!await assignmentAllowed(ctx, actor, assignedAccountId)) return fail('invalid_assignment');
  const pick = (key, fallback) => w[key] ?? row?.[key] ?? fallback;
  const data = {
    contactId, ...(pick('conversationId') ? { conversationId: pick('conversationId') } : {}),
    source: bounded(pick('source', 'manual'), 40), need,
    areas: strings(pick('areas', []), 10, 100), propertyTypes: strings(pick('propertyTypes', []), 10, 60),
    budgetMinMinor: pick('budgetMinMinor', 0), budgetMaxMinor: pick('budgetMaxMinor', 0),
    ...(Number.isSafeInteger(pick('bedrooms')) && pick('bedrooms') > 0 ? { bedrooms: pick('bedrooms') } : {}),
    financeReadiness: bounded(pick('financeReadiness', 'unknown'), 40), decisionMakerReadiness: bounded(pick('decisionMakerReadiness', 'unknown'), 40),
    timeline: bounded(pick('timeline', 'unknown'), 80), mustHaves: strings(pick('mustHaves', []), 20, 120),
    assignedAccountId, nextAction: bounded(pick('nextAction'), 200) || undefined, firstInboundAt: pick('firstInboundAt', now),
    ...(Number.isSafeInteger(pick('replyQueuedAt')) ? { replyQueuedAt: pick('replyQueuedAt') } : {}),
    ...(Number.isSafeInteger(pick('providerSubmittedAt')) ? { providerSubmittedAt: pick('providerSubmittedAt') } : {}),
    ...(Number.isSafeInteger(pick('deliveredAt')) ? { deliveredAt: pick('deliveredAt') } : {}),
    version: (row?.version || 0) + 1, updatedAt: now,
  };
  if (!data.source || !data.areas || !data.propertyTypes || !data.mustHaves || !isMinor(data.budgetMinMinor) || !isMinor(data.budgetMaxMinor) || data.budgetMinMinor > data.budgetMaxMinor) return fail('invalid_opportunity');
  // Stage moves go through opportunity_stage; saving requirements only promotes an early deal once it is fully qualified.
  const prior = row?.stage;
  data.stage = qualified(data) && (!prior || ['new', 'contacted'].includes(prior)) ? 'qualified' : (prior || 'new');
  let id;
  if (row) { await ctx.db.patch(row._id, data); id = row._id; }
  else id = await ctx.db.insert('realEstateOpportunities', { ...data, accountId, requestId: a.requestId, createdAt: now });
  if (prior !== data.stage) await dealEvent(ctx, tenant, actor, id, prior, data.stage, now);
  await audit(ctx, tenant, actor, row ? 'opportunity_updated' : 'opportunity_created', 'opportunity', id, now);
  return ok(await one(ctx, accountId, await ctx.db.get(id)));
}

async function opportunityStage(ctx, tenant, actor, a, now) {
  const row = await visibleOpportunity(ctx, tenant, actor, a.opportunityId);
  if (!row) return fail('opportunity_not_found');
  if (row.version !== a.version) return fail('opportunity_conflict');
  const to = a.status;
  if (!OPEN_STAGES.includes(row.stage) || !STAGES.includes(to) || to === 'won') return fail('invalid_stage_transition');
  const reason = bounded(a.reason, 200);
  if (to === 'lost' && !reason) return fail('lost_reason_required');
  if (to !== 'lost' && OPEN_STAGES.indexOf(to) <= OPEN_STAGES.indexOf(row.stage)) return fail('invalid_stage_transition');
  if (to === 'qualified' && !qualified(row)) return fail('qualification_incomplete');
  await ctx.db.patch(row._id, { stage: to, ...(to === 'lost' ? { lostReason: reason } : {}), version: row.version + 1, updatedAt: now });
  await dealEvent(ctx, tenant, actor, row._id, row.stage, to, now, to === 'lost' ? reason : undefined);
  await audit(ctx, tenant, actor, 'opportunity_stage', 'opportunity', row._id, now, `${row.stage}>${to}`);
  return ok(await one(ctx, tenant.accountId, await ctx.db.get(row._id)));
}

async function generateMatches(ctx, tenant, actor, a, now) {
  const opportunity = await visibleOpportunity(ctx, tenant, actor, a.opportunityId);
  if (!opportunity) return fail('opportunity_not_found');
  if (!qualified(opportunity)) return fail('qualification_incomplete');
  const freshnessMs = ((await settingsFor(ctx, tenant.accountId)).listingFreshnessDays ?? 30) * DAY;
  const properties = await ctx.db.query('hasibProperties').withIndex('by_account_created', q => q.eq('accountId', tenant.accountId)).order('desc').take(500);
  const tx = opportunity.need === 'rent' ? 'rent' : 'sale';
  // Only listings someone verified recently, with authority to market them, are ever suggested.
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
    rows.push(match);
  }
  await audit(ctx, tenant, actor, 'matches_generated', 'opportunity', opportunity._id, now, String(rows.length));
  return ok({ items: await readable(ctx, tenant.accountId, rows) });
}

async function matchUpdate(ctx, tenant, actor, a, now) {
  const row = await owned(ctx, a.matchId, tenant.accountId, 'realEstateMatches');
  if (!row || !await visibleOpportunity(ctx, tenant, actor, row.opportunityId)) return fail('match_not_found');
  if (!['suggested', 'interested', 'rejected'].includes(a.status)) return fail('invalid_match');
  await ctx.db.patch(row._id, { state: a.status, updatedAt: now });
  await audit(ctx, tenant, actor, 'match_updated', 'match', row._id, now, a.status);
  return ok(await one(ctx, tenant.accountId, await ctx.db.get(row._id)));
}

async function viewingSave(ctx, tenant, actor, a, now) {
  const w = a.workflow || {};
  let row = null;
  if (a.viewingId) {
    row = await owned(ctx, a.viewingId, tenant.accountId, 'realEstateViewings');
    if (!row || !await visibleOpportunity(ctx, tenant, actor, row.opportunityId)) return fail('viewing_not_found');
    if (row.version !== a.version) return fail('viewing_conflict');
  } else {
    if (!REQUEST_ID.test(a.requestId || '')) return fail('invalid_request');
    const replay = await byRequest(ctx, 'realEstateViewings', tenant.accountId, a.requestId);
    if (replay) return ok(await one(ctx, tenant.accountId, replay));
  }
  const opportunityId = row?.opportunityId || w.opportunityId, propertyId = row?.propertyId || w.propertyId;
  if (!await visibleOpportunity(ctx, tenant, actor, opportunityId)) return fail('opportunity_not_found');
  if (!await owned(ctx, propertyId, tenant.accountId, 'hasibProperties')) return fail('property_not_found');
  const status = w.status ?? row?.status ?? 'requested', scheduledAt = w.scheduledAt ?? row?.scheduledAt;
  if (!Object.hasOwn(VIEWING_NEXT, status) || !Number.isSafeInteger(scheduledAt)) return fail('invalid_viewing');
  if (!row && !['requested', 'confirmed'].includes(status)) return fail('invalid_viewing');
  if (row && status !== row.status && !VIEWING_NEXT[row.status].includes(status)) return fail('invalid_viewing_transition');
  if (row && status === row.status && !VIEWING_NEXT[row.status].length) return fail('invalid_viewing_transition');
  const outcome = bounded(w.outcome ?? row?.outcome, 500), nextAction = bounded(w.nextAction ?? row?.nextAction, 200);
  if (status === 'completed' && !outcome) return fail('viewing_outcome_required');
  const data = { opportunityId, propertyId, status, scheduledAt, ...(outcome ? { outcome } : {}), ...(nextAction ? { nextAction } : {}), version: (row?.version || 0) + 1, updatedAt: now };
  let id; if (row) { await ctx.db.patch(row._id, data); id = row._id; } else id = await ctx.db.insert('realEstateViewings', { ...data, accountId: tenant.accountId, requestId: a.requestId, createdAt: now });
  if (status !== 'cancelled') await advanceOpportunity(ctx, tenant, actor, opportunityId, 'viewing', now);
  await audit(ctx, tenant, actor, row ? 'viewing_updated' : 'viewing_created', 'viewing', id, now, status);
  return ok(await one(ctx, tenant.accountId, await ctx.db.get(id)));
}

async function offerSave(ctx, tenant, actor, a, now) {
  const w = a.workflow || {};
  let row = null;
  if (a.offerId) {
    row = await owned(ctx, a.offerId, tenant.accountId, 'realEstateOffers');
    if (!row || !await visibleOpportunity(ctx, tenant, actor, row.opportunityId)) return fail('offer_not_found');
    if (row.version !== a.version) return fail('offer_conflict');
  } else {
    if (!REQUEST_ID.test(a.requestId || '')) return fail('invalid_request');
    const replay = await byRequest(ctx, 'realEstateOffers', tenant.accountId, a.requestId);
    if (replay) return ok(await one(ctx, tenant.accountId, replay));
  }
  const opportunityId = row?.opportunityId || w.opportunityId, propertyId = row?.propertyId || w.propertyId;
  if (!await visibleOpportunity(ctx, tenant, actor, opportunityId)) return fail('opportunity_not_found');
  if (!await owned(ctx, propertyId, tenant.accountId, 'hasibProperties')) return fail('property_not_found');
  const status = w.status ?? row?.status ?? 'draft';
  if (!Object.hasOwn(OFFER_NEXT, status) || status === 'approved') return fail('invalid_offer');
  if (!row && status !== 'draft') return fail('invalid_offer');
  if (row && status !== row.status) {
    if (row.status === 'draft') return fail('offer_approval_required');
    if (!OFFER_NEXT[row.status].includes(status)) return fail('invalid_offer_transition');
  }
  // The amount and terms change only while drafting or when the other side counters.
  const amountMinor = w.amountMinor ?? row?.amountMinor, terms = bounded(w.terms ?? row?.terms, 2000);
  const reprices = row && (amountMinor !== row.amountMinor || terms !== row.terms);
  if (reprices && !['draft', 'countered'].includes(status)) return fail('invalid_offer_transition');
  if (row && status === row.status && status !== 'draft' && status !== 'countered') return fail('invalid_offer_transition');
  if (!isMinor(amountMinor) || amountMinor <= 0 || !terms) return fail('invalid_offer');
  const data = { opportunityId, propertyId, amountMinor, terms, status, version: (row?.version || 0) + 1, updatedAt: now };
  let id; if (row) { await ctx.db.patch(row._id, data); id = row._id; } else id = await ctx.db.insert('realEstateOffers', { ...data, accountId: tenant.accountId, requestId: a.requestId, createdAt: now });
  if (!['rejected', 'withdrawn'].includes(status)) await advanceOpportunity(ctx, tenant, actor, opportunityId, 'offer', now);
  await audit(ctx, tenant, actor, row ? 'offer_updated' : 'offer_created', 'offer', id, now, `${status}|${amountMinor}`);
  return ok(await one(ctx, tenant.accountId, await ctx.db.get(id)));
}

async function approveOffer(ctx, tenant, actor, a, now) {
  const row = await owned(ctx, a.offerId, tenant.accountId, 'realEstateOffers');
  if (!row) return fail('offer_not_found');
  if (row.version !== a.version) return fail('offer_conflict');
  if (row.status !== 'draft') return fail('invalid_offer_transition');
  await ctx.db.patch(row._id, { status: 'approved', approvedBy: actor.actorAccountId, approvedAt: now, version: row.version + 1, updatedAt: now });
  await audit(ctx, tenant, actor, 'offer_approved', 'offer', row._id, now, String(row.amountMinor));
  return ok(await one(ctx, tenant.accountId, await ctx.db.get(row._id)));
}

/** One check at a time: identity, authority to sell, financing, agreement, completion. */
async function complianceUpdate(ctx, tenant, actor, a, now) {
  const opportunity = await owned(ctx, a.opportunityId, tenant.accountId, 'realEstateOpportunities');
  if (!opportunity) return fail('opportunity_not_found');
  if (!COMPLIANCE_CHECKS.includes(a.kind) || !['pending', 'confirmed', 'not_applicable'].includes(a.status)) return fail('invalid_compliance');
  const row = await ctx.db.query('realEstateCompliance').withIndex('by_opportunity', q => q.eq('opportunityId', opportunity._id)).unique();
  if (row && row.version !== a.version) return fail('compliance_conflict');
  const statuses = Object.fromEntries(COMPLIANCE_CHECKS.map(check => [`${check}Status`, row?.[`${check}Status`] || 'pending']));
  statuses[`${a.kind}Status`] = a.status;
  const confirmedAt = { ...(row?.confirmedAt || {}) }, confirmedBy = { ...(row?.confirmedBy || {}) };
  if (a.status === 'pending') { delete confirmedAt[a.kind]; delete confirmedBy[a.kind]; }
  else { confirmedAt[a.kind] = now; confirmedBy[a.kind] = String(actor.actorAccountId); }
  const data = { ...statuses, confirmedAt, confirmedBy, version: (row?.version || 0) + 1, updatedAt: now };
  if (row) await ctx.db.patch(row._id, data); else await ctx.db.insert('realEstateCompliance', { ...data, accountId: tenant.accountId, opportunityId: opportunity._id });
  await audit(ctx, tenant, actor, 'compliance_updated', 'opportunity', opportunity._id, now, `${a.kind}:${a.status}`);
  return ok(publicRow(await ctx.db.query('realEstateCompliance').withIndex('by_opportunity', q => q.eq('opportunityId', opportunity._id)).unique()));
}

async function closeDeal(ctx, tenant, actor, a, now) {
  const opportunity = await owned(ctx, a.opportunityId, tenant.accountId, 'realEstateOpportunities');
  if (!opportunity) return fail('opportunity_not_found');
  const existing = await ctx.db.query('realEstateCommissions').withIndex('by_opportunity', q => q.eq('opportunityId', opportunity._id)).unique();
  if (existing) return ok(await one(ctx, tenant.accountId, existing));
  const offer = await owned(ctx, a.offerId, tenant.accountId, 'realEstateOffers');
  if (!offer || offer.opportunityId !== opportunity._id || offer.status !== 'accepted') return fail('accepted_offer_required');
  const compliance = await ctx.db.query('realEstateCompliance').withIndex('by_opportunity', q => q.eq('opportunityId', opportunity._id)).unique();
  if (!compliance || COMPLIANCE_CHECKS.some(check => !COMPLIANCE_DONE.has(compliance[`${check}Status`]))) return fail('compliance_incomplete');
  if (!isMinor(a.commissionMinor) || a.commissionMinor <= 0) return fail('commission_required');
  const property = await owned(ctx, offer.propertyId, tenant.accountId, 'hasibProperties');
  const label = `Agency commission${property?.label ? `: ${property.label}` : ''}`.slice(0, 120);
  const charge = await createOrder(ctx, tenant, { requestId: `commission:${opportunity._id}`, channel: 'walk_in', contactId: opportunity.contactId, fulfilment: { type: 'in_store' }, lines: [{ name: label, qty: 1, unitPriceMinor: a.commissionMinor }] }, now, { internal: true });
  if (!charge.ok) return charge;
  const id = await ctx.db.insert('realEstateCommissions', { accountId: tenant.accountId, opportunityId: opportunity._id, orderId: charge.value.id, amountMinor: a.commissionMinor, status: 'due', createdAt: now, updatedAt: now });
  if (property) await ctx.db.patch(property._id, { availability: 'unavailable', version: property.version + 1, updatedAt: now });
  await ctx.db.patch(opportunity._id, { stage: 'won', version: opportunity.version + 1, updatedAt: now });
  await dealEvent(ctx, tenant, actor, opportunity._id, opportunity.stage, 'won', now);
  await audit(ctx, tenant, actor, 'deal_closed', 'opportunity', opportunity._id, now, String(a.commissionMinor));
  return ok(await one(ctx, tenant.accountId, await ctx.db.get(id)));
}

async function recordCommission(ctx, tenant, actor, a, now) {
  const row = await owned(ctx, a.commissionId, tenant.accountId, 'realEstateCommissions');
  if (!row) return fail('commission_not_found');
  if (!['due', 'paid'].includes(a.status)) return fail('invalid_commission');
  if (row.status === a.status) return ok(await one(ctx, tenant.accountId, row));
  await ctx.db.patch(row._id, { status: a.status, ...(a.status === 'paid' ? { paidAt: now } : { paidAt: undefined }), updatedAt: now });
  await audit(ctx, tenant, actor, 'commission_recorded', 'commission', row._id, now, a.status);
  return ok(await one(ctx, tenant.accountId, await ctx.db.get(row._id)));
}

async function draftSave(ctx, tenant, actor, a, now) {
  const w = a.workflow || {};
  let row = null;
  if (a.draftId) {
    row = await owned(ctx, a.draftId, tenant.accountId, 'realEstateDrafts');
    if (!row || !await visibleOpportunity(ctx, tenant, actor, row.opportunityId)) return fail('draft_not_found');
    if (row.version !== a.version) return fail('draft_conflict');
    if (row.status !== 'draft') return fail('invalid_draft_transition');
  }
  const opportunityId = row?.opportunityId || w.opportunityId;
  const opportunity = await visibleOpportunity(ctx, tenant, actor, opportunityId);
  if (!opportunity) return fail('opportunity_not_found');
  const text = bounded(w.text ?? row?.text, 4000), kind = w.kind ?? row?.kind ?? 'follow_up';
  if (!text || !['follow_up', 'viewing_confirmation', 'offer'].includes(kind)) return fail('invalid_draft');
  const conversationId = w.conversationId ?? row?.conversationId ?? opportunity.conversationId, templateId = bounded(w.templateId ?? row?.templateId, 80);
  const data = { opportunityId, ...(conversationId ? { conversationId } : {}), kind, text, ...(templateId ? { templateId } : {}), status: 'draft', version: (row?.version || 0) + 1, updatedAt: now };
  let id; if (row) { await ctx.db.patch(row._id, data); id = row._id; } else id = await ctx.db.insert('realEstateDrafts', { ...data, accountId: tenant.accountId, requestId: a.requestId, createdAt: now });
  await audit(ctx, tenant, actor, row ? 'draft_updated' : 'draft_created', 'draft', id, now);
  return ok(await one(ctx, tenant.accountId, await ctx.db.get(id)));
}

/** Sends an approved follow-up: free text inside WhatsApp's 24-hour window, an approved utility template outside it. */
async function approveDraft(ctx, tenant, actor, a, now) {
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
  if (status === 'template_required') await ctx.db.insert('realEstateTasks', { accountId: tenant.accountId, kind: 'template_required', entityType: 'draft', entityId: String(row._id), status: 'open', reason: 'An approved utility template is needed outside the WhatsApp 24-hour window', createdAt: now, updatedAt: now });
  await audit(ctx, tenant, actor, 'draft_approved', 'draft', row._id, now, status);
  return ok(await one(ctx, tenant.accountId, await ctx.db.get(row._id)));
}

async function compliance(ctx, tenant, actor, a) {
  const opportunity = await visibleOpportunity(ctx, tenant, actor, a.opportunityId);
  if (!opportunity) return fail('opportunity_not_found');
  const row = await ctx.db.query('realEstateCompliance').withIndex('by_opportunity', q => q.eq('opportunityId', opportunity._id)).unique();
  return ok(row ? publicRow(row) : { version: 0, ...Object.fromEntries(COMPLIANCE_CHECKS.map(check => [`${check}Status`, 'pending'])), confirmedAt: {}, confirmedBy: {} });
}

export async function executeRealEstate(ctx, tenant, actor, a, now) {
  if (MANAGER_ONLY.has(a.operation) && actor.role !== 'manager') return fail('manager_required');
  switch (a.operation) {
    case 'real_estate_overview': return overview(ctx, tenant, actor, now);
    case 'real_estate_insights': return insights(ctx, tenant);
    case 'real_estate_task_resolve': return resolveTask(ctx, tenant, actor, a, now);
    case 'opportunities': return dealList(ctx, tenant, actor, 'realEstateOpportunities', a);
    case 'opportunity_save': return opportunitySave(ctx, tenant, actor, a, now);
    case 'opportunity_stage': return opportunityStage(ctx, tenant, actor, a, now);
    case 'matches': { const row = await visibleOpportunity(ctx, tenant, actor, a.opportunityId); if (!row) return fail('opportunity_not_found'); const rows = await ctx.db.query('realEstateMatches').withIndex('by_opportunity', q => q.eq('opportunityId', row._id)).take(200); return ok({ items: await readable(ctx, tenant.accountId, rows) }); }
    case 'match_generate': return generateMatches(ctx, tenant, actor, a, now);
    case 'match_update': return matchUpdate(ctx, tenant, actor, a, now);
    case 'viewings': return dealList(ctx, tenant, actor, 'realEstateViewings', a, 'by_account_date');
    case 'viewing_save': return viewingSave(ctx, tenant, actor, a, now);
    case 'offers': return dealList(ctx, tenant, actor, 'realEstateOffers', a);
    case 'offer_save': return offerSave(ctx, tenant, actor, a, now);
    case 'offer_approve': return approveOffer(ctx, tenant, actor, a, now);
    case 'compliance': return compliance(ctx, tenant, actor, a);
    case 'compliance_update': return complianceUpdate(ctx, tenant, actor, a, now);
    case 'deal_close': return closeDeal(ctx, tenant, actor, a, now);
    case 'commissions': { const page = await ctx.db.query('realEstateCommissions').withIndex('by_account_created', q => q.eq('accountId', tenant.accountId)).order('desc').take(200); return ok({ items: await readable(ctx, tenant.accountId, page), cursor: null }); }
    case 'commission_record': return recordCommission(ctx, tenant, actor, a, now);
    case 'drafts': return dealList(ctx, tenant, actor, 'realEstateDrafts', a);
    case 'draft_save': return draftSave(ctx, tenant, actor, a, now);
    case 'draft_approve': return approveDraft(ctx, tenant, actor, a, now);
    case 'real_estate_tasks': { const result = await overview(ctx, tenant, actor, now); return result.ok ? ok({ items: result.value.tasks }) : result; }
    case 'deal_history': { const row = await visibleOpportunity(ctx, tenant, actor, a.opportunityId); if (!row) return fail('opportunity_not_found'); const rows = await ctx.db.query('realEstateDealEvents').withIndex('by_opportunity', q => q.eq('opportunityId', row._id)).take(200); return ok({ items: rows.map(publicRow) }); }
    default: return null;
  }
}
