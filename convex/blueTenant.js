import { instagramConnection, instagramRow } from './blueInstagramState.js';
// Tenant resolution for dashboard and campaign operations. The only accepted
// identity is the server-derived session hash of a verified account's draft;
// a client-supplied account, integration or contact id is never trusted alone.
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export async function resolveTenant(ctx, sessionHash, now) {
  if (!hash(sessionHash)) return { error: 'sign_in_required' };
  const row = await ctx.db.query('blueReviewSessions').withIndex('by_hash', q => q.eq('sessionHash', sessionHash)).unique();
  if (!row?.accountId || row.expiresAt <= now) return { error: 'sign_in_required' };
  const ig=await instagramConnection(ctx,row.accountId);
  const instagram=instagramRow(row,ig,now);
  const connected = !!row.integration && ['connected', 'paused'].includes(row.status);
  return { row, accountId: row.accountId, integration: row.integration || null, connected:connected || !!instagram, instagram, instagramConnection:ig };
}

/** Load a document and prove it belongs to this account (and optionally integration). */
export async function owned(ctx, id, accountId, table) {
  if (typeof id !== 'string' || id.length > 64) return null;
  // Convex ids are table-typed: refuse an id from another table before loading it.
  if (table && ctx.db.normalizeId && !ctx.db.normalizeId(table, id)) return null;
  let doc = null;
  try { doc = await ctx.db.get(id); } catch { return null; }
  if (!doc || doc.accountId !== accountId || (table && doc.table && doc.table !== table)) return null;
  return doc;
}

export function encodeCursor(at, id) { return `${Number(at) || 0}:${id}`; }
export function decodeCursor(cursor) {
  const m = typeof cursor === 'string' && cursor.match(/^(\d{1,16}):([A-Za-z0-9_-]{1,64})$/);
  return m ? { at: Number(m[1]), id: m[2] } : null;
}
/** Rows are ordered by `field` descending; drop everything up to and including the cursor row. */
export function afterCursor(rows, cursor, field) {
  if (!cursor) return rows;
  const index = rows.findIndex(r => r._id === cursor.id);
  if (index >= 0) return rows.slice(index + 1);
  return rows.filter(r => (r[field] || 0) < cursor.at);
}

export const ownsIntegration = (tenant, id) => !!id && (tenant.integration?.id===id || tenant.instagram?.integration.id===id);
