// One browser client for the Layla/Blue API surfaces.
//
// Five places had written their own: src/lib/dashboard/api.js and the four
// Layla* pages. Each rebuilt the same request — same-origin credentials,
// `cache: 'no-store'`, a CSRF header on writes, an abort timeout — and each
// re-derived the reason guard below. The guard in particular appeared six times,
// which is six chances for one of them to forward whatever the server said
// straight into the UI.

/** The shape a reason code must have before it may be shown or matched on. */
export const REASON_CODE = /^[a-z_]{1,60}$/;

/**
 * Narrow an arbitrary value to a reason code.
 *
 * The server answers failures with a short machine code. Anything else — an HTML
 * error page, a proxy's prose, an exception message — must never reach the UI as
 * though it were one, because the pages map these codes to translated text and
 * an unmapped value renders raw.
 *
 * @param {unknown} value
 * @param {string} [fallback]
 * @returns {string}
 */
export const reasonOf = (value, fallback = 'unavailable') =>
  REASON_CODE.test(String(value ?? '')) ? String(value) : fallback;

/** A failed API call, carrying the reason code and the HTTP status. */
export class ApiError extends Error {
  constructor(reason, status) { super(reason); this.name = 'ApiError'; this.reason = reason; this.status = status; }
}

/**
 * Call a JSON API endpoint.
 *
 * GET when `body` is omitted, POST when it is present — the surfaces all use
 * that convention, so passing a body is the only signal needed.
 *
 * @param {string} url
 * @param {object} [options]
 * @param {object|null} [options.body] present ⇒ POST
 * @param {string} [options.csrf] CSRF token, sent on writes only
 * @param {number} [options.timeout] ms
 * @param {string} [options.fallback] reason to use when the server's is unusable
 * @returns {Promise<object>} the parsed, `ok: true` payload
 * @throws {ApiError}
 */
export async function callApi(url, { body = null, csrf = '', timeout = 30000, fallback = 'unavailable' } = {}) {
  let response;
  try {
    response = await fetch(url, {
      method: body ? 'POST' : 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeout),
      ...(body ? { headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify(body) } : {}),
    });
  } catch {
    // A network failure or an abort. There is no server reason to report, and
    // the exception's own message is not one.
    throw new ApiError(fallback, 0);
  }

  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }

  if (!response.ok || !payload?.ok) throw new ApiError(reasonOf(payload?.reason, fallback), response.status);
  return payload;
}
