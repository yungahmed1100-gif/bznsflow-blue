// Browser client for the owner dashboard. Components call `dashboard(action)`
// and never build URLs, headers or tenant identifiers themselves.

export class DashboardError extends Error {
  constructor(reason, status) { super(reason); this.reason = reason; this.status = status; }
}

let csrfToken = '';
async function call(surface, body, { timeout = 30000 } = {}) {
  const response = await fetch(`/api/layla-meta?surface=${surface}`, {
    method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(timeout),
    ...(body ? { headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify(body) } : {}),
  });
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (payload?.csrfToken) csrfToken = payload.csrfToken;
  if (!response.ok || !payload?.ok) {
    const reason = /^[a-z_]{1,60}$/.test(payload?.reason || '') ? payload.reason : 'unavailable';
    throw new DashboardError(reason, response.status);
  }
  return payload;
}

export const loadOverview = () => call('dashboard');
export const dashboard = (action, body = {}, options) => call('dashboard', { action, ...body }, options);
/** Layla's existing conversational controls: activate, pause, takeover, resume, manual replies. */
export const messaging = (action, body = {}) => call('messaging', { action, ...body });
export const messagingState = () => call('messaging');
export const dashboardPath = lang => `${lang === 'ar' ? '' : '/en'}/layla/dashboard`;
export const setupPath = (lang, next) => `${lang === 'ar' ? '' : '/en'}/layla/setup${next ? `?next=${next}` : ''}`;
