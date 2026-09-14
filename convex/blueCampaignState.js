// Broadcast campaigns: approved marketing templates sent to consented contacts.
// Separate tables, rate counters and failure state from Layla's conversational
// replies, so a broadcast can never pause or duplicate a chat response.
import { resolveTenant, owned, encodeCursor, decodeCursor, afterCursor } from './blueTenant.js';
import { DAY, displayName } from './blueContacts.js';
import { marketingEligibility } from './blueAudienceState.js';
import { messagingReady } from './blueMessagingState.js';
import { formatPhone } from '../src/lib/dashboard/phone.js';
import { resolveParameters, validMapping, validTemplateRecord } from '../config/layla-templates.js';

export const MAX_RECIPIENTS = 100;
export const CAMPAIGN_PER_MINUTE = 20;
export const MAX_ATTEMPTS = 3;
export const RETRY_BACKOFF_MS = [30000, 120000, 480000];
export const STALE_ATTEMPT_MS = 120000;
export const MAX_SCHEDULE_AHEAD_MS = 30 * DAY;
const ACCEPTED = ['submitted', 'sent', 'delivered', 'read'];
const STATUSES = ['pending', 'queued', 'attempting', 'submitted', 'sent', 'delivered', 'read', 'failed', 'ambiguous', 'blocked', 'cancelled'];
const ok = value => ({ ok: true, value }), fail = reason => ({ ok: false, reason });

async function broadcastEnabled(ctx) {
  const row = await ctx.db.query('blueMessagingSettings').withIndex('by_key', q => q.eq('key', 'broadcast')).unique();
  return row?.enabled === true;
}
async function recipientsFor(ctx, campaignId, status, limit = MAX_RECIPIENTS) {
  return ctx.db.query('blueCampaignRecipients').withIndex('by_campaign_status', q => q.eq('campaignId', campaignId).eq('status', status)).take(limit);
}
async function counts(ctx, campaignId) {
  const out = {};
  for (const status of STATUSES) out[status] = (await recipientsFor(ctx, campaignId, status)).length;
  return out;
}
function publicTemplate(t) {
  return { id: t.templateId, name: t.name, language: t.language, category: t.category, status: t.status, parameterFormat: t.parameterFormat,
    header: t.header || null, body: t.body, footer: t.footer || '', buttons: t.buttons, variables: t.variables, sendable: t.sendable, unsupportedReason: t.unsupportedReason || null, syncedAt: t.syncedAt };
}
async function publicCampaign(ctx, c, withRecipients = false) {
  const base = { id: c._id, name: c.name, origin: c.origin, status: c.status, reason: c.reason || null, template: { name: c.template.name, language: c.template.language, body: c.template.body },
    scheduledAt: c.scheduledAt, timezone: c.timezone, recipientCount: c.recipientCount, createdAt: c.createdAt, startedAt: c.startedAt || null,
    completedAt: c.completedAt || null, cancelledAt: c.cancelledAt || null, counts: await counts(ctx, c._id) };
  if (!withRecipients) return base;
  const recipients = [];
  for (const status of STATUSES) for (const r of await recipientsFor(ctx, c._id, status)) {
    recipients.push({ name: r.name || '', number: r.waId ? formatPhone(r.waId) : '', status: r.status, reason: r.reason || null, errorCode: r.errorCode ?? null, updatedAt: r.updatedAt });
  }
  return { ...base, recipients };
}
async function sentInLastDay(ctx, integrationId, now) {
  let total = 0;
  for (const status of ACCEPTED) {
    const rows = await ctx.db.query('blueCampaignRecipients').withIndex('by_integration_status', q => q.eq('integrationId', integrationId).eq('status', status)).take(2000);
    total += rows.filter(r => r.attemptAt && now - r.attemptAt < DAY).length;
  }
  return total;
}
async function schedule(ctx, a, args) { if (a.workerFunction) await ctx.scheduler.runAfter(0, a.workerFunction, args); }

