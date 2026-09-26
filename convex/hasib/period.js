// Business-day periods. Days start at midnight in the business's IANA zone,
// so "today" in Muscat is 20:00–20:00 UTC, never UTC midnight.
import { formatLocal, zonedLocalToUtc, validTimezone } from '../../src/lib/timezone.js';

export const PERIODS = ['today', '7d', '30d', 'month', 'prev_month'];
export const DEFAULT_TIMEZONE = 'Asia/Muscat';
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const timezoneOr = tz => validTimezone(tz) ? tz : DEFAULT_TIMEZONE;
export const businessDate = (ms, tz) => formatLocal(ms, tz).slice(0, 10);

export function validDate(date) {
  const m = typeof date === 'string' && date.match(DATE);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}
export function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
/** Midnight of a business date; zones whose midnight is skipped by DST start at 01:00. */
export function dayStart(date, tz) {
  try { return zonedLocalToUtc(`${date}T00:00`, tz); } catch { return zonedLocalToUtc(`${date}T01:00`, tz); }
}
/** Noon of a business date: a stable instant inside that day for records dated by the owner. */
export const dayNoon = (date, tz) => zonedLocalToUtc(`${date}T12:00`, tz);

export function periodRange(period, now, tz) {
  const today = businessDate(now, tz), first = `${today.slice(0, 8)}01`;
  const span = (fromDate, toDate) => ({ period, from: dayStart(fromDate, tz), to: dayStart(toDate, tz), fromDate, toDate: addDays(toDate, -1) });
  const nextMonth = date => { const [y, m] = date.split('-').map(Number); return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10); };
  const prevMonth = date => { const [y, m] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10); };
  if (period === 'today') return span(today, addDays(today, 1));
  if (period === '7d') return span(addDays(today, -6), addDays(today, 1));
  if (period === '30d') return span(addDays(today, -29), addDays(today, 1));
  if (period === 'month') return span(first, nextMonth(first));
  if (period === 'prev_month') return span(prevMonth(first), first);
  throw Object.assign(new Error('invalid_period'), { reason: 'invalid_period' });
}
