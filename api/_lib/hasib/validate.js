// Per-action argument allow-lists for the Hasib API. Unknown keys are dropped,
// strings are length-bounded, numbers must already be integers (money is sent
// in minor units and never coerced from a string). Convex re-validates all of it.
import { PilotError } from '../layla/config.js';

const ID = /^[A-Za-z0-9_-]{1,64}$/, UUID = /^[a-f0-9-]{36}$/;
const id = v => typeof v === 'string' && ID.test(v) ? v : undefined;
const uuid = v => typeof v === 'string' && UUID.test(v) ? v : undefined;
const str = (v, n) => typeof v === 'string' && v.length <= n ? v : undefined;
const int = v => Number.isSafeInteger(v) ? v : undefined;
const bool = v => v === true;
const list = (v, max, fn) => Array.isArray(v) ? v.slice(0, max).map(fn) : undefined;
const pair = (k, n) => o => ({ key: str(o?.key, 40) || '', value: str(o?.value, n) || '' });
const compact = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

const line = l => compact({ variantId: id(l?.variantId), name: str(l?.name, 120), qty: int(l?.qty) ?? 0, unitPriceMinor: int(l?.unitPriceMinor), discountMinor: int(l?.discountMinor) });
const variant = v => compact({ variantId: id(v?.variantId), sku: str(v?.sku, 40) ?? '', options: list(v?.options, 3, pair('key', 40)) || [], priceMinor: int(v?.priceMinor) ?? -1,
  costMinor: int(v?.costMinor), reorderPoint: int(v?.reorderPoint), openingStock: int(v?.openingStock) });
const item = i => i && typeof i === 'object' ? compact({ kind: str(i.kind, 20) || '', nameAr: str(i.nameAr, 120) ?? '', nameEn: str(i.nameEn, 120) ?? '', category: str(i.category, 60) ?? '',
  unit: str(i.unit, 20) || 'piece', trackStock: bool(i.trackStock), catalogEntryKey: uuid(i.catalogEntryKey) }) : undefined;

/** Actions whose id-bearing argument is required; a malformed id is refused rather than dropped. */
const REQUIRED = { order: 'orderId', order_status: 'orderId', payment_record: 'orderId', item_archive: 'itemId', stock_moves: 'variantId', stock_move: 'variantId', contact_summary: 'contactId', chat_prefill: 'conversationId' };
const NEEDS_REQUEST = new Set(['order_create', 'payment_record', 'stock_move']);

const SHAPES = {
  items: b => ({ search: str(b.search, 80), cursor: str(b.cursor, 100), limit: int(b.limit) }),
  low_stock: () => ({}),
  item_save: b => ({ requestId: uuid(b.requestId), itemId: id(b.itemId), item: item(b.item), variants: list(b.variants, 50, variant) }),
  item_archive: b => ({ itemId: id(b.itemId) }),
  stock_move: b => ({ requestId: uuid(b.requestId), variantId: id(b.variantId), delta: int(b.delta), reason: str(b.reason, 20), unitCostMinor: int(b.unitCostMinor), note: str(b.note, 200) }),
  stock_moves: b => ({ variantId: id(b.variantId), cursor: str(b.cursor, 100), limit: int(b.limit) }),
  orders: b => ({ status: str(b.status, 20), cursor: str(b.cursor, 100), limit: int(b.limit) }),
  order: b => ({ orderId: id(b.orderId) }),
  order_create: b => ({ requestId: uuid(b.requestId), channel: str(b.channel, 20), confirm: bool(b.confirm), contactId: id(b.contactId), conversationId: id(b.conversationId),
    customerName: str(b.customerName, 80), lines: list(b.lines, 50, line) || [], deliveryFeeMinor: int(b.deliveryFeeMinor), notes: str(b.notes, 500),
    fulfilment: b.fulfilment && typeof b.fulfilment === 'object' ? compact({ type: str(b.fulfilment.type, 20) || '', area: str(b.fulfilment.area, 80), dueAt: int(b.fulfilment.dueAt) }) : { type: '' },
    customFields: list(b.customFields, 10, pair('key', 300)) }),
  order_status: b => ({ orderId: id(b.orderId), to: str(b.to, 20), version: int(b.version) }),
  payment_record: b => ({ requestId: uuid(b.requestId), orderId: id(b.orderId), amountMinor: int(b.amountMinor), method: str(b.method, 20), reference: str(b.reference, 80) }),
  contact_summary: b => ({ contactId: id(b.contactId) }),
  chat_prefill: b => ({ conversationId: id(b.conversationId) }),
  settings_update: b => ({ stockPolicy: str(b.stockPolicy, 10),
    vat: b.vat && typeof b.vat === 'object' ? compact({ registered: bool(b.vat.registered), rateBps: int(b.vat.rateBps) ?? -1, pricesIncludeVat: bool(b.vat.pricesIncludeVat), vatin: str(b.vat.vatin, 20) }) : undefined }),
};
export const HASIB_ACTIONS = Object.keys(SHAPES);

export function hasibArgs(action, body) {
  const shape = SHAPES[action];
  if (!shape) throw new PilotError('invalid_action');
  const args = compact(shape(body));
  if (REQUIRED[action] && !args[REQUIRED[action]]) throw new PilotError('invalid_request');
  if (NEEDS_REQUEST.has(action) && !args.requestId) throw new PilotError('invalid_request');
  if (action === 'item_save' && !args.itemId && !args.requestId) throw new PilotError('invalid_request');
  return args;
}
