// Instagram has its own connection lifecycle. Business facts remain in the
// account's existing draft; credentials never enter a public dashboard shape.
import { deleteContact } from './blueContacts.js';

const DAY = 86400000;
// One cleanup batch stays well inside a mutation's limits; the purge
// reschedules itself immediately until nothing is left.
const PURGE = {conversations:10, messages:200, contacts:10};
const ok = value => ({ok:true,value}), fail = reason => ({ok:false,reason});
const lookup = (ctx, table, index, field, value) => ctx.db.query(table).withIndex(index,q=>q.eq(field,value)).unique();
export const instagramConnection = (ctx, accountId) => lookup(ctx,'blueInstagramConnections','by_account','accountId',accountId);

export function instagramRow(row, connection, now) {
  if (!row || !connection || connection.status !== 'connected' || connection.tokenExpiresAt <= now || !connection.integration.credential) return null;
  return {...row, integration:connection.integration, status:'connected', checkedAt:connection.checkedAt,
    connectionChecks:{routing:true,registered:true,path:true}};
}
export async function rowForIntegration(ctx, row, integrationId, now) {
  if (row?.integration?.id === integrationId) return row;
  if (!row?.accountId) return null;
  const connection = await instagramConnection(ctx,row.accountId);
  return connection?.integration.id === integrationId ? instagramRow(row,connection,now) : null;
}
export function publicInstagram(connection) {
  return connection ? {channel:'instagram',username:connection.integration.username,status:connection.deletePending?'deleting':connection.status,
    checkedAt:connection.checkedAt,tokenExpiresAt:connection.tokenExpiresAt} : null;
}

export async function executeInstagram(ctx, a, now = Date.now()) {
  if(a.operation==='deletion_status') {
    const row=await lookup(ctx,'blueInstagramConnections','by_deletion_code','deletionCode',a.deletionCode);
    return ok({status:row?.deletePending?'pending':'complete'});
  }
  // Provider callbacks are authenticated by their signed request at the API.
  if (a.operation === 'revoke') {
    const connection=await lookup(ctx,'blueInstagramConnections','by_oauth_user','oauthUserId',a.igAccount) || await lookup(ctx,'blueInstagramConnections','by_ig_account','igAccount',a.igAccount);
    if (connection) {
      if (a.issuedAt && connection.connectedAt && a.issuedAt < Math.floor(connection.connectedAt / 1000) * 1000) return ok(a.deletionCode?{deletionCode:a.deletionCode}:null);
      const deletionCode=connection.deletePending ? connection.deletionCode : a.deletionCode;
      await stop(ctx,connection,now,'revoked');
      await ctx.db.patch(connection._id,{integration:{...connection.integration,credential:undefined},...(a.deleteData?{deletePending:true,deletionCode}:{})});
      // Start removing the data now rather than on the next maintenance run.
      if (a.deleteData && a.purgeFunction) await ctx.scheduler.runAfter(0,a.purgeFunction,{connectionId:connection._id});
      return ok(deletionCode?{deletionCode}:null);
    }
    return ok(a.deletionCode?{deletionCode:a.deletionCode}:null);
  }
  if (a.operation === 'refresh_context') {
    const connection=await lookup(ctx,'blueInstagramConnections','by_integration','integrationId',a.integrationId);
    if (!connection || connection.status !== 'connected') return ok(null);
    if(connection.tokenExpiresAt<=now) {await stop(ctx,connection,now,'reconnect_required');return ok(null);}
    return ok(connection);
  }
  if (a.operation === 'refresh_result') {
    const connection=await lookup(ctx,'blueInstagramConnections','by_integration','integrationId',a.integrationId);
    if (!connection || connection.status!=='connected' || connection.updatedAt!==a.expectedUpdatedAt) return fail('connection_changed');
    if (!a.credential || !Number.isFinite(a.tokenExpiresAt) || a.tokenExpiresAt<=now) {
      await stop(ctx,connection,now,'reconnect_required'); return ok(null);
    }
    await ctx.db.patch(connection._id,{integration:{...connection.integration,credential:a.credential},tokenExpiresAt:a.tokenExpiresAt,refreshAt:now+DAY,updatedAt:now});
    return ok(null);
  }
  const row=await lookup(ctx,'blueReviewSessions','by_hash','sessionHash',a.sessionHash);
  if (!row?.accountId || row.expiresAt<=now) return fail('sign_in_required');
  const connection=await instagramConnection(ctx,row.accountId);
  const attempt=()=>lookup(ctx,'blueInstagramAttempts','by_session','sessionHash',a.sessionHash);
  if (a.operation === 'state') {
    // A sign-in that began and never came back: Instagram sometimes leaves a
    // freshly signed-in person on its feed, and the card offers to finish it.
    const pending=await attempt();
    return ok({connection:publicInstagram(connection),pendingSignIn:!!pending && !pending.used && pending.expiresAt>now});
  }
  if (a.operation === 'context') return ok(connection);
  if (a.operation === 'begin') {
    if (!/^[a-f0-9]{64}$/.test(a.stateHash || '')) return fail('invalid_state');
    if (connection?.deletePending || connection?.status==='disconnecting') return fail('connection_busy');
    const previous=await attempt();
    if (previous && now-previous.createdAt<10000) return fail('too_soon');
    const value={sessionHash:a.sessionHash,stateHash:a.stateHash,lang:a.lang==='ar'?'ar':'en',createdAt:now,expiresAt:now+600000,used:false,completed:false};
    if (previous) await ctx.db.replace(previous._id,value); else await ctx.db.insert('blueInstagramAttempts',value);
    return ok(null);
  }
  if (a.operation === 'consume') {
    const pending=await attempt();
    if (!pending || pending.stateHash!==a.stateHash || pending.used || pending.expiresAt<=now) return fail('invalid_oauth_state');
    await ctx.db.patch(pending._id,{used:true}); return ok({lang:pending.lang});
  }
  if (a.operation === 'connect') {
    const pending=await attempt(), i=a.integration;
    if (!pending?.used || pending.completed || pending.expiresAt<=now || pending.stateHash!==a.stateHash) return fail('invalid_oauth_state');
    if (i?.channel!=='instagram' || !/^[a-f0-9-]{36}$/.test(i.id || '') || !/^\d{1,30}$/.test(i.igAccount || '') || !/^\d{1,30}$/.test(i.app || '') || !i.credential || !Number.isFinite(a.tokenExpiresAt) || a.tokenExpiresAt<=now) return fail('invalid_connection');
    const claimed=await lookup(ctx,'blueInstagramConnections','by_ig_account','igAccount',i.igAccount);
    if (claimed && claimed.accountId!==row.accountId) return fail('asset_in_use');
    // Keep historical contacts addressable by provider deletion callbacks.
    if (connection && connection.igAccount!==i.igAccount) return fail('different_account');
    if (connection?.deletePending) return fail('connection_busy');
    // Reconnecting the same account keeps the owner's choice: replies that were
    // on stay on, paused stays paused.
    let keepActive=false;
    if (connection) {
      const old=await lookup(ctx,'blueMessagingControls','by_integration','integrationId',connection.integrationId);
      keepActive=connection.status==='connected' && old?.active===true;
      await stop(ctx,connection,now,'connection_replaced');
      // The replaced integration can never send again; drop its control row.
      if (old) await ctx.db.delete(old._id);
    }
    const value={accountId:row.accountId,sessionHash:a.sessionHash,igAccount:i.igAccount,...(i.oauthUserId?{oauthUserId:i.oauthUserId}:{}),integrationId:i.id,integration:i,status:'connected',connectedAt:now,tokenExpiresAt:a.tokenExpiresAt,checkedAt:now,refreshAt:now+DAY,updatedAt:now};
    if (connection) await ctx.db.replace(connection._id,value); else await ctx.db.insert('blueInstagramConnections',value);
    // Receiving is enabled after connection; sending still requires activation.
    await ctx.db.insert('blueMessagingControls',{integrationId:i.id,sessionHash:a.sessionHash,accountId:row.accountId,active:keepActive,reason:keepActive?'':'not_activated',activatedAt:keepActive?now:0,healthAt:now,profileVersion:row.profileVersion || 1});
    await ctx.db.patch(pending._id,{completed:true}); return ok(publicInstagram(value));
  }
  if (!connection) return fail('connection_not_ready');
  if (a.operation === 'checked') {
    if (connection.integrationId!==a.integrationId) return fail('connection_changed');
    if (!a.connected) await stop(ctx,connection,now,'reconnect_required');
    else if (connection.status==='connected') await ctx.db.patch(connection._id,{checkedAt:now});
    return ok(null);
  }
  if (a.operation === 'disconnect') {
    await stop(ctx,connection,now,'disconnecting');
    return ok(connection);
  }
  if (a.operation === 'disconnected') {
    if (connection.integrationId!==a.integrationId || connection.status!=='disconnecting') return fail('connection_changed');
    await ctx.db.patch(connection._id,{status:'disconnected',integration:{...connection.integration,credential:undefined},updatedAt:now});
    return ok(null);
  }
  return fail('invalid_action');
}

