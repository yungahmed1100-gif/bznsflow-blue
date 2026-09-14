// WhatsApp number rules shared by the dashboard importer, manual entry and the
// server. A wa_id is the E.164 number without "+": 8–15 digits, country code first.
import { COUNTRIES, COUNTRY_CODES, dialFor } from '../countries.js';

const BY_DIAL_LENGTH = [...COUNTRIES].sort((a, b) => b[1].length - a[1].length);
const toLatinDigits = value => String(value ?? '').replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

/** Longest dial-code match; +1 resolves to US/CA, which share the same code. */
export function countryForWaId(waId) {
  const found = BY_DIAL_LENGTH.find(([, dial]) => String(waId).startsWith(dial));
  return found ? (found[1] === '1' ? 'US' : found[0]) : '';
}
export const isValidWaId = waId => /^[1-9]\d{7,14}$/.test(waId || '');

/**
 * Normalize user input to a wa_id.
 * International forms ("+968…", "00968…") win; otherwise the country supplies
 * the dial code and a national trunk "0" is dropped.
 * @returns {{ waId: string, countryIso: string } | { error: string }}
 */
export function normalizePhone(input, countryIso = '') {
  const raw = toLatinDigits(input).trim();
  if (!raw || raw.length > 32 || /[^\d\s+().-]/.test(raw)) return { error: 'invalid_phone' };
  const digits = raw.replace(/\D/g, '');
  let waId;
  if (raw.startsWith('+')) waId = digits;
  else if (digits.startsWith('00')) waId = digits.slice(2);
  else {
    const iso = COUNTRY_CODES.has(countryIso) ? countryIso : '';
    const dial = iso ? dialFor(iso) : '';
    if (!dial) return { error: 'missing_country' };
    const national = digits.replace(/^0+/, '');
    // A pasted "968 9123 4567" already carries the code; keep it once.
    waId = national.startsWith(dial) && national.length - dial.length >= 7 ? national : `${dial}${national}`;
  }
  if (!isValidWaId(waId)) return { error: 'invalid_phone' };
  const detected = countryForWaId(waId);
  if (!detected) return { error: 'invalid_phone' };
  const dial = dialFor(detected) || '1';
  if (waId.length - dial.length < 6) return { error: 'invalid_phone' };
  return { waId, countryIso: COUNTRY_CODES.has(countryIso) && waId.startsWith(dialFor(countryIso)) ? countryIso : detected };
}

/** "+968 9123 4567" style display; never used as an identifier. */
export function formatPhone(waId) {
  if (!isValidWaId(waId)) return waId ? `+${waId}` : '';
  const iso = countryForWaId(waId), dial = dialFor(iso) || '1';
  const national = waId.slice(dial.length);
  const groups = national.length <= 8 ? national.match(/.{1,4}/g) : [national.slice(0, national.length - 7), national.slice(-7, -4), national.slice(-4)];
  return `+${dial} ${groups.join(' ')}`;
}

/** WhatsApp does not deliver marketing templates to US numbers. +1 cannot tell US from Canada, so this warns. */
export const mayBeUsNumber = waId => String(waId || '').startsWith('1') && countryForWaId(waId) === 'US';
