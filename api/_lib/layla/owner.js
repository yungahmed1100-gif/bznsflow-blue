import { hashToken } from '../auth.js';
import { parseCookies, SESSION_COOKIE, verifyCsrf } from '../cookies.js';
import { getSession } from '../db.js';
import { PilotError } from './config.js';
export async function owner(req, c, sessionLookup = getSession) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) throw new PilotError('sign_in_required', 401);
  if (!c.owner) throw new PilotError('owner_configuration_missing', 503);
  let session;
  try { session = await sessionLookup(hashToken(token)); } catch { throw new PilotError('session_unavailable', 503); }
  if (!session?.ok) throw new PilotError('sign_in_required', 401);
  if (session.account?.id !== c.owner) throw new PilotError('owner_only', 403);
  if (req.method !== 'GET') {
    // Strict same-origin for this privileged surface; shared public-chat allowlists do not apply.
    let origin;
    try { origin = new URL(req.headers?.origin); } catch { throw new PilotError('origin', 403); }
    if (origin.host !== req.headers?.host || !['https:','http:'].includes(origin.protocol)) throw new PilotError('origin', 403);
    if (origin.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) throw new PilotError('origin', 403);
    if (!verifyCsrf(req)) throw new PilotError('csrf', 403);
  }
  return session.account;
}
