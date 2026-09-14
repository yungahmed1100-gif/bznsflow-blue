// Contact import: column mapping, normalization, duplicate merging and preview.
// Nothing here sends a message; the server re-validates every row.
import { parseDelimited, toCsv } from './csv.js';
import { normalizePhone } from './phone.js';
import { COUNTRIES, COUNTRY_CODES } from '../countries.js';

export const IMPORT_MAX_ROWS = 1000;
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const IMPORT_PAGE = 100;

const HEADER_HINTS = {
  phone: /^(phone|mobile|whatsapp|number|tel|telephone|cell|msisdn|wa_?id|رقم|الرقم|الهاتف|الجوال|واتساب|موبايل)/i,
  name: /^(name|full ?name|contact|customer|الاسم|اسم|العميل)/i,
  country: /^(country|country ?code|dial ?code|الدولة|البلد|رمز الدولة)/i,
};

/** Best-effort column mapping from header names; the owner can change it. */
export function guessMapping(headers, fields = []) {
  const find = test => headers.findIndex(h => test(String(h || '').trim()));
  const mapping = { phone: find(h => HEADER_HINTS.phone.test(h)), name: find(h => HEADER_HINTS.name.test(h)), country: find(h => HEADER_HINTS.country.test(h)), fields: {} };
  for (const f of fields) {
    const index = find(h => h.toLowerCase() === f.key || h.toLowerCase() === f.en.toLowerCase() || h === f.ar);
    if (index >= 0) mapping.fields[f.key] = index;
  }
  return mapping;
}

/** Country column may hold ISO-2, a dial code (+968 / 968) or an English name. */
export function countryFromCell(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (COUNTRY_CODES.has(text.toUpperCase())) return text.toUpperCase();
  const dial = text.replace(/^\+|^00/, '');
  if (/^\d{1,4}$/.test(dial)) return dial === '1' ? 'US' : COUNTRIES.find(([, d]) => d === dial)?.[0] || '';
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'region' });
    return COUNTRIES.find(([iso]) => names.of(iso)?.toLowerCase() === text.toLowerCase())?.[0] || '';
  } catch { return ''; }
}

/**
 * @param {string[][]} rows including the header row
 * @returns {{ valid: object[], invalid: {line:number,reason:string,value:string}[], duplicates: number, truncated: boolean }}
 */
export function buildImportPreview(rows, mapping, defaultCountry, fields = []) {
  const [, ...data] = rows;
  const truncated = data.length > IMPORT_MAX_ROWS;
  const byWaId = new Map(), invalid = [];
  let duplicates = 0;
  data.slice(0, IMPORT_MAX_ROWS).forEach((cells, index) => {
    const line = index + 2;
    const raw = mapping.phone >= 0 ? cells[mapping.phone] : '';
    const country = (mapping.country >= 0 && countryFromCell(cells[mapping.country])) || defaultCountry;
    const normalized = normalizePhone(raw, country);
    if (normalized.error) { invalid.push({ line, reason: raw ? normalized.error : 'missing_phone', value: String(raw || '').slice(0, 40) }); return; }
    const name = mapping.name >= 0 ? String(cells[mapping.name] || '').trim().slice(0, 80) : '';
    const rowFields = fields.map(f => ({ key: f.key, value: String(cells[mapping.fields?.[f.key]] ?? '').trim().slice(0, 120) })).filter(f => mapping.fields?.[f.key] >= 0 && f.value);
    const existing = byWaId.get(normalized.waId);
    if (existing) {
      duplicates++;
      if (!existing.name && name) existing.name = name;
      for (const f of rowFields) if (!existing.fields.some(e => e.key === f.key)) existing.fields.push(f);
      return;
    }
    byWaId.set(normalized.waId, { line, waId: normalized.waId, countryIso: normalized.countryIso, name, fields: rowFields });
  });
  return { valid: [...byWaId.values()], invalid, duplicates, truncated };
}

export function sampleCsv(fields = []) {
  const extra = fields.slice(0, 3);
  return toCsv([
    ['phone', 'name', 'country', ...extra.map(f => f.key)],
    ['+968 9123 4567', 'Aisha Al Balushi', 'OM', ...extra.map(() => '')],
    ['0501234567', 'Omar', 'AE', ...extra.map(() => '')],
  ]);
}

export async function readContactsFile(file) {
  if (!file || file.size > IMPORT_MAX_BYTES) throw new Error('import_file_too_large');
  const name = String(file.name || '').toLowerCase();
  if (name.endsWith('.xlsx')) {
    const module = await import('exceljs');
    const ExcelJS = module.default || module;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const sheet = workbook.worksheets[0];
    const rows = [];
    sheet?.eachRow({ includeEmpty: false }, row => {
      if (rows.length > IMPORT_MAX_ROWS + 1) return;
      rows.push(row.values.slice(1).map(v => {
        if (v && typeof v === 'object') return String(v.text ?? v.result ?? (v.richText ? v.richText.map(r => r.text).join('') : ''));
        return String(v ?? '').trim();
      }));
    });
    if (!rows.length) throw new Error('import_file_empty');
    return rows;
  }
  if (/\.(csv|txt)$/.test(name) || String(file.type).startsWith('text/')) {
    const rows = parseDelimited(await file.text(), { maxRows: IMPORT_MAX_ROWS + 1 });
    if (rows.length < 2) throw new Error('import_file_empty');
    return rows;
  }
  throw new Error('import_file_type');
}
