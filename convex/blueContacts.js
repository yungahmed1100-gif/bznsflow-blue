// Tenant contact records, shared by messaging ingest, the dashboard and campaigns.
// Every helper takes an explicit accountId; nothing here trusts a client id.
import { numberHash } from './hash.js';
import { extractQualification, mergeFields, planQuestions, qualificationStatus, sectorIdFor, validateFieldValue } from '../config/layla-qualification.js';

export const DAY = 86400000;
export const TEXT_RETENTION_MS = 30 * DAY;
export const MESSAGE_RETENTION_MS = 30 * DAY;
export const contactKey = (accountId, waId) => `${accountId}:${waId}`;
const clean = (value, n) => typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '';

/** Owner edit → customer-provided name → channel profile name (WhatsApp name or Instagram @username) → number. */
export function displayName(contact) {
  const profileSource = contact?.channel === 'instagram' ? 'instagram' : 'whatsapp';
  for (const [field, source] of [['ownerName', 'owner'], ['customerName', 'customer'], ['profileName', profileSource]]) {
    if (contact?.[field]) return { name: contact[field], source };
  }
  if (contact?.channel==='instagram') return {name:`Instagram ${contact.igId || ''}`,source:'instagram'};
  return { name: contact?.waId ? `+${contact.waId}` : '', source: 'number' };
}
export function searchTextFor(contact) {
  return [contact.ownerName, contact.customerName, contact.profileName, contact.waId, contact.igId, ...(contact.fields || []).map(f => f.value)]
    .filter(Boolean).join(' ').slice(0, 1000);
}
export function sectorFor(row) { return sectorIdFor(row?.profile?.sector); }

async function tombstoneFor(ctx, accountId, hash) {
  const rows = await ctx.db.query('blueContacts').withIndex('by_account_hash', q => q.eq('accountId', accountId).eq('numberHash', hash)).take(20);
  return rows.find(r => r.state === 'deleted' && r.optout) || null;
}

/**
 * Find or create the active contact for a number. New contacts inherit a
 * deleted contact's opt-out through the keyed hash, never through the number.
 */
export async function ensureContact(ctx, { accountId, waId, sectorId, source = 'inbound', now, secret, profileName, countryIso, channel='whatsapp', igAccount }) {
  if (!(channel==='instagram' ? /^\d{1,30}$/ : /^\d{7,15}$/).test(waId || '')) throw new Error('invalid_wa_id');
  const identity=channel==='instagram'?`instagram:${igAccount}:${waId}`:waId;
  const key = contactKey(accountId, identity);
  const existing = await ctx.db.query('blueContacts').withIndex('by_key', q => q.eq('key', key)).unique();
  if (existing) {
    const name = clean(profileName, 80);
    if (name && existing.profileName !== name) {
      const next = { ...existing, profileName: name };
      await ctx.db.patch(existing._id, { profileName: name, searchText: searchTextFor(next), updatedAt: now });
      return next;
    }
    return existing;
  }
  const hash = numberHash(secret, accountId, identity);
  const tomb = await tombstoneFor(ctx, accountId, hash);
  const record = { accountId, key, state: 'active', ...(channel==='instagram'?{channel,igId:waId,igAccount}:{waId}), numberHash: hash, source, sectorId, fields: [], qualificationStatus: 'new',
    consent: { status: tomb ? 'revoked' : 'unknown' }, optout: !!tomb, ...(tomb?.optoutAt ? { optoutAt: tomb.optoutAt } : {}),
    lastActivityAt: now, createdAt: now, updatedAt: now,
    ...(clean(profileName, 80) ? { profileName: clean(profileName, 80) } : {}), ...(countryIso ? { countryIso } : {}) };
  record.searchText = searchTextFor(record);
  const id = await ctx.db.insert('blueContacts', record);
  return { _id: id, ...record };
}

