import { createHmac, timingSafeEqual } from 'node:crypto';
import { PilotError } from './config.js';
import { CHANNEL_BY_OBJECT, INSTAGRAM, accountOf, channelOf, isSender } from './channel.js';
export const MAX_BODY = 65536;
const id = x => typeof x === 'string' && /^[A-Za-z0-9_.:=/-]{1,220}$/.test(x);
const phone = x => typeof x === 'string' && /^\d{7,15}$/.test(x);
export function signatureValid(raw, signature, secret) {
  if (!secret || !Buffer.isBuffer(raw) || typeof signature !== 'string' || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  return timingSafeEqual(createHmac('sha256', secret).update(raw).digest(), Buffer.from(signature.slice(7), 'hex'));
}
export async function rawBody(req) {
  // Vercel installs a lazy JSON-parsing getter. Do not invoke it: consume the
  // original stream instead. Already materialized JSON cannot prove raw bytes.
  const body = Object.getOwnPropertyDescriptor(req, 'body');
  if (body && 'value' in body && Buffer.isBuffer(body.value)) {
    if (body.value.length > MAX_BODY) throw new PilotError('body_too_large', 413);
    return body.value;
  }
  if (body && 'value' in body && body.value !== undefined && body.value !== null) throw new PilotError('raw_body_required', 503);
  // Vercel replays data/end events after buffering the IncomingMessage. Its
  // original readableEnded flag can already be true, so use the replay events.
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', chunk => {
      const b = Buffer.from(chunk); size += b.length;
      if (size > MAX_BODY) { chunks.length = 0; reject(new PilotError('body_too_large', 413)); return; }
      chunks.push(b);
    });
    req.once('end', () => resolve(Buffer.concat(chunks)));
    req.once('error', reject);
    req.once('aborted', () => reject(new PilotError('incomplete_body', 400)));
  });
}
/**
 * Turn one verified webhook body into the channel-agnostic events the domain
 * understands. The envelope names its own channel, but it may not *choose* one:
 * a binding answers for exactly the channel it was created for, so an Instagram
 * envelope arriving on a WhatsApp binding is refused rather than parsed.
 */
export function parseEvents(raw, c, now) {
  let body;
  try { body = JSON.parse(raw.toString('utf8')); } catch { throw new PilotError('invalid_json'); }
  const channel = CHANNEL_BY_OBJECT[body?.object];
  if (!channel || !Array.isArray(body.entry) || body.entry.length > 100) throw new PilotError('invalid_envelope');
  if (channel !== channelOf(c)) throw new PilotError('wrong_account', 403);
  return channel === INSTAGRAM ? instagramEvents(body, c, now) : whatsappEvents(body, c, now);
}

function whatsappEvents(body, c, now) {
  if (!c.waba || !c.phone || !c.sender) throw new PilotError('configuration_missing', 503);
  const events = [];
  const timestamp = x => {
    if (typeof x !== 'string' || !/^\d{1,12}$/.test(x)) throw new PilotError('invalid_timestamp');
    const at = Number(x) * 1000;
    if (at <= 0 || at > now + 300000) throw new PilotError('invalid_timestamp');
    return at;
  };
  for (const entry of body.entry) {
    if (entry?.id !== c.waba) throw new PilotError('wrong_account', 403);
    if (!Array.isArray(entry.changes) || entry.changes.length > 100) throw new PilotError('invalid_changes');
    for (const change of entry.changes) {
      if (!change || typeof change.field !== 'string' || !change.value || typeof change.value !== 'object') throw new PilotError('invalid_change');
      const v = change.value;
      if (!['messages','smb_message_echoes','user_preferences'].includes(change.field)) continue;
      if (v.metadata?.phone_number_id !== c.phone || v.messaging_product !== 'whatsapp') throw new PilotError('wrong_sender', 403);
      for (const name of ['messages','statuses','message_echoes','user_preferences']) if (v[name] !== undefined && (!Array.isArray(v[name]) || v[name].length > 100)) throw new PilotError('invalid_events');
      if (change.field === 'messages') {
        for (const m of v.messages || []) {
          if (!m || !id(m.id) || !phone(m.from)) throw new PilotError('invalid_message');
          const at = timestamp(m.timestamp);
          if (m.from === c.sender || m.from_business === true || m.type !== 'text') continue;
          if (typeof m.text?.body !== 'string' || !m.text.body.trim() || m.text.body.length > 1000) continue;
          events.push({ kind: 'message', id: m.id, from: m.from, at, text: m.text.body });
        }
        for (const r of v.statuses || []) {
          if (!r || !id(r.id) || !phone(r.recipient_id)) throw new PilotError('invalid_receipt');
          if (!['sent','delivered','read','failed'].includes(r.status)) continue;
          if (r.biz_opaque_callback_data !== undefined && !id(r.biz_opaque_callback_data)) throw new PilotError('invalid_correlation');
          events.push({ kind: 'receipt', id: r.id, recipient: r.recipient_id, status: r.status, at: timestamp(r.timestamp), intent: r.biz_opaque_callback_data || null });
        }
      }
      // Coexistence echoes never generate replies; pause before processing this envelope.
      if (change.field === 'smb_message_echoes') for (const m of v.message_echoes || []) {
        if (!m || !id(m.id) || !phone(m.to) || m.from !== c.sender) throw new PilotError('invalid_echo');
        events.push({ kind: 'takeover', id: `echo:${m.id}`, from: m.to });
      }
      if (change.field === 'user_preferences') for (const p of v.user_preferences || []) {
        if (!p || !phone(p.wa_id)) throw new PilotError('invalid_preference');
        // Resume requires explicit owner review; an unknown preference fails closed.
        if (p.value !== 'resume') events.push({ kind: 'optout', from: p.wa_id });
      }
      if (events.length > 100) throw new PilotError('too_many_events', 413);
    }
  }
  return events;
}

