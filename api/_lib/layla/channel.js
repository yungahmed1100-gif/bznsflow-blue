// The messaging surfaces Layla answers on.
//
// Everything above this file — classify(), answer(), domain.js, the profile,
// opt-out, handoff, the reviewed===true gate — is already channel-agnostic and
// stays that way. Everything below it (envelope shape, sender identity,
// transport host, token lifetime) differs per channel. This module is the seam,
// so the difference is named in one place instead of being re-derived at every
// call site.

/** @typedef {'whatsapp'|'instagram'} Channel */

export const WHATSAPP = 'whatsapp';
export const INSTAGRAM = 'instagram';
export const CHANNELS = [WHATSAPP, INSTAGRAM];

/**
 * Meta's top-level webhook `object`, which is how the two channels are told
 * apart when they share one callback. This is read only after the signature has
 * been verified over the raw bytes, so it is trusted input by that point — but
 * it still may not *choose* a binding: the caller checks it against the
 * binding's own channel, and a mismatch is refused.
 */
export const CHANNEL_BY_OBJECT = Object.freeze({
  whatsapp_business_account: WHATSAPP,
  instagram: INSTAGRAM,
});

export const OBJECT_BY_CHANNEL = Object.freeze({
  [WHATSAPP]: 'whatsapp_business_account',
  [INSTAGRAM]: 'instagram',
});

// A WhatsApp sender is an E.164 subscriber number. An Instagram sender is an
// IGSID — an Instagram-scoped ID, opaque and scoped to one app, in practice
// 16-17 digits. The single /^\d{7,15}$/ test this replaces rejected every IGSID
// as malformed, so an unsplit validator could never have accepted Instagram at
// all. The Instagram bound matches the /^\d{1,30}$/ this codebase already uses
// for every other Meta numeric id.
const SENDER = Object.freeze({
  [WHATSAPP]: /^\d{7,15}$/,
  [INSTAGRAM]: /^\d{1,30}$/,
});

export const isChannel = (value) => CHANNELS.includes(value);

/** Normalises an absent channel to WhatsApp, which is what every row predating
 * this module is. Never infer a channel from anything client-supplied. */
export const channelOf = (c) => (isChannel(c?.channel) ? c.channel : WHATSAPP);

/** Is `value` a well-formed sender identity on this channel? */
export function isSender(value, channel = WHATSAPP) {
  const pattern = SENDER[isChannel(channel) ? channel : WHATSAPP];
  return typeof value === 'string' && pattern.test(value);
}

// WhatsApp splits the account from the sending identity: the envelope is keyed
// on the WABA while an outbound message carries the display number. Instagram
// uses one account id for both. These two accessors keep that asymmetry out of
// the parsers.

/** The id Meta puts in `entry[].id` for this binding. */
export const accountOf = (c) => (channelOf(c) === INSTAGRAM ? c.igAccount : c.waba);

/** The identity our own outbound messages carry, used to skip self-traffic. */
export const selfOf = (c) => (channelOf(c) === INSTAGRAM ? c.igAccount : c.sender);
