// Repair workshop statuses. Parts leave stock at `ready` (the linked order is
// confirmed); collection completes the order; cancelling cancels it.
const TRANSITIONS = {
  received: ['diagnosing', 'cancelled'],
  diagnosing: ['waiting_parts', 'repairing', 'ready', 'cancelled'],
  waiting_parts: ['repairing', 'cancelled'],
  repairing: ['ready', 'cancelled'],
  ready: ['collected', 'cancelled'],
  collected: [],
  cancelled: [],
};
export const REPAIR_STATUSES = Object.freeze(Object.keys(TRANSITIONS));
/** While a ticket is in these states its quote and parts can still change. */
export const REPAIR_EDITABLE = Object.freeze(['received', 'diagnosing', 'waiting_parts', 'repairing']);
export const isRepairStatus = s => Object.hasOwn(TRANSITIONS, s);
export const repairNext = s => (isRepairStatus(s) ? [...TRANSITIONS[s]] : []);
export const canRepairTransition = (from, to) => isRepairStatus(from) && TRANSITIONS[from].includes(to);
/** The linked order status each repair status requires, if it changes. */
export const ORDER_FOR_REPAIR = Object.freeze({ ready: 'confirmed', collected: 'completed', cancelled: 'cancelled' });
