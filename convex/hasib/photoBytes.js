// Product photos are checked by their bytes, not by the type the browser declared.
// Runs in the Convex HTTP route (actions can read storage; mutations cannot).
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** The real image type from the file signature, or null. */
export function photoKind(head) {
  const at = (i, ...b) => b.every((x, k) => head[i + k] === x);
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
  return null;
}

/** 'ok' | 'bad' | 'missing' for an uploaded file. */
export async function checkPhotoBytes(ctx, storageId) {
  let blob;
  try { blob = await ctx.storage.get(storageId); } catch { return 'missing'; }
  if (!blob) return 'missing';
  if (blob.size > PHOTO_MAX_BYTES) return 'bad';
  return photoKind(new Uint8Array(await blob.slice(0, 12).arrayBuffer())) ? 'ok' : 'bad';
}
