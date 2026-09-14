// Authenticated owner dashboard API: /api/layla-meta?surface=dashboard
// The tenant is always the signed-in account's saved draft. Request bodies never
// name an account, integration or tenant; ids they carry are re-checked in Convex.
import { convexConfigured, reviewStore } from '../convex.js';
import { blueAccount, blueAuthStore } from '../blue-auth.js';
import { ensureCsrfToken, verifyCsrf } from '../cookies.js';
import { readBody, send } from '../http.js';
import { PilotError } from './config.js';
import { credentialContext, openToken } from './customer-meta.js';
import { dashboardStore } from './dashboard-store.js';
import { fetchApprovedMarketingTemplates, fetchMessagingAllowance } from './templates.js';
import { validTimezone, zonedLocalToUtc } from './timezone.js';
import { normalizePhone } from '../../../src/lib/dashboard/phone.js';

const HOST = 'bznsflow-blue.vercel.app', ORIGIN = `https://${HOST}`;
const GRAPH = { app: '1388038082832745', version: 'v25.0' };
const READ_ACTIONS = new Set(['conversations', 'thread', 'contacts', 'templates', 'campaigns', 'campaign_detail', 'export_chat', 'export_contacts', 'export_account']);
const BROADCAST_ACTIONS = new Set(['sync_templates', 'campaign_preview', 'campaign_create', 'campaign_cancel']);
const LIMITS = { import_contacts: 60000, campaign_preview: 40000, campaign_create: 40000 };
const DEFAULT_BODY_LIMIT = 6000;
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : undefined;
const uuid = value => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value) ? value : undefined;
const optionalString = (value, n) => typeof value === 'string' && value.length <= n ? value : undefined;

export const dashboardAvailable = (env = process.env) => convexConfigured(env) && env.BLUE_DASHBOARD_ENABLED === 'true' && env.BLUE_ACCOUNT_SAVE_ENABLED === 'true';
export const broadcastAvailable = (env = process.env) => dashboardAvailable(env) && env.BLUE_BROADCAST_ENABLED === 'true' && env.BLUE_LIVE_MESSAGING_ENABLED === 'true';

function importRows(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 100) throw new PilotError('invalid_import');
  return rows.map(row => {
    const normalized = normalizePhone(`+${String(row?.waId || '')}`, row?.countryIso);
    if (normalized.error) throw new PilotError('invalid_phone');
    const fields = Array.isArray(row.fields) ? row.fields.slice(0, 20).filter(f => typeof f?.key === 'string' && typeof f?.value === 'string' && f.value.trim()).map(f => ({ key: f.key.slice(0, 40), value: f.value.slice(0, 120) })) : undefined;
    return { waId: normalized.waId, countryIso: normalized.countryIso, ...(optionalString(row.name, 80)?.trim() ? { name: row.name.trim() } : {}), ...(fields?.length ? { fields } : {}) };
  });
}

