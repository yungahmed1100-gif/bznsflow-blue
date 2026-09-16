// Server-to-server clients for the dashboard and campaign Convex routes.
//
// The implementation that used to live here — `convexClient` — was the most
// general of the six copies in the codebase, so it was promoted into
// ../convex.js and the other five now share it. This file re-exports the two
// routes it owns so its callers do not have to care where the client is built.
export { dashboardStore, campaignStore } from '../convex.js';
