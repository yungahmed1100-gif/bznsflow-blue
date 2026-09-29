// Product photos. The browser uploads straight to Convex storage; the HTTP route
// then checks the real bytes and the shop registers the file. Only a registered
// file of the same shop (or the product's current photo) can be attached.
import { ok, fail } from './shared.js';
import { PHOTO_MAX_BYTES } from './photoBytes.js';

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const HOUR = 3600000, SWEEP_WINDOW = 3 * HOUR, SWEEP_BATCH = 500;
const KEEP_UNREGISTERED = HOUR, KEEP_UNSAVED = 24 * HOUR;

const storageId = (ctx, id) => (typeof id === 'string' ? ctx.db.system.normalizeId('_storage', id) : null);
const attachedTo = async (ctx, id) => [
  ...(await ctx.db.query('hasibItems').withIndex('by_photo', q => q.eq('photoId', id)).take(2)),
  ...(await ctx.db.query('hasibPropertyPhotos').withIndex('by_storage', q => q.eq('storageId', id)).take(2)),
  ...(await ctx.db.query('automotiveInspectionPhotos').withIndex('by_storage', q => q.eq('storageId', id)).take(2)),
];
const registration = (ctx, id) => ctx.db.query('hasibPhotoUploads').withIndex('by_storage', q => q.eq('storageId', id)).unique();

/** `photo_register`: `photoCheck` is set by the HTTP route from the file's bytes, never by the client. */
export async function registerPhoto(ctx, accountId, a, now) {
  const id = storageId(ctx, a.storageId);
  if (!id) return fail('invalid_photo');
  const [claimed, users] = [await registration(ctx, id), await attachedTo(ctx, id)];
  if (claimed || users.length) return claimed?.accountId === accountId && !users.length ? ok({ photoId: id }) : fail('invalid_photo');
  if (a.photoCheck !== 'ok') {
    if (await ctx.db.system.get(id)) await ctx.storage.delete(id);
    return fail('invalid_photo');
  }
  await ctx.db.insert('hasibPhotoUploads', { accountId, storageId: id, at: now });
  return ok({ photoId: id });
}

/** The storage id to attach, or null: an image under 5 MB this shop registered, or the product's own photo. */
export async function checkPhoto(ctx, accountId, photoId, item) {
  const id = storageId(ctx, photoId);
  const meta = id && await ctx.db.system.get(id);
  if (!meta || !PHOTO_TYPES.includes(meta.contentType) || !(meta.size <= PHOTO_MAX_BYTES)) return null;
  if (item?.photoId === id) return id;
  const [claimed, users] = [await registration(ctx, id), await attachedTo(ctx, id)];
  return claimed?.accountId === accountId && !users.length ? id : null;
}

/** Once a product holds the file, the product row is its owner. */
export async function releaseRegistration(ctx, id) {
  const claimed = await registration(ctx, id);
  if (claimed) await ctx.db.delete(claimed._id);
}

async function sweepWindow(ctx, olderThan, keep) {
  const files = await ctx.db.system.query('_storage').withIndex('by_creation_time', q => q.gt('_creationTime', olderThan - SWEEP_WINDOW).lte('_creationTime', olderThan)).take(SWEEP_BATCH);
  let removed = 0;
  for (const f of files) {
    if ((await attachedTo(ctx, f._id)).length) continue;
    const claimed = await registration(ctx, f._id);
    if (claimed && !keep(claimed)) continue;
    if (claimed) await ctx.db.delete(claimed._id);
    await ctx.storage.delete(f._id);
    removed++;
  }
  return removed;
}
/**
 * Hourly: an upload never registered (failed or abandoned) goes after an hour; a
 * registered one never saved to a product goes after a day. Windows overlap so a
 * skipped run loses nothing.
 */
export async function sweepOrphanPhotos(ctx, now) {
  return (await sweepWindow(ctx, now - KEEP_UNREGISTERED, () => false)) + (await sweepWindow(ctx, now - KEEP_UNSAVED, () => true));
}

export async function withPhoto(ctx, publicRow, item) {
  return { ...publicRow, photoUrl: item.photoId ? await ctx.storage.getUrl(item.photoId) : null };
}
