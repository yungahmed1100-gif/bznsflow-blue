// Stock policy. `warn` lets a sale go through and flags the shortfall (owners
// often sell before recording a delivery from the supplier); `block` refuses.
export const STOCK_POLICIES = ['warn', 'block'];
export const MOVE_REASONS = ['sale', 'sale_reversal', 'stock_in', 'adjustment', 'damage', 'return', 'count', 'opening', 'waste', 'prep', 'prep_output'];

export function applyStockPolicy({ onHand, delta, policy }) {
  const next = onHand + delta, short = delta < 0 && next < 0;
  if (short && policy === 'block') return { ok: false, reason: 'insufficient_stock', onHand, short };
  return { ok: true, onHand: next, short };
}
