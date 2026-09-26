import React from 'react';
import { useHasib } from './HasibContext';

/** "Create order" in a chat thread. Renders nothing when Hasib is off for the account. */
export function ChatOrderButton({ conversationId }) {
  const hb = useHasib();
  if (!hb || !hb.overview.modules.includes('orders')) return null;
  return <button type="button" className="ld-button ld-primary ld-compact" onClick={() => hb.onCreateOrderFromChat(conversationId)}>{hb.h.t('createOrder')}</button>;
}
