// Phase 2: product photos. Uploads go straight to Convex storage and are checked
// on save; Layla sends a product's photo the first time it is asked about in a chat.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { blueHarness, seedTenant } from './helpers/blue-tenant.mjs';
import { SECRET } from './helpers/convex-memory.mjs';
import { executeHasib } from '../convex/hasib/hasibState.js';
import { grantPlan } from '../convex/hasib/plans.js';
import { sweepOrphanPhotos } from '../convex/hasib/catalogState.js';
import { photoKind, checkPhotoBytes } from '../convex/hasib/photoBytes.js';
import { whatsappPayload, instagramMessage } from '../api/_lib/layla/blue-messaging.js';

async function setup() {
  const h = blueHarness();
  await h.enable();
  await h.m.db.insert('blueMessagingSettings', { key: 'hasib', enabled: true });
  const a = await seedTenant(h.m, { name: 'a', sector: 'Retail' });
  const b = await seedTenant(h.m, { name: 'b', sector: 'Retail', phone: '9999', waba: '8888', sender: '96890000001' });
  await h.messaging('activate', { sessionHash: a.sessionHash });
  for (const e of ['a', 'b']) await grantPlan(h.m.ctx, { email: `${e}@example.com`, plan: 'ascend', packId: 'retail' }, h.m.now());
  const as = t => (operation, args = {}) => executeHasib(h.m.ctx, { operation, sessionHash: t.sessionHash, hashSecret: SECRET, ...args }, h.m.now());
  const hasib = as(a), other = as(b);
  // What the browser does after uploading: the route checks the bytes, then the shop claims the file.
  const upload = async (who = hasib, file = h.m.putFile()) => ((await who('photo_register', { storageId: file, photoCheck: 'ok' })).ok ? file : null);
  return { h, a, b, hasib, other, upload };
}
const item = (photoId, extra = {}) => ({ requestId: randomUUID(), item: { kind: 'product', nameAr: 'عباية سوداء', nameEn: 'Black abaya', category: 'Abayas', unit: 'piece', trackStock: true, ...(photoId !== undefined ? { photoId } : {}) },
  variants: [{ sku: 'AB', options: [{ key: 'size', value: '52' }], priceMinor: 25000, costMinor: 10000, reorderPoint: 1, openingStock: 3 }], ...extra });

