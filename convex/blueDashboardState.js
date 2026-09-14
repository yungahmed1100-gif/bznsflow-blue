// Owner dashboard reads and owner-initiated contact changes. Every operation is
// scoped by the tenant resolved from the verified session; results never carry
// credentials, hashes or internal integration identifiers.
import { resolveTenant, owned, encodeCursor, decodeCursor, afterCursor } from './blueTenant.js';
import { DAY, deleteContact, linkConversation, ownerContactPatch, publicContact, sectorFor } from './blueContacts.js';
import { messagingReady } from './blueMessagingState.js';
import { packDescription } from '../config/layla-qualification.js';
import { renderTemplate } from '../config/layla-templates.js';

const PAGE = 25, SEARCH_LIMIT = 30, THREAD_PAGE = 50, EXPORT_MESSAGES = 1000;
const ok = value => ({ ok: true, value }), fail = reason => ({ ok: false, reason });
const clampLimit = (value, max) => Math.min(max, Math.max(1, Number.isSafeInteger(value) ? value : max));
export const TIMEZONE_PATTERN = /^(?:UTC|[A-Za-z]+(?:[/_+-][A-Za-z0-9]+){1,3})$/;

function publicMessage(m, now) {
  return { id: m._id, direction: m.direction, text: m.textExpiresAt > now ? m.text : null, textExpired: !(m.textExpiresAt > now),
    status: m.status, reason: m.reason || null, errorCode: m.errorCode ?? null, manual: !!m.manual, at: m.at };
}
function publicTemplateSend(r, campaign, now) {
  const retained = !!r.waId && r.expiresAt > now;
  return { id: r._id, direction: 'template', templateName: campaign?.template.name || '', text: retained && campaign ? renderTemplate(campaign.template, r.parameters) : null,
    textExpired: !retained, status: r.status, reason: r.reason || null, errorCode: r.errorCode ?? null, manual: true, at: r.at };
}

async function messagingState(ctx, tenant, now) {
  const global = await ctx.db.query('blueMessagingSettings').withIndex('by_key', q => q.eq('key', 'global')).unique();
  const broadcast = await ctx.db.query('blueMessagingSettings').withIndex('by_key', q => q.eq('key', 'broadcast')).unique();
  const enabled = global?.enabled === true;
  const control = tenant.integration && await ctx.db.query('blueMessagingControls').withIndex('by_integration', q => q.eq('integrationId', tenant.integration.id)).unique();
  const row = tenant.row, ready = messagingReady(row, now);
  const active = enabled && control?.active === true && ready && control.profileVersion === (row.profileVersion || 1);
  const rate = tenant.integration && await ctx.db.query('blueMessageRates').withIndex('by_key', q => q.eq('key', `day:${tenant.integration.id}:${Math.floor(now / DAY)}`)).unique();
  return { available: enabled, active, broadcastAvailable: broadcast?.enabled === true,
    reason: !enabled ? 'messaging_unavailable' : active ? '' : control?.reason || (control?.active ? 'activation_not_ready' : 'not_activated'),
    limits: { perMinute: 10, perDay: 100, usedToday: rate?.count || 0 } };
}

async function lastMessage(ctx, conversationId, now) {
  const [m] = await ctx.db.query('blueMessages').withIndex('by_conversation_at', q => q.eq('conversationId', conversationId)).order('desc').take(1);
  return m ? { direction: m.direction, text: m.textExpiresAt > now ? String(m.text || '').slice(0, 140) : null, status: m.status, at: m.at } : null;
}
async function conversationItem(ctx, person, tenant, now) {
  const contact = await linkConversation(ctx, person, { sectorId: sectorFor(tenant.row), now, secret: tenant.secret });
  return { id: person._id, contact: publicContact(contact, person), lastMessage: await lastMessage(ctx, person._id, now),
    updatedAt: person.updatedAt, takeover: person.takeover, optout: person.optout || contact.optout, windowOpenUntil: person.lastInbound ? person.lastInbound + DAY : 0 };
}

