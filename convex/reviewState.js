// Every transition executes in one Convex mutation; provider calls happen outside it.
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const id = value => typeof value === 'string' && /^[a-f0-9-]{32,64}$/.test(value);
const paths = ['coexistence', 'new_number', 'existing_cloud'];
export async function executeReview(ctx, a, now = Date.now()) {
  const fail = reason => ({ ok: false, reason });
  if (!hash(a.sessionHash)) return fail('invalid_state');
  if (['begin','await','claim','cancel'].includes(a.operation) && (!id(a.attempt) || !hash(a.stateHash))) return fail('invalid_state');
  if (a.operation === 'begin' && !paths.includes(a.path)) return fail('invalid_state');
  if (a.operation === 'begin' && a.preselect && (a.path === 'coexistence' || !Object.keys(a.preselect).length || Object.entries(a.preselect).some(([k, value]) => !['business','waba'].includes(k) || !/^\d{1,30}$/.test(value)))) return fail('invalid_state');
  if (a.operation === 'profile') {
    const p = a.profile;
    if (p?.faqs && (!Array.isArray(p.faqs) || p.faqs.length>12 || p.faqs.some(f=>typeof f.question !== 'string' || !f.question.trim() || f.question.length>200 || typeof f.answer !== 'string' || !f.answer.trim() || f.answer.length>700))) return fail('invalid_profile');
    if (!p || p.reviewed !== true || !['businessName','sector','services'].every(k => typeof p[k] === 'string' && p[k].trim()) ||
      !['businessName','sector','services','prices','hours','location','humanContact'].every(k => typeof p[k] === 'string' && p[k].length <= 350) || p.businessName.length > 100 || p.humanContact.length > 120) return fail('invalid_profile');
  }
  if (a.operation === 'credential' && (!id(a.attempt) || !a.integration || !/^\d{1,30}$/.test(a.integration.phone) || !/^\d{1,30}$/.test(a.integration.waba) || !id(a.integration.id) || a.integration.app !== '1388038082832745' || !paths.includes(a.integration.path) || a.integration.credential?.data?.length > 12000)) return fail('invalid_state');
  if (a.operation === 'claim_operation' && (!id(a.operationId) || !['register','subscribe','refresh'].includes(a.effect))) return fail('invalid_state');
  if (a.operation === 'result' && (!['connected','registration_required','reconciliation_required','failed'].includes(a.status) || (a.operationId ? !id(a.operationId) : !id(a.attempt)))) return fail('invalid_state');
  let row = await ctx.db.query('blueReviewSessions').withIndex('by_hash', q => q.eq('sessionHash', a.sessionHash)).unique();
  if (a.operation === 'create' && !row) {
    const key = await ctx.db.insert('blueReviewSessions', { sessionHash: a.sessionHash, status: 'empty', expiresAt: now + 86400000, createdAt: now, updatedAt: now, attempts: 0 });
    row = await ctx.db.get(key);
  }
  if (!row || row.expiresAt <= now) return fail('session_expired');
  const patch = async value => { await ctx.db.patch(row._id, { ...value, updatedAt: now }); row = await ctx.db.get(row._id); };
  if (a.operation === 'profile') {
    if (row.operation || (row.attempt && !row.attempt.claimed && row.attempt.expiresAt > now && ['prepared','awaiting_meta'].includes(row.status))) return fail('operation_conflict');
    await patch({ profile: a.profile, metrics:{...row.metrics,draftSavedAt:row.metrics?.draftSavedAt || now}, profileVersion: (row.profileVersion || (row.profile ? 1 : 0)) + 1, lastPreview: undefined, previewIntents: [], journeyStep: [undefined, 0, 2].includes(row.journeyStep) ? 1 : row.journeyStep, status: row.integration || row.pendingSelection || row.attempt ? row.status : 'business_saved' });
    // A pre-unification Hasib choice is only a migration hint. Once Business
    // Setup is saved, its single industry becomes authoritative.
    if (row.accountId) {
      const hasibSettings = await ctx.db.query('hasibSettings').withIndex('by_account', q => q.eq('accountId', row.accountId)).unique();
      if (hasibSettings?.packId) await ctx.db.patch(hasibSettings._id, { packId: undefined, updatedAt: now });
    }
  } else if (a.operation === 'preview_result') {
    if (!row.profile?.reviewed || a.profileVersion !== (row.profileVersion || 1)) return fail('profile_changed');
    if (!a.preview || typeof a.preview.question !== 'string' || a.preview.question.length > 1000 || typeof a.preview.text !== 'string' || a.preview.text.length > 1200) return fail('invalid_state');
    await patch({ lastPreview: a.preview, metrics:{...row.metrics,firstPreviewAt:row.metrics?.firstPreviewAt || now}, previewIntents: [...new Set([...(row.previewIntents || []), a.preview.intent])].slice(0, 12) });
  } else if (a.operation === 'save_progress') {
    if (![0,1,3].includes(a.journeyStep) || (a.journeyStep !== 0 && !row.profile?.reviewed)) return fail('operation_conflict');
    await patch({ journeyStep: a.journeyStep });
  } else if (a.operation === 'begin') {
    if (!row.profile?.reviewed || !row.profile.humanContact || row.integration || (row.pendingSelection && row.attempt?.expiresAt > now) || row.status === 'reconciliation_required' || (row.status === 'verifying' && row.attempt?.expiresAt > now)) return fail('operation_conflict');
    if (row.attempts >= 10) return fail('attempt_limit');
    if (row.attempt && row.attempt.expiresAt > now && !['cancelled','failed','expired'].includes(row.status)) return fail('operation_conflict');
    // A new attempt starts clean: the previous attempt's diagnostic no longer describes it.
    await patch({ status: 'prepared', metrics:{...row.metrics,metaStartedAt:row.metrics?.metaStartedAt || now}, pendingSelection: undefined, diagnostic: undefined, attempts: row.attempts + 1, attempt: { id: a.attempt, stateHash: a.stateHash, path: a.path, expiresAt: now + 600000, claimed: false, ...(a.preselect ? { preselect: a.preselect } : {}) } });
  } else if (['await','claim','cancel'].includes(a.operation)) {
    if (row.attempt?.id !== a.attempt || row.attempt?.stateHash !== a.stateHash) return fail('invalid_state');
    if (row.attempt.expiresAt <= now) return fail('attempt_expired');
    if (row.attempt.claimed || !['prepared','awaiting_meta'].includes(row.status)) return fail('attempt_used');
    await patch(a.operation === 'claim' ? { status: 'verifying', attempt: { ...row.attempt, claimed: true } } : { status: a.operation === 'await' ? 'awaiting_meta' : 'cancelled' });
  } else if (a.operation === 'cancel_selection') {
    if (!row.pendingSelection || row.integration) return fail('operation_conflict');
    await patch({ pendingSelection: undefined, status: 'cancelled' });
  } else if (a.operation === 'pending_selection') {
    if (row.status !== 'verifying' || !row.attempt?.claimed || row.integration || a.selection?.waba !== undefined && !/^\d{1,30}$/.test(a.selection.waba) || !a.selection?.candidates?.length || a.selection.candidates.length > 100 || a.selection.path !== row.attempt.path) return fail('invalid_state');
    await patch({ pendingSelection: a.selection, status: 'selection_required', journeyStep: 1 });
  } else if (a.operation === 'credential') {
    if (!['verifying','selection_required'].includes(row.status) || row.attempt?.id !== a.attempt || !row.attempt?.claimed || row.attempt.expiresAt <= now || row.integration) return fail('operation_conflict');
    for (const [index, field] of [['by_phone','phone'],['by_waba','waba']]) {
      const other = await ctx.db.query('blueReviewSessions').withIndex(index, q => q.eq(field, a.integration[field])).first();
      if (other && other._id !== row._id) return fail('asset_in_use');
    }
    for (const field of ['phone','waba']) {
      const claim=await ctx.db.query('blueAssetClaims').withIndex(`by_${field}`,q=>q.eq(field,a.integration[field])).unique();
      if(claim && claim.sessionHash !== row.sessionHash) return fail('asset_in_use');
    }
    if (a.integration.path !== row.attempt.path) return fail('invalid_state');
    await ctx.db.insert('blueAssetClaims',{phone:a.integration.phone,waba:a.integration.waba,sessionHash:row.sessionHash,createdAt:now});
    await patch({ integration: a.integration, metrics:{...row.metrics,assetsVerifiedAt:row.metrics?.assetsVerifiedAt || now}, phone: a.integration.phone, waba: a.integration.waba, pendingSelection: undefined, status: 'verifying' });
  } else if (a.operation === 'claim_operation') {
    if (!row.integration) return fail('operation_conflict');
    if (a.effect === 'refresh' && row.checkedAt && now - row.checkedAt < 5000) return fail('refresh_throttled');
    // A refresh may supersede a crashed operation only after its bounded request
    // window. Its new id fences late results; it never repeats an external write.
    if (row.operation && (a.effect !== 'refresh' || row.operationAt + 60000 > now)) return fail('operation_conflict');
    if (a.effect === 'register' && (row.integration.path !== 'new_number' || row.status !== 'registration_required' || row.registrationAttempted)) return fail('operation_conflict');
    if (a.effect === 'subscribe' && (row.subscriptionAttempted || row.status !== 'verifying')) return fail('operation_conflict');
    await patch({ status: 'verifying', operation: a.operationId, operationAt: now, operationEffect: a.effect,
      ...(a.effect === 'register' ? { registrationAttempted: true } : a.effect === 'subscribe' ? { subscriptionAttempted: true } : {}) });
  } else if (a.operation === 'result') {
    if (a.operationId ? row.operation !== a.operationId : (row.attempt?.id !== a.attempt || row.operation || row.status !== 'verifying')) return fail('operation_conflict');
    if (['connected','registration_required'].includes(a.status) && !row.integration) return fail('operation_conflict');
    await patch({ status: a.status, ...(a.status === 'connected' ? {metrics:{...row.metrics,connectionReadyAt:row.metrics?.connectionReadyAt || now}} : {}), operation: undefined, operationAt: undefined, operationEffect: undefined, diagnostic: a.diagnostic, ...(a.connectionChecks ? { connectionChecks: a.connectionChecks, checkedAt: now } : {}) });
  } else if (a.operation === 'pause') {
    if (!['connected','paused'].includes(row.status)) return fail('operation_conflict');
    await patch({ status: 'paused' });
  } else if (!['create','get'].includes(a.operation)) return fail('operation_conflict');
  return { ok: true, value: row };
}

