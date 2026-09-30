// Authenticated Hasib API: /api/layla-meta?surface=hasib
// Same boundary as the Layla dashboard: exact Blue host and origin, the
// __Host-blue_account session, CSRF double-submit. The tenant is always the
// signed-in account's saved draft; request bodies never name an account.
import { hasibStore } from '../convex.js';
import { blueAccount, blueAuthStore, blueAccountsAvailable } from '../blue-auth.js';
import { ensureCsrfToken, verifyCsrf } from '../cookies.js';
import { readBody, send, sendPilotError } from '../http.js';
import { PilotError } from '../layla/config.js';
import { dashboardAvailable } from '../layla/dashboard-api.js';
import { hasibArgs } from './validate.js';
import { isHasibFounder } from './founder.js';
import { hasibPreviewResponse } from './preview.js';

const HOST = 'bznsflow-blue.vercel.app', ORIGIN = `https://${HOST}`;
const LIMITS = { items_import: 60000, item_save: 40000, order_create: 40000, stock_move: 16000, repair_update: 12000 };
const DEFAULT_BODY_LIMIT = 6000;

export const hasibAvailable = (env = process.env) => dashboardAvailable(env) && env.BLUE_HASIB_ENABLED === 'true';

export async function sendTeamInvitation({ member, env, fetcher = fetch }) {
  if (!blueAccountsAvailable(env) || !member?.email) throw new PilotError('invite_send_failed', 502);
  const response = await fetcher('https://api.resend.com/emails', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: {
    Authorization: `Bearer ${env.BLUE_RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `ascend-invite/${member.id}/${member.resentAt || member.invitedAt}`,
  }, body: JSON.stringify({ from: env.BLUE_AUTH_FROM, to: [member.email], subject: 'You have been invited to join a BznsFlow team',
    text: `You have been invited to join your team's BznsFlow dashboard. Sign in with this email at https://bznsflow-blue.vercel.app/en/layla/dashboard — your invitation activates only after the email-code sign-in is verified.\n\nتمت دعوتك للانضمام إلى لوحة فريقك على BznsFlow. سجّل الدخول بهذا البريد عبر https://bznsflow-blue.vercel.app/layla/dashboard، ولن تتفعّل الدعوة إلا بعد التحقق من رمز البريد.` }) });
  if (!response.ok || typeof (await response.json())?.id !== 'string') throw new PilotError('invite_send_failed', 502);
}

export function createHasibApi({ env = process.env, fetcher = fetch, accounts = blueAuthStore({ env, fetcher }), store = hasibStore({ env, fetcher }) } = {}) {
  return async (req, res) => {
    try {
      if (req.headers?.host !== HOST || (req.method !== 'GET' && req.headers?.origin !== ORIGIN)) throw new PilotError('origin', 403);
      if (!['GET', 'POST'].includes(req.method)) throw new PilotError('method', 405);
      if (!hasibAvailable(env)) throw new PilotError('hasib_unavailable', 503);
      const account = await blueAccount(req, accounts);
      if (!account) throw new PilotError('sign_in_required', 401);
      const sessionHash = account.workspaceDraftHash || account.draftHash;
      if (!sessionHash) throw new PilotError('setup_required', 409);
      const url = new URL(req.url || '/api/layla-meta', ORIGIN);
      const csrfToken = ensureCsrfToken(req, res);
      const reply = value => send(res, 200, { ok: true, ...value, csrfToken }, { vary: 'Cookie' });

      if (req.method === 'GET') {
        const previewPack = url.searchParams.get('previewIndustry');
        if (previewPack) {
          if (!isHasibFounder(account)) throw new PilotError('preview_forbidden', 403);
          return reply(hasibPreviewResponse(previewPack, 'overview'));
        }
        return reply(await store('overview', { sessionHash, actorAccountId: account.id }));
      }
      if (!verifyCsrf(req)) throw new PilotError('csrf', 403);
      const body = readBody(req);
      const action = typeof body.action === 'string' ? body.action : '';
      if (JSON.stringify(body).length > (LIMITS[action] || DEFAULT_BODY_LIMIT)) throw new PilotError('body_too_large', 413);
      if (body.previewIndustry !== undefined) {
        if (!isHasibFounder(account)) throw new PilotError('preview_forbidden', 403);
        return reply(hasibPreviewResponse(body.previewIndustry, action));
      }
      if (action === 'settings_update' && body.packId !== undefined && !isHasibFounder(account)) throw new PilotError('industry_profile_required', 409);
      const result = await store(action, { sessionHash, actorAccountId: account.id, ...hasibArgs(action, body) });
      if (['team_invite', 'team_resend'].includes(action)) {
        try { await sendTeamInvitation({ member: result, env, fetcher }); }
        catch { return reply({ ...result, invitationDelivery: 'failed' }); }
        return reply({ ...result, invitationDelivery: 'sent' });
      }
      return reply(result);
    } catch (e) {
      return sendPilotError(res, e, { fallback: 'hasib_unavailable', vary: 'Cookie' });
    }
  };
}