/** Owner-facing template and campaign operations. */
export async function executeCampaigns(ctx, a, now = Date.now()) {
  const tenant = await resolveTenant(ctx, a.sessionHash, now);
  if (tenant.error) return fail(tenant.error);
  const { accountId, integration, row } = tenant;

  if (a.operation === 'templates') {
    const rows = await ctx.db.query('blueTemplates').withIndex('by_account_synced', q => q.eq('accountId', accountId)).order('desc').take(250);
    const current = rows.filter(t => t.integrationId === integration?.id);
    return ok({ templates: current.map(publicTemplate), syncedAt: current[0]?.syncedAt || null, broadcastAvailable: await broadcastEnabled(ctx) });
  }
  if (a.operation === 'replace_templates') {
    if (!integration || a.integrationId !== integration.id || !Array.isArray(a.templates) || a.templates.length > 250 || !a.templates.every(validTemplateRecord)) return fail('invalid_templates');
    const existing = await ctx.db.query('blueTemplates').withIndex('by_account_synced', q => q.eq('accountId', accountId)).take(1000);
    const keep = new Set(a.templates.map(t => t.templateId));
    for (const t of existing) if (!keep.has(t.templateId) || t.integrationId !== integration.id) await ctx.db.delete(t._id);
    for (const t of a.templates) {
      const current = existing.find(e => e.templateId === t.templateId && e.integrationId === integration.id);
      const value = { ...t, accountId, integrationId: integration.id, syncedAt: now };
      if (current) await ctx.db.replace(current._id, value); else await ctx.db.insert('blueTemplates', value);
    }
    return ok({ count: a.templates.length });
  }

  if (['campaign_preview', 'campaign_create'].includes(a.operation)) {
    if (!integration || !tenant.connected || !messagingReady(row, now)) return fail('connection_not_ready');
    if (!await broadcastEnabled(ctx)) return fail('broadcast_unavailable');
    const template = await ctx.db.query('blueTemplates').withIndex('by_account_template', q => q.eq('accountId', accountId).eq('templateId', String(a.templateId || ''))).unique();
    if (!template || template.integrationId !== integration.id || !template.sendable || template.status !== 'APPROVED' || template.category !== 'MARKETING') return fail('template_not_sendable');
    if (!validMapping(template, a.mapping || [])) return fail('invalid_mapping');
    if (!Array.isArray(a.contactIds) || !a.contactIds.length || a.contactIds.length > 500) return fail('invalid_recipients');
    const allowance = Number.isFinite(a.allowance) ? a.allowance : 0;
    const remaining = Math.max(0, allowance - await sentInLastDay(ctx, integration.id, now));
    const cap = Math.min(MAX_RECIPIENTS, remaining);
    const eligible = [], excluded = [];
    for (const id of [...new Set(a.contactIds)]) {
      const contact = await owned(ctx, id, accountId, 'blueContacts');
      const reason = marketingEligibility(contact);
      const shown = contact?.state === 'active' ? { contactId: contact._id, name: displayName(contact).name, number: formatPhone(contact.waId) } : { contactId: String(id), name: '', number: '' };
      if (reason) { excluded.push({ ...shown, reason }); continue; }
      const { parameters, missing } = resolveParameters(template, a.mapping, contact);
      if (missing.length) { excluded.push({ ...shown, reason: 'missing_variable' }); continue; }
      eligible.push({ ...shown, contact, parameters });
    }
    const preview = { eligible: eligible.map(({ contact, ...e }) => e), excluded, cap, allowance, maxRecipients: MAX_RECIPIENTS };
    if (a.operation === 'campaign_preview') return ok(preview);

    if (!/^[a-f0-9-]{36}$/.test(a.requestId || '')) return fail('invalid_request');
    const prior = await ctx.db.query('blueCampaigns').withIndex('by_account_request', q => q.eq('accountId', accountId).eq('requestId', a.requestId)).unique();
    if (prior) return ok({ campaign: await publicCampaign(ctx, prior) });
    if (a.confirm !== true) return fail('confirmation_required');
    if (!eligible.length) return fail('no_eligible_recipients');
    if (eligible.length > cap) return fail(eligible.length > MAX_RECIPIENTS ? 'recipient_limit' : 'messaging_limit');
    const scheduledAt = Number(a.scheduledAt);
    if (!Number.isSafeInteger(scheduledAt) || scheduledAt < now - 60000 || scheduledAt > now + MAX_SCHEDULE_AHEAD_MS) return fail('invalid_schedule');
    if (typeof a.timezone !== 'string' || !a.timezone || a.timezone.length > 64) return fail('invalid_timezone');
    const name = typeof a.name === 'string' && a.name.trim() ? a.name.trim().slice(0, 80) : template.name;
    const campaignId = await ctx.db.insert('blueCampaigns', { accountId, integrationId: integration.id, requestId: a.requestId, name, origin: a.origin === 'chat' ? 'chat' : 'broadcast',
      template: { templateId: template.templateId, name: template.name, language: template.language, category: template.category, parameterFormat: template.parameterFormat,
        body: template.body, ...(template.header ? { header: template.header } : {}), ...(template.footer ? { footer: template.footer } : {}) },
      mapping: a.mapping, status: 'scheduled', scheduledAt: Math.max(now, scheduledAt), timezone: a.timezone, recipientCount: eligible.length, createdAt: now, updatedAt: now });
    for (const e of eligible) {
      await ctx.db.insert('blueCampaignRecipients', { campaignId, accountId, integrationId: integration.id, contactId: e.contact._id, numberHash: e.contact.numberHash,
        waId: e.contact.waId, name: displayName(e.contact).name, parameters: e.parameters, status: 'pending', attempts: 0, nextAttemptAt: Math.max(now, scheduledAt),
        at: Math.max(now, scheduledAt), updatedAt: now, expiresAt: Math.max(now, scheduledAt) + 30 * DAY });
    }
    return ok({ campaign: await publicCampaign(ctx, await ctx.db.get(campaignId)), excluded });
  }

  if (a.operation === 'campaigns') {
    const cursor = decodeCursor(a.cursor);
    const query = ctx.db.query('blueCampaigns').withIndex('by_account_created', q => cursor ? q.eq('accountId', accountId).lte('createdAt', cursor.at) : q.eq('accountId', accountId));
    const rows = afterCursor(await query.order('desc').take(40), cursor, 'createdAt').slice(0, 20);
    const items = [];
    for (const c of rows) items.push(await publicCampaign(ctx, c));
    return ok({ items, cursor: rows.length === 20 ? encodeCursor(rows.at(-1).createdAt, rows.at(-1)._id) : null });
  }
  if (a.operation === 'campaign_detail') {
    const c = await owned(ctx, a.campaignId, accountId, 'blueCampaigns');
    return c ? ok({ campaign: await publicCampaign(ctx, c, true) }) : fail('campaign_not_found');
  }
  if (a.operation === 'campaign_cancel') {
    const c = await owned(ctx, a.campaignId, accountId, 'blueCampaigns');
    if (!c) return fail('campaign_not_found');
    // Cancellable only until recipient processing starts.
    if (!['scheduled', 'starting'].includes(c.status)) return fail('campaign_not_cancellable');
    await ctx.db.patch(c._id, { status: 'cancelled', cancelledAt: now, updatedAt: now });
    for (const r of await recipientsFor(ctx, c._id, 'pending')) await ctx.db.patch(r._id, { status: 'cancelled', updatedAt: now });
    return ok({ campaign: await publicCampaign(ctx, await ctx.db.get(c._id)) });
  }
  return fail('invalid_action');
}