/** Lazy migration: link a pre-dashboard conversation to its contact record. */
export async function linkConversation(ctx, conversation, { sectorId, now, secret, igAccount=undefined }) {
  if (conversation.contactId) {
    const contact = await ctx.db.get(conversation.contactId);
    if (contact?.state === 'active') return contact;
  }
  const contact = await ensureContact(ctx, { accountId: conversation.accountId, waId: conversation.number, sectorId, now, secret, source: 'inbound',channel:conversation.channel || 'whatsapp',igAccount:igAccount || conversation.igAccount || conversation.integrationId });
  if (conversation.optout && !contact.optout) {
    await ctx.db.patch(contact._id, { optout: true, optoutAt: now, consent: { ...contact.consent, status: 'revoked' }, updatedAt: now });
    contact.optout = true;
  }
  await ctx.db.patch(conversation._id, { contactId: contact._id });
  return contact;
}

/** Opt-out: suppress the contact and block every unclaimed campaign job for it. */
export async function applyOptout(ctx, contact, now) {
  if (!contact) return;
  await ctx.db.patch(contact._id, { optout: true, optoutAt: contact.optoutAt || now, consent: { ...contact.consent, status: 'revoked' }, updatedAt: now });
  const jobs = await ctx.db.query('blueCampaignRecipients').withIndex('by_contact_at', q => q.eq('contactId', contact._id)).take(500);
  for (const job of jobs) if (['pending', 'queued'].includes(job.status)) await ctx.db.patch(job._id, { status: 'blocked', reason: 'contact_opted_out', updatedAt: now });
}

/**
 * Apply one inbound message to the contact: activity, customer name and sector
 * fields. Returns the question plan Layla may append to its reply.
 */
export async function applyInbound(ctx, contact, { text, intent, handoff, at, now, sectorId, catalog }) {
  // A short reply only answers Layla's question if that question is recent.
  const askedRecently = !!contact.lastAskedAt && now - contact.lastAskedAt < DAY;
  const extracted = extractQualification({ text, sectorId, catalog, asked: contact.asked || [], askedRecently, existing: contact.fields, intent });
  const merged = mergeFields(contact.fields, extracted.updates, now);
  const answeredNow = merged.changed;
  const patch = { lastActivityAt: Math.max(contact.lastActivityAt || 0, at), lastInboundAt: Math.max(contact.lastInboundAt || 0, at), sectorId, updatedAt: now };
  if (merged.changed) { patch.fields = merged.fields; patch.qualificationStatus = qualificationStatus(sectorId, merged.fields); }
  if (extracted.customerName && extracted.customerName !== contact.customerName) patch.customerName = extracted.customerName;
  const lang = /[؀-ۿ]/.test(text || '') ? 'ar' : 'en';
  const plan = contact.optout ? { text: '', keys: [] } : planQuestions({ sectorId, fields: merged.fields, askCounts: contact.askCounts || [], asked: contact.asked || [],
    lastAskedAt: contact.lastAskedAt || 0, answeredNow, intent, handoff, now, lang });
  const next = { ...contact, ...patch };
  next.searchText = searchTextFor(next);
  await ctx.db.patch(contact._id, { ...patch, searchText: next.searchText });
  return { contact: next, plan, updates: extracted.updates };
}

/** Record that questions were actually queued in a reply. */
export async function recordQuestions(ctx, contact, keys, now) {
  if (!keys.length) return;
  const counts = new Map((contact.askCounts || []).map(c => [c.key, c.count]));
  for (const key of keys) counts.set(key, (counts.get(key) || 0) + 1);
  await ctx.db.patch(contact._id, { asked: keys, askCounts: [...counts].map(([key, count]) => ({ key, count })), lastAskedAt: now, updatedAt: now });
}