export function createDashboardApi({ env = process.env, fetcher = fetch, now = Date.now, accounts = blueAuthStore({ env, fetcher }), store = dashboardStore({ env, fetcher }), reviews = reviewStore({ env, fetcher }),
  templates = fetchApprovedMarketingTemplates, allowance = fetchMessagingAllowance } = {}) {
  async function graphContext(sessionHash) {
    const row = await reviews('get', { sessionHash });
    if (!row?.integration || !['connected', 'paused'].includes(row.status)) throw new PilotError('connection_not_ready', 409);
    const token = openToken(row.integration.credential, credentialContext(sessionHash, row.integration), env);
    return { integration: row.integration, token, c: { ...GRAPH, secret: env.LAYLA_META_APP_SECRET } };
  }
  return async (req, res) => {
    try {
      if (req.headers?.host !== HOST || (req.method !== 'GET' && req.headers?.origin !== ORIGIN)) throw new PilotError('origin', 403);
      if (!['GET', 'POST'].includes(req.method)) throw new PilotError('method', 405);
      if (!dashboardAvailable(env)) throw new PilotError('dashboard_unavailable', 503);
      const account = await blueAccount(req, accounts);
      if (!account) throw new PilotError('sign_in_required', 401);
      if (!account.draftHash) throw new PilotError('setup_required', 409);
      const sessionHash = account.draftHash;
      const csrfToken = ensureCsrfToken(req, res);
      const reply = value => send(res, 200, { ok: true, ...value, csrfToken }, { vary: 'Cookie' });

      if (req.method === 'GET') {
        const overview = await store('overview', { sessionHash });
        // Template sync needs only the Vercel gate, so an approved template can be confirmed
        // before the durable Convex gate allows any campaign to be created.
        return reply({ ...overview, account: { email: account.email }, dashboardAvailable: true, broadcastApiEnabled: broadcastAvailable(env), broadcastEnabled: broadcastAvailable(env) && overview.messaging.broadcastAvailable });
      }
      if (!verifyCsrf(req)) throw new PilotError('csrf', 403);
      const body = readBody(req);
      const action = typeof body.action === 'string' ? body.action : '';
      if (JSON.stringify(body).length > (LIMITS[action] || DEFAULT_BODY_LIMIT)) throw new PilotError('body_too_large', 413);
      if (BROADCAST_ACTIONS.has(action) && !broadcastAvailable(env)) throw new PilotError('broadcast_unavailable', 503);

      if (READ_ACTIONS.has(action)) {
        const args = { sessionHash, cursor: optionalString(body.cursor, 100), search: optionalString(body.search, 80), status: optionalString(body.status, 20),
          conversationId: id(body.conversationId), campaignId: id(body.campaignId), before: Number.isSafeInteger(body.before) ? body.before : undefined,
          limit: Number.isSafeInteger(body.limit) ? body.limit : undefined };
        return reply(await store(action, Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined))));
      }
      if (action === 'set_timezone') {
        if (!validTimezone(body.timezone)) throw new PilotError('invalid_timezone');
        return reply(await store('set_timezone', { sessionHash, timezone: body.timezone }));
      }
      if (action === 'contact_update') {
        const patch = body.patch && typeof body.patch === 'object' ? body.patch : {};
        return reply(await store('contact_update', { sessionHash, contactId: id(body.contactId) || '', patch: {
          ...(typeof patch.ownerName === 'string' ? { ownerName: patch.ownerName.slice(0, 80) } : {}),
          ...(Array.isArray(patch.fields) ? { fields: patch.fields.slice(0, 20).map(f => ({ key: String(f?.key || '').slice(0, 40), value: typeof f?.value === 'string' ? f.value.slice(0, 120) : null })) } : {}),
          ...(patch.qualificationOverride === null || typeof patch.qualificationOverride === 'string' ? { qualificationOverride: patch.qualificationOverride } : {}),
        } }));
      }
      if (action === 'contact_delete') return reply(await store('contact_delete', { sessionHash, contactId: id(body.contactId) || '', confirm: body.confirm === true }));
      if (action === 'import_contacts') {
        const consent = body.consent && typeof body.consent === 'object' ? { source: String(body.consent.source || '').slice(0, 120), date: String(body.consent.date || '').slice(0, 10),
          purpose: String(body.consent.purpose || '').slice(0, 200), attested: body.consent.attested === true } : undefined;
        return reply(await store('import_contacts', { sessionHash, requestId: uuid(body.requestId) || '', origin: body.origin === 'manual' ? 'manual' : 'import',
          requireConsent: body.requireConsent === true, rows: importRows(body.rows), ...(consent ? { consent } : {}) }));
      }
      if (action === 'sync_templates') {
        const { integration, token, c } = await graphContext(sessionHash);
        const records = await templates({ c, integration, token, fetcher });
        await store('replace_templates', { sessionHash, integrationId: integration.id, templates: records });
        return reply(await store('templates', { sessionHash }));
      }
      if (action === 'campaign_preview' || action === 'campaign_create') {
        const { integration, token, c } = await graphContext(sessionHash);
        const limit = await allowance({ c, integration, token, fetcher });
        const mapping = Array.isArray(body.mapping) ? body.mapping.slice(0, 20).map(m => ({ key: String(m?.key || '').slice(0, 60), source: String(m?.source || '').slice(0, 50), value: String(m?.value ?? '').slice(0, 1024) })) : [];
        const contactIds = Array.isArray(body.contactIds) ? body.contactIds.slice(0, 500).map(id).filter(Boolean) : [];
        const args = { sessionHash, templateId: optionalString(body.templateId, 30) || '', mapping, contactIds, allowance: Number.isFinite(limit) ? Math.min(limit, 1e9) : 1e9 };
        if (action === 'campaign_preview') return reply(await store('campaign_preview', args));
        const timezone = body.schedule?.timezone;
        if (!validTimezone(timezone)) throw new PilotError('invalid_timezone');
        let scheduledAt = now();
        if (body.schedule?.mode === 'later') {
          try { scheduledAt = zonedLocalToUtc(body.schedule.local, timezone); } catch { throw new PilotError('invalid_schedule'); }
        } else if (body.schedule?.mode !== 'now') throw new PilotError('invalid_schedule');
        // The browser's request id makes a double-clicked confirmation create one campaign.
        return reply(await store('campaign_create', { ...args, requestId: uuid(body.requestId) || '', confirm: body.confirm === true, scheduledAt, timezone,
          name: optionalString(body.name, 80) || '', origin: body.origin === 'chat' ? 'chat' : 'broadcast' }));
      }
      if (action === 'campaign_cancel') return reply(await store('campaign_cancel', { sessionHash, campaignId: id(body.campaignId) || '' }));
      throw new PilotError('invalid_action');
    } catch (e) {
      return send(res, e instanceof PilotError ? e.status : 503, { ok: false, reason: e instanceof PilotError ? e.code : 'dashboard_unavailable' }, { vary: 'Cookie' });
    }
  };
}