/** Link a bounded number of pre-dashboard conversations for this account. */
export async function migrateAccount(ctx, tenant, now, limit = 25) {
  const rows = await ctx.db.query('blueConversations').withIndex('by_account_updated', q => q.eq('accountId', tenant.accountId)).order('desc').take(500);
  const pending = rows.filter(r => !r.contactId);
  for (const person of pending.slice(0, limit)) await linkConversation(ctx, person, { sectorId: sectorFor(tenant.row), now, secret: tenant.secret });
  return Math.max(0, pending.length - limit);
}

async function searchContacts(ctx, accountId, text, limit) {
  const digits = text.replace(/\D/g, '');
  const bySearch = await ctx.db.query('blueContacts').withSearchIndex('search_contacts', q => q.search('searchText', text).eq('accountId', accountId).eq('state', 'active')).take(limit);
  if (digits.length < 3) return bySearch;
  // Number fragments are not whole search tokens; scan recent activity for them.
  const recent = await ctx.db.query('blueContacts').withIndex('by_account_state_activity', q => q.eq('accountId', accountId).eq('state', 'active')).order('desc').take(500);
  const seen = new Set(bySearch.map(c => c._id));
  return [...bySearch, ...recent.filter(c => !seen.has(c._id) && c.waId?.includes(digits))].slice(0, limit);
}
async function conversationFor(ctx, contact) {
  const rows = await ctx.db.query('blueConversations').withIndex('by_contact', q => q.eq('contactId', contact._id)).take(5);
  return rows.sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;
}

async function threadMessages(ctx, person, contact, before, limit, now) {
  const query = ctx.db.query('blueMessages').withIndex('by_conversation_at', q => before ? q.eq('conversationId', person._id).lt('at', before) : q.eq('conversationId', person._id));
  const messages = (await query.order('desc').take(limit)).map(m => publicMessage(m, now));
  const sends = contact ? await ctx.db.query('blueCampaignRecipients').withIndex('by_contact_at', q => before ? q.eq('contactId', contact._id).lt('at', before) : q.eq('contactId', contact._id)).order('desc').take(limit) : [];
  const campaigns = new Map();
  const templates = [];
  for (const r of sends.filter(s => !['pending', 'cancelled'].includes(s.status))) {
    if (!campaigns.has(r.campaignId)) campaigns.set(r.campaignId, await ctx.db.get(r.campaignId));
    templates.push(publicTemplateSend(r, campaigns.get(r.campaignId), now));
  }
  const merged = [...messages, ...templates].sort((a, b) => b.at - a.at).slice(0, limit);
  return { messages: merged.reverse(), before: merged.length === limit ? merged[0].at : null };
}