/** Owner edits. Owner-entered field values outrank anything a message extracts. */
export function ownerContactPatch(contact, input, now) {
  const patch = { updatedAt: now };
  if (input.ownerName !== undefined) {
    const name = clean(input.ownerName, 80);
    patch.ownerName = name || undefined;
  }
  if (Array.isArray(input.fields)) {
    if (input.fields.length > 20) return { error: 'invalid_contact' };
    const map = new Map(contact.fields.map(f => [f.key, f]));
    for (const f of input.fields) {
      if (typeof f?.key !== 'string') return { error: 'invalid_contact' };
      if (f.value === '' || f.value === null) { map.delete(f.key); continue; }
      const value = validateFieldValue(contact.sectorId, f.key, f.value);
      if (!value) return { error: 'invalid_contact_field' };
      map.set(f.key, { key: f.key, value, source: 'owner', confidence: 1, at: now });
    }
    patch.fields = [...map.values()];
    patch.qualificationStatus = qualificationStatus(contact.sectorId, patch.fields);
  }
  if (input.qualificationOverride !== undefined) {
    if (![null, 'qualified', 'not_qualified', 'in_progress'].includes(input.qualificationOverride)) return { error: 'invalid_contact' };
    patch.qualificationOverride = input.qualificationOverride || undefined;
  }
  const next = { ...contact, ...patch };
  patch.searchText = searchTextFor(next);
  return { patch };
}

/**
 * Delete a contact's readable data. Keeps only a PII-free tombstone (keyed hash
 * and opt-out) plus in-flight send records without text, so ambiguous sends
 * stay reconcilable and are never retried.
 */
export async function deleteContact(ctx, contact, now) {
  const conversations = await ctx.db.query('blueConversations').withIndex('by_contact', q => q.eq('contactId', contact._id)).take(20);
  for (const person of conversations) {
    const messages = await ctx.db.query('blueMessages').withIndex('by_conversation_at', q => q.eq('conversationId', person._id)).take(1000);
    for (const m of messages) {
      if (['attempting', 'ambiguous'].includes(m.status)) await ctx.db.patch(m._id, { text: undefined, textExpiresAt: Number.MAX_SAFE_INTEGER });
      else if (m.status === 'queued') await ctx.db.patch(m._id, { status: 'blocked', reason: 'contact_deleted', text: undefined, textExpiresAt: Number.MAX_SAFE_INTEGER });
      else await ctx.db.delete(m._id);
    }
    await ctx.db.delete(person._id);
  }
  const jobs = await ctx.db.query('blueCampaignRecipients').withIndex('by_contact_at', q => q.eq('contactId', contact._id)).take(500);
  for (const job of jobs) {
    const unclaimed = ['pending', 'queued'].includes(job.status);
    await ctx.db.patch(job._id, { waId: undefined, name: undefined, parameters: [], ...(unclaimed ? { status: 'blocked', reason: 'contact_deleted' } : {}), updatedAt: now });
  }
  await ctx.db.patch(contact._id, { state: 'deleted', key: `deleted:${contact._id}`, waId: undefined, igId:undefined, igAccount:undefined, countryIso: undefined, ownerName: undefined, customerName: undefined,
    profileName: undefined, fields: [], asked: undefined, askCounts: undefined, qualificationOverride: undefined, searchText: undefined,
    consent: { status: contact.optout ? 'revoked' : 'unknown' }, deletedAt: now, updatedAt: now });
}

/** Public contact shape. Never includes hashes, tenant ids or consent batch ids. */
export function publicContact(contact, conversation) {
  const { name, source } = displayName(contact);
  const window = conversation?.lastInbound ? conversation.lastInbound + DAY : 0;
  return { id: contact._id, channel:contact.channel || 'whatsapp', igId:contact.igId, name, nameSource: source, number: contact.waId, ownerName: contact.ownerName || '', customerName: contact.customerName || '',
    profileName: contact.profileName || '', source: contact.source, sectorId: contact.sectorId,
    fields: contact.fields.map(({ key, value, source: from, confidence, at }) => ({ key, value, source: from, confidence, at })),
    qualificationStatus: contact.qualificationStatus, qualificationOverride: contact.qualificationOverride || null,
    status: contact.qualificationOverride || contact.qualificationStatus,
    consent: { status: contact.consent.status, source: contact.consent.source || '', date: contact.consent.date || '', purpose: contact.consent.purpose || '' },
    optout: contact.optout, lastActivityAt: contact.lastActivityAt, lastInboundAt: contact.lastInboundAt || null,
    takeover: !!conversation?.takeover, conversationId: conversation?._id || null, windowOpenUntil: window };
}
