import { isLivePack } from '../../config/hasib-packs.js';
import { hasibEnabled } from './gate.js';
import { HASIB_PLANS, planFor } from './plans.js';
import { packFor } from './shared.js';
import { workspaceForManager } from './workspaceState.js';
import { executeRealEstate } from './realEstateState.js';

const number = value => {
  const clean = String(value || '').replace(/[^0-9.]/g, '');
  const n = Number(clean);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) : 0;
};
const arabic = text => /[؀-ۿ]/.test(text || '');
const hash8 = value => {
  let hash = 2166136261;
  for (const char of String(value || '')) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, '0');
};
const turnRequestId = (person, contact, need, now) => {
  const stamp = now.toString(16).padStart(12, '0').slice(-12);
  return `${hash8(person._id)}-${hash8(contact._id).slice(0, 4)}-4${stamp.slice(0, 3)}-8${stamp.slice(3, 6)}-${stamp.slice(6)}${hash8(need).slice(0, 6)}`;
};

export async function realEstateTurn(ctx, { row, person, contact, text, now, secret }) {
  if (!(await hasibEnabled(ctx)) || !HASIB_PLANS.includes(await planFor(ctx, row.accountId))) return null;
  const tenant = { accountId: row.accountId, row, secret }, pack = await packFor(ctx, tenant);
  if (!isLivePack(pack.id) || pack.id !== 'real-estate') return null;
  tenant.pack = pack;
  const fields = new Map((contact.fields || []).map(field => [field.key, field.value]));
  const need = fields.get('need') || 'buy';
  const workspace = await workspaceForManager(ctx, row.accountId, now);
  const actor = { workspace, role: 'manager', actorAccountId: row.accountId };
  const saved = await executeRealEstate(ctx, tenant, actor, { operation: 'opportunity_save', requestId: turnRequestId(person, contact, need, now), workflow: {
    contactId: contact._id, conversationId: person._id, source: person.channel || 'whatsapp', need,
    areas: fields.get('area') ? [fields.get('area')] : [], propertyTypes: fields.get('property_type') ? [fields.get('property_type')] : [],
    budgetMinMinor: 0, budgetMaxMinor: number(fields.get('budget')), bedrooms: Number(fields.get('bedrooms') || 0) || undefined,
    financeReadiness: fields.get('finance_readiness') || 'unknown', decisionMakerReadiness: fields.get('decision_maker') || 'unknown',
    timeline: fields.get('timeline') || 'unknown', mustHaves: fields.get('must_haves') ? [fields.get('must_haves')] : [], firstInboundAt: contact.lastInboundAt || now,
  } }, now);
  if (!saved?.ok || saved.value.stage !== 'qualified') return saved?.ok ? { opportunityId: saved.value.id } : null;
  const matches = await executeRealEstate(ctx, tenant, actor, { operation: 'match_generate', opportunityId: saved.value.id }, now);
  if (!matches?.ok || !matches.value.items.length) {
    const existing = await ctx.db.query('realEstateTasks').withIndex('by_entity', q => q.eq('entityType', 'opportunity').eq('entityId', String(saved.value.id))).take(20);
    if (!existing.some(task => task.status === 'open' && task.kind === 'no_verified_match')) await ctx.db.insert('realEstateTasks', { accountId: row.accountId, kind: 'no_verified_match', entityType: 'opportunity', entityId: String(saved.value.id), status: 'open', reason: 'No available, recently verified listing matches every saved requirement', createdAt: now, updatedAt: now });
    return { opportunityId: saved.value.id, handoff: true, facts: arabic(text) ? 'سيتحقق الفريق من العقارات المناسبة ويعود إليك بالمعلومات المؤكدة.' : 'The team will check suitable properties and return with confirmed details.' };
  }
  const lines = [];
  for (const match of matches.value.items.slice(0, 3)) {
    const property = await ctx.db.get(match.propertyId);
    if (!property?.label || !property.location || !Number.isSafeInteger(property.askingPriceMinor)) continue;
    lines.push(`${property.label} — ${property.location} — ${(property.askingPriceMinor / 1000).toFixed(3)} ${arabic(text) ? 'ر.ع.' : 'OMR'}`);
  }
  return { opportunityId: saved.value.id, facts: lines.join('\n') || null };
}
