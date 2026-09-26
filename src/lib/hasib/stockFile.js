// Reads whatever file a shop keeps its stock in, in the browser. Spreadsheets
// keep their columns (and pictures placed on a row); PDFs, Word files and photos
// of a price list become text lines for the price-list parser.
import { parseDelimited } from '../dashboard/csv.js';
import { STOCK_IMPORT_MAX_ROWS, textToStockRows } from './stockImport.js';

export const STOCK_FILE_MAX_BYTES = 15 * 1024 * 1024;
export const STOCK_FILE_ACCEPT = '.xlsx,.csv,.txt,.pdf,.docx,.png,.jpg,.jpeg,.webp';
const MAX_PAGES = 50;

/** UTF-8 (without its byte-order mark), else Windows-1256 — how Excel saves Arabic CSV. */
export function decodeText(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes); }
  catch { return new TextDecoder('windows-1256').decode(bytes); }
}

/**
 * pdf.js text pieces to lines: pieces on the same baseline join, and a wide gap
 * between them becomes a tab so a table keeps its columns.
 */
export function pdfLines(items) {
  const lines = [];
  for (const it of items.filter(i => i.str && i.str.trim())) {
    const y = it.transform[5], x = it.transform[4];
    let line = lines.find(l => Math.abs(l.y - y) < 2);
    if (!line) { line = { y, parts: [] }; lines.push(line); }
    line.parts.push({ x, end: x + (it.width || 0), str: it.str.trim(), charWidth: (it.width || it.str.length * 5) / Math.max(1, it.str.length) });
  }
  return lines.sort((a, b) => b.y - a.y).map(l => {
    const parts = l.parts.sort((a, b) => a.x - b.x);
    return parts.reduce((text, p, i) => (i ? text + (p.x - parts[i - 1].end > p.charWidth * 3 ? '\t' : ' ') + p.str : p.str), '');
  }).join('\n');
}

const cellText = v => {
  if (v && typeof v === 'object') return String(v.text ?? v.result ?? (v.richText ? v.richText.map(r => r.text).join('') : ''));
  return String(v ?? '').trim();
};

async function readXlsx(buffer) {
  const module = await import('exceljs');
  const ExcelJS = module.default || module;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets.find(s => s.actualRowCount > 0) || workbook.worksheets[0];
  const rows = [], rowIndex = new Map();
  sheet?.eachRow({ includeEmpty: false }, (row, number) => {
    if (rows.length > STOCK_IMPORT_MAX_ROWS + 15) return;
    rowIndex.set(number, rows.length);
    rows.push(row.values.slice(1).map(cellText));
  });
  // Pictures anchored on a row belong to that row's product.
  const images = [];
  for (const image of sheet?.getImages?.() || []) {
    const at = rowIndex.get(Math.floor(image.range?.tl?.nativeRow ?? image.range?.tl?.row ?? -1) + 1);
    const media = workbook.getImage(Number(image.imageId));
    const type = { png: 'image/png', jpeg: 'image/jpeg', jpg: 'image/jpeg', webp: 'image/webp' }[media?.extension];
    if (at !== undefined && type && media.buffer) images.push({ row: at, blob: new Blob([media.buffer], { type }) });
  }
  return { rows, images };
}

async function pdfText(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer), disableWorker: true }).promise;
  const pages = [];
  for (let n = 1; n <= Math.min(pdf.numPages, MAX_PAGES); n++) pages.push(pdfLines((await (await pdf.getPage(n)).getTextContent()).items));
  return pages.join('\n');
}

/** Word: the largest table keeps its cells; otherwise the paragraphs as lines. */
async function docxRows(buffer) {
  const mammoth = await import('mammoth/mammoth.browser');
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: buffer });
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const tables = [...doc.querySelectorAll('table')].map(t => [...t.querySelectorAll('tr')].map(tr => [...tr.querySelectorAll('td,th')].map(td => td.textContent.trim())));
  const biggest = tables.sort((a, b) => b.length - a.length)[0];
  if (biggest?.length >= 2) return biggest;
  return textToStockRows([...doc.body.querySelectorAll('p,li,h1,h2,h3')].map(p => p.textContent.trim()).join('\n'));
}

async function ocrText(file) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(['eng', 'ara']);
  try { return (await worker.recognize(file)).data.text; } finally { await worker.terminate(); }
}

/**
 * @returns {Promise<{ kind: 'table'|'text', rows: string[][], images: {row:number, blob:Blob}[] }>}
 * `rows` include the header row (a synthetic Name/Price/Quantity one for text).
 */
export async function readStockFile(file) {
  if (!file || file.size > STOCK_FILE_MAX_BYTES) throw Object.assign(new Error('import_file_too_large'), { reason: 'import_file_too_large' });
  const name = String(file.name || '').toLowerCase(), type = file.type || '';
  const buffer = await file.arrayBuffer();
  let result;
  if (name.endsWith('.xlsx')) result = { kind: 'table', ...(await readXlsx(buffer)) };
  else if (name.endsWith('.csv') || (name.endsWith('.txt') && decodeText(new Uint8Array(buffer)).includes(','))) result = { kind: 'table', rows: parseDelimited(decodeText(new Uint8Array(buffer)), { maxRows: STOCK_IMPORT_MAX_ROWS + 15 }), images: [] };
  else if (name.endsWith('.txt') || type.startsWith('text/')) result = { kind: 'text', rows: textToStockRows(decodeText(new Uint8Array(buffer))), images: [] };
  else if (type === 'application/pdf' || name.endsWith('.pdf')) result = { kind: 'text', rows: textToStockRows(await pdfText(buffer)), images: [] };
  else if (name.endsWith('.docx')) result = { kind: 'text', rows: await docxRows(buffer), images: [] };
  else if (type.startsWith('image/') || /\.(png|jpe?g|webp)$/.test(name)) result = { kind: 'text', rows: textToStockRows(await ocrText(file)), images: [] };
  else throw Object.assign(new Error('import_file_type'), { reason: 'import_file_type' });
  if (result.rows.length < 2) throw Object.assign(new Error('import_file_empty'), { reason: 'import_file_empty' });
  return result;
}
