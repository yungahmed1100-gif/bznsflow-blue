// Layla turns a buying message into an order, so nothing said in a chat is lost.
// One open ("pending", source "layla") order per conversation: created on the
// first product + quantity, updated by later messages, confirmed by the owner.
// Deterministic only — product names come from the shop's own Hasib products.
import { extractQualification } from '../../config/layla-qualification.js';
import { isLivePack } from '../../config/hasib-packs.js';
import { hasibEnabled } from './gate.js';
import { planFor, HASIB_PLANS } from './plans.js';
import { packFor } from './shared.js';
import { matchItem } from './matching.js';
import { normalizeDigits } from './money.js';
import { createOrder, updatePendingOrder } from './ordersState.js';

/** "I want the black abaya" is an order for one; a bare question is not. */
const BUYING = /\b(want|need|order|buy|take|reserve|book|get me)\b|أبغى|ابغى|ابغا|أبغا|أبي|ابي|أريد|اريد|ودي|اطلب|أطلب|احجز|أحجز|بشتري|باخذ|بآخذ/i;
const MAX_QTY = 99;

export function acknowledgement(number, text) {
  return /[؀-ۿ]/.test(text || '')
    ? `تم استلام طلبك رقم ${number} — سيؤكد الفريق التوفّر والمجموع قريباً.`
    : `Order #${number} received — the team will confirm availability and the total shortly.`;
}

/** The variant whose option values (size 56, Black, 128GB) are named in the message. */
function pickVariant(variants, text) {
  const words = ` ${normalizeDigits(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  const score = v => v.options.filter(o => words.includes(` ${normalizeDigits(o.value).toLowerCase()} `)).length;
  const ranked = variants.map(v => ({ v, n: score(v) })).sort((a, b) => b.n - a.n);
  if (ranked[0]?.n > 0 && ranked[0].n !== ranked[1]?.n) return { variant: ranked[0].v, confirmed: true };
  return { variant: variants.find(v => v.onHand > 0) || variants[0], confirmed: variants.length === 1 };
}

/**
 * Called from Layla's ingest for every inbound customer message.
 * Returns `{ created, number, ack? }`, or null when the message holds no order.
 */
export async function captureOrder(ctx, { row, person, text, intent, now, secret }) {
  if (!text || !person || !(await hasibEnabled(ctx))) return null;
  const accountId = row.accountId;
  if (!HASIB_PLANS.includes(await planFor(ctx, accountId))) return null;
  const tenant = { accountId, row, secret };
  const pack = await packFor(ctx, tenant);
  if (!isLivePack(pack.id) || pack.modules.orders !== 'available') return null;
  tenant.pack = pack;

  const products = (await ctx.db.query('hasibItems').withIndex('by_account_archived_updated', q => q.eq('accountId', accountId).eq('archived', false)).take(300)).filter(i => i.kind === 'product');
  if (!products.length) return null;
  // Read the message as a retail order whatever Layla's own sector is; Layla's questions are untouched.
  const { updates } = extractQualification({ text, sectorId: 'retail', catalog: products.map(p => ({ nameEn: p.nameEn, nameAr: p.nameAr, prices: [] })), asked: [], askedRecently: false, existing: [], intent });
  const field = key => updates.find(u => u.key === key)?.value;
  const item = field('item') && await matchItem(ctx, accountId, field('item'));
  if (!item) return null;
  const said = parseInt(normalizeDigits(field('quantity') || ''), 10);
  const qty = Number.isSafeInteger(said) && said > 0 ? Math.min(said, MAX_QTY) : BUYING.test(text) ? 1 : 0;
  if (!qty) return null;
  const variants = (await ctx.db.query('hasibVariants').withIndex('by_item', q => q.eq('itemId', item._id)).take(50)).filter(v => !v.archived);
  if (!variants.length) return null;
  const { variant, confirmed } = pickVariant(variants, text);
  const type = ['delivery', 'pickup'].includes(field('fulfilment')) ? field('fulfilment') : undefined, area = field('area');

  const open = (await ctx.db.query('hasibOrders').withIndex('by_conversation_status', q => q.eq('conversationId', person._id).eq('status', 'pending')).take(10))
    .find(o => o.accountId === accountId && o.source === 'layla');
  if (open) {
    const lines = open.lines.map(l => ({ ...(l.variantId ? { variantId: l.variantId } : { name: l.name }), qty: l.qty, unitPriceMinor: l.unitPriceMinor, ...(l.discountMinor ? { discountMinor: l.discountMinor } : {}), ...(l.role ? { role: l.role } : {}) }));
    const at = lines.findIndex(l => l.variantId === variant._id);
    if (at >= 0) { if (field('quantity')) lines[at] = { ...lines[at], qty }; } else lines.push({ variantId: variant._id, qty });
    const fulfilment = type || area ? { type: type || open.fulfilment.type, ...((area || open.fulfilment.area) ? { area: area || open.fulfilment.area } : {}), ...(open.fulfilment.dueAt ? { dueAt: open.fulfilment.dueAt } : {}) } : undefined;
    const updated = await updatePendingOrder(ctx, accountId, open, lines, now, { allowSerializedDraft: true, fulfilment });
    if (!updated.ok) throw new Error(updated.reason);
    return { created: false, number: open.number };
  }
  const created = await createOrder(ctx, tenant, { requestId: `layla:${person._id}:${now}`, channel: person.channel || 'whatsapp', source: 'layla', conversationId: person._id,
    fulfilment: { type: type || 'pickup', ...(area ? { area } : {}) }, lines: [{ variantId: variant._id, qty }],
    // Shown to the owner in their language; the customer is never told a size Layla guessed.
    ...(confirmed ? {} : { flags: ['options_unconfirmed'] }) }, now, { internal: true });
  if (!created.ok) throw new Error(created.reason);
  return { created: true, number: created.value.number, ack: acknowledgement(created.value.number, text) };
}
