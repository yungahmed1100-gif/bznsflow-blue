// The visit date a captured "preferred time" points to, read deterministically from
// when the patient said it. Only clear dates are resolved; anything else stays blank
// for the owner to fill in.
import { businessDate, addDays, validDate } from '../../../convex/hasib/period.js';

const WEEKDAYS = [
  ['sunday', 'sun', 'الاحد'], ['monday', 'mon', 'الاثنين'], ['tuesday', 'tue', 'tues', 'الثلاثاء'], ['wednesday', 'wed', 'الاربعاء'],
  ['thursday', 'thu', 'thur', 'thurs', 'الخميس'], ['friday', 'fri', 'الجمعه'], ['saturday', 'sat', 'السبت'],
];
const normal = text => String(text || '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
const has = (text, word) => new RegExp(`(^|[^a-z\\u0600-\\u06ff])${word}($|[^a-z\\u0600-\\u06ff])`).test(text);

/**
 * @param {string} value the captured preferred time, e.g. "tomorrow 5pm", "2027-01-15", "الخميس"
 * @param {number} saidAt when the patient said it (ms)
 * @param {string} timezone the business time zone
 * @returns {string} YYYY-MM-DD, or '' when the date isn't clear
 */
export function visitDateFrom(value, saidAt, timezone) {
  const text = normal(value);
  if (!text || !Number.isFinite(saidAt)) return '';
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return validDate(iso[1]) ? iso[1] : '';
  const base = businessDate(saidAt, timezone);
  const dm = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (dm) {
    const year = dm[3] ? (dm[3].length === 2 ? `20${dm[3]}` : dm[3]) : base.slice(0, 4);
    let date = `${year}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`;
    if (!dm[3] && date < base) date = `${Number(year) + 1}${date.slice(4)}`;
    return validDate(date) ? date : '';
  }
  if (has(text, 'day after tomorrow') || text.includes('بعد بكره')) return addDays(base, 2);
  if (['tomorrow', 'بكره', 'بكرا', 'باكر', 'غدا'].some(w => has(text, w))) return addDays(base, 1);
  if (['today', 'tonight', 'اليوم', 'الليله'].some(w => has(text, w))) return base;
  const day = WEEKDAYS.findIndex(names => names.some(n => has(text, n)));
  if (day >= 0) {
    const today = new Date(`${base}T12:00:00Z`).getUTCDay();
    return addDays(base, ((day - today + 7) % 7) || 7);
  }
  return '';
}