export async function executeDashboard(ctx, a, now = Date.now()) {
  const tenant = await resolveTenant(ctx, a.sessionHash, now);
  if (tenant.error) return fail(tenant.error);
  tenant.secret = a.hashSecret;
  const { accountId, row } = tenant;
  const sectorId = sectorFor(row);

  if (a.operation === 'overview') {
    const settings = await ctx.db.query('blueBusinessSettings').withIndex('by_account', q => q.eq('accountId', accountId)).unique();
    const unlinked = (await ctx.db.query('blueConversations').withIndex('by_account_updated', q => q.eq('accountId', accountId)).order('desc').take(500)).some(r => !r.contactId);
    return ok({ business: { name: row.profile?.businessName || '', sector: row.profile?.sector || '', sectorId },
      connected: tenant.connected, integration: tenant.integration ? { sender: tenant.integration.sender, path: tenant.integration.path, status: row.status,
        checks: row.connectionChecks || null, checkedAt: row.checkedAt || null } : null,
      messaging: await messagingState(ctx, tenant, now), timezone: settings?.timezone || null, migrationPending: unlinked,
      qualification: packDescription(sectorId) });
  }
  if (a.operation === 'set_timezone') {
    if (typeof a.timezone !== 'string' || a.timezone.length > 64 || !TIMEZONE_PATTERN.test(a.timezone)) return fail('invalid_timezone');
    const settings = await ctx.db.query('blueBusinessSettings').withIndex('by_account', q => q.eq('accountId', accountId)).unique();
    if (settings) await ctx.db.patch(settings._id, { timezone: a.timezone, updatedAt: now });
    else await ctx.db.insert('blueBusinessSettings', { accountId, timezone: a.timezone, updatedAt: now });
    return ok({ timezone: a.timezone });
  }

  if (a.operation === 'conversations') {
    const limit = clampLimit(a.limit, PAGE);
    if (typeof a.search === 'string' && a.search.trim()) {
      if (a.search.length > 80) return fail('invalid_search');
      const items = [];
      for (const contact of await searchContacts(ctx, accountId, a.search.trim(), SEARCH_LIMIT)) {
        const person = await conversationFor(ctx, contact);
        if (person?.integrationId === tenant.integration?.id) items.push(await conversationItem(ctx, person, tenant, now));
      }
      return ok({ items, cursor: null });
    }
    const cursor = decodeCursor(a.cursor);
    const query = ctx.db.query('blueConversations').withIndex('by_account_updated', q => cursor ? q.eq('accountId', accountId).lte('updatedAt', cursor.at) : q.eq('accountId', accountId));
    // Chats belong to the currently connected number; an old number's threads stay out of the list.
    const rows = afterCursor(await query.order('desc').take(limit + 50), cursor, 'updatedAt').slice(0, limit);
    const items = [];
    for (const person of rows) if (person.integrationId === tenant.integration?.id) items.push(await conversationItem(ctx, person, tenant, now));
    return ok({ items, cursor: rows.length === limit ? encodeCursor(rows.at(-1).updatedAt, rows.at(-1)._id) : null });
  }
  if (a.operation === 'thread') {
    const person = await owned(ctx, a.conversationId, accountId, 'blueConversations');
    if (!person || person.integrationId !== tenant.integration?.id) return fail('conversation_not_found');
    const contact = await linkConversation(ctx, person, { sectorId, now, secret: tenant.secret });
    const before = Number.isSafeInteger(a.before) && a.before > 0 ? a.before : null;
    const page = await threadMessages(ctx, person, contact, before, THREAD_PAGE, now);
    return ok({ conversation: { id: person._id, takeover: person.takeover, optout: person.optout || contact.optout, windowOpenUntil: person.lastInbound ? person.lastInbound + DAY : 0 },
      contact: publicContact(contact, person), ...page });
  }

  if (a.operation === 'contacts') {
    const remaining = await migrateAccount(ctx, tenant, now);
    const limit = clampLimit(a.limit, 50);
    const status = ['new', 'in_progress', 'qualified', 'not_qualified'].includes(a.status) ? a.status : null;
    let rows;
    let next = null;
    if (typeof a.search === 'string' && a.search.trim()) {
      if (a.search.length > 80) return fail('invalid_search');
      rows = await searchContacts(ctx, accountId, a.search.trim(), 50);
    } else {
      const cursor = decodeCursor(a.cursor);
      const query = ctx.db.query('blueContacts').withIndex('by_account_state_activity', q => cursor ? q.eq('accountId', accountId).eq('state', 'active').lte('lastActivityAt', cursor.at) : q.eq('accountId', accountId).eq('state', 'active'));
      const page = afterCursor(await query.order('desc').take(limit + 50), cursor, 'lastActivityAt').slice(0, limit);
      next = page.length === limit ? encodeCursor(page.at(-1).lastActivityAt, page.at(-1)._id) : null;
      rows = page;
    }
    const items = [];
    for (const contact of rows) {
      const item = publicContact(contact, await conversationFor(ctx, contact));
      if (!status || item.status === status) items.push(item);
    }
    return ok({ items, cursor: next, migrationPending: remaining > 0, qualification: packDescription(sectorId) });
  }
  if (a.operation === 'contact_update') {
    const contact = await owned(ctx, a.contactId, accountId, 'blueContacts');
    if (!contact || contact.state !== 'active') return fail('contact_not_found');
    const { patch, error } = ownerContactPatch(contact, a.patch || {}, now);
    if (error) return fail(error);
    await ctx.db.patch(contact._id, patch);
    return ok({ contact: publicContact({ ...contact, ...patch }, await conversationFor(ctx, contact)) });
  }
  if (a.operation === 'contact_delete') {
    const contact = await owned(ctx, a.contactId, accountId, 'blueContacts');
    if (!contact || contact.state !== 'active') return fail('contact_not_found');
    if (a.confirm !== true) return fail('confirmation_required');
    await deleteContact(ctx, contact, now);
    return ok({ deleted: true });
  }

  if (a.operation === 'export_chat') {
    const person = await owned(ctx, a.conversationId, accountId, 'blueConversations');
    if (!person || person.integrationId !== tenant.integration?.id) return fail('conversation_not_found');
    const contact = await linkConversation(ctx, person, { sectorId, now, secret: tenant.secret });
    const page = await threadMessages(ctx, person, contact, null, EXPORT_MESSAGES, now);
    return ok(exportChat(contact, person, page.messages));
  }
  if (a.operation === 'export_contacts') {
    const cursor = decodeCursor(a.cursor);
    const query = ctx.db.query('blueContacts').withIndex('by_account_state_activity', q => cursor ? q.eq('accountId', accountId).eq('state', 'active').lte('lastActivityAt', cursor.at) : q.eq('accountId', accountId).eq('state', 'active'));
    const rows = afterCursor(await query.order('desc').take(250), cursor, 'lastActivityAt').slice(0, 200);
    const items = [];
    for (const contact of rows) items.push(exportContact(publicContact(contact, await conversationFor(ctx, contact))));
    return ok({ items, cursor: rows.length === 200 ? encodeCursor(rows.at(-1).lastActivityAt, rows.at(-1)._id) : null });
  }
  if (a.operation === 'export_account') {
    // Paged by conversation so one mutation stays inside Convex read limits.
    const cursor = decodeCursor(a.cursor);
    const query = ctx.db.query('blueConversations').withIndex('by_account_updated', q => cursor ? q.eq('accountId', accountId).lte('updatedAt', cursor.at) : q.eq('accountId', accountId));
    const rows = afterCursor(await query.order('desc').take(60), cursor, 'updatedAt').filter(r => r.integrationId === tenant.integration?.id).slice(0, 10);
    const chats = [];
    for (const person of rows) {
      const contact = await linkConversation(ctx, person, { sectorId, now, secret: tenant.secret });
      chats.push(exportChat(contact, person, (await threadMessages(ctx, person, contact, null, EXPORT_MESSAGES, now)).messages));
    }
    return ok({ chats, cursor: rows.length === 10 ? encodeCursor(rows.at(-1).updatedAt, rows.at(-1)._id) : null });
  }
  return fail('invalid_action');
}

// Export shapes contain only retained, human-readable data for this tenant.
function exportContact(c) {
  return { name: c.name, number: c.number ? `+${c.number}` : '', source: c.source, status: c.status, consent: c.consent.status,
    consentSource: c.consent.source, consentDate: c.consent.date, consentPurpose: c.consent.purpose, optedOut: c.optout,
    lastActivity: c.lastActivityAt ? new Date(c.lastActivityAt).toISOString() : '', takeover: c.takeover,
    fields: Object.fromEntries(c.fields.map(f => [f.key, f.value])) };
}
function exportChat(contact, person, messages) {
  const c = publicContact(contact, person);
  return { contact: exportContact(c), messages: messages.filter(m => !m.textExpired).map(m => ({ at: new Date(m.at).toISOString(), direction: m.direction,
    template: m.templateName || '', status: m.status, text: m.text || '' })) };
}
