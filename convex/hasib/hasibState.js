import { executeRequests } from './requestsState.js';
import { executeProperty } from './propertyState.js';
import { executeJobs } from './jobsState.js';
import { executeFollowups } from './followupsState.js';
import { executeMemberships } from './membershipsState.js';
import { executeBookings } from './bookingsState.js';
import { bakingSuggestions } from './industryMetrics.js';
import { businessTimezone } from './expensesState.js';
import { BOOKING_OPERATIONS, JOB_OPERATIONS, REAL_ESTATE_OPERATIONS, TEAM_OPERATIONS, CLINIC_OPERATIONS, CONSTRUCTION_OPERATIONS, AUTOMOTIVE_OPERATIONS } from '../../config/hasib-workflow-operations.js';
import { executeClinic } from './clinicState.js';
import { executeConstruction } from './constructionState.js';
import { executeAutomotive } from './automotiveState.js';
// Hasib entry point: gate, tenant, then one of the feature executors.
// The tenant is always resolved from the verified session hash; ids in the
// request are re-checked against it by `owned()` inside each executor.
import { registerPhoto } from './photosState.js';
import { importItems } from './importState.js';
import { executeToday } from './todayState.js';
import { resolveTenant } from '../blueTenant.js';
import { visibleModules, isLivePack, livePackSummaries, industryCatalog, HASIB_PACKS } from '../../config/hasib-packs.js';
import { STOCK_POLICIES } from './stock.js';
import { hasibEnabled } from './gate.js';
import { ok, fail, settingsFor, packFor, trackedLow } from './shared.js';
import { shortenClinicalText, textRetentionFor, CLINICAL_TEXT_RETENTION_MS } from '../blueContacts.js';
import { syncServiceItems } from './serviceSync.js';
import { STOCK_SOURCE } from './stockSync.js';
import { hasibPack } from '../../config/hasib-packs.js';
import { executeCatalog } from './catalogState.js';
import { executeOrders } from './ordersState.js';
import { executeExpenses } from './expensesState.js';
import { executeInsights } from './insightsState.js';
import { planFor, HASIB_PLANS } from './plans.js';
import { executeSerials } from './serialsState.js';
import { executeRepairs } from './repairsState.js';
import { executeRestaurant } from './restaurantState.js';
import { executeRealEstate } from './realEstateState.js';
import { actorWorkspace, executeTeam } from './workspaceState.js';
import { capabilitiesFor, roleAllows } from './capabilities.js';
import { staffArgs, staffResult, auditChange } from './staffPolicy.js';

export const HASIB_OPERATIONS = [...Object.keys(BOOKING_OPERATIONS), ...JOB_OPERATIONS, ...REAL_ESTATE_OPERATIONS, ...TEAM_OPERATIONS, ...CLINIC_OPERATIONS, ...CONSTRUCTION_OPERATIONS, ...AUTOMOTIVE_OPERATIONS, 'overview', 'settings_update', 'items', 'item_save', 'item_archive', 'stock_move', 'stock_moves', 'low_stock',
  'order_create', 'order_status', 'orders', 'order', 'payment_record', 'contact_summary', 'conversation_orders', 'expense_create', 'expenses', 'expense_void', 'insights',
  'today', 'photo_upload_url', 'photo_register', 'item_photo', 'items_import', 'serials', 'serial_lookup', 'trade_in', 'repairs', 'repair', 'repair_create', 'repair_approval', 'repair_update', 'repair_status',
  'baking_suggestions', 'order_preparation', 'recipes', 'recipe_save', 'waste_create', 'stock_count', 'stock_receive', 'batch_create', 'restaurant_summary', 'stock_expiry', 'services_sync'];

// Operations that belong to an optional module; a pack without that module refuses them.
const MODULE_OPS = { serials: ['serials', 'serial_lookup'], tradeIns: ['trade_in'], repairs: ['repairs', 'repair', 'repair_create', 'repair_approval', 'repair_update', 'repair_status'], recipes: ['recipes', 'recipe_save', 'waste_create', 'stock_count', 'stock_receive', 'restaurant_summary'], batches: ['batch_create'], shelfLife: ['stock_expiry'] };
const DAY = 86400000, PHOTO_UPLOADS_PER_DAY = 300;
const moduleOf = op => Object.keys(MODULE_OPS).find(m => MODULE_OPS[m].includes(op));

export { hasibEnabled };