const OPEN_MESSAGES = ['pending','queued','attempting','ambiguous'];
const OPEN_CAMPAIGNS = ['scheduled','starting','processing'];
const CONNECTION_FIELDS = ['integration','phone','waba','attempt','operation','operationAt','operationEffect','pendingSelection','connectionChecks','checkedAt','diagnostic','subscriptionAttempted','registrationAttempted'];
/**
 * Operator-only: detach an idle connection from a saved setup so the owner can
 * connect a different number. Facts, metrics and the account link are kept.
 * Nothing is changed at Meta. Refuses while anything could still send.
 */
export async function detachIntegration(ctx, a, now = Date.now()) {
  const fail = reason => ({ ok: false, reason });
  const email = typeof a.email === 'string' ? a.email.trim().toLowerCase() : '';
  if (!email || a.confirm !== true) return fail('confirmation_required');
  const account = await ctx.db.query('accounts').withIndex('by_email', q => q.eq('email', email)).unique();
  if (!account?.draftHash) return fail('setup_not_found');
  const row = await ctx.db.query('blueReviewSessions').withIndex('by_hash', q => q.eq('sessionHash', account.draftHash)).unique();
  if (!row || String(row.accountId) !== String(account._id)) return fail('setup_not_found');
  const i = row.integration;
  if (!i) return fail('not_connected');
  if (row.operation || row.status === 'verifying' || row.pendingSelection) return fail('operation_in_progress');
  const control = await ctx.db.query('blueMessagingControls').withIndex('by_integration', q => q.eq('integrationId', i.id)).unique();
  if (control?.active) return fail('messaging_active');
  const open = async (table, statuses) => {
    for (const status of statuses) {
      if ((await ctx.db.query(table).withIndex('by_integration_status', q => q.eq('integrationId', i.id).eq('status', status)).take(1)).length) return true;
    }
    return false;
  };
  if (await open('blueMessages', OPEN_MESSAGES) || await open('blueCampaignRecipients', OPEN_MESSAGES)) return fail('sends_pending');
  if (await open('blueCampaigns', OPEN_CAMPAIGNS)) return fail('campaign_open');
  for (const field of ['phone','waba']) {
    const claim = await ctx.db.query('blueAssetClaims').withIndex(`by_${field}`, q => q.eq(field, i[field])).unique();
    if (claim && claim.sessionHash === row.sessionHash) await ctx.db.delete(claim._id);
  }
  if (control) await ctx.db.delete(control._id);
  const templates = await ctx.db.query('blueTemplates').withIndex('by_account_template', q => q.eq('accountId', account._id)).take(500);
  for (const template of templates) if (template.integrationId === i.id) await ctx.db.delete(template._id);
  await ctx.db.patch(row._id, { ...Object.fromEntries(CONNECTION_FIELDS.map(k => [k, undefined])), status: 'business_saved', updatedAt: now });
  return { ok: true, value: { detached: true } };
}

/** Operator-only: restore a saved setup's connection-attempt budget. Nothing else changes. */
export async function resetAttempts(ctx, a, now = Date.now()) {
  const fail = reason => ({ ok: false, reason });
  const email = typeof a.email === 'string' ? a.email.trim().toLowerCase() : '';
  if (!email || a.confirm !== true) return fail('confirmation_required');
  const account = await ctx.db.query('accounts').withIndex('by_email', q => q.eq('email', email)).unique();
  if (!account?.draftHash) return fail('setup_not_found');
  const row = await ctx.db.query('blueReviewSessions').withIndex('by_hash', q => q.eq('sessionHash', account.draftHash)).unique();
  if (!row || String(row.accountId) !== String(account._id)) return fail('setup_not_found');
  if (row.operation || row.status === 'verifying') return fail('operation_in_progress');
  await ctx.db.patch(row._id, { attempts: 0, updatedAt: now });
  return { ok: true, value: { reset: true } };
}
