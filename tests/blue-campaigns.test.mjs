import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sanitizeTemplate, renderTemplate, templateComponents, resolveParameters, cleanParameter, templateSendResult, messagingAllowance, validMapping } from '../config/layla-templates.js';
import { zonedLocalToUtc, validTimezone } from '../api/_lib/layla/timezone.js';
import { runCampaignSend, runCampaignStart } from '../api/_lib/layla/campaign-worker.js';
import { fetchApprovedTemplates } from '../api/_lib/layla/templates.js';
import { sealToken, credentialContext } from '../api/_lib/layla/customer-meta.js';
import { MAX_RECIPIENTS, MAX_ATTEMPTS, RETRY_BACKOFF_MS } from '../convex/blueCampaignState.js';
import { blueHarness, seedTenant } from './helpers/blue-tenant.mjs';

const approved = { id: '111', name: 'autumn_offer', language: 'en', status: 'APPROVED', category: 'MARKETING', parameter_format: 'POSITIONAL', components: [
  { type: 'HEADER', format: 'TEXT', text: 'Hi {{1}}' },
  { type: 'BODY', text: 'Hello {{1}}, enjoy {{2}} off this week.', example: { body_text: [['Sara', '10%']] } },
  { type: 'FOOTER', text: 'Reply STOP to opt out' },
  { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Stop promotions' }, { type: 'URL', text: 'Shop', url: 'https://example.com' }] }] };

test('only approved marketing templates with plain text parameters are sendable', () => {
  const t = sanitizeTemplate(approved);
  assert.equal(t.sendable, true);
  assert.deepEqual(t.variables, [{ key: '1', component: 'header' }, { key: '1', component: 'body', example: 'Sara' }, { key: '2', component: 'body', example: '10%' }]);
  const cases = [
    [{ ...approved, category: 'UTILITY' }, 'not_marketing'], [{ ...approved, status: 'PAUSED' }, 'not_approved'],
    [{ ...approved, components: [{ type: 'HEADER', format: 'IMAGE' }, approved.components[1]] }, 'media_header'],
    [{ ...approved, components: [approved.components[1], { type: 'BUTTONS', buttons: [{ type: 'URL', text: 'Go', url: 'https://x.com/{{1}}' }] }] }, 'dynamic_button'],
    [{ ...approved, components: [{ type: 'CAROUSEL' }, approved.components[1]] }, 'unsupported_component'],
    [{ ...approved, components: [{ type: 'BODY', text: 'Hi {{2}}' }] }, 'invalid_variables'],
  ];
  for (const [raw, reason] of cases) assert.deepEqual([sanitizeTemplate(raw).sendable, sanitizeTemplate(raw).unsupportedReason], [false, reason]);
  const named = sanitizeTemplate({ ...approved, parameter_format: 'NAMED', components: [{ type: 'BODY', text: 'Hi {{first_name}}', example: { body_text_named_params: [{ param_name: 'first_name', example: 'Omar' }] } }] });
  assert.deepEqual(named.variables, [{ key: 'first_name', component: 'body', example: 'Omar' }]);
  assert.deepEqual(templateComponents(named, [{ key: 'first_name', component: 'body', text: 'Omar' }]), [{ type: 'body', parameters: [{ type: 'text', text: 'Omar', parameter_name: 'first_name' }] }]);
});

test('parameters are validated, resolved per recipient and rendered for the thread', () => {
  const t = sanitizeTemplate(approved);
  const mapping = [{ key: 'body:1', source: 'contact_name', value: 'there' }, { key: 'body:2', source: 'static', value: '15%' }];
  assert.equal(validMapping(t, mapping), false, 'header variable must also be mapped');
  const full = [...mapping, { key: 'header:1', source: 'static', value: 'friend' }];
  assert.equal(validMapping(t, full), true);
  assert.equal(validMapping(t, [...full, { key: 'body:2', source: 'static', value: 'dup' }]), false, 'duplicate mapping');
  assert.equal(validMapping(t, [{ key: 'body:2', source: 'script', value: 'x' }, ...full.slice(0, 1), full[2]]), false);
  // Newlines and tabs become spaces; runs longer than four spaces are shortened.
  assert.equal(cleanParameter('line one\nline two\t  x      y'), 'line one line two   x    y');
  assert.equal(cleanParameter('   '), null);
  const { parameters, missing } = resolveParameters(t, [{ key: 'header:1', source: 'contact_name', value: 'there' }, { key: 'body:1', source: 'contact_name', value: 'there' }, { key: 'body:2', source: 'field:budget', value: '' }], { ownerName: 'Aisha', fields: [] });
  assert.deepEqual(missing, ['body:2']);
  assert.equal(parameters[0].text, 'Aisha');
  const rendered = renderTemplate(t, [{ key: '1', component: 'header', text: 'Aisha' }, { key: '1', component: 'body', text: 'Aisha' }, { key: '2', component: 'body', text: '15%' }]);
  assert.equal(rendered, 'Hi Aisha\n\nHello Aisha, enjoy 15% off this week.\n\nReply STOP to opt out');
});

test('provider responses: accepted, definite throttling (retry), definite rejection, ambiguous and campaign-blocking errors', () => {
  assert.deepEqual(templateSendResult(200, { messages: [{ id: 'wamid.1', message_status: 'accepted' }] }), { status: 'submitted', providerId: 'wamid.1' });
  assert.equal(templateSendResult(200, {}).status, 'ambiguous');
  assert.equal(templateSendResult(500, { error: { code: 131000 } }).status, 'ambiguous');
  assert.equal(templateSendResult(400, null).status, 'ambiguous');
  assert.deepEqual(templateSendResult(429, { error: { code: 130429 } }), { status: 'retry', errorCode: 130429, reason: 'provider_throttled' });
  assert.deepEqual(templateSendResult(400, { error: { code: 131026 } }), { status: 'failed', errorCode: 131026, reason: 'provider_rejected' });
  assert.equal(templateSendResult(400, { error: { code: 132015 } }).campaignBlock, 'template_paused');
  assert.equal(messagingAllowance('TIER_250'), 250);
  assert.equal(messagingAllowance('TIER_UNLIMITED'), Infinity);
  assert.equal(messagingAllowance(undefined), 0);
});

test('scheduling converts business-local time to UTC and rejects invalid zones or DST gaps', () => {
  assert.equal(new Date(zonedLocalToUtc('2026-09-20T10:30', 'Asia/Muscat')).toISOString(), '2026-09-20T06:30:00.000Z');
  assert.equal(new Date(zonedLocalToUtc('2026-12-01T09:00', 'Africa/Cairo')).toISOString(), '2026-12-01T07:00:00.000Z');
  assert.throws(() => zonedLocalToUtc('2026-03-08T02:30', 'America/New_York'), /invalid_schedule/);
  assert.throws(() => zonedLocalToUtc('2026-09-20 10:30', 'Asia/Muscat'), /invalid_schedule/);
  assert.equal(validTimezone('Mars/Olympus'), false);
});

async function campaignTenant({ contacts = 3, consented = contacts } = {}) {
  const h = blueHarness();
  await h.enable();
  const t = await seedTenant(h.m, { name: 'c' });
  await h.messaging('activate', { sessionHash: t.sessionHash });
  const t2 = sanitizeTemplate(approved);
  await h.campaigns('replace_templates', { sessionHash: t.sessionHash, integrationId: t.integration.id, templates: [t2] });
  const rows = Array.from({ length: contacts }, (_, i) => ({ waId: String(96891000000 + i), name: `Lead ${i}` }));
  const consent = { source: 'Store sign-up sheet', date: '2026-09-01', purpose: 'Offers', attested: true };
  for (let i = 0; i < rows.length; i += 100) {
    const page = rows.slice(i, i + 100);
    await h.audience('import_contacts', { sessionHash: t.sessionHash, requestId: randomUUID(), origin: 'import', rows: page.slice(0, Math.max(0, consented - i)), consent });
    const rest = page.slice(Math.max(0, consented - i));
    if (rest.length) await h.audience('import_contacts', { sessionHash: t.sessionHash, requestId: randomUUID(), origin: 'import', rows: rest });
  }
  const ids = h.m.table('blueContacts').map(c => c._id);
  const mapping = [{ key: 'header:1', source: 'contact_name', value: 'there' }, { key: 'body:1', source: 'contact_name', value: 'there' }, { key: 'body:2', source: 'static', value: '10%' }];
  const create = (extra = {}) => h.campaigns('campaign_create', { sessionHash: t.sessionHash, templateId: '111', mapping, contactIds: ids, allowance: 250, requestId: randomUUID(), confirm: true, scheduledAt: h.m.now(), timezone: 'Asia/Muscat', ...extra });
  return { h, t, ids, mapping, create };
}

test('recipient preview excludes unknown, revoked, deleted and opted-out contacts and enforces the 100 and allowance caps', async () => {
  const { h, t, ids, mapping, create } = await campaignTenant({ contacts: 5, consented: 3 });
  await h.inbound(t, { from: '96891000001', text: 'stop', intent: 'optout', reply: null });
  await h.dashboard('contact_delete', { sessionHash: t.sessionHash, contactId: ids[2], confirm: true });
  const preview = (await h.campaigns('campaign_preview', { sessionHash: t.sessionHash, templateId: '111', mapping, contactIds: ids, allowance: 250 })).value;
  assert.equal(preview.eligible.length, 1);
  assert.deepEqual(preview.excluded.map(e => e.reason).sort(), ['consent_unknown', 'consent_unknown', 'contact_deleted', 'opted_out']);
  assert.equal((await create({ allowance: 0 })).reason, 'messaging_limit');
  assert.equal((await create({ confirm: false })).reason, 'confirmation_required');
  assert.equal((await create({ scheduledAt: h.m.now() + 31 * 86400000 })).reason, 'invalid_schedule');
  assert.equal((await h.campaigns('campaign_preview', { sessionHash: t.sessionHash, templateId: '111', mapping: mapping.slice(0, 1), contactIds: ids, allowance: 250 })).reason, 'invalid_mapping');
  const big = await campaignTenant({ contacts: MAX_RECIPIENTS + 1 });
  assert.equal((await big.create()).reason, 'recipient_limit');
});

test('campaign creation is idempotent, freezes the snapshot, and can be cancelled only until processing starts', async () => {
  const { h, t, create } = await campaignTenant();
  const requestId = randomUUID();
  const first = await create({ requestId, scheduledAt: h.m.now() + 3600000 });
  const again = await create({ requestId, scheduledAt: h.m.now() + 3600000 });
  assert.equal(first.value.campaign.id, again.value.campaign.id);
  assert.equal(h.m.table('blueCampaigns').length, 1);
  const recipient = h.m.table('blueCampaignRecipients')[0];
  assert.deepEqual(recipient.parameters.map(p => p.text), ['Lead 0', 'Lead 0', '10%']);
  // Editing the contact after scheduling does not change the frozen parameters.
  await h.dashboard('contact_update', { sessionHash: t.sessionHash, contactId: recipient.contactId, patch: { ownerName: 'Renamed' } });
  assert.deepEqual(h.m.table('blueCampaignRecipients')[0].parameters.map(p => p.text), ['Lead 0', 'Lead 0', '10%']);
  const cancelled = await h.campaigns('campaign_cancel', { sessionHash: t.sessionHash, campaignId: first.value.campaign.id });
  assert.equal(cancelled.value.campaign.status, 'cancelled');
  assert.ok(h.m.table('blueCampaignRecipients').every(r => r.status === 'cancelled'));
  const started = await create();
  await h.maintain();
  await h.worker('start_result', { campaignId: started.value.campaign.id, ready: true, allowance: 250 });
  assert.equal((await h.campaigns('campaign_cancel', { sessionHash: t.sessionHash, campaignId: started.value.campaign.id })).reason, 'campaign_not_cancellable');
});

test('start revalidation blocks on template or connection changes and applies the lower messaging allowance', async () => {
  const { h, create } = await campaignTenant({ contacts: 3 });
  const blocked = await create();
  await h.maintain();
  assert.deepEqual(h.m.scheduled.at(-1), { campaignStartId: blocked.value.campaign.id });
  await h.worker('start_result', { campaignId: blocked.value.campaign.id, ready: false, reason: 'template_not_approved' });
  assert.equal((await h.m.db.get(blocked.value.campaign.id)).status, 'blocked');
  assert.ok(h.m.table('blueCampaignRecipients').every(r => r.status === 'blocked' && r.reason === 'template_not_approved'));
  const limited = await create();
  await h.maintain();
  await h.worker('start_result', { campaignId: limited.value.campaign.id, ready: true, allowance: 2 });
  const rows = h.m.table('blueCampaignRecipients').filter(r => r.campaignId === limited.value.campaign.id);
  assert.deepEqual(rows.map(r => r.status).sort(), ['blocked', 'queued', 'queued']);
  assert.equal(rows.find(r => r.status === 'blocked').reason, 'messaging_limit');
});

test('one claim at a time, retries only definite throttling with backoff, never retries ambiguous outcomes, and completes', async () => {
  const { h, create } = await campaignTenant({ contacts: 3 });
  const campaign = (await create()).value.campaign;
  await h.maintain();
  await h.worker('start_result', { campaignId: campaign.id, ready: true, allowance: 250 });
  const [a, b, c] = h.m.table('blueCampaignRecipients');
  const claimA = await h.worker('claim', { jobId: a._id, intent: randomUUID() });
  assert.ok(claimA.value);
  assert.equal((await h.worker('claim', { jobId: b._id, intent: randomUUID() })).value, null, 'single in-flight send per campaign');
  await h.worker('result', { jobId: a._id, intent: claimA.value.intent, status: 'retry', errorCode: 130429 });
  const retried = await h.m.db.get(a._id);
  assert.equal(retried.status, 'queued');
  assert.equal(retried.nextAttemptAt, h.m.now() + RETRY_BACKOFF_MS[0]);
  assert.equal((await h.worker('claim', { jobId: a._id, intent: randomUUID() })).value, null, 'backoff respected');
  for (let attempt = 2; attempt <= MAX_ATTEMPTS; attempt++) {
    h.m.advance(RETRY_BACKOFF_MS[attempt - 2]);
    const claim = await h.worker('claim', { jobId: a._id, intent: randomUUID() });
    await h.worker('result', { jobId: a._id, intent: claim.value.intent, status: 'retry', errorCode: 130429 });
  }
  assert.equal((await h.m.db.get(a._id)).status, 'failed');
  const claimB = await h.worker('claim', { jobId: b._id, intent: randomUUID() });
  await h.worker('result', { jobId: b._id, intent: claimB.value.intent, status: 'ambiguous', reason: 'provider_outcome_unknown' });
  assert.equal((await h.m.db.get(b._id)).status, 'ambiguous');
  assert.equal((await h.worker('claim', { jobId: b._id, intent: randomUUID() })).value, null);
  const claimC = await h.worker('claim', { jobId: c._id, intent: randomUUID() });
  await h.worker('result', { jobId: c._id, intent: claimC.value.intent, status: 'submitted', providerId: 'wamid.c' });
  assert.equal((await h.m.db.get(campaign.id)).status, 'completed');
  // Conversational automation is untouched by campaign failures.
  assert.ok(h.m.table('blueMessagingControls').every(ctl => ctl.active === true));
});

test('receipts reconcile campaign sends in order, ignore mismatched recipients and keep failure codes', async () => {
  const { h, t, create } = await campaignTenant({ contacts: 1 });
  const campaign = (await create()).value.campaign;
  await h.maintain();
  await h.worker('start_result', { campaignId: campaign.id, ready: true, allowance: 250 });
  const [job] = h.m.table('blueCampaignRecipients');
  const claim = await h.worker('claim', { jobId: job._id, intent: randomUUID() });
  const receipt = status => ({ kind: 'receipt', id: 'wamid.x', intent: claim.value.intent, recipient: job.waId, status, at: h.m.now() });
  await h.messaging('ingest', { integrationId: t.integration.id, events: [{ ...receipt('delivered'), recipient: '96899999999' }] });
  assert.equal((await h.m.db.get(job._id)).status, 'attempting');
  await h.messaging('ingest', { integrationId: t.integration.id, events: [receipt('read')] });
  await h.worker('result', { jobId: job._id, intent: claim.value.intent, status: 'submitted', providerId: 'wamid.x' });
  await h.messaging('ingest', { integrationId: t.integration.id, events: [receipt('delivered')] });
  assert.equal((await h.m.db.get(job._id)).status, 'read');
  const other = await campaignTenant({ contacts: 1 });
  const c2 = (await other.create()).value.campaign;
  await other.h.maintain();
  await other.h.worker('start_result', { campaignId: c2.id, ready: true, allowance: 250 });
  const [job2] = other.h.m.table('blueCampaignRecipients');
  const claim2 = await other.h.worker('claim', { jobId: job2._id, intent: randomUUID() });
  await other.h.worker('result', { jobId: job2._id, intent: claim2.value.intent, status: 'submitted', providerId: 'wamid.y' });
  await other.h.messaging('ingest', { integrationId: other.t.integration.id, events: [{ kind: 'receipt', id: 'wamid.y', recipient: job2.waId, status: 'failed', errorCode: 131049, at: other.h.m.now() }] });
  assert.deepEqual([(await other.h.m.db.get(job2._id)).status, (await other.h.m.db.get(job2._id)).errorCode], ['failed', 131049]);
});

test('a new opt-out blocks every unclaimed campaign job and closes the send gate for an in-flight one', async () => {
  const { h, t, create } = await campaignTenant({ contacts: 2 });
  const first = (await create()).value.campaign;
  const later = (await create({ scheduledAt: h.m.now() + 3600000 })).value.campaign;
  await h.maintain();
  await h.worker('start_result', { campaignId: first.id, ready: true, allowance: 250 });
  const inFlight = h.m.table('blueCampaignRecipients').find(r => r.campaignId === first.id && r.waId === '96891000000');
  const claim = await h.worker('claim', { jobId: inFlight._id, intent: randomUUID() });
  await h.inbound(t, { from: '96891000000', text: 'Stop promotions', intent: 'optout', reply: null });
  assert.equal((await h.worker('gate', { jobId: inFlight._id, intent: claim.value.intent })).value, false);
  const pendingLater = h.m.table('blueCampaignRecipients').find(r => r.campaignId === later.id && r.waId === '96891000000');
  assert.deepEqual([pendingLater.status, pendingLater.reason], ['blocked', 'contact_opted_out']);
  const preview = await h.campaigns('campaign_preview', { sessionHash: t.sessionHash, templateId: '111', mapping: [{ key: 'header:1', source: 'static', value: 'x' }, { key: 'body:1', source: 'static', value: 'x' }, { key: 'body:2', source: 'static', value: 'y' }], contactIds: h.m.table('blueContacts').map(c => c._id), allowance: 250 });
  assert.deepEqual(preview.value.excluded.map(e => e.reason), ['opted_out']);
});

test('tenants cannot see, cancel or target another tenant’s campaigns, templates or contacts', async () => {
  const one = await campaignTenant({ contacts: 1 });
  const campaign = (await one.create({ scheduledAt: one.h.m.now() + 3600000 })).value.campaign;
  const intruder = await seedTenant(one.h.m, { name: 'z', phone: '7777', waba: '6666', sender: '96890000009' });
  assert.equal((await one.h.campaigns('campaign_detail', { sessionHash: intruder.sessionHash, campaignId: campaign.id })).reason, 'campaign_not_found');
  assert.equal((await one.h.campaigns('campaign_cancel', { sessionHash: intruder.sessionHash, campaignId: campaign.id })).reason, 'campaign_not_found');
  assert.deepEqual((await one.h.campaigns('templates', { sessionHash: intruder.sessionHash })).value.templates, []);
  assert.equal((await one.h.campaigns('campaign_preview', { sessionHash: intruder.sessionHash, templateId: '111', mapping: one.mapping, contactIds: one.ids, allowance: 250 })).reason, 'template_not_sendable');
  assert.deepEqual((await one.h.campaigns('campaigns', { sessionHash: intruder.sessionHash })).value.items, []);
});

test('worker revalidates before start, sends one template POST, and records a timeout as ambiguous without retrying', async () => {
  const env = { BLUE_BROADCAST_ENABLED: 'true', LAYLA_CREDENTIAL_ENCRYPTION_KEY: 'b'.repeat(64), LAYLA_META_APP_SECRET: 'x' };
  const integration = { id: randomUUID(), app: '1388038082832745', waba: '1', phone: '2', sender: '96890000000', path: 'new_number' };
  integration.credential = sealToken('synthetic-token-value', credentialContext('d'.repeat(64), integration), env);
  const calls = [];
  const store = async (operation, args) => {
    calls.push([operation, args]);
    if (operation === 'start_context') return { campaignId: 'c1', template: { templateId: '111' }, integration, sessionHash: 'd'.repeat(64) };
    if (operation === 'claim') return { jobId: 'j1', intent: args.intent, waId: '96891234567', parameters: [{ key: '1', component: 'body', text: 'Sara' }], template: sanitizeTemplate(approved), integration, sessionHash: 'd'.repeat(64) };
    if (operation === 'gate') return true;
    return null;
  };
  await runCampaignStart({ campaignId: 'c1', env, store, fetcher: async () => assert.fail(), inspect: async () => ({ connected: true }), templateState: async () => ({ status: 'PAUSED', category: 'MARKETING' }), allowance: async () => 250 });
  assert.deepEqual(calls.at(-1), ['start_result', { campaignId: 'c1', ready: false, reason: 'template_not_approved' }]);
  let posts = 0;
  const outcome = await runCampaignSend({ jobId: 'j1', env, store, inspect: async () => ({ connected: true }), fetcher: async (url, options) => {
    posts++;
    const body = JSON.parse(options.body);
    assert.equal(body.type, 'template');
    assert.equal(body.template.name, 'autumn_offer');
    assert.equal(body.biz_opaque_callback_data, calls.find(c => c[0] === 'claim')[1].intent);
    throw Error('timeout');
  } });
  assert.equal(posts, 1);
  assert.equal(outcome.status, 'ambiguous');
  assert.deepEqual(calls.at(-1)[1].status, 'ambiguous');
  await assert.rejects(runCampaignSend({ jobId: 'j1', env: { ...env, BLUE_BROADCAST_ENABLED: 'false' }, store }), /broadcast_unavailable/);
});

test('sync lists every approved template but only marketing ones are sendable', async () => {
  const data = [approved, { ...approved, id: '222', name: 'appointment_reminder', category: 'UTILITY' }, { ...approved, id: '333', name: 'draft_offer', status: 'PENDING' }];
  const fetcher = async () => ({ ok: true, text: async () => JSON.stringify({ data }) });
  const list = await fetchApprovedTemplates({ c: { app: '1', version: 'v25.0' }, integration: { waba: '9' }, token: 'synthetic', fetcher });
  assert.deepEqual(list.map(t => [t.name, t.sendable, t.unsupportedReason || null]), [['autumn_offer', true, null], ['appointment_reminder', false, 'not_marketing']]);
});
