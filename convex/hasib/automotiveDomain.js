import { fail } from './shared.js';

export const DAY = 86400000;
export const REQUEST_STATES = ['new', 'assigned', 'booked', 'declined', 'withdrawn'];
export const APPOINTMENT_STATES = ['scheduled', 'confirmed', 'checked_in', 'cancelled', 'missed'];
export const WORK_STATES = ['intake', 'inspection', 'awaiting_approval', 'approved', 'in_progress', 'quality_check', 'ready', 'collected', 'closed', 'cancelled'];
export const TERMINAL_WORK = new Set(['closed', 'cancelled']);
export const POWERTRAINS = ['petrol', 'diesel', 'hybrid', 'electric', 'other'];
export const INSPECTION_CONDITIONS = ['ok', 'monitor', 'attention', 'not_checked'];
export const SERVICE_CATEGORIES = ['maintenance', 'repair', 'inspection', 'tyres', 'body', 'electrical', 'other'];
export const EVIDENCE = ['in_person', 'phone', 'whatsapp', 'instagram', 'email', 'signed'];

export const publicAutomotiveRow = row => {
  const { _id, _seq, table, accountId, requestId, ...rest } = row;
  return { id: _id, ...rest };
};
export const publicAutomotiveWork = row => ({
  ...publicAutomotiveRow(row),
  approvedEstimateVersion: row.approvedEstimateVersion ?? null,
  orderId: row.orderId ?? null,
});
export const publicTechnicianWork = row => {
  const { contactId, assignedAdvisorAccountId, ...value } = publicAutomotiveWork(row);
  return value;
};
export const automotiveInteger = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;
export const isAutomotiveManager = actor => actor.role === 'manager';
export const isAutomotiveTechnician = actor => actor.role === 'employee' && actor.operationalRole === 'technician';
export const isAutomotiveAdvisor = actor => isAutomotiveManager(actor) || actor.operationalRole !== 'technician';
export const automotiveVersionError = (row, args, name) => !row ? fail(`${name}_not_found`) : row.version !== args.version ? fail(`${name}_conflict`) : null;

export const AUTOMOTIVE_READS = new Set([
  'automotive_overview', 'automotive_insights', 'automotive_contacts', 'automotive_vehicles', 'automotive_bays',
  'automotive_services', 'automotive_requests', 'automotive_appointments', 'automotive_work_orders',
  'automotive_work_order', 'automotive_estimates', 'automotive_labor_entries', 'automotive_parts',
]);
export const AUTOMOTIVE_WRITES = new Set([
  'automotive_vehicle_save', 'automotive_bay_save', 'automotive_service_save', 'automotive_request_save',
  'automotive_request_status', 'automotive_appointment_save', 'automotive_appointment_status',
  'automotive_work_order_save', 'automotive_work_order_status', 'automotive_inspection_save',
  'automotive_estimate_save', 'automotive_estimate_status', 'automotive_approval_record',
  'automotive_labor_start', 'automotive_labor_stop', 'automotive_part_save', 'automotive_part_status',
  'automotive_quality_save', 'automotive_experience_save',
]);
