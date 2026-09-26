// Operator reset of one Blue account: removes its channel connections, saved
// setup, chats and contacts so the owner can onboard again from nothing. The
// login account and its sign-in sessions stay. Nothing here calls Meta; the
// owner revokes Instagram access in Instagram's own settings.
const BATCH = 500;
const OPEN_SENDS = ['attempting'];

export async function resetAccount(ctx, a) {
  const fail = reason => ({ ok: false, reason });
  const email = typeof a.email === 'string' ? a.email.trim().toLowerCase() : '';
  if (!email) return fail('email_required');
  if (a.confirm !== true && a.dryRun !== true) return fail('confirmation_required');
  const account = await ctx.db.query('accounts').withIndex('by_email', q => q.eq('email', email)).unique();
  if (!account) return fail('account_not_found');
  const accountId = account._id, owner = String(accountId);
  const session = account.draftHash ? await ctx.db.query('blueReviewSessions').withIndex('by_hash', q => q.eq('sessionHash', account.draftHash)).unique() : null;
  const sessionHash = session?.sessionHash || account.draftHash;

  const messages = await ctx.db.query('blueMessages').withIndex('by_account_at', q => q.eq('accountId', accountId)).take(BATCH);
  if (messages.some(m => OPEN_SENDS.includes(m.status))) return fail('send_in_progress');
  const campaigns = await ctx.db.query('blueCampaigns').withIndex('by_account_created', q => q.eq('accountId', accountId)).take(BATCH);
  const recipients = [];
  for (const c of campaigns) recipients.push(...await ctx.db.query('blueCampaignRecipients').withIndex('by_campaign_status', q => q.eq('campaignId', c._id)).take(BATCH));
  const claims = [];
  for (const field of ['phone', 'waba']) {
    const value = session?.integration?.[field];
    const claim = value && await ctx.db.query('blueAssetClaims').withIndex(`by_${field}`, q => q.eq(field, value)).unique();
    if (claim && claim.sessionHash === sessionHash && !claims.some(c => c._id === claim._id)) claims.push(claim);
  }
  // Controls have no account index and stay small; match them by accountId.
  const controls = (await ctx.db.query('blueMessagingControls').collect()).filter(c => String(c.accountId) === owner);

  const rows = {
    blueInstagramConnections: await ctx.db.query('blueInstagramConnections').withIndex('by_account', q => q.eq('accountId', accountId)).take(BATCH),
    blueInstagramAttempts: sessionHash ? await ctx.db.query('blueInstagramAttempts').withIndex('by_session', q => q.eq('sessionHash', sessionHash)).take(BATCH) : [],
    blueMessagingControls: controls,
    blueMessages: messages,
    blueConversations: await ctx.db.query('blueConversations').withIndex('by_account_updated', q => q.eq('accountId', accountId)).take(BATCH),
    blueContacts: await ctx.db.query('blueContacts').withIndex('by_account_state_activity', q => q.eq('accountId', accountId)).take(BATCH),
    blueCampaignRecipients: recipients,
    blueCampaigns: campaigns,
    blueTemplates: await ctx.db.query('blueTemplates').withIndex('by_account_template', q => q.eq('accountId', accountId)).take(BATCH),
    blueAssetClaims: claims,
    blueCatalogEntries: await ctx.db.query('blueCatalogEntries').withIndex('by_owner_key', q => q.eq('ownerKey', owner)).take(BATCH),
    blueCatalogMeta: await ctx.db.query('blueCatalogMeta').withIndex('by_owner', q => q.eq('ownerKey', owner)).take(BATCH),
    blueBusinessSettings: await ctx.db.query('blueBusinessSettings').withIndex('by_account', q => q.eq('accountId', accountId)).take(BATCH),
    blueConsentBatches: await ctx.db.query('blueConsentBatches').withIndex('by_account_request', q => q.eq('accountId', accountId)).take(BATCH),
    blueReviewSessions: session ? [session] : [],
  };
  const counts = Object.fromEntries(Object.entries(rows).map(([table, list]) => [table, list.length]));
  if (a.dryRun === true) return { ok: true, value: { dryRun: true, counts } };

  for (const list of Object.values(rows)) for (const row of list) await ctx.db.delete(row._id);
  // Anything left over (a table over one batch) is picked up by the caller re-running.
  const done = Object.values(rows).every(list => list.length < BATCH);
  if (done) await ctx.db.patch(accountId, { draftHash: undefined });
  return { ok: true, value: { dryRun: false, done, counts } };
}