async function finishIfDone(ctx, campaign, now) {
  if (campaign.status !== 'processing') return;
  for (const status of ['pending', 'queued', 'attempting']) if ((await recipientsFor(ctx, campaign._id, status, 1)).length) return;
  await ctx.db.patch(campaign._id, { status: 'completed', completedAt: now, updatedAt: now });
}
async function blockCampaign(ctx, campaign, reason, now) {
  await ctx.db.patch(campaign._id, { status: 'blocked', reason, updatedAt: now });
  for (const status of ['pending', 'queued']) for (const r of await recipientsFor(ctx, campaign._id, status)) await ctx.db.patch(r._id, { status: 'blocked', reason, updatedAt: now });
}
async function nextQueued(ctx, a, campaignId, now) {
  const [next] = (await recipientsFor(ctx, campaignId, 'queued')).filter(r => r.nextAttemptAt <= now).sort((x, y) => x.nextAttemptAt - y.nextAttemptAt);
  if (next) await schedule(ctx, a, { campaignJobId: next._id });
}
async function accountRow(ctx, accountId, integrationId) {
  const account = await ctx.db.get(accountId);
  if (!account?.draftHash) return null;
  const row = await ctx.db.query('blueReviewSessions').withIndex('by_hash', q => q.eq('sessionHash', account.draftHash)).unique();
  return row?.integration?.id === integrationId ? row : null;
}
async function jobBlockReason(ctx, job, campaign, now) {
  if (!campaign || campaign.status !== 'processing') return 'campaign_not_processing';
  if (!await broadcastEnabled(ctx)) return 'broadcast_paused';
  const row = await accountRow(ctx, job.accountId, job.integrationId);
  if (!row || !messagingReady(row, now)) return 'connection_not_ready';
  const contact = await ctx.db.get(job.contactId);
  const eligibility = marketingEligibility(contact);
  if (eligibility) return eligibility;
  if (contact.numberHash !== job.numberHash || !job.waId) return 'contact_changed';
  return null;
}

