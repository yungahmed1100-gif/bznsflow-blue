// Browser client for the owner dashboard. Components call `dashboard(action)`
// and never build URLs, headers or tenant identifiers themselves.

import { ApiError, callApi } from '../api-client.js';

// Kept as a distinct name because components catch `DashboardError` by name.
export { ApiError as DashboardError };

// This surface threads its own CSRF token: the dashboard mounts without one and
// learns it from the first response, where the Layla pages receive it as a prop.
// That difference is why the shared client takes the token rather than owning it.
let csrfToken = '';
async function call(surface, body, { timeout = 30000, query = {} } = {}) {
  const params = new URLSearchParams({ ...query, surface });
  const payload = await callApi(`/api/layla-meta?${params}`, { body, csrf: csrfToken, timeout });
  if (payload?.csrfToken) csrfToken = payload.csrfToken;
  return payload;
}

export const loadOverview = () => call('dashboard');
export const dashboard = (action, body = {}, options) => call('dashboard', { action, ...body }, options);
/** Layla's existing conversational controls: activate, pause, takeover, resume, manual replies. */
export const messaging = async (action, body = {}) => {
  // The first call only fetches a CSRF token; the channel picks whose state it reads.
  if (!csrfToken) await call('messaging', undefined, { query: body.channel === 'instagram' ? { channel: 'instagram' } : {} });
  return call('messaging', { action, ...body });
};
export const messagingState = () => call('messaging');
export const dashboardPath = lang => `${lang === 'ar' ? '' : '/en'}/layla/dashboard`;
export const setupPath = (lang, next) => `${lang === 'ar' ? '' : '/en'}/layla/setup${next ? `?next=${next}` : ''}`;
/** Hasib (orders, stock, payments) shares this client's session and CSRF token. */
export const loadHasib = () => call('hasib');
export const hasib = (action, body = {}, options) => call('hasib', { action, ...body }, options);
