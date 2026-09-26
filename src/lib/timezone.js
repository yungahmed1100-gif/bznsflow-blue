// Business-timezone scheduling without a date library. Local wall-clock input
// ("2026-09-20T10:30") is converted to a UTC instant using the IANA zone.

export function validTimezone(timezone) {
  if (typeof timezone !== 'string' || !timezone || timezone.length > 64) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }); return true; } catch { return false; }
}

function offsetAt(ms, timezone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: timezone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(ms).map(p => [p.type, p.value]));
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute), Number(parts.second));
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/**
 * @returns {number} epoch milliseconds
 * @throws {Error} 'invalid_schedule' for malformed input or a wall-clock time skipped by DST
 */
export function zonedLocalToUtc(local, timezone) {
  const m = typeof local === 'string' && local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m || !validTimezone(timezone)) throw new Error('invalid_schedule');
  const [, y, mo, d, h, mi] = m.map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let utc = wall - offsetAt(wall, timezone);
  utc = wall - offsetAt(utc, timezone);
  if (formatLocal(utc, timezone) !== local) throw new Error('invalid_schedule');
  return utc;
}

export function formatLocal(ms, timezone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: timezone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(ms).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${String(Number(p.hour) % 24).padStart(2, '0')}:${p.minute}`;
}