const publicSettings = s => ({ currency: s.currency, vatRegistered: s.vatRegistered, vatRateBps: s.vatRateBps, pricesIncludeVat: s.pricesIncludeVat, vatin: s.vatin || '', stockPolicy: s.stockPolicy, unsoldDays: s.unsoldDays ?? 60, absenceDays: s.absenceDays ?? 14, listingFreshnessDays: s.listingFreshnessDays ?? 30, constructionIncidentHoursDenominator:s.constructionIncidentHoursDenominator ?? 200000 });

/** What choosing an industry changes beyond the setting itself. */
async function applyPackChoice(ctx, accountId, pack, now) {
  // A clinical industry's 24-hour chat-text rule applies to recent messages at once.
  if (textRetentionFor(null, pack.id) === CLINICAL_TEXT_RETENTION_MS) {
    // Newest first, up to 2,000 messages in this change; a busier account finishes with blueHasib:shortenDentalText.
    let next = now + 1;
    for (let page = 0; page < 4 && next !== null; page++) next = (await shortenClinicalText(ctx, accountId, now, next)).next;
  }
  // Internal stock (a clinic's supplies) leaves Layla's catalog; treatments become chargeable.
  if (pack.internalStock) {
    const published = await ctx.db.query('blueCatalogEntries').withIndex('by_owner_status_order', q => q.eq('ownerKey', String(accountId)).eq('status', 'approved')).take(500);
    for (const entry of published.filter(e => e.source === STOCK_SOURCE)) await ctx.db.patch(entry._id, { status: 'archived', updatedAt: now });
  }
  if (pack.serviceItems) await syncServiceItems(ctx, accountId, now);
}

async function updateSettings(ctx, accountId, a, now) {
  const current = await ctx.db.query('hasibSettings').withIndex('by_account', q => q.eq('accountId', accountId)).unique();
  const next = { ...(await settingsFor(ctx, accountId)) };
  if (a.vat !== undefined) {
    const { registered, rateBps, pricesIncludeVat, vatin } = a.vat || {};
    if (typeof registered !== 'boolean' || !Number.isSafeInteger(rateBps) || rateBps < 0 || rateBps > 10000 || typeof pricesIncludeVat !== 'boolean') return fail('invalid_settings');
    if (vatin !== undefined && vatin !== '' && !/^[A-Z0-9]{6,20}$/.test(vatin)) return fail('invalid_settings');
    Object.assign(next, { vatRegistered: registered, vatRateBps: rateBps, pricesIncludeVat, vatin: vatin || undefined });
  }
  if (a.stockPolicy !== undefined) {
    if (!STOCK_POLICIES.includes(a.stockPolicy)) return fail('invalid_settings');
    next.stockPolicy = a.stockPolicy;
  }
  for (const key of ['unsoldDays', 'absenceDays', 'listingFreshnessDays']) {
    if (a[key] !== undefined) {
      if (!Number.isSafeInteger(a[key]) || a[key] < 1 || a[key] > 3650) return fail('invalid_settings');
      next[key] = a[key];
    }
  }
  if (a.constructionIncidentHoursDenominator !== undefined) {
    if (!Number.isSafeInteger(a.constructionIncidentHoursDenominator) || a.constructionIncidentHoursDenominator < 10000 || a.constructionIncidentHoursDenominator > 1000000) return fail('invalid_settings');
    next.constructionIncidentHoursDenominator = a.constructionIncidentHoursDenominator;
  }
  // The Hasib industry is the owner's explicit choice; Layla's own sector is never written here.
  if (a.packId !== undefined) {
    if (!isLivePack(a.packId) && !(ctx.hasibPreview === true && HASIB_PACKS[a.packId])) return fail('pack_not_live');
    next.packId = a.packId;
  }
  const row = { accountId, ...(next.packId ? { packId: next.packId } : {}), currency: next.currency, vatRegistered: next.vatRegistered, vatRateBps: next.vatRateBps, pricesIncludeVat: next.pricesIncludeVat,
    ...(next.vatin ? { vatin: next.vatin } : {}), stockPolicy: next.stockPolicy, unsoldDays: next.unsoldDays ?? 60, absenceDays: next.absenceDays ?? 14, listingFreshnessDays: next.listingFreshnessDays ?? 30, constructionIncidentHoursDenominator:next.constructionIncidentHoursDenominator ?? 200000, updatedAt: now };
  if (current) await ctx.db.replace(current._id, row); else await ctx.db.insert('hasibSettings', row);
  if (a.packId !== undefined) await applyPackChoice(ctx, accountId, hasibPack(a.packId), now);
  return ok({ settings: publicSettings(row) });
}

