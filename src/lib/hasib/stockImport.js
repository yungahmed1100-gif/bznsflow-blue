// Stock import: turn whatever file a shop keeps (a spreadsheet, a PDF price list,
// a photo of one) into products with variants the owner reviews before saving.
// Pure functions; the server re-validates every product.
import { normalizeDigits, parseAmount } from '../../../convex/hasib/money.js';
import { toCsv } from '../dashboard/csv.js';

export const STOCK_IMPORT_MAX_ROWS = 2000;
export const STOCK_IMPORT_BATCH = 25;
const MAX_QTY = 100000;
const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim();
const isArabic = text => /[؀-ۿ]/.test(text);

// Checked in this order; a column is used once. Cost comes before price because
// "سعر التكلفة" (cost price) also starts with "سعر" (price).
const HINTS = [
  ['serial', /^(imei\d?|serial( ?(no|number))?|s\/?n|الرقم التسلسلي|السيريال|ايمي|آيمي)$/i],
  ['sku', /^(sku|code|bar ?code|item ?code|product ?code|ref(erence)?|الرمز|الكود|الباركود|رمز المنتج|كود المنتج)$/i],
  ['nameAr', /^(arabic ?name|name ?\(?ar(abic)?\)?|name_ar|الاسم (بالعربي|العربي|عربي)|اسم المنتج (بالعربي|عربي))$/i],
  ['nameEn', /^(english ?name|name ?\(?en(glish)?\)?|name_en|الاسم (بالانجليزي|بالإنجليزي|الانجليزي|الإنجليزي|انجليزي)|اسم المنتج (بالانجليزي|انجليزي))$/i],
  ['cost', /^(cost|cost ?price|unit ?cost|purchase ?price|buy(ing)? ?price|التكلفة|الكلفة|سعر التكلفة|سعر الشراء)/i],
  ['reorderPoint', /^(alert( at)?|min(imum)?( stock| qty)?|reorder( point| level)?|الحد الأدنى|حد الطلب|تنبيه( عند)?)$/i],
  ['price', /^(price|selling ?price|sale ?price|retail ?price|unit ?price|rrp|السعر|سعر البيع|سعر)/i],
  ['quantity', /^(qty|quantity|stock|on ?hand|in ?stock|count|units|available|الكمية|المخزون|العدد|الرصيد|المتوفر|الكميه)$/i],
  ['category', /^(category|group|department|collection|الفئة|القسم|التصنيف|المجموعة)$/i],
  ['name', /^(name|product( ?name)?|item( ?name)?|description|title|الاسم|اسم|المنتج|اسم المنتج|الصنف|البيان|الوصف)$/i],
];
const OPTION_HINTS = {
  size: /^(size|sz|المقاس|الحجم|القياس|المقاسات)$/i, colour: /^(colou?r|اللون|الالوان|الألوان)$/i, length: /^(length|الطول)$/i,
  storage: /^(storage|capacity|memory|rom|السعة|الذاكرة|المساحة)$/i, model: /^(model|الموديل|الطراز)$/i,
  condition: /^(condition|state|new ?\/ ?used|الحالة)$/i, flavour: /^(flavou?r|النكهة)$/i,
};

/**
 * Best-effort column mapping from the header row; the owner can change it.
 * @param {string[]} headers
 * @param {{key:string,en:string,ar:string}[]} variantOptions the pack's option names
 */
export function guessStockMapping(headers, variantOptions = []) {
  const labels = headers.map(h => clean(h).replace(/[:*]+$/, ''));
  const used = new Set();
  const take = test => { const i = labels.findIndex((h, idx) => h && !used.has(idx) && test(h)); if (i >= 0) used.add(i); return i; };
  const mapping = { options: {} };
  // Pack options first when named exactly ("Size", "المقاس"), so "Size" never becomes a name.
  for (const o of variantOptions) {
    const i = take(h => h.toLowerCase() === o.key || h.toLowerCase() === o.en.toLowerCase() || h === o.ar || OPTION_HINTS[o.key]?.test(h));
    if (i >= 0) mapping.options[o.key] = i;
  }
  for (const [field, test] of HINTS) mapping[field] = take(h => test.test(h));
  return mapping;
}

/** The rows from the header row on (a title or blank rows above it are dropped), or null when no row names a product and a price. */
export function findHeaderRow(rows, variantOptions = []) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const m = guessStockMapping(rows[i] || [], variantOptions);
    if (m.price >= 0 && (m.name >= 0 || m.nameAr >= 0 || m.nameEn >= 0)) return rows.slice(i);
  }
  return null;
}

/** An amount cell ("25.500", "OMR 25", "٢٥٫٥ ر.ع.", "1,250") in minor units, or null. */
export function parseCellAmount(value) {
  if (typeof value === 'number') return parseAmount(value);
  const text = normalizeDigits(clean(value)).replace(/(omr|r\.?o\.?|ر\.?\s?ع\.?|ريال( عماني)?|baisa)/gi, '').replace(/\s/g, '');
  if (!text) return null;
  const unthousand = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(text) ? text.replace(/,/g, '') : text.replace(/,/g, '.');
  return parseAmount(unthousand);
}
const parseCount = value => {
  const text = normalizeDigits(clean(value)).replace(/[,\s]/g, '');
  if (!text) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) && n >= 0 && n <= MAX_QTY ? n : NaN;
};
const cell = (cells, index) => (index >= 0 ? clean(cells[index]) : '');