test('an owner gets an upload address, and a saved photo appears on the product', async () => {
  const { h, hasib, upload } = await setup();
  assert.match((await hasib('photo_upload_url')).value.url, /^https:\/\/upload\.test\//);
  const photo = await upload(hasib, h.m.putFile({ contentType: 'image/webp', size: 200000 }));
  const saved = (await hasib('item_save', item(photo))).value;
  assert.equal(saved.item.photoUrl, `https://files.test/${photo}`);
  assert.equal((await hasib('items')).value.items[0].photoUrl, `https://files.test/${photo}`);
});

test('photos are checked: images only, at most 5 MB, real, and not someone else’s', async () => {
  const { h, hasib, other, upload } = await setup();
  for (const [file, why] of [[h.m.putFile({ contentType: 'application/pdf' }), 'type'], [h.m.putFile({ size: 6 * 1024 * 1024 }), 'size'], ['_storage_999', 'missing'], ['not-an-id', 'shape']]) {
    await hasib('photo_register', { storageId: file, photoCheck: 'ok' });
    assert.equal((await hasib('item_save', item(file))).reason, 'invalid_photo', why);
  }
  assert.equal((await hasib('item_save', item(h.m.putFile()))).reason, 'invalid_photo', 'an upload that was never registered');
  const mine = await upload();
  assert.equal((await other('item_save', item(mine))).reason, 'invalid_photo', 'another shop’s upload');
  assert.equal((await other('photo_register', { storageId: mine, photoCheck: 'ok' })).reason, 'invalid_photo', 'and it cannot be claimed twice');
  await hasib('item_save', item(mine));
  assert.equal((await other('item_save', item(mine))).reason, 'invalid_photo', 'a photo already used by another shop');
});

test('replacing a photo deletes the old file; removing it clears the product', async () => {
  const { h, hasib, upload } = await setup();
  const first = await upload(), second = await upload();
  const saved = (await hasib('item_save', item(first))).value;
  const edit = photoId => hasib('item_save', { itemId: saved.item.id, item: { kind: 'product', nameAr: 'عباية سوداء', nameEn: 'Black abaya', category: 'Abayas', unit: 'piece', trackStock: true, photoId },
    variants: [{ variantId: saved.variants[0].id, sku: 'AB', options: [{ key: 'size', value: '52' }], priceMinor: 25000, costMinor: 10000, reorderPoint: 1 }] });
  assert.equal((await edit(second)).value.item.photoUrl, `https://files.test/${second}`);
  assert.deepEqual(h.m.deletedFiles, [first]);
  assert.equal((await edit('')).value.item.photoUrl, null);
  assert.deepEqual(h.m.deletedFiles, [first, second]);
});

test('Layla sends the product photo the first time it is asked about in a chat, never twice', async () => {
  const { h, a, hasib, upload } = await setup();
  const photo = await upload();
  await hasib('item_save', item(photo));
  await h.inbound(a, { from: '96891111111', text: 'Do you have the black abaya?', intent: 'prices', reply: 'Let me check' });
  const conversation = h.m.table('blueConversations').find(c => c.accountId === a.accountId);
  const images = () => h.m.table('blueMessages').filter(m => m.conversationId === conversation._id && m.media);
  assert.equal(images().length, 1);
  assert.deepEqual([images()[0].media.kind, images()[0].media.storageId, images()[0].text], ['image', photo, 'Black abaya']);
  const claim = await h.messaging('claim', { jobId: h.m.table('blueMessages').find(m => m.conversationId === conversation._id && m.direction === 'out' && !m.media)._id, intent: 'i1' });
  assert.ok(claim.value);
  await h.messaging('result', { jobId: claim.value.jobId, intent: 'i1', status: 'submitted', providerId: 'wamid.1' });
  const photoClaim = await h.messaging('claim', { jobId: images()[0]._id, intent: 'i2' });
  assert.equal(photoClaim.value.imageUrl, `https://files.test/${photo}`);
  await h.inbound(a, { from: '96891111111', text: 'How much is the black abaya?', intent: 'prices', reply: 'Let me check' });
  assert.equal(images().length, 1, 'not sent again in the same chat');
});

test('no photo job when the product has no photo', async () => {
  const { h, a, hasib } = await setup();
  await hasib('item_save', item(undefined));
  await h.inbound(a, { from: '96891111111', text: 'Do you have the black abaya?', intent: 'prices', reply: 'Let me check' });
  assert.equal(h.m.table('blueMessages').filter(m => m.media).length, 0);
});

test('provider payloads: WhatsApp image with caption, Instagram image attachment', () => {
  assert.deepEqual(whatsappPayload({ number: '968911', text: 'Black abaya', imageUrl: 'https://files.test/x', intent: 'i' }),
    { messaging_product: 'whatsapp', recipient_type: 'individual', to: '968911', type: 'image', image: { link: 'https://files.test/x', caption: 'Black abaya' }, biz_opaque_callback_data: 'i' });
  assert.deepEqual(whatsappPayload({ number: '968911', text: 'Hi', intent: 'i' }).text, { preview_url: false, body: 'Hi' });
  assert.deepEqual(instagramMessage({ text: 'Black abaya', imageUrl: 'https://files.test/x' }), { attachment: { type: 'image', payload: { url: 'https://files.test/x' } } });
  assert.deepEqual(instagramMessage({ text: 'Hi' }), { text: 'Hi' });
});

test('upload addresses are capped per shop per day', async () => {
  const { h, hasib, other } = await setup();
  for (let i = 0; i < 300; i++) assert.ok((await hasib('photo_upload_url')).ok);
  assert.equal((await hasib('photo_upload_url')).reason, 'photo_limit');
  assert.ok((await other('photo_upload_url')).ok, 'another shop is unaffected');
  h.m.advance(86400000);
  assert.ok((await hasib('photo_upload_url')).ok, 'a new day');
});

test('uploads never registered go within hours, registered but unsaved ones after a day; used and fresh ones stay', async () => {
  const { h, hasib, upload } = await setup();
  const stray = h.m.putFile(), pending = await upload(), used = await upload();
  await hasib('item_save', item(used));
  h.m.advance(2 * 3600000);
  await sweepOrphanPhotos(h.m.ctx, h.m.now());
  assert.deepEqual(h.m.deletedFiles, [stray], 'an upload never registered goes within hours');
  h.m.advance(23 * 3600000);
  const fresh = await upload();
  await sweepOrphanPhotos(h.m.ctx, h.m.now());
  assert.deepEqual(h.m.deletedFiles, [stray, pending], 'a registered upload never saved goes after a day');
  assert.ok(fresh && used);
});

test('the upload route checks real bytes: JPEG, PNG and WebP signatures, size, and a missing file', async () => {
  const bytes = a => new Uint8Array(a);
  assert.equal(photoKind(bytes([0xff, 0xd8, 0xff, 0xdb])), 'image/jpeg');
  assert.equal(photoKind(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png');
  assert.equal(photoKind(bytes([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')])), 'image/webp');
  assert.equal(photoKind(bytes([...Buffer.from('<html>')])), null);
  const storage = files => ({ storage: { get: async id => files[id] || null } });
  assert.equal(await checkPhotoBytes(storage({ a: new Blob([bytes([0xff, 0xd8, 0xff, 0xe0])]) }), 'a'), 'ok');
  assert.equal(await checkPhotoBytes(storage({ a: new Blob(['<svg onload=alert(1)>']) }), 'a'), 'bad');
  assert.equal(await checkPhotoBytes(storage({ a: new Blob([bytes([0xff, 0xd8, 0xff]), new Uint8Array(5 * 1024 * 1024)]) }), 'a'), 'bad');
  assert.equal(await checkPhotoBytes(storage({}), 'a'), 'missing');
  assert.equal(await checkPhotoBytes({ storage: { get: async () => { throw new Error('bad id'); } } }, 'x'), 'missing');
});

test('a file that fails the byte check is deleted and never registered', async () => {
  const { h, hasib } = await setup();
  const fake = h.m.putFile();
  assert.equal((await hasib('photo_register', { storageId: fake, photoCheck: 'bad' })).reason, 'invalid_photo');
  assert.deepEqual(h.m.deletedFiles, [fake]);
  assert.equal((await hasib('item_save', item(fake))).reason, 'invalid_photo');
});

test('the API never forwards a client’s own photo check', async () => {
  const { hasibArgs } = await import('../api/_lib/hasib/validate.js');
  assert.deepEqual(hasibArgs('photo_register', { storageId: 'kg2abc', photoCheck: 'ok' }), { storageId: 'kg2abc' });
  assert.equal(hasibArgs('item_save', { requestId: randomUUID(), item: { kind: 'product', nameAr: '', nameEn: 'A', category: '', unit: 'piece', trackStock: true, photoId: 'x"; drop' }, variants: [] }).item.photoId, undefined);
});

test('item_photo sets or clears just the photo of one of the shop’s products', async () => {
  const { h, hasib, other, upload } = await setup();
  const saved = (await hasib('item_save', item(undefined))).value;
  const first = await upload(), second = await upload();
  assert.equal((await hasib('item_photo', { itemId: saved.item.id, photoId: first })).value.item.photoUrl, `https://files.test/${first}`);
  assert.equal((await hasib('item_photo', { itemId: saved.item.id, photoId: second })).value.item.photoUrl, `https://files.test/${second}`);
  assert.deepEqual(h.m.deletedFiles, [first]);
  assert.equal((await other('item_photo', { itemId: saved.item.id, photoId: '' })).reason, 'item_not_found', 'not another shop’s product');
  assert.equal((await hasib('item_photo', { itemId: saved.item.id, photoId: h.m.putFile() })).reason, 'invalid_photo');
  assert.equal((await hasib('item_photo', { itemId: saved.item.id, photoId: '' })).value.item.photoUrl, null);
  assert.equal(h.m.table('blueCatalogEntries').length > 0, true);
});