export async function executeHasib(ctx, a, now = Date.now()) {
  if (!(await hasibEnabled(ctx))) return fail('hasib_unavailable');
  const tenant = await resolveTenant(ctx, a.sessionHash, now);
  if (tenant.error) return fail(tenant.error);
  tenant.secret = a.hashSecret;
  // Hasib is part of Ascend and Apex; Layla-only accounts have no grant.
  const plan = await planFor(ctx, tenant.accountId);
  if (!HASIB_PLANS.includes(plan)) return fail('plan_required');
  const actor = await actorWorkspace(ctx, tenant.accountId, a.actorAccountId, now);
  if (!actor) return fail('workspace_access_revoked');
  if (!roleAllows(actor.role, a.operation)) return fail('manager_required');
  tenant.actor = actor;
  tenant.workerFunction = a.workerFunction;
  const pack = tenant.pack = await packFor(ctx, tenant);
  if (a.operation === 'settings_update') return actor.role === 'manager' ? updateSettings(ctx, tenant.accountId, a, now) : fail('manager_required');
  if (!isLivePack(pack.id) && ctx.hasibPreview !== true) {
    // Only live packs open Hasib for customer records.
    if (a.operation !== 'overview') return fail('pack_not_live');
    const settings = await settingsFor(ctx, tenant.accountId), industry = industryCatalog().find(row => row.id === pack.id);
    return ok({ plan, setupRequired: true, selectedIndustryId: pack.id, legacyIndustryId: settings.packId || null, industry, livePacks: livePackSummaries(), industries: industryCatalog(), modules: [], settings: publicSettings(settings) });
  }

  const staff = await staffArgs(ctx, tenant, a);
  if (staff.refusal) return fail(staff.refusal);
  const result = await dispatchHasib(ctx, tenant, actor, plan, pack, staff.args, now);
  await auditChange(ctx, tenant, staff.args, result, now);
  return staffResult(tenant, staff.args, result);
}

