import { activatePendingInvitation } from './hasib/workspaceState.js';

const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export async function executeBlueAuth(ctx,a,now = Date.now()) {
  const fail = reason => ({ok:false,reason}), ok = value => ({ok:true,value});
  const lookup = (table,index,field,value) => ctx.db.query(table).withIndex(index,q=>q.eq(field,value)).unique();
  if(a.operation==='review_access') {
    if(!hash(a.accessHash) || !hash(a.tokenHash)) return fail('invalid_state');
    const access=await lookup('blueReviewerAccess','by_hash','tokenHash',a.accessHash);
    if(!access || access.expiresAt<=now) return fail('session_expired');
    const account=await ctx.db.get(access.accountId);
    if(!account) return fail('session_expired');
    await ctx.db.insert('sessions',{accountId:account._id,tokenHash:a.tokenHash,createdAt:now,expiresAt:Math.min(access.expiresAt,now+86400000)});
    return ok({id:account._id,email:account.email});
  }
  async function limit(key,max,window) {
    const r = await lookup('blueAuthLimits','by_key','key',key);
    if (!r) { await ctx.db.insert('blueAuthLimits',{key,count:1,expiresAt:now+window}); return true; }
    if (r.expiresAt <= now) { await ctx.db.patch(r._id,{count:1,expiresAt:now+window}); return true; }
    if (r.count >= max) return false;
    await ctx.db.patch(r._id,{count:r.count+1}); return true;
  }
  if(a.operation === 'limit_import') {
    if(!hash(a.ipHash)) return fail('invalid_state');
    return await limit(`import:${a.ipHash}`,10,3600000) && await limit('import-global',200,86400000) ? ok(null) : fail('too_many');
  }
  if (['request_code','verify_code'].includes(a.operation)) {
    if (!hash(a.ipHash) || !hash(a.codeHash) || typeof a.email !== 'string' || a.email.length > 254) return fail('invalid_state');
    if (!await limit(`${a.operation}:${a.ipHash}`,a.operation === 'request_code' ? 5 : 20,60000)) return fail('too_many');
  }
  if (a.operation === 'request_code') {
    if (!await limit('email-global',300,86400000) || !await limit(`email:${a.email}`,5,3600000)) return fail('too_many');
    const r = await lookup('blueAuthChallenges','by_email','email',a.email);
    if (r && now-r.createdAt < 60000) return fail('too_soon');
    const record = {email:a.email,codeHash:a.codeHash,challengeId:a.challengeId,createdAt:now,expiresAt:now+600000,attempts:0,sent:false};
    if (r) await ctx.db.patch(r._id,record); else await ctx.db.insert('blueAuthChallenges',record);
    return ok(null);
  }
  if (a.operation === 'code_sent') {
    const r = await lookup('blueAuthChallenges','by_email','email',a.email);
    if (!r || r.challengeId !== a.challengeId) return fail('code_invalid');
    await ctx.db.patch(r._id,{sent:true});return ok(null);
  }
  if (a.operation === 'verify_code') {
    if (!hash(a.tokenHash)) return fail('invalid_state');
    const r = await lookup('blueAuthChallenges','by_email','email',a.email);
    if (!r || !r.sent || r.expiresAt <= now || r.attempts >= 5) return fail('code_invalid');
    await ctx.db.patch(r._id,{attempts:r.attempts+1});
    if (r.codeHash !== a.codeHash) return fail('code_invalid');
    await ctx.db.delete(r._id);
    let account = await lookup('accounts','by_email','email',a.email);
    if (!account) account = await ctx.db.get(await ctx.db.insert('accounts',{email:a.email,role:'customer',createdAt:now}));
    await activatePendingInvitation(ctx, account, now);
    await ctx.db.insert('sessions',{accountId:account._id,tokenHash:a.tokenHash,createdAt:now,expiresAt:now+2592000000});
    return ok({id:account._id,email:account.email});
  }
  if (['session','signout','claim_draft'].includes(a.operation)) {
    if (!hash(a.tokenHash)) return fail('invalid_state');
    const session = await lookup('sessions','by_token_hash','tokenHash',a.tokenHash);
    if (!session || session.expiresAt <= now) return a.operation === 'session' ? ok(null) : fail('session_expired');
    if (a.operation === 'signout') {await ctx.db.delete(session._id);return ok(null);}
    const account = await ctx.db.get(session.accountId);
    if (!account) return fail('session_expired');
    if (a.operation === 'claim_draft') {
      if (!hash(a.sessionHash) || !hash(a.draftHash)) return fail('invalid_state');
      if (account.draftHash) return ok({draftHash:account.draftHash});
      const draft = await lookup('blueReviewSessions','by_hash','sessionHash',a.sessionHash);
      // Each refusal names its cause so the owner knows what to do. Confirmed business details are
      // enough: the Layla preview is optional and comes last, so it is not required here.
      if (!draft || draft.expiresAt <= now) return fail('draft_expired');
      if (draft.accountId) return fail('draft_already_claimed');
      if (draft.operation) return fail('draft_operation_in_progress');
      if (draft.pendingSelection) return fail('draft_selection_pending');
      if (draft.attempt && !draft.attempt.claimed && draft.attempt.expiresAt > now && ['prepared','awaiting_meta'].includes(draft.status)) return fail('draft_attempt_active');
      if (!draft.profile?.reviewed) return fail('draft_details_unconfirmed');
      if (draft.integration && !a.credential) return fail('draft_not_claimable');
      if (draft.integration) {
        if (a.credential.v !== 1 || a.credential.data.length > 12000) return fail('draft_not_claimable');
        const claim = await lookup('blueAssetClaims','by_phone','phone',draft.integration.phone);
        if (claim && claim.sessionHash !== a.sessionHash) return fail('draft_not_claimable');
        if (claim) await ctx.db.patch(claim._id,{sessionHash:a.draftHash});
        else await ctx.db.insert('blueAssetClaims',{phone:draft.integration.phone,waba:draft.integration.waba,sessionHash:a.draftHash,createdAt:now});
      }
      await ctx.db.patch(draft._id,{...(draft.integration ? {integration:{...draft.integration,credential:a.credential}} : {}),accountId:account._id,metrics:{...draft.metrics,accountVerifiedAt:now},sessionHash:a.draftHash,expiresAt:Number.MAX_SAFE_INTEGER,...(!draft.integration ? {attempt:undefined} : {})});
      await ctx.db.patch(account._id,{draftHash:a.draftHash});
      return ok({draftHash:a.draftHash});
    }
    const membership = await lookup('ascendWorkspaceMembers','by_account','accountId',account._id);
    let workspaceDraftHash = null, workspaceRole = 'manager';
    if (membership?.status === 'active') {
      const workspace = await ctx.db.get(membership.workspaceId);
      const manager = workspace ? await ctx.db.get(workspace.managerAccountId) : null;
      workspaceDraftHash = manager?.draftHash || null;
      workspaceRole = 'employee';
    }
    return ok({id:account._id,email:account.email,name:account.name || '',draftHash:account.draftHash || null,workspaceDraftHash,workspaceRole});
  }
  return fail('invalid_state');
}
