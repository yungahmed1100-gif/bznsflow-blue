// Locale-aware dates in the business timezone. Digits stay Latin in Arabic UI
// (Gulf business convention for numbers, prices and times).
const DAY = 86400000;
const locale = lang => (lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB');
const safeZone = tz => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return tz; } catch { return undefined; } };

export function formatTime(ms, lang, timezone) {
  if (!ms) return '';
  return new Intl.DateTimeFormat(locale(lang), { hour: 'numeric', minute: '2-digit', timeZone: safeZone(timezone) }).format(ms);
}
export function formatDateTime(ms, lang, timezone) {
  if (!ms) return '';
  return new Intl.DateTimeFormat(locale(lang), { dateStyle: 'medium', timeStyle: 'short', timeZone: safeZone(timezone) }).format(ms);
}
function dayKey(ms, timezone) {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: safeZone(timezone) }).format(ms);
}
/** "Today" / "Yesterday" / a date, as chat day separators and list timestamps. */
export function formatDay(ms, lang, timezone, now = Date.now()) {
  const key = dayKey(ms, timezone);
  if (key === dayKey(now, timezone)) return lang === 'ar' ? 'اليوم' : 'Today';
  if (key === dayKey(now - DAY, timezone)) return lang === 'ar' ? 'أمس' : 'Yesterday';
  return new Intl.DateTimeFormat(locale(lang), { day: 'numeric', month: 'short', year: now - ms > 300 * DAY ? 'numeric' : undefined, timeZone: safeZone(timezone) }).format(ms);
}
export function listTimestamp(ms, lang, timezone, now = Date.now()) {
  return dayKey(ms, timezone) === dayKey(now, timezone) ? formatTime(ms, lang, timezone) : formatDay(ms, lang, timezone, now);
}
export const sameDay = (a, b, timezone) => dayKey(a, timezone) === dayKey(b, timezone);
export function browserTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}
export function timezoneOptions(current) {
  let zones = [];
  try { zones = Intl.supportedValuesOf('timeZone'); } catch { zones = ['Asia/Muscat', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Qatar', 'Asia/Kuwait', 'Asia/Bahrain', 'Africa/Cairo', 'Europe/London', 'UTC']; }
  return [...new Set([current, ...zones].filter(Boolean))];
}
/** Local "YYYY-MM-DDTHH:mm" for <input type="datetime-local"> in a zone. */
export function localInputValue(ms, timezone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: safeZone(timezone), hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(ms).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${String(Number(p.hour) % 24).padStart(2, '0')}:${p.minute}`;
}
export const initials = name => {
  const words = String(name || '').replace(/^\+/, '').trim().split(/\s+/).filter(Boolean);
  if (!words.length || /^\d/.test(words[0])) return '#';
  return words.slice(0, 2).map(w => [...w][0]).join('').toUpperCase();
};
