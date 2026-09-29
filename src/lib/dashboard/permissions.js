// Which dashboard controls to show. The server enforces the same rules
// (convex/blueDashboardGate.js, blueDashboardState.js); showing a control the
// server will refuse only produces an error, so every view asks here.

/**
 * @param {{ capabilities?: Record<string, boolean>, workspaceRole?: string } | null | undefined} overview the dashboard overview
 * @returns {{ canExport: boolean, canImport: boolean, canBroadcast: boolean, canDeleteCustomer: boolean }}
 */
export function dashboardPermissions(overview) {
  const caps = overview?.capabilities || {};
  const manager = (overview?.workspaceRole || 'manager') === 'manager';
  return {
    canExport: !!caps.exports && manager,
    canImport: !!caps.imports && manager,
    canBroadcast: !!caps.broadcasts && manager,
    canDeleteCustomer: !!caps.customerDelete && manager,
  };
}