function readRow(cells, mapping, optionKeys) {
  let nameAr = cell(cells, mapping.nameAr).slice(0, 120), nameEn = cell(cells, mapping.nameEn).slice(0, 120);
  const name = cell(cells, mapping.name).slice(0, 120);
  if (name) { if (isArabic(name)) nameAr ||= name; else nameEn ||= name; }
  const options = optionKeys.map(key => ({ key, value: cell(cells, mapping.options?.[key]).slice(0, 40) })).filter(o => o.value);
  const priceText = cell(cells, mapping.price), costText = cell(cells, mapping.cost);
  return { nameAr, nameEn, options, category: cell(cells, mapping.category).slice(0, 60), sku: cell(cells, mapping.sku).slice(0, 40),
    serial: cell(cells, mapping.serial).replace(/\s/g, '').slice(0, 40), priceText, priceMinor: parseCellAmount(priceText),
    costText, costMinor: costText ? parseCellAmount(costText) : 0, quantity: parseCount(cell(cells, mapping.quantity)), reorderPoint: parseCount(cell(cells, mapping.reorderPoint)) };
}
const productKey = r => (r.nameEn || r.nameAr).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const variantKey = r => r.sku ? `sku:${r.sku.toLowerCase()}` : `opt:${r.options.map(o => `${o.key}=${o.value.toLowerCase()}`).join('|')}`;

function rowProblem(r) {
  if (!r.nameAr && !r.nameEn) return 'name_missing';
  if (!r.priceText) return 'price_missing';
  if (r.priceMinor === null) return 'price_invalid';
  if (r.costMinor === null) return 'cost_invalid';
  if (Number.isNaN(r.quantity)) return 'quantity_invalid';
  if (Number.isNaN(r.reorderPoint)) return 'alert_invalid';
  if (r.serial && !/^[A-Za-z0-9-]{4,40}$/.test(r.serial)) return 'serial_invalid';
  return null;
}

/**
 * Rows with the same product name become one product; rows with the same options
 * or SKU under it become one variant. An IMEI/serial row is one unit.
 * @param {string[][]} rows including the header row
 * @returns {{ products: object[], invalid: {line:number,reason:string,value:string}[], truncated: boolean, counts: {products:number,variants:number,units:number} }}
 */
export function buildStockPreview(rows, mapping, variantOptions = []) {
  const optionKeys = variantOptions.map(o => o.key);
  const [, ...data] = rows;
  const truncated = data.length > STOCK_IMPORT_MAX_ROWS;
  const products = new Map(), skuOwner = new Map(), serials = new Set(), invalid = [];
  data.slice(0, STOCK_IMPORT_MAX_ROWS).forEach((cells, index) => {
    const line = index + 2;
    if (!cells.some(c => clean(c))) return;
    const r = readRow(cells, mapping, optionKeys);
    const problem = rowProblem(r);
    if (problem) { invalid.push({ line, reason: problem, value: (r.nameEn || r.nameAr || cells.map(clean).find(Boolean) || '').slice(0, 60) }); return; }
    const pk = productKey(r);
    if (r.sku && skuOwner.has(r.sku.toLowerCase()) && skuOwner.get(r.sku.toLowerCase()) !== pk) { invalid.push({ line, reason: 'duplicate_sku', value: r.sku }); return; }
    if (r.serial && serials.has(r.serial)) { invalid.push({ line, reason: 'duplicate_serial', value: r.serial }); return; }
    if (r.sku) skuOwner.set(r.sku.toLowerCase(), pk);
    if (r.serial) serials.add(r.serial);
    const product = products.get(pk) || { key: pk, line, nameAr: '', nameEn: '', category: '', serialized: false, variants: new Map() };
    product.nameAr ||= r.nameAr; product.nameEn ||= r.nameEn; product.category ||= r.category;
    product.serialized ||= !!r.serial;
    const vk = variantKey(r);
    const variant = product.variants.get(vk) || { key: vk, line, sku: r.sku, options: r.options, priceMinor: r.priceMinor, costMinor: r.costMinor, reorderPoint: r.reorderPoint, quantity: null, serials: [] };
    if (r.serial) variant.serials.push(r.serial);
    else if (r.quantity !== null) variant.quantity = (variant.quantity || 0) + r.quantity;
    product.variants.set(vk, variant);
    products.set(pk, product);
  });
  const list = [...products.values()].map(p => ({ ...p, variants: [...p.variants.values()].map(v => ({ ...v, quantity: v.serials.length ? v.serials.length : v.quantity })) }));
  const variants = list.flatMap(p => p.variants);
  return { products: list, invalid, truncated, counts: { products: list.length, variants: variants.length, units: variants.reduce((n, v) => n + (v.quantity || 0), 0) } };
}

