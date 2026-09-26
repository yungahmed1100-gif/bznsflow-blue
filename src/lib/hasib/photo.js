// Product photos: shrink big phone pictures in the browser, then upload straight
// to storage. The server re-checks type and size when the product is saved.
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const MAX_SIDE = 1600, QUALITY = 0.85, SHRINK_ABOVE = 1.5 * 1024 * 1024;

/** 'photo_type' | 'photo_size' | null for a file the owner picked. */
export function photoProblem(file) {
  if (!file || !PHOTO_TYPES.includes(file.type)) return 'photo_type';
  return null;
}

/** A JPEG no larger than MAX_SIDE, or the original when it is already small. */
export async function preparePhoto(file) {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= SHRINK_ABOVE) { bitmap.close?.(); return file; }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
  return blob || file;
}

/** Uploads to the one-time address and returns the storage id. */
export async function uploadPhoto(url, blob, fetcher = fetch) {
  if (blob.size > PHOTO_MAX_BYTES) throw Object.assign(new Error('photo_size'), { reason: 'photo_size' });
  const response = await fetcher(url, { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob });
  const body = response.ok ? await response.json().catch(() => null) : null;
  if (!body?.storageId) throw Object.assign(new Error('photo_upload_failed'), { reason: 'photo_upload_failed' });
  return body.storageId;
}

/**
 * Shrink, upload, and have the server check and register a product photo.
 * @param {(action: string, body?: object) => Promise<any>} hasib the Hasib API client
 * @returns {Promise<{ photoId: string, preview: Blob }>}
 */
export async function uploadProductPhoto(hasib, file) {
  const problem = photoProblem(file);
  if (problem) throw Object.assign(new Error(problem), { reason: problem });
  const prepared = await preparePhoto(file);
  const { url } = await hasib('photo_upload_url');
  const { photoId } = await hasib('photo_register', { storageId: await uploadPhoto(url, prepared) });
  return { photoId, preview: prepared };
}