// Removes one batch of the Instagram data Meta asked us to delete, then the
// connection itself, so the owner is left with a clean "Connect Instagram".
// Returns true once nothing is left. The deletion receipt then reports complete,
// because no pending connection carries its code any more.
export async function purgeInstagram(ctx, connectionId, now) {
  const connection=await ctx.db.get(connectionId);
  if (!connection?.deletePending) return true;
  const scope=q=>q.eq('accountId',connection.accountId).eq('igAccount',connection.igAccount);
  const conversations=await ctx.db.query('blueConversations').withIndex('by_instagram',scope).take(PURGE.conversations);
  for (const conversation of conversations) {
    const messages=await ctx.db.query('blueMessages').withIndex('by_conversation_at',q=>q.eq('conversationId',conversation._id)).take(PURGE.messages);
    for (const message of messages) await ctx.db.delete(message._id);
    if (messages.length<PURGE.messages) await ctx.db.delete(conversation._id);
  }
  if (conversations.length) return false;
  const contacts=await ctx.db.query('blueContacts').withIndex('by_instagram',scope).take(PURGE.contacts);
  for (const contact of contacts) await deleteContact(ctx,contact,now);
  if (contacts.length) return false;
  const control=await lookup(ctx,'blueMessagingControls','by_integration','integrationId',connection.integrationId);
  if (control) await ctx.db.delete(control._id);
  await ctx.db.delete(connection._id);
  return true;
}

async function stop(ctx, connection, now, reason) {
  await ctx.db.patch(connection._id,{status:reason,updatedAt:now});
  const control=await lookup(ctx,'blueMessagingControls','by_integration','integrationId',connection.integrationId);
  if (control) await ctx.db.patch(control._id,{active:false,reason});
  const queued=await ctx.db.query('blueMessages').withIndex('by_integration_status',q=>q.eq('integrationId',connection.integrationId).eq('status','queued')).take(100);
  for (const job of queued) await ctx.db.patch(job._id,{status:'blocked',reason});
}
