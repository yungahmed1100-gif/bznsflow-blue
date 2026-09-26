// Demand signals: every time a customer asks Layla about a product. Written at
// message ingest, PII-free (contact id only), and removed with the contact.
import { hasibEnabled } from './gate.js';
import { matchItem, demandKey } from './matching.js';

const DEMAND_INTENTS = new Set(['catalog_item', 'price', 'availability_request']);
const DEDUPE_MS = 86400000;
const KIND = { availability_request: 'availability', price: 'price' };

/**
 * Called from Layla's ingest after qualification fields are applied. A signal needs a
 * product: either an item Layla just captured, or the contact's known item on a price or
 * availability question. One signal per person, product and day.
 */
export async function recordDemand(ctx, { accountId, contact, conversationId, updates = [], intent, at }) {
  const captured = updates.find(u => u.key === 'item')?.value;
  const known = contact.fields?.find(f => f.key === 'item')?.value;
  const text = captured || (DEMAND_INTENTS.has(intent) ? known : '');
  if (!text || !(await hasibEnabled(ctx))) return;
  const key = demandKey(text);
  const recent = await ctx.db.query('hasibDemandSignals').withIndex('by_contact_at', q => q.eq('contactId', contact._id).gte('at', at - DEDUPE_MS)).take(50);
  if (recent.some(s => s.key === key)) return;
  const item = await matchItem(ctx, accountId, text);
  let onHand = null;
  if (item?.trackStock) {
    const variants = await ctx.db.query('hasibVariants').withIndex('by_item', q => q.eq('itemId', item._id)).take(50);
    onHand = variants.filter(v => !v.archived).reduce((n, v) => n + Math.max(v.onHand, 0), 0);
  }
  await ctx.db.insert('hasibDemandSignals', { accountId, contactId: contact._id, ...(conversationId ? { conversationId } : {}), ...(item ? { itemId: item._id } : {}),
    text: text.slice(0, 80), key, kind: KIND[intent] || 'asked', outOfStock: onHand === 0, at });
}

export async function removeDemandFor(ctx, contactId) {
  const rows = await ctx.db.query('hasibDemandSignals').withIndex('by_contact_at', q => q.eq('contactId', contactId)).take(2000);
  for (const r of rows) await ctx.db.delete(r._id);
}
