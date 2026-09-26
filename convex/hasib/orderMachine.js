// The order lifecycle. Stock leaves the shelf when an order is confirmed and
// comes back when a confirmed order is cancelled or returned — never twice.
const TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['ready', 'out_for_delivery', 'completed', 'cancelled'],
  ready: ['out_for_delivery', 'completed', 'cancelled'],
  out_for_delivery: ['delivered', 'failed_delivery'],
  failed_delivery: ['out_for_delivery', 'cancelled'],
  delivered: ['returned'],
  completed: ['returned'],
  cancelled: [],
  returned: [],
};
export const STATUSES = Object.freeze(Object.keys(TRANSITIONS));
export const TERMINAL = Object.freeze(STATUSES.filter(s => !TRANSITIONS[s].length));
const DEDUCTED = new Set(['confirmed', 'ready', 'out_for_delivery', 'failed_delivery', 'delivered', 'completed']);

export const isStatus = s => Object.hasOwn(TRANSITIONS, s);
export const nextStatuses = s => (isStatus(s) ? [...TRANSITIONS[s]] : []);
export const canTransition = (from, to) => isStatus(from) && TRANSITIONS[from].includes(to);
export const deductsStock = s => DEDUCTED.has(s);

/** -1 take stock, +1 return stock, 0 no movement. */
export function stockEffect(from, to) {
  const before = deductsStock(from), after = deductsStock(to);
  return before === after ? 0 : after ? -1 : 1;
}