/** Server-to-server worker operations (bearer-authenticated Vercel worker). */
export async function executeCampaignWorker(ctx, a, now = Date.now()) {
  if (a.operation === 'start_context') {
    const campaign = await ctx.db.get(a.campaignId);
    if (!campaign || campaign.status !== 'starting') return ok(null);
    const row = await accountRow(ctx, campaign.accountId, campaign.integrationId);
    return ok(row && messagingReady(row, now) ? { campaignId: campaign._id, template: campaign.template, integration: row.integration, sessionHash: row.sessionHash } : { campaignId: campaign._id, blocked: 'connection_not_ready' });
  }
  if (a.operation === 'start_result') {
    const campaign = await ctx.db.get(a.campaignId);
    if (!campaign || campaign.status !== 'starting') return ok(null);
    if (!await broadcastEnabled(ctx)) { await blockCampaign(ctx, campaign, 'broadcast_paused', now); return ok(null); }
    if (a.ready !== true) { await blockCampaign(ctx, campaign, typeof a.reason === 'string' ? a.reason.slice(0, 60) : 'start_checks_failed', now); return ok(null); }
    const allowance = Math.max(0, Number(a.allowance) || 0);
    const room = Math.min(MAX_RECIPIENTS, Math.max(0, allowance - await sentInLastDay(ctx, campaign.integrationId, now)));
    const pending = (await recipientsFor(ctx, campaign._id, 'pending')).sort((x, y) => x.at - y.at);
    for (const [index, r] of pending.entries()) {
      await ctx.db.patch(r._id, index < room ? { status: 'queued', nextAttemptAt: now, updatedAt: now } : { status: 'blocked', reason: 'messaging_limit', updatedAt: now });
    }
    await ctx.db.patch(campaign._id, { status: 'processing', allowance, startedAt: now, updatedAt: now });
    await nextQueued(ctx, a, campaign._id, now);
    await finishIfDone(ctx, await ctx.db.get(campaign._id), now);
    return ok(null);
  }
  if (a.operation === 'claim') {
    const job = await ctx.db.get(a.jobId);
    if (!job || job.status !== 'queued' || job.nextAttemptAt > now || !/^[a-f0-9-]{36}$/.test(a.intent || '')) return ok(null);
    if ((await recipientsFor(ctx, job.campaignId, 'attempting', 1)).length) return ok(null);
    const campaign = await ctx.db.get(job.campaignId);
    const reason = await jobBlockReason(ctx, job, campaign, now);
    if (reason) {
      await ctx.db.patch(job._id, { status: 'blocked', reason, updatedAt: now });
      if (['broadcast_paused', 'connection_not_ready'].includes(reason) && campaign?.status === 'processing') await blockCampaign(ctx, campaign, reason, now);
      else if (campaign) await nextQueued(ctx, a, campaign._id, now);
      if (campaign) await finishIfDone(ctx, await ctx.db.get(campaign._id), now);
      return ok(null);
    }
    const key = `campaign-minute:${job.integrationId}:${Math.floor(now / 60000)}`;
    const rate = await ctx.db.query('blueMessageRates').withIndex('by_key', q => q.eq('key', key)).unique();
    if (rate?.count >= CAMPAIGN_PER_MINUTE) {
      await ctx.db.patch(job._id, { nextAttemptAt: (Math.floor(now / 60000) + 1) * 60000, updatedAt: now });
      return ok(null);
    }
    if (rate) await ctx.db.patch(rate._id, { count: rate.count + 1 }); else await ctx.db.insert('blueMessageRates', { key, count: 1, expiresAt: now + 120000 });
    const row = await accountRow(ctx, job.accountId, job.integrationId);
    await ctx.db.patch(job._id, { status: 'attempting', intent: a.intent, attemptAt: now, attempts: job.attempts + 1, updatedAt: now });
    return ok({ jobId: job._id, intent: a.intent, waId: job.waId, parameters: job.parameters, template: campaign.template, integration: row.integration, sessionHash: row.sessionHash });
  }
  if (a.operation === 'gate') {
    const job = await ctx.db.get(a.jobId);
    if (!job || job.status !== 'attempting' || job.intent !== a.intent) return ok(false);
    return ok(!await jobBlockReason(ctx, job, await ctx.db.get(job.campaignId), now));
  }
  if (a.operation === 'result') {
    const job = await ctx.db.get(a.jobId);
    if (!job || job.intent !== a.intent || !['submitted', 'retry', 'failed', 'ambiguous', 'blocked'].includes(a.status)) return fail('invalid_state');
    const campaign = await ctx.db.get(job.campaignId);
    // A receipt may already have advanced the job while the provider call returned.
    if (job.status === 'attempting') {
      const code = Number.isSafeInteger(a.errorCode) ? { errorCode: a.errorCode } : {};
      if (a.status === 'retry' && job.attempts < MAX_ATTEMPTS) {
        await ctx.db.patch(job._id, { status: 'queued', nextAttemptAt: now + RETRY_BACKOFF_MS[job.attempts - 1], reason: 'provider_throttled', intent: undefined, ...code, updatedAt: now });
      } else {
        const status = a.status === 'retry' ? 'failed' : a.status;
        await ctx.db.patch(job._id, { status, ...(a.providerId ? { providerId: a.providerId } : {}), ...(a.reason ? { reason: String(a.reason).slice(0, 60) } : {}), ...code, updatedAt: now });
      }
    } else if (a.providerId && !job.providerId) await ctx.db.patch(job._id, { providerId: a.providerId, updatedAt: now });
    if (campaign && typeof a.campaignBlock === 'string' && campaign.status === 'processing') await blockCampaign(ctx, campaign, a.campaignBlock.slice(0, 60), now);
    else if (campaign) await nextQueued(ctx, a, campaign._id, now);
    if (campaign) await finishIfDone(ctx, await ctx.db.get(campaign._id), now);
    return ok(null);
  }
  return fail('invalid_state');
}

