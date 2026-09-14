// RFC 4180-style CSV reading and spreadsheet-safe CSV writing.

export const MAX_ROWS = 5000;

/** Detect "," ";" or tab from the header line, outside quotes. */
function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  let inQuotes = false;
  const counts = { ',': 0, ';': 0, '\t': 0 };
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch]++;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] : ',';
}

/** @returns {string[][]} rows of trimmed cells; blank lines are skipped. */
export function parseDelimited(input, { maxRows = MAX_ROWS } = {}) {
  const text = String(input || '').replace(/^﻿/, '');
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [], cell = '', inQuotes = false;
  const pushRow = () => { row.push(cell); cell = ''; if (row.some(v => v.trim() !== '')) rows.push(row.map(v => v.trim())); row = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') inQuotes = true;
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; pushRow(); if (rows.length > maxRows) break; }
    else cell += ch;
  }
  if (cell !== '' || row.length) pushRow();
  return rows.slice(0, maxRows + 1);
}

/** Cells that a spreadsheet would evaluate as a formula are prefixed so they stay text. */
export function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
export function toCsv(rows) {
  // BOM so Excel opens Arabic text as UTF-8.
  return `﻿${rows.map(r => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
