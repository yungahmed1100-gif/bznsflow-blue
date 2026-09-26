// Phase 3: Stock accepts the files a shop already keeps. Column guessing in
// Arabic and English, variant grouping, IMEI rows and price-list text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { guessStockMapping, buildStockPreview, parseCellAmount, textToStockRows, importBatches, findHeaderRow, STOCK_IMPORT_BATCH } from '../src/lib/hasib/stockImport.js';

const retail = [{ key: 'size', en: 'Size', ar: 'المقاس' }, { key: 'length', en: 'Length', ar: 'الطول' }, { key: 'colour', en: 'Colour', ar: 'اللون' }];
const tech = [{ key: 'model', en: 'Model', ar: 'الموديل' }, { key: 'storage', en: 'Storage', ar: 'السعة' }, { key: 'colour', en: 'Colour', ar: 'اللون' }, { key: 'condition', en: 'Condition', ar: 'الحالة' }];

test('English headers map to fields and pack options; unknown columns are ignored', () => {
  const m = guessStockMapping(['Product Name', 'Category', 'Size', 'Color', 'Selling Price', 'Cost Price', 'Qty', 'SKU', 'Notes'], retail);
  assert.deepEqual([m.name, m.category, m.options.size, m.options.colour, m.price, m.cost, m.quantity, m.sku], [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(m.options.length, undefined);
});

test('Arabic headers, with cost price not mistaken for price', () => {
  const m = guessStockMapping(['اسم المنتج', 'المقاس', 'سعر التكلفة', 'سعر البيع', 'الكمية', 'الباركود'], retail);
  assert.deepEqual([m.name, m.options.size, m.cost, m.price, m.quantity, m.sku], [0, 1, 2, 3, 4, 5]);
});

test('amount cells: currency words, Arabic digits and thousands separators', () => {
  assert.deepEqual(['25.500', 'OMR 25', '٢٥٫٥ ر.ع.', '1,250', '12,5', 18.25, 'abc', ''].map(parseCellAmount), [25500, 25000, 25500, 1250000, 12500, 18250, null, null]);
});

test('rows with the same name become one product with variants; quantities of repeated rows add up', () => {
  const rows = [['Name', 'Size', 'Price', 'Qty'], ['Black abaya', '52', '25', '3'], ['Black abaya', '56', '25', '2'], ['black abaya ', '56', '25', '1'], ['Kaftan', '', '18.5', ''], ['', '', '', '']];
  const p = buildStockPreview(rows, guessStockMapping(rows[0], retail), retail);
  assert.equal(p.products.length, 2);
  const abaya = p.products[0];
  assert.deepEqual([abaya.nameEn, abaya.variants.length, abaya.variants.map(v => v.quantity)], ['Black abaya', 2, [3, 3]]);
  assert.deepEqual(abaya.variants[0].options, [{ key: 'size', value: '52' }]);
  assert.deepEqual([p.products[1].variants[0].priceMinor, p.products[1].variants[0].quantity], [18500, null], 'no quantity column value: stock is left alone');
  assert.deepEqual(p.counts, { products: 2, variants: 3, units: 6 });
});

test('a single name column goes to Arabic or English by script; separate columns are kept', () => {
  let rows = [['الاسم', 'السعر'], ['عباية سوداء', '25']];
  let p = buildStockPreview(rows, guessStockMapping(rows[0], retail), retail);
  assert.deepEqual([p.products[0].nameAr, p.products[0].nameEn], ['عباية سوداء', '']);
  rows = [['Name (Arabic)', 'Name (English)', 'Price'], ['عباية سوداء', 'Black abaya', '25']];
  p = buildStockPreview(rows, guessStockMapping(rows[0], retail), retail);
  assert.deepEqual([p.products[0].nameAr, p.products[0].nameEn], ['عباية سوداء', 'Black abaya']);
});

test('problems are listed by line and the row is left out', () => {
  const rows = [['Name', 'Price', 'Qty', 'SKU'], ['A', '', '1', ''], ['', '5', '', ''], ['B', 'free', '', ''], ['C', '5', 'lots', ''], ['D', '5', '1', 'X1'], ['E', '6', '1', 'X1']];
  const p = buildStockPreview(rows, guessStockMapping(rows[0]), []);
  assert.deepEqual(p.invalid.map(i => [i.line, i.reason]), [[2, 'price_missing'], [3, 'name_missing'], [4, 'price_invalid'], [5, 'quantity_invalid'], [7, 'duplicate_sku']]);
  assert.deepEqual(p.products.map(x => x.nameEn), ['D']);
});

test('phone stores: one IMEI per row becomes units of a serialized variant', () => {
  const rows = [['Product', 'Model', 'Storage', 'Price', 'IMEI'], ['iPhone 15', '15', '128GB', '320', '111111111111111'], ['iPhone 15', '15', '128GB', '320', '222222222222222'], ['iPhone 15', '15', '256GB', '360', '333333333333333'], ['iPhone 15', '15', '256GB', '360', '333333333333333']];
  const p = buildStockPreview(rows, guessStockMapping(rows[0], tech), tech);
  const [phone] = p.products;
  assert.equal(phone.serialized, true);
  assert.deepEqual(phone.variants.map(v => [v.options.map(o => o.value).join('/'), v.serials.length, v.quantity]), [['15/128GB', 2, 2], ['15/256GB', 1, 1]]);
  assert.deepEqual(p.invalid.map(i => i.reason), ['duplicate_serial']);
  const [[shaped]] = importBatches(p.products);
  assert.deepEqual(shaped.variants[0].serials, ['111111111111111', '222222222222222']);
  assert.equal(shaped.variants[0].quantity, undefined, 'serialized stock arrives as serials, never a count');
});

test('price-list text: one product per priced line, with quantity when given', () => {
  const rows = textToStockRows(['NOOR ABAYAS — PRICE LIST', 'Black abaya 25.000 OMR', 'Kaftan linen - 18.5 RO qty 4', 'عباية مطرزة ٣٢٫٥٠٠ ر.ع. الكمية ٢', 'Call 91234567 for orders', '1. Shayla chiffon: 6 OMR'].join('\n'));
  assert.deepEqual(rows, [['Name', 'Price', 'Quantity'], ['Black abaya', '25.000', ''], ['Kaftan linen', '18.5', '4'], ['عباية مطرزة', '32.500', '2'], ['Shayla chiffon', '6', '']]);
  const p = buildStockPreview(rows, guessStockMapping(rows[0]), []);
  assert.equal(p.products.length, 4);
  assert.equal(p.invalid.length, 0);
});

test('a table pasted from a PDF or Word file keeps its columns', () => {
  const rows = textToStockRows('| Name | Size | Price |\n|---|---|---|\n| Black abaya | 52 | 25 |\n| Black abaya | 56 | 25 |');
  assert.deepEqual(rows, [['Name', 'Size', 'Price'], ['Black abaya', '52', '25'], ['Black abaya', '56', '25']]);
});

test('import batches hold at most 25 products in server shape', () => {
  const rows = [['Name', 'Price', 'Qty'], ...Array.from({ length: 60 }, (_, i) => [`P${i}`, '1', '2'])];
  const batches = importBatches(buildStockPreview(rows, guessStockMapping(rows[0]), []).products);
  assert.deepEqual(batches.map(b => b.length), [STOCK_IMPORT_BATCH, STOCK_IMPORT_BATCH, 10]);
  assert.match(batches[0][0].requestId, /^[a-f0-9-]{36}$/);
  const { requestId, ...first } = batches[0][0];
  assert.deepEqual(first, { item: { kind: 'product', nameAr: '', nameEn: 'P0', category: '', unit: 'piece', trackStock: true }, variants: [{ sku: '', options: [], priceMinor: 1000, costMinor: 0, quantity: 2 }] });
});

test('batches also stay under the request size limit', () => {
  const serials = Array.from({ length: 150 }, (_, i) => String(100000000000000 + i));
  const products = Array.from({ length: 20 }, (_, i) => ({ nameAr: '', nameEn: `Phone ${i}`, category: '', serialized: true, variants: [{ sku: '', options: [], priceMinor: 1, costMinor: 0, reorderPoint: null, quantity: 150, serials }] }));
  const batches = importBatches(products);
  assert.ok(batches.length > 1);
  assert.ok(batches.every(b => JSON.stringify(b).length <= 48000 + 5000));
});

test('a title row above the headers is skipped', async () => {
  const { findHeaderRow } = await import('../src/lib/hasib/stockImport.js');
  const rows = [['Noor Abayas stock — September'], [], ['Product', 'Size', 'Price', 'Qty'], ['Black abaya', '52', '25', '3']];
  assert.deepEqual(findHeaderRow(rows, retail), [['Product', 'Size', 'Price', 'Qty'], ['Black abaya', '52', '25', '3']]);
  assert.equal(findHeaderRow([['a', 'b'], ['c', 'd']], retail), null, 'no name and price columns anywhere');
});

test('PDF text pieces become lines, with wide gaps as columns', async () => {
  const { pdfLines } = await import('../src/lib/hasib/stockFile.js');
  const item = (str, x, y, width = str.length * 5) => ({ str, transform: [1, 0, 0, 1, x, y], width });
  const text = pdfLines([item('Name', 10, 700), item('Price', 200, 700), item('Black', 10, 680), item('abaya', 38, 680), item('25.000', 200, 680.4), item('Kaftan', 10, 660), item('18.500', 200, 660)]);
  assert.equal(text, 'Name\tPrice\nBlack abaya\t25.000\nKaftan\t18.500');
  assert.deepEqual(textToStockRows(text), [['Name', 'Price'], ['Black abaya', '25.000'], ['Kaftan', '18.500']]);
});

test('CSV text decodes as UTF-8, or Windows-1256 when Excel saved it that way', async () => {
  const { decodeText } = await import('../src/lib/hasib/stockFile.js');
  assert.equal(decodeText(new TextEncoder().encode('الاسم,السعر')), 'الاسم,السعر');
  assert.equal(decodeText(new Uint8Array([0xC7, 0xE1, 0xD3, 0xDA, 0xD1])), 'السعر');
  assert.equal(decodeText(new Uint8Array([0xEF, 0xBB, 0xBF, 0x41])), 'A', 'byte-order mark dropped');
});

test('the example file for each shop type reads back cleanly', async () => {
  const { sampleStockCsv } = await import('../src/lib/hasib/stockImport.js');
  const { parseDelimited } = await import('../src/lib/dashboard/csv.js');
  for (const [options, serials] of [[retail, false], [tech, true]]) {
    const rows = parseDelimited(sampleStockCsv(options, { serials }));
    const p = buildStockPreview(rows, guessStockMapping(rows[0], options), options);
    assert.deepEqual([p.invalid, p.products.length, p.products[0].nameAr, p.products[0].serialized], [[], 1, serials ? 'آيفون 15' : 'عباية سوداء', serials]);
    assert.equal(p.products[0].variants.length, 2);
  }
});

test('an Excel file keeps its columns and gives each picture to the row it sits on', async () => {
  const { readStockFile } = await import('../src/lib/hasib/stockFile.js');
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Stock');
  ws.addRow(['Noor Abayas — stock']);
  ws.addRow(['Product', 'Size', 'Price', 'Qty']);
  ws.addRow(['Black abaya', '52', 25, 3]);
  ws.addRow(['Kaftan', 'M', 18.5, 2]);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  ws.addImage(wb.addImage({ buffer: png, extension: 'png' }), { tl: { col: 4, row: 3 }, ext: { width: 40, height: 40 } });
  const file = new File([await wb.xlsx.writeBuffer()], 'stock.xlsx');
  const read = await readStockFile(file);
  assert.equal(read.kind, 'table');
  const rows = findHeaderRow(read.rows, retail), offset = read.rows.length - rows.length;
  assert.deepEqual(rows.slice(1), [['Black abaya', '52', '25', '3'], ['Kaftan', 'M', '18.5', '2']]);
  assert.equal(read.images.length, 1);
  const line = read.images[0].row - offset + 1;
  const p = buildStockPreview(rows, guessStockMapping(rows[0], retail), retail);
  assert.equal(p.products.find(x => x.line === line)?.nameEn, 'Kaftan', 'the picture on the Kaftan row');
  assert.equal(read.images[0].blob.type, 'image/png');
});
