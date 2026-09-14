import { createHash } from 'node:crypto';
import { PilotError } from './config.js';
import { parseEvents } from './webhook.js';

// Called only after validating the signature over original bytes. Client input
// cannot choose a tenant; the durable exclusive sender registry is authoritative.
export async function routeCustomerEnvelope(raw, c, registry, now) {
  let body;
  try { body = JSON.parse(raw.toString('utf8')); } catch { throw new PilotError('invalid_json'); }
  if (body?.object !== 'whatsapp_business_account' || !Array.isArray(body.entry) || body.entry.length > 100) throw new PilotError('invalid_envelope');
  const groups = new Map();
  for (const entry of body.entry) {
    if (!/^\d{1,30}$/.test(entry?.id || '') || !Array.isArray(entry.changes) || entry.changes.length > 100) throw new PilotError('invalid_changes');
    for (const change of entry.changes) {
      if (!change || typeof change.field !== 'string') throw new PilotError('invalid_change');
      if (!['messages', 'smb_message_echoes', 'user_preferences'].includes(change.field)) continue;
      const phone = change.value?.metadata?.phone_number_id;
      if (!/^\d{1,30}$/.test(phone || '')) throw new PilotError('wrong_sender', 403);
      const key = `${entry.id}:${phone}`;
      if (!groups.has(key)) groups.set(key, { waba: entry.id, phone, changes: [] });
      groups.get(key).changes.push(change);
    }
  }
  if (groups.size > 10) throw new PilotError('too_many_bindings', 413);
  const result = []; let total = 0;
  for (const group of groups.values()) {
    const own = group.waba === c.waba && group.phone === c.phone;
    const integration = own ? null : await registry.binding(group.waba, group.phone);
    if (!own && (!integration || integration.app_id !== c.app)) throw new PilotError('unknown_sender_binding', 403);
    const configuration = own ? c : { ...c, waba: integration.waba_id, phone: integration.phone_id, sender: integration.sender };
    const events = parseEvents(Buffer.from(JSON.stringify({ object: body.object, entry: [{ id: group.waba, changes: group.changes }] })), configuration, now);
    total += events.length; if (total > 100) throw new PilotError('too_many_events', 413);
    result.push({ integration, events });
  }
  return result;
}
export async function persistCustomerEvents(registry, integration, events) {
  if (!events.length) return;
  await registry.inbox(events.map(event => ({ account_id: integration.account_id, integration_id: integration.id,
    event_id: createHash('sha256').update(event.kind === 'message' ? `message:${event.id}` : JSON.stringify(event)).digest('hex'), event })));
}
