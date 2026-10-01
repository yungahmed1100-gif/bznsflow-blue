// Contact import and marketing-consent evidence. Importing never sends anything,
// never clears an opt-out and never overwrites an owner-entered name or field.
import { resolveTenant } from './blueTenant.js';
import { catalogForFields, ensureContact, publicContact, searchTextFor, sectorFor } from './blueContacts.js';
import { qualificationStatus, validateFieldValue } from '../config/layla-qualification.js';

export const IMPORT_BATCH_ROWS = 100;
const ok = value => ({ ok: true, value }), fail = reason => ({ ok: false, reason });
const text = (value, n) => typeof value === 'string' && value.length <= n && !/[\x00-\x1f\x7f]/.test(value) ? value.trim() : null;

/** A contact may receive a marketing template only with granted, unrevoked consent. */
export function marketingEligibility(contact) {
  if(contact?.channel==='instagram') return 'wrong_channel';
  if (!contact || contact.state !== 'active') return 'contact_deleted';
  if (contact.optout) return 'opted_out';
  if (contact.consent?.status === 'revoked') return 'consent_revoked';
  if (contact.consent?.status !== 'granted') return 'consent_unknown';
  return null;
}

export function validateConsent(batch, now) {
  if (!batch || batch.attested !== true) return null;
  const source = text(batch.source, 120), purpose = text(batch.purpose, 200), date = text(batch.date, 10);
  if (!source || !purpose || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const at = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(at) || at > now + 86400000 || at < Date.parse('2000-01-01T00:00:00Z')) return null;
  return { source, purpose, date };
}

export async function executeAudience(ctx, a, now = Date.now()) {
  const tenant = await resolveTenant(ctx, a.sessionHash, now);
  if (tenant.error) return fail(tenant.error);
  const { accountId, row } = tenant;
  if (a.operation !== 'import_contacts') return fail('invalid_action');
  if (!/^[a-f0-9-]{36}$/.test(a.requestId || '') || !Array.isArray(a.rows) || !a.rows.length || a.rows.length > IMPORT_BATCH_ROWS) return fail('invalid_import');
  if (!['manual', 'import'].includes(a.origin)) return fail('invalid_import');
  const consent = a.consent ? validateConsent(a.consent, now) : null;
  if (a.consent && !consent) return fail('invalid_consent');
  if (a.requireConsent && !consent) return fail('consent_required');
  const sectorId = sectorFor(row);
  const catalog = await catalogForFields(ctx, accountId, sectorId);

  // One attestation per import; later pages of the same import reuse it.
  let batchId;
  if (consent) {
    const existing = await ctx.db.query('blueConsentBatches').withIndex('by_account_request', q => q.eq('accountId', accountId).eq('requestId', a.requestId)).unique();
    if (existing && (existing.source !== consent.source || existing.date !== consent.date || existing.purpose !== consent.purpose)) return fail('invalid_consent');
    batchId = existing?._id || await ctx.db.insert('blueConsentBatches', { accountId, ...consent, attestedAt: now, requestId: a.requestId, count: 0 });
  }

  const summary = { created: 0, updated: 0, consentRecorded: 0, optedOutKept: 0, invalid: 0, contacts: [] };
  const seen = new Set();
  for (const input of a.rows) {
    const waId = typeof input?.waId === 'string' && /^[1-9]\d{7,14}$/.test(input.waId) ? input.waId : null;
    if (!waId || seen.has(waId)) { summary.invalid += waId ? 0 : 1; continue; }
    seen.add(waId);
    const before = await ctx.db.query('blueContacts').withIndex('by_key', q => q.eq('key', `${accountId}:${waId}`)).unique();
    const contact = await ensureContact(ctx, { accountId, waId, sectorId, source: a.origin, now, secret: a.hashSecret,
      countryIso: /^[A-Z]{2}$/.test(input.countryIso || '') ? input.countryIso : undefined });
    const patch = { updatedAt: now };
    const name = text(input.name, 80);
    if (name && !contact.ownerName) patch.ownerName = name;
    if (Array.isArray(input.fields) && input.fields.length <= 20) {
      const map = new Map(contact.fields.map(f => [f.key, f]));
      for (const f of input.fields) {
        const value = validateFieldValue(sectorId, f?.key, f?.value, catalog);
        if (value && !map.get(f.key)?.value) map.set(f.key, { key: f.key, value, source: 'owner', confidence: 1, at: now });
      }
      patch.fields = [...map.values()];
      patch.qualificationStatus = qualificationStatus(sectorId, patch.fields);
    }
    if (consent) {
      if (contact.optout || contact.consent.status === 'revoked') summary.optedOutKept++;
      else { patch.consent = { status: 'granted', ...consent, attestedAt: now, batchId }; summary.consentRecorded++; }
    }
    const next = { ...contact, ...patch };
    patch.searchText = searchTextFor(next);
    await ctx.db.patch(contact._id, patch);
    summary[before ? 'updated' : 'created']++;
    summary.contacts.push(publicContact(next, null));
  }
  if (batchId && summary.consentRecorded) {
    const batch = await ctx.db.get(batchId);
    await ctx.db.patch(batchId, { count: (batch?.count || 0) + summary.consentRecorded });
  }
  return ok(summary);
}