async function dispatchHasib(ctx, tenant, actor, plan, pack, a, now) {
  if (a.operation === 'overview') {
    const settings = await settingsFor(ctx, tenant.accountId);
    const pending = await ctx.db.query('hasibOrders').withIndex('by_account_status_created', q => q.eq('accountId', tenant.accountId).eq('status', 'pending')).take(200);
    const confirmedAsks = [];
    for (const status of ['confirmed', 'ready']) confirmedAsks.push(...(await ctx.db.query('hasibOrders').withIndex('by_account_status_created', q => q.eq('accountId', tenant.accountId).eq('status', status)).take(200)));
    // Waiting for the owner: Layla's orders she could not confirm, and confirmed ones the customer asked to change.
    const layla = [...pending, ...confirmedAsks.filter(o => o.flags?.includes('change_requested'))].filter(o => o.source === 'layla');
    const low = await trackedLow(ctx, tenant.accountId);
    return ok({ pack: { id: pack.id, archetype: pack.archetype, version: pack.version, ownerUi: pack.ownerUi, todayMetrics: pack.todayMetrics, thresholds: pack.thresholds, variantOptions: pack.variantOptions, orderFields: pack.orderFields, expenseCategories: pack.expenseCategories, modules: pack.modules,
        ...(pack.labels ? { labels: pack.labels, sensitive: pack.sensitive, noOrderNotes: pack.noOrderNotes, fulfilment: pack.fulfilment, internalStock: pack.internalStock, serviceItems: pack.serviceItems } : {}) },
      selectedIndustryId: pack.id, legacyIndustryId: settings.packId || null, industry: industryCatalog().find(row => row.id === pack.id),
      plan, workspaceRole: actor.role, capabilities: capabilitiesFor(plan, actor.role), teamSummary: { role: actor.role, operationalRole: actor.operationalRole || (actor.role === 'manager' ? 'manager' : 'service_advisor'), actorAccountId: actor.actorAccountId, employeeLimit: actor.workspace.employeeLimit }, setupRequired: false, livePacks: livePackSummaries(), industries: industryCatalog().map(i => ctx.hasibPreview === true ? { ...i, live: true, preview: true } : i), modules: visibleModules(pack), settings: publicSettings(settings), counts: { pendingOrders: pending.length, lowStock: low.length, laylaWaiting: layla.length, laylaOverdue: layla.filter(o => now - o.createdAt > 86400000).length } });
  }
  // Photos go straight from the owner's browser to Convex storage; the id is checked when the product is saved.
  if (a.operation === 'photo_upload_url') {
    const key = `hasib-photo:${tenant.accountId}:${Math.floor(now / DAY)}`;
    const rate = await ctx.db.query('blueMessageRates').withIndex('by_key', q => q.eq('key', key)).unique();
    if (rate?.count >= PHOTO_UPLOADS_PER_DAY) return fail('photo_limit');
    if (rate) await ctx.db.patch(rate._id, { count: rate.count + 1 }); else await ctx.db.insert('blueMessageRates', { key, count: 1, expiresAt: now + 2 * DAY });
    return ok({ url: await ctx.storage.generateUploadUrl() });
  }
  if (a.operation === 'photo_register') return registerPhoto(ctx, tenant.accountId, a, now);
  if (a.operation === 'items_import') return importItems(ctx, tenant, a, now);
  if (a.operation === 'services_sync') return pack.serviceItems ? ok(await syncServiceItems(ctx, tenant.accountId, now)) : fail('module_unavailable');
  const module = moduleOf(a.operation);
  if (module && pack.modules[module] !== 'available') return fail('module_unavailable');
  if (a.operation === 'baking_suggestions') return pack.id === 'cakes' ? ok(await bakingSuggestions(ctx, tenant.accountId, now, await businessTimezone(ctx, tenant.accountId))) : fail('module_unavailable');
  if (a.operation === 'order_preparation' && pack.id !== 'cakes') return fail('module_unavailable');
  const op = a.operation;
  const allowed = op.startsWith('job') || op.startsWith('equipment') ? ['automotive','cleaning','hvac','construction']
    : op.startsWith('property') ? ['real-estate']
    : op.startsWith('product_request') ? ['retail','retail-tech']
    : op.startsWith('membership') ? ['fitness','education']
    : Object.keys(BOOKING_OPERATIONS).includes(op) && !op.startsWith('followup') ? ['beauty','dental','clinic','fitness','education'] : null;
  if (allowed && !allowed.includes(pack.id)) return fail('module_unavailable');
  if (REAL_ESTATE_OPERATIONS.includes(op) && pack.id !== 'real-estate') return fail('module_unavailable');
  if (CLINIC_OPERATIONS.includes(op) && pack.id !== 'clinic') return fail('module_unavailable');
  if (CONSTRUCTION_OPERATIONS.includes(op) && pack.id !== 'construction') return fail('module_unavailable');
  if (AUTOMOTIVE_OPERATIONS.includes(op) && pack.id !== 'automotive') return fail('module_unavailable');
  const teamResult = await executeTeam(ctx, tenant, actor, a, now);
  if (teamResult) return teamResult;
  const realEstateResult = await executeRealEstate(ctx, tenant, actor, a, now);
  if (realEstateResult) return realEstateResult;
  const clinicResult = await executeClinic(ctx, tenant, actor, a, now);
  if (clinicResult) return clinicResult;
  const constructionResult = await executeConstruction(ctx, tenant, actor, a, now);
  if (constructionResult) return constructionResult;
  const automotiveResult = await executeAutomotive(ctx, tenant, actor, a, now);
  if (automotiveResult) return automotiveResult;
  const workflowResult = await executeBookings(ctx, tenant, a, now) || await executeMemberships(ctx, tenant, a, now) || await executeFollowups(ctx, tenant, a, now)
    || await executeJobs(ctx, tenant, a, now) || await executeProperty(ctx, tenant, a, now) || await executeRequests(ctx, tenant, a, now);
  if (workflowResult) return workflowResult;
  const result = (await executeCatalog(ctx, tenant, a, now)) || (await executeOrders(ctx, tenant, a, now))
    || (await executeExpenses(ctx, tenant, a, now)) || (await executeInsights(ctx, tenant, a, now))
    || (await executeSerials(ctx, tenant, a, now)) || (await executeRepairs(ctx, tenant, a, now)) || (await executeRestaurant(ctx, tenant, a, now)) || (await executeToday(ctx, tenant, a, now));
  return result || fail('invalid_action');
}