/** Minute cron: start due campaigns, redispatch due jobs, fence lost attempts, expire snapshots. */
export async function maintainCampaigns(ctx, a, now = Date.now()) {
  const due = await ctx.db.query('blueCampaigns').withIndex('by_status_scheduled', q => q.eq('status', 'scheduled').lte('scheduledAt', now)).take(20);
  for (const c of due) { await ctx.db.patch(c._id, { status: 'starting', startingAt: now, updatedAt: now }); await schedule(ctx, a, { campaignStartId: c._id }); }
  const starting = await ctx.db.query('blueCampaigns').withIndex('by_status_scheduled', q => q.eq('status', 'starting')).take(20);
  for (const c of starting) if ((c.startingAt || 0) < now - STALE_ATTEMPT_MS) { await ctx.db.patch(c._id, { startingAt: now, updatedAt: now }); await schedule(ctx, a, { campaignStartId: c._id }); }
  const attempting = await ctx.db.query('blueCampaignRecipients').withIndex('by_status_next', q => q.eq('status', 'attempting')).take(100);
  for (const job of attempting) if ((job.attemptAt || 0) < now - STALE_ATTEMPT_MS) {
    // Outcome unknown: never retried. The campaign continues with other recipients.
    await ctx.db.patch(job._id, { status: 'ambiguous', reason: 'worker_outcome_unknown', updatedAt: now });
  }
  const queued = await ctx.db.query('blueCampaignRecipients').withIndex('by_status_next', q => q.eq('status', 'queued').lte('nextAttemptAt', now)).take(100);
  const campaigns = new Set();
  for (const job of queued) if (!campaigns.has(job.campaignId)) { campaigns.add(job.campaignId); await schedule(ctx, a, { campaignJobId: job._id }); }
  const processing = await ctx.db.query('blueCampaigns').withIndex('by_status_scheduled', q => q.eq('status', 'processing')).take(50);
  for (const c of processing) await finishIfDone(ctx, c, now);
  const expired = await ctx.db.query('blueCampaignRecipients').withIndex('by_expiry', q => q.lt('expiresAt', now)).take(100);
  for (const r of expired) if (!['attempting', 'queued', 'pending'].includes(r.status)) await ctx.db.delete(r._id);
}
