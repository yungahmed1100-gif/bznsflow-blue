import { PilotError } from './layla/config.js';

/**
 * The response object these handlers actually receive.
 *
 * Not `http.ServerResponse`: Vercel adds `status()` on top of it, and the JSDoc
 * here claimed the bare Node type — so every `res.status(...)` in this file was
 * annotated as a call to a method that does not exist.
 *
 * @typedef {import('http').ServerResponse & { status(code: number): unknown }} Res
 */

// Shared request/response plumbing for the serverless functions.
//
// `send`, `readBody` and `limits` were each copy-pasted into three handlers,
// with the copies already diverging — one had `Vary: Cookie`, one read its env
// inline instead of through a function. Three copies of a response helper is
// three places to remember when a header changes.
//
// api/chat.js keeps its own `reply()` wrapper on top of `send`: that one is
// genuinely different, shaping every response to the widget's invariant that a
// `reply` string is present at every status code.

/**
 * Write a JSON response.
 *
 * `Cache-Control: no-store` is unconditional. Every endpoint here is either
 * per-visitor or state-changing, and a cached response on any of them is a bug —
 * a shared cache serving one visitor's chat reply or account to another.
 *
 * @param {Res} res
 * @param {number} status
 * @param {object} payload
 * @param {{ vary?: string }} [options] `Vary` for responses that differ by cookie
 */
export function send(res, status, payload, options = {}) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (options.vary) res.setHeader('Vary', options.vary);
  res.end(JSON.stringify(payload));
}

/**
 * Send a 302 to a same-site path.
 *
 * The OAuth handlers answer with a redirect rather than JSON: they are reached
 * by a top-level browser navigation, not by fetch, so there is nobody to read a
 * response body. `no-store` matters more here than elsewhere — these responses
 * carry Set-Cookie, and a cached 302 would hand one visitor's session to the
 * next.
 *
 * @param {Res} res
 * @param {string} location a path on this site, never a caller-supplied URL
 */
export function redirect(res, location) {
  res.status(302);
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}

/**
 * Read a JSON body.
 *
 * Vercel parses JSON bodies automatically, but tolerate a raw string too: a
 * client that sends the right bytes with the wrong Content-Type should still be
 * understood, and a malformed body should read as empty rather than throw
 * inside the handler.
 *
 * @returns {object} always an object, never null
 */
export function readBody(req) {
  const b = req?.body;
  if (!b) return {};
  if (typeof b === 'string') {
    try {
      return JSON.parse(b);
    } catch {
      return {};
    }
  }
  return typeof b === 'object' ? b : {};
}

/**
 * Answer a failed Layla/Blue request.
 *
 * This block was written out by hand at eleven call sites, differing only in the
 * fallback reason and whether `Vary: Cookie` was set — so eleven places had to
 * agree, forever, on how a failure is shaped.
 *
 * `instanceof PilotError` is the load-bearing part and not a formality. A
 * PilotError carries a reason that was *decided* — a machine code the client is
 * meant to read. Anything else arrived from the runtime, and Node's own errors
 * carry a `.code` too (`ABORT_ERR`, `ENOTFOUND`, `ECONNREFUSED`): duck-typing on
 * `.code` would forward those to the browser as if they were answers.
 *
 * @param {Res} res
 * @param {unknown} error
 * @param {{ fallback?: string, vary?: string }} [options]
 */
export function sendPilotError(res, error, { fallback = 'unavailable', vary } = {}) {
  const decided = error instanceof PilotError;
  return send(
    res,
    decided ? error.status : 503,
    { ok: false, reason: decided ? error.code : fallback },
    vary ? { vary } : {},
  );
}

/**
 * Read a numeric env limit at request time.
 *
 * Deliberately not a module-level constant: those are frozen at cold start, so
 * they silently ignore an environment change until the instance recycles, and
 * they cannot be exercised by a test.
 *
 * @param {string} name env var
 * @param {number} fallback used when unset, empty or not a finite number
 */
export function limit(name, fallback) {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}
