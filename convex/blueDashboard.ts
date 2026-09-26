import { internalMutation, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import { v, type Value } from 'convex/values';
import { executeDashboard } from './blueDashboardState.js';
import { executeAudience } from './blueAudienceState.js';
import { executeCampaigns } from './blueCampaignState.js';
import { linkConversation, sectorFor } from './blueContacts.js';

type Result = Promise<{ ok: boolean; value?: Value; reason?: string }>;
const DASHBOARD = ['overview', 'set_timezone', 'conversations', 'thread', 'contacts', 'contact_update', 'contact_delete', 'export_chat', 'export_contacts', 'export_account'];
const CAMPAIGNS = ['templates', 'replace_templates', 'campaign_preview', 'campaign_create', 'campaigns', 'campaign_detail', 'campaign_cancel'];
const field = v.object({ key: v.string(), value: v.union(v.string(), v.null()) });
const templateRecord = v.object({ templateId: v.string(), name: v.string(), language: v.string(), category: v.string(), status: v.string(), parameterFormat: v.string(),
  header: v.optional(v.object({ format: v.string(), text: v.optional(v.string()) })), body: v.string(), footer: v.optional(v.string()),
  buttons: v.array(v.object({ type: v.string(), text: v.string() })), variables: v.array(v.object({ key: v.string(), component: v.string(), example: v.optional(v.string()) })),
  sendable: v.boolean(), unsupportedReason: v.optional(v.string()) });

// Every call is resolved to one tenant from sessionHash inside the executors.
export const execute = internalMutation({
  args: {
    operation: v.union(...[...DASHBOARD, ...CAMPAIGNS, 'import_contacts'].map(s => v.literal(s))),
    sessionHash: v.string(), channel:v.optional(v.union(v.literal('whatsapp'),v.literal('instagram'))), cursor: v.optional(v.string()), search: v.optional(v.string()), limit: v.optional(v.number()), status: v.optional(v.string()),
    before: v.optional(v.number()), conversationId: v.optional(v.string()), contactId: v.optional(v.string()), confirm: v.optional(v.boolean()), timezone: v.optional(v.string()),
    patch: v.optional(v.object({ ownerName: v.optional(v.string()), fields: v.optional(v.array(field)), qualificationOverride: v.optional(v.union(v.string(), v.null())) })),
    requestId: v.optional(v.string()), origin: v.optional(v.string()), requireConsent: v.optional(v.boolean()),
    consent: v.optional(v.object({ source: v.string(), date: v.string(), purpose: v.string(), attested: v.boolean() })),
    rows: v.optional(v.array(v.object({ waId: v.string(), name: v.optional(v.string()), countryIso: v.optional(v.string()), fields: v.optional(v.array(v.object({ key: v.string(), value: v.string() }))) }))),
    integrationId: v.optional(v.string()), templates: v.optional(v.array(templateRecord)), templateId: v.optional(v.string()),
    mapping: v.optional(v.array(v.object({ key: v.string(), source: v.string(), value: v.string() }))), contactIds: v.optional(v.array(v.string())),
    allowance: v.optional(v.number()), scheduledAt: v.optional(v.number()), name: v.optional(v.string()), campaignId: v.optional(v.string()),
  },
  handler: (ctx, args): Result => {
    const a = { ...args, hashSecret: process.env.BLUE_REVIEW_SERVICE_SECRET };
    if (args.operation === 'import_contacts') return executeAudience(ctx, a);
    if (CAMPAIGNS.includes(args.operation)) return executeCampaigns(ctx, a);
    return executeDashboard(ctx, a);
  },
});

/** Operator check before enabling the dashboard: conversations not yet linked to contacts. */
export const migrationStatus = internalQuery({ args: {}, handler: async ctx => {
  const rows = await ctx.db.query('blueConversations').withIndex('by_contact', q => q.eq('contactId', undefined)).take(1000);
  return { unlinkedConversations: rows.length, complete: rows.length === 0 };
} });

/** Operator migration step: links conversations in bounded batches, then reschedules itself. */
export const migrateContacts = internalMutation({ args: {}, handler: async ctx => {
  const now = Date.now();
  const rows = await ctx.db.query('blueConversations').withIndex('by_contact', q => q.eq('contactId', undefined)).take(50);
  for (const person of rows) {
    const account = await ctx.db.get(person.accountId);
    const session = account?.draftHash ? await ctx.db.query('blueReviewSessions').withIndex('by_hash', q => q.eq('sessionHash', account.draftHash!)).unique() : null;
    await linkConversation(ctx, person, { sectorId: sectorFor(session), now, secret: process.env.BLUE_REVIEW_SERVICE_SECRET });
  }
  if (rows.length === 50) await ctx.scheduler.runAfter(0, internal.blueDashboard.migrateContacts, {});
  return { linked: rows.length };
} });