const PRICE_IN_LINE = /(?:(?:omr|r\.?o\.?|ر\.?\s?ع\.?)\s*)?(\d{1,7}(?:[.,]\d{1,3})?)\s*(?:omr|r\.?o\.?|ر\.?\s?ع\.?|ريال(?: عماني)?)?/gi;
const QTY_IN_LINE = /(?:qty|quantity|stock|x|×|الكمية|العدد|المخزون)\s*[:=]?\s*(\d{1,6})\b|\b(\d{1,6})\s*(?:pcs|pieces|units|قطعة|حبة|حبات)\b/i;

/**
 * Text from a PDF, Word file or photo. A table (tabs or "|" columns) keeps its
 * cells; otherwise each line with a price becomes a row of name, price and quantity.
 * @returns {string[][]} rows including a header row
 */
export function textToStockRows(text) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const split = l => (l.includes('\t') ? l.split('\t') : l.replace(/^\||\|$/g, '').split('|')).map(clean);
  const tabular = lines.filter(l => l.includes('\t') || (l.match(/\|/g) || []).length >= 2);
  if (tabular.length >= 2 && tabular.length >= lines.length * 0.6) return tabular.map(split).filter(r => !r.every(c => /^[-:\s]*$/.test(c)));
  const rows = [['Name', 'Price', 'Quantity']];
  for (const raw of lines) {
    const line = normalizeDigits(raw).replace(/٬/g, ',');
    const qtyMatch = line.match(QTY_IN_LINE);
    const withoutQty = qtyMatch ? line.replace(qtyMatch[0], ' ') : line;
    const prices = [...withoutQty.matchAll(PRICE_IN_LINE)].filter(m => /[.,]\d|omr|r\.?o|ر\.?\s?ع|ريال/i.test(m[0]));
    const price = prices.at(-1) || [...withoutQty.matchAll(/\b(\d{1,7}(?:\.\d{1,3})?)\s*$/g)].at(-1);
    if (!price) continue;
    const name = withoutQty.slice(0, price.index).replace(/[\s:–—\-|•·.]+$/, '').replace(/^[\s\d.)•·-]+(?=\D)/, '').trim();
    if (name.length < 2) continue;
    rows.push([name.slice(0, 120), price[1], qtyMatch ? (qtyMatch[1] || qtyMatch[2]) : '']);
  }
  return rows;
}

const BATCH_BYTES = 48000;
/**
 * Products in server shape, split into batches the import op accepts (at most 25
 * products and 48 KB each). Request ids are fixed here, so retrying a batch is safe.
 */
export function importBatches(products, newId = () => crypto.randomUUID()) {
  const shaped = products.map(p => ({ requestId: newId(),
    item: { kind: 'product', nameAr: p.nameAr, nameEn: p.nameEn, category: p.category, unit: 'piece', trackStock: true, ...(p.serialized ? { serialized: true } : {}) },
    variants: p.variants.map(v => ({ sku: v.sku, options: v.options, priceMinor: v.priceMinor, costMinor: v.costMinor,
      ...(v.reorderPoint !== null ? { reorderPoint: v.reorderPoint } : {}), ...(v.quantity !== null && !v.serials.length ? { quantity: v.quantity } : {}), ...(v.serials.length ? { serials: v.serials } : {}) })),
  }));
  const out = [];
  let batch = [], bytes = 0;
  for (const p of shaped) {
    const size = JSON.stringify(p).length;
    if (batch.length && (batch.length >= STOCK_IMPORT_BATCH || bytes + size > BATCH_BYTES)) { out.push(batch); batch = []; bytes = 0; }
    batch.push(p); bytes += size;
  }
  if (batch.length) out.push(batch);
  return out;
}

/** An example file in the shop's own columns, to download and fill in. */
export function sampleStockCsv(variantOptions = [], { serials = false } = {}) {
  const examples = { size: ['52', '56'], length: ['54', '56'], colour: ['Black', 'Black'], storage: ['128GB', '256GB'], model: ['15', '15'], condition: ['New', 'New'], flavour: ['Vanilla', 'Chocolate'] };
  const name = serials ? ['iPhone 15', 'آيفون 15'] : ['Black abaya', 'عباية سوداء'];
  const head = ['Name', 'Name (Arabic)', 'Category', ...variantOptions.map(o => o.en), 'Price', 'Cost', ...(serials ? ['IMEI'] : ['Quantity']), 'SKU'];
  const row = i => [name[0], name[1], serials ? 'Phones' : 'Abayas', ...variantOptions.map(o => examples[o.key]?.[i] || ''), serials ? ['320.000', '360.000'][i] : '25.000', serials ? ['280.000', '310.000'][i] : '10.000',
    serials ? ['356789012345671', '356789012345672'][i] : ['3', '2'][i], `${serials ? 'IP15' : 'AB'}-${i + 1}`];
  return toCsv([head, row(0), row(1)]);
}
