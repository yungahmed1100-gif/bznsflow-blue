import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Icon } from '../ui/Icon';
import { waLink } from '../../lib/whatsapp';
import { mailtoLink } from '../../lib/constants';
import { getSessionId, sendChatMessage, CHAT_MAX_CHARS } from '../../lib/chat';
import laylaAvatar from '../../assets/layla-avatar.png';

// Layla web chat widget (Phase 3). Floating avatar bubble → in-page chat panel
// wired to the live n8n /webhook/chat backend. Bilingual + RTL-aware, typing
// indicator, and a WhatsApp handoff button when the backend flags handoff:true.

// `respond` replaces the live chat backend (the setup page answers from a fixed scenario list);
// `suggestions` are one-tap questions shown under the greeting.
export function ChatWidget({ t, lang = 'en', trackEvent = () => {}, onOpenChange = () => {}, respond = null, suggestions = [] }) {
  const isAr = lang === 'ar';
  const [isOpen, setIsOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]); // { role: 'user'|'layla', text, handoff?, handoffContext? }
  const [isTyping, setIsTyping] = useState(false);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const sessionRef = useRef(null);

  // Greeting seeded once, on first open, in the visitor's language.
  const openPanel = useCallback(() => {
    setIsOpen(true);
    if (!hasOpened) {
      setHasOpened(true);
      sessionRef.current = getSessionId();
      setMessages([{ role: 'layla', text: t.chat_greeting }]);
      trackEvent('ChatOpen', { source: 'widget' });
    }
  }, [hasOpened, t.chat_greeting, trackEvent]);

  const closePanel = useCallback(() => setIsOpen(false), []);

  // Report open state upward so other surfaces (the playbook popup) can stand
  // down rather than stacking a second dialog over this one.
  useEffect(() => { onOpenChange(isOpen); }, [isOpen, onOpenChange]);

  // Auto-scroll to newest message / typing indicator.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  // Focus the input when the panel opens.
  useEffect(() => {
    if (isOpen && inputRef.current) {
      const id = setTimeout(() => inputRef.current?.focus(), 260);
      return () => clearTimeout(id);
    }
  }, [isOpen]);

  // Close on Escape.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') closePanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, closePanel]);

  const send = useCallback(async (preset) => {
    const text = (typeof preset === 'string' ? preset : input).trim();
    if (!text || isTyping) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setIsTyping(true);
    trackEvent('ChatMessageSent', { source: 'widget' });

    try {
      const res = respond ? await respond(text) : await sendChatMessage(text, sessionRef.current);
      setMessages((prev) => [
        ...prev,
        {
          role: 'layla',
          text: res.reply || t.chat_error,
          handoff: res.handoff,
          handoffContext: res.handoffContext,
        },
      ]);
      if (res.handoff) trackEvent('ChatHandoff', { source: 'widget' });
    } catch (_) {
      setMessages((prev) => [...prev, { role: 'layla', text: t.chat_error }]);
    } finally {
      setIsTyping(false);
    }
  }, [input, isTyping, t.chat_error, trackEvent, respond]);

  const onInputKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className={`chat-widget${isAr ? ' chat-widget--rtl' : ''}`} dir={isAr ? 'rtl' : 'ltr'}>
      {/* Launcher bubble */}
      <button
        type="button"
        className={`chat-launcher${isOpen ? ' is-open' : ''}`}
        onClick={isOpen ? closePanel : openPanel}
        aria-label={isOpen ? t.chat_close : t.chat_open_aria}
        aria-expanded={isOpen}
      >
        <span className="chat-launcher-icons">
          <img src={laylaAvatar} alt="" className="chat-launcher-avatar" width="52" height="52" />
          <Icon name="close" size={22} className="chat-launcher-close" />
        </span>
      </button>

      {/* Invite pill (only before first open) */}
      {!isOpen && !hasOpened && (
        <button type="button" className="chat-invite" onClick={openPanel}>
          <span className="chat-invite-dot" aria-hidden="true" />
          {t.chat_invite}
        </button>
      )}

      {/* Chat panel */}
      <div className={`chat-panel${isOpen ? ' is-open' : ''}`} role="dialog" aria-label={t.chat_title} aria-modal="false">
        <header className="chat-header">
          <div className="chat-header-id">
            <span className="chat-header-avatar">
              <img src={laylaAvatar} alt="Layla" width="44" height="44" />
              <span className="chat-header-status" aria-hidden="true" />
            </span>
            <span className="chat-header-text">
              <strong>{t.chat_title}</strong>
              <span className="chat-header-sub">{t.chat_subtitle}</span>
            </span>
          </div>
          <button type="button" className="chat-header-close" onClick={closePanel} aria-label={t.chat_close}>
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className="chat-body" ref={scrollRef} tabIndex={0} aria-label={t.chat_messages_label || t.chat_title}>
          {messages.map((m, i) => (
            <div key={i} className={`chat-msg chat-msg--${m.role}`}>
              {m.role === 'layla' && (
                <img src={laylaAvatar} alt="" className="chat-msg-avatar" width="28" height="28" />
              )}
              <div className="chat-msg-bubble">
                <p>{m.text}</p>
                {m.handoff && (
                  // Two routes, never one: a visitor who does not use WhatsApp
                  // would otherwise hit a dead end at the moment they converted.
                  <div className="chat-handoff-actions">
                    <a
                      href={waLink(
                        m.handoffContext
                          ? `${t.chat_wa_prefix}: ${m.handoffContext}`
                          : t.chat_wa_prefix,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="chat-wa-btn"
                      onClick={() => trackEvent('WhatsAppClick', { source: 'chat-handoff' })}
                    >
                      <Icon name="whatsapp" size={18} />
                      <span>{t.chat_wa_cta}</span>
                    </a>
                    <a
                      href={mailtoLink(
                        t.chat_email_subject,
                        m.handoffContext
                          ? `${t.chat_wa_prefix}: ${m.handoffContext}`
                          : t.chat_wa_prefix,
                      )}
                      className="chat-email-btn"
                      onClick={() => trackEvent('EmailClick', { source: 'chat-handoff' })}
                    >
                      <Icon name="mail" size={16} />
                      <span>{t.chat_email_cta}</span>
                    </a>
                  </div>
                )}
              </div>
            </div>
          ))}

          {suggestions.length > 0 && messages.length === 1 && !isTyping && (
            <div className="chat-suggestions" role="group" aria-label={t.chat_suggestions_label || 'Suggested questions'}>
              {suggestions.map((item) => {
                const question = typeof item === 'string' ? item : item.question;
                const label = typeof item === 'string' ? item : item.label;
                return <button key={question} type="button" className="chat-suggestion" onClick={() => send(question)}>{label}</button>;
              })}
            </div>
          )}
          {isTyping && (
            <div className="chat-msg chat-msg--layla">
              <img src={laylaAvatar} alt="" className="chat-msg-avatar" width="28" height="28" />
              <div className="chat-msg-bubble chat-typing" aria-label={t.chat_typing}>
                <span></span><span></span><span></span>
              </div>
            </div>
          )}
        </div>

        <div className="chat-input-row">
          <textarea
            ref={inputRef}
            className="chat-input"
            rows="1"
            value={input}
            maxLength={CHAT_MAX_CHARS}
            placeholder={t.chat_placeholder}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onInputKey}
            aria-label={t.chat_placeholder}
          />
          <button
            type="button"
            className="chat-send"
            onClick={send}
            disabled={!input.trim() || isTyping}
            aria-label={t.chat_send}
          >
            <Icon name="arrow-right" size={20} />
          </button>
        </div>

        <p className="chat-footnote">{t.chat_footnote}</p>
      </div>
    </div>
  );
}
