// Money for Hasib. Every amount is an integer count of minor units; OMR has
// three (1 OMR = 1000 baisa). Floats never reach storage or arithmetic.
export const MINOR_DIGITS = 3;
export const MINOR_PER_UNIT = 1000;
/** OMR 10,000,000 — far above any SME order or expense; rejects typos like an extra 000. */
export const MAX_MINOR = 10_000_000 * MINOR_PER_UNIT;

const DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };

/** Western digits and a dot, whatever the owner typed with (Arabic keyboards send ١٢٫٥). */
export function normalizeDigits(text) {
  return String(text).replace(/[٠-٩۰-۹]/g, d => DIGITS[d]).replace(/[٫]/g, '.').trim();
}

/** Parse a non-negative amount in major units to minor units, or null if it is not one. */
export function parseAmount(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null;
    value = value.toFixed(MINOR_DIGITS);
  }
  if (typeof value !== 'string') return null;
  const m = normalizeDigits(value).match(/^(\d{1,8})(?:\.(\d{1,3}))?$/);
  if (!m) return null;
  const minor = Number(m[1]) * MINOR_PER_UNIT + Number((m[2] || '').padEnd(MINOR_DIGITS, '0'));
  return minor <= MAX_MINOR ? minor : null;
}

export function formatMinor(minor) {
  const sign = minor < 0 ? '-' : '', abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / MINOR_PER_UNIT)}.${String(abs % MINOR_PER_UNIT).padStart(MINOR_DIGITS, '0')}`;
}

export const isMinor = (value, { allowNegative = false } = {}) =>
  Number.isSafeInteger(value) && Math.abs(value) <= MAX_MINOR && (allowNegative || value >= 0);
