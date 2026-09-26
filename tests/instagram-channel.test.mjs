import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEvents } from '../api/_lib/layla/webhook.js';
import { INSTAGRAM, WHATSAPP, accountOf, channelOf, isSender, selfOf } from '../api/_lib/layla/channel.js';

const NOW = Date.UTC(2026, 8, 17, 12);
// A real IGSID is 16-17 digits — longer than any E.164 subscriber number, which
// is the whole reason the old single sender test could not accept Instagram.
const IG_ACCOUNT = '17841400000000000', IGSID = '6123456789012345';
const ig = () => ({ channel: INSTAGRAM, igAccount: IG_ACCOUNT });
const wa = () => ({ channel: WHATSAPP, waba: '222', phone: '333', sender: '96888888888' });
const raw = x => Buffer.from(JSON.stringify(x));

const item = (over = {}) => ({ sender: { id: IGSID }, recipient: { id: IG_ACCOUNT }, timestamp: NOW,
  message: { mid: 'ig.mid.1', text: 'what are your prices?' }, ...over });
const envelope = (...items) => ({ object: 'instagram', entry: [{ id: IG_ACCOUNT, time: NOW, messaging: items.length ? items : [item()] }] });

test('an Instagram direct message parses into one channel-agnostic message event', () => {
  assert.deepEqual(parseEvents(raw(envelope()), ig(), NOW),
    [{ kind: 'message', id: 'ig.mid.1', from: IGSID, at: NOW, text: 'what are your prices?' }]);
});

test('an IGSID is accepted as a sender where the WhatsApp phone rule would reject it', () => {
  // The regression this split exists to prevent: /^\d{7,15}$/ rejects every
  // IGSID, so before the per-channel validator this envelope produced nothing.
  assert.equal(IGSID.length > 15, true);
  assert.equal(isSender(IGSID, INSTAGRAM), true);
  assert.equal(isSender(IGSID, WHATSAPP), false);
  assert.equal(parseEvents(raw(envelope()), ig(), NOW).length, 1);
});

test('Instagram timestamps are milliseconds, not WhatsApp seconds', () => {
  const [event] = parseEvents(raw(envelope()), ig(), NOW);
  assert.equal(event.at, NOW);
  // Seconds would be read as 1970 and a far-future value must still be refused.
  assert.throws(() => parseEvents(raw(envelope(item({ timestamp: NOW + 86400000 }))), ig(), NOW), /invalid_timestamp/);
  assert.throws(() => parseEvents(raw(envelope(item({ timestamp: String(NOW) }))), ig(), NOW), /invalid_timestamp/);
});

test('a business echo retains its provider identity so our own replies can be excluded', () => {
  const echo = item({ sender: { id: IG_ACCOUNT }, recipient: { id: IGSID },
    message: { mid: 'ig.mid.2', text: 'a human answered', is_echo: true } });
  assert.deepEqual(parseEvents(raw(envelope(echo)), ig(), NOW), [{ kind: 'echo', id: 'ig.mid.2', from: IGSID, at:NOW, text:'a human answered' }]);
});

test('unsent messages, self traffic and bodiless events create no reply work', () => {
  const deleted = item({ message: { mid: 'ig.mid.3', text: 'oops', is_deleted: true } });
  const self = item({ sender: { id: IG_ACCOUNT }, message: { mid: 'ig.mid.4', text: 'ours' } });
  const seen = item({ message: undefined, read: { mid: 'ig.mid.1' } });
  const empty = item({ message: { mid: 'ig.mid.5', text: '   ' } });
  const events=parseEvents(raw(envelope(deleted, self, seen, empty)), ig(), NOW);
  assert.equal(events[0].kind,'deleted');
  assert.equal(events[1].handoff,true);
  assert.equal(events[1].reply,null);
  assert.equal(events.length,2);
});

test('a binding answers only for its own channel, in both directions', () => {
  const whatsapp = { object: 'whatsapp_business_account', entry: [{ id: '222', changes: [] }] };
  assert.throws(() => parseEvents(raw(envelope()), wa(), NOW), /wrong_account/);
  assert.throws(() => parseEvents(raw(whatsapp), ig(), NOW), /wrong_account/);
  // An object naming no known channel is still simply malformed.
  assert.throws(() => parseEvents(raw({ object: 'page', entry: [] }), ig(), NOW), /invalid_envelope/);
});

test('an envelope for another Instagram account is refused', () => {
  const other = { object: 'instagram', entry: [{ id: '17841499999999999', time: NOW, messaging: [item()] }] };
  assert.throws(() => parseEvents(raw(other), ig(), NOW), /wrong_account/);
  assert.throws(() => parseEvents(raw(envelope(item({ sender: { id: 'not-a-number' } }))), ig(), NOW), /wrong_sender/);
});

test('a binding with no channel is still WhatsApp, so existing rows are unaffected', () => {
  assert.equal(channelOf({}), WHATSAPP);
  assert.equal(channelOf({ channel: 'telegram' }), WHATSAPP);
  assert.equal(channelOf({ channel: INSTAGRAM }), INSTAGRAM);
  // WhatsApp keeps the WABA/sender split; Instagram uses one id for both.
  assert.equal(accountOf(wa()), '222');
  assert.equal(selfOf(wa()), '96888888888');
  assert.equal(accountOf(ig()), IG_ACCOUNT);
  assert.equal(selfOf(ig()), IG_ACCOUNT);
});
