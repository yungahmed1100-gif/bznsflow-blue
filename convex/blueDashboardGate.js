// Which plan or role a dashboard operation needs. Pure, so the refusal a Catalyst
// owner or an employee receives is tested without a Convex deployment.

export const CAMPAIGN_OPERATIONS = Object.freeze(['templates', 'replace_templates', 'campaign_preview', 'campaign_create', 'campaigns', 'campaign_detail', 'campaign_cancel']);

/**
 * @param {string} operation the requested dashboard operation
 * @param {Record<string, boolean>} capabilities from capabilitiesFor(plan)
 * @param {string} role the actor's workspace role ('manager' or 'employee')
 * @returns {null | 'plan_required' | 'manager_required'} null when the operation may run
 */
export function dashboardGate(operation, capabilities, role) {
  const needs = operation === 'import_contacts' ? 'imports' : CAMPAIGN_OPERATIONS.includes(operation) ? 'broadcasts' : null;
  if (!needs) return null;
  if (role !== 'manager') return 'manager_required';
  return capabilities[needs] ? null : 'plan_required';
}
