// Broadcast worker steps, invoked by the Convex scheduler through the Blue
// worker endpoint. One provider effect per invocation; ambiguous outcomes are
// recorded and never retried; only definite throttling rejections retry.
import { randomUUID } from 'node:crypto';
import { PilotError } from './config.js';
import { credentialContext, openToken } from './customer-meta.js';
import { inspectReviewConnection } from './review-api.js';
import { fetchMessagingAllowance, fetchTemplateState } from './templates.js';
import { templateComponents, templateSendResult } from '../../../config/layla-templates.js';

const GRAPH = { app: '1388038082832745', version: 'v25.0' };

/** Revalidate template approval, connection health and allowance before the first send. */
export async function runCampaignStart({ campaignId, env, store, fetcher, inspect = inspectReviewConnection, allowance = fetchMessagingAllowance, templateState = fetchTemplateState }) {
  const context = await store('start_context', { campaignId });
  if (!context) return { processed: false };
  if (env.BLUE_BROADCAST_ENABLED !== 'true') return store('start_result', { campaignId, ready: false, reason: 'broadcast_unavailable' });
  if (context.blocked) return store('start_result', { campaignId, ready: false, reason: context.blocked });
  let result = { ready: false, reason: 'start_checks_failed' };
  try {
    const c = { ...GRAPH, secret: env.LAYLA_META_APP_SECRET };
    const token = openToken(context.integration.credential, credentialContext(context.sessionHash, context.integration), env);
    const proof = await inspect({ c, integration: context.integration, token, fetcher });
    if (!proof.connected) result = { ready: false, reason: 'connection_not_ready' };
    else {
      const state = await templateState({ c, templateId: context.template.templateId, token, fetcher });
      if (state.status !== 'APPROVED' || state.category !== 'MARKETING') result = { ready: false, reason: 'template_not_approved' };
      else {
        const limit = await allowance({ c, integration: context.integration, token, fetcher });
        result = limit > 0 ? { ready: true, allowance: Number.isFinite(limit) ? limit : 1e9 } : { ready: false, reason: 'messaging_limit_unknown' };
      }
    }
  } catch (e) { result = { ready: false, reason: e instanceof PilotError ? e.code : 'start_checks_failed' }; }
  await store('start_result', { campaignId, ...result });
  return { processed: true, ready: result.ready };
}

export async function runCampaignSend({ jobId, env, store, fetcher, inspect = inspectReviewConnection }) {
  if (env.BLUE_BROADCAST_ENABLED !== 'true') throw new PilotError('broadcast_unavailable', 503);
  const job = await store('claim', { jobId, intent: randomUUID() });
  if (!job) return { processed: false };
  let started = false, outcome = { status: 'blocked', reason: 'connection_not_ready' };
  try {
    const c = { ...GRAPH, secret: env.LAYLA_META_APP_SECRET };
    const token = openToken(job.integration.credential, credentialContext(job.sessionHash, job.integration), env);
    const proof = await inspect({ c, integration: job.integration, token, fetcher });
    if (!proof.connected) outcome = { status: 'failed', reason: 'connection_not_ready', campaignBlock: 'connection_not_ready' };
    else if (await store('gate', { jobId: job.jobId, intent: job.intent })) {
      started = true;
      try {
        const response = await fetcher(`https://graph.facebook.com/${GRAPH.version}/${job.integration.phone}/messages`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: job.waId, type: 'template', biz_opaque_callback_data: job.intent,
            template: { name: job.template.name, language: { code: job.template.language }, components: templateComponents(job.template, job.parameters) } }) });
        let body = null;
        try { body = await response.json(); } catch { body = null; }
        outcome = templateSendResult(response.status, body);
      } catch { outcome = { status: 'ambiguous', reason: 'provider_outcome_unknown' }; }
    } else outcome = { status: 'blocked', reason: 'send_gate_closed' };
  } catch {
    outcome = started ? { status: 'ambiguous', reason: 'provider_outcome_unknown' } : { status: 'blocked', reason: 'connection_check_failed' };
  }
  await store('result', { jobId: job.jobId, intent: job.intent, ...outcome });
  return { processed: true, status: outcome.status };
}
