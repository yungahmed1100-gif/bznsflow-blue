// Browser client for the owner dashboard. Components call `dashboard(action)`
// and never build URLs, headers or tenant identifiers themselves.

import { ApiError, callApi } from '../api-client.js';

// Kept as a distinct name because components catch `DashboardError` by name.
export { ApiError as DashboardError };

// This surface threads its own CSRF token: the dashboard mounts without one and
// learns it from the first response, where the Layla pages receive it as a prop.
// That difference is why the shared client takes the token rather than owning it.
let csrfToken = '';
async function call(surface, body, { timeout = 30000 } = {}) {
  const payload = await callApi(`/api/layla-meta?surface=${surface}`, { body, csrf: csrfToken, timeout });
  if (payload?.csrfToken) csrfToken = payload.csrfToken;
  return payload;
}

export const loadOverview = () => call('dashboard');
export const dashboard = (action, body = {}, options) => call('dashboard', { action, ...body }, options);
/** Layla's existing conversational controls: activate, pause, takeover, resume, manual replies. */
export const messaging = (action, body = {}) => call('messaging', { action, ...body });
export const messagingState = () => call('messaging');
export const dashboardPath = lang => `${lang === 'ar' ? '' : '/en'}/layla/dashboard`;
export const setupPath = (lang, next) => `${lang === 'ar' ? '' : '/en'}/layla/setup${next ? `?next=${next}` : ''}`;
