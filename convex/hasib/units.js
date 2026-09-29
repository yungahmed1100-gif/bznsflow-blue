// Quantities stay in the item's stock unit; only compatible dimensions convert.
const UNITS = { g: ['mass', 1], kg: ['mass', 1000], ml: ['volume', 1], l: ['volume', 1000], piece: ['count', 1], unit: ['count', 1] };
export function convertQuantity(qty, from, to) {
  if (!Number.isFinite(qty) || qty <= 0 || qty > 1_000_000) return null;
  if (from === to) return qty;
  const a = UNITS[from], b = UNITS[to];
  if (!a || !b || a[0] !== b[0]) return null;
  const result = qty * a[1] / b[1];
  return result <= 1_000_000 ? Math.round(result * 1e9) / 1e9 : null;
}