// Instagram's envelope shares no structure with WhatsApp's. Entries carry a
// `messaging` array of individual events rather than a `changes` array of
// batched values, there is no `metadata`/`messaging_product` pair to check, and
// timestamps arrive as milliseconds where WhatsApp sends seconds as a string.
// That is why this is a sibling of whatsappEvents and not a branch inside it.
function instagramEvents(body, c, now) {
  const account = accountOf(c);
  if (!account) throw new PilotError('configuration_missing', 503);
  const events = [];
  const timestamp = x => {
    if (!Number.isSafeInteger(x) || x <= 0 || x > now + 300000) throw new PilotError('invalid_timestamp');
    return x;
  };
  for (const entry of body.entry) {
    if (entry?.id !== account) throw new PilotError('wrong_account', 403);
    if (!Array.isArray(entry.messaging) || entry.messaging.length > 100) throw new PilotError('invalid_changes');
    for (const item of entry.messaging) {
      if (!item || typeof item !== 'object') throw new PilotError('invalid_change');
      const senderId = item.sender?.id, recipientId = item.recipient?.id;
      if (!isSender(senderId, INSTAGRAM) || !isSender(recipientId, INSTAGRAM)) throw new PilotError('wrong_sender', 403);
      // Reads, postbacks and reactions carry no message body. They are authentic
      // and create no reply work, exactly like an unknown WhatsApp change field.
      const message = item.message;
      if (!message || typeof message !== 'object') continue;
      if (!id(message.mid)) throw new PilotError('invalid_message');
      // An echo is the business answering from the Instagram app itself, so the
      // contact is the recipient rather than the sender. Same meaning as a
      // WhatsApp smb_message_echo: a human has taken this thread over.
      if (message.is_self === true || item.is_self === true) continue;
      if (message.is_echo === true) {
        if (senderId !== account) throw new PilotError('wrong_sender',403);
        events.push({kind:'echo',id:message.mid,from:recipientId,at:timestamp(item.timestamp),text:typeof message.text==='string'?message.text.slice(0,1000):'[Message needs human attention]'});
        continue;
      }
      if (senderId === account) continue;
      if (recipientId !== account) throw new PilotError('wrong_sender',403);
      // An unsent message must never be answered after the fact.
      if (message.is_deleted === true) { events.push({kind:'deleted',id:message.mid,from:senderId}); continue; }
      if (typeof message.text !== 'string' || !message.text.trim() || message.text.length > 1000) {
        events.push({kind:'message',id:message.mid,from:senderId,at:timestamp(item.timestamp),text:'[Message needs human attention]',handoff:true,reply:null,intent:'human'});
        continue;
      }
      events.push({ kind: 'message', id: message.mid, from: senderId, at: timestamp(item.timestamp), text: message.text });
    }
    if (events.length > 100) throw new PilotError('too_many_events', 413);
  }
  return events;
}
