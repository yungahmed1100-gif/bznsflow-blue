import React, { useState } from 'react';

const STORES = [['App Store (iPhone)', 'https://apps.apple.com/app/whatsapp-business/id1386412706'], ['Google Play (Android)', 'https://play.google.com/store/apps/details?id=com.whatsapp.w4b']];

/** The two WhatsApp icons side by side, drawn so an owner can match them to their phone. */
function AppIcon({ business }) {
  return <svg className="layla-app-icon" width="48" height="48" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <rect width="48" height="48" rx="12" fill="#25D366" />
    <path d="M24 10a14 14 0 0 0-12 21.2L10 38l7-1.9A14 14 0 1 0 24 10z" fill="#fff" />
    {business
      ? <text x="24" y="30" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="15" fill="#25D366">B</text>
      : <path d="M19.5 17.5c.4-.9.8-.9 1.2-.9h1c.3 0 .7.1.9.7l1.4 3.3c.1.3 0 .6-.1.8l-.9 1.1c.8 1.5 2.1 2.8 3.7 3.6l1.1-1c.3-.2.6-.3.9-.1l3.2 1.5c.4.2.6.5.5.9-.2 1.4-1.6 2.6-3 2.6-4.8-.3-9.6-5.1-9.9-9.9 0-.9.4-1.8 1-2.6z" fill="#25D366" />}
  </svg>;
}

/** "Which WhatsApp do you use for your shop?" — Business goes on; regular WhatsApp gets a switch guide. */
export function WhichWhatsApp({ tr, onBusiness }) {
  const [regular, setRegular] = useState(false);
  return <section className="layla-which" aria-labelledby="layla-which-heading">
    <h4 id="layla-which-heading">{tr('Which WhatsApp do you use for your shop?', 'أي واتساب تستخدم لمتجرك؟')}</h4>
    <p className="layla-help">{tr('Look at the icon on your phone.', 'انظر إلى الأيقونة في هاتفك.')}</p>
    <div className="layla-which-cards">
      <button type="button" className="layla-which-card" onClick={onBusiness}>
        <AppIcon business /><span><strong>{tr('WhatsApp Business', 'واتساب للأعمال')}</strong><small>{tr('Green icon with a “B”', 'أيقونة خضراء فيها حرف «B»')}</small></span>
      </button>
      <button type="button" className="layla-which-card" aria-expanded={regular} aria-controls="layla-switch-guide" onClick={() => setRegular(true)}>
        <AppIcon /><span><strong>{tr('WhatsApp', 'واتساب')}</strong><small>{tr('Green icon with a phone', 'أيقونة خضراء فيها سماعة هاتف')}</small></span>
      </button>
    </div>
    {regular && <div id="layla-switch-guide" className="layla-answer" role="region" aria-label={tr('Switch to WhatsApp Business', 'الانتقال إلى واتساب للأعمال')}>
      <h4>{tr('Switch to WhatsApp Business — keep your number and chats', 'انتقل إلى واتساب للأعمال واحتفظ برقمك ومحادثاتك')}</h4>
      <ol>
        <li>{tr('Download WhatsApp Business (free):', 'نزّل واتساب للأعمال (مجاناً):')} {STORES.map(([name, href]) => <a key={href} href={href} target="_blank" rel="noopener noreferrer" className="layla-store-link">{name}</a>)}</li>
        <li>{tr('Open it and choose your same number.', 'افتحه واختر رقمك نفسه.')}</li>
        <li>{tr('Tap “Continue” to move your chats over, then add your shop’s name.', 'اضغط «متابعة» لنقل محادثاتك، ثم أضف اسم متجرك.')}</li>
      </ol>
      <button type="button" className="layla-primary" onClick={onBusiness}>{tr('Done — I now use WhatsApp Business', 'تم، أستخدم الآن واتساب للأعمال')}</button>
    </div>}
  </section>;
}
