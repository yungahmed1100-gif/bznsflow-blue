import React, { useEffect, useState } from 'react';

/** True on a phone-sized or touch-first screen, where scanning a code on the same screen isn't possible. */
export function usePhoneOnly() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const query = window.matchMedia('(max-width: 760px), (pointer: coarse)');
    const update = () => setPhone(query.matches);
    update(); query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  return phone;
}

/** "Stuck?" — ask Layla, or email yourself this page for a computer. */
export function SetupHelpLinks({ tr, email, phoneOnly }) {
  const page = typeof window === 'undefined' ? '' : window.location.href.split('#')[0];
  const mail = `mailto:${encodeURIComponent(email || '')}?subject=${encodeURIComponent(tr('Finish setting up Layla', 'أكمل إعداد ليلى'))}&body=${encodeURIComponent(`${tr('Open this on a computer and keep your phone with you:', 'افتح هذا الرابط على كمبيوتر وأبقِ هاتفك معك:')}\n${page}`)}`;
  return <aside className="layla-help-links" aria-label={tr('Help with connecting', 'مساعدة في الربط')}>
    <p><strong>{tr('Stuck?', 'تحتاج مساعدة؟')}</strong> {tr('Ask Layla in the chat at the bottom of the page.', 'اسأل ليلى في المحادثة أسفل الصفحة.')}</p>
    {phoneOnly && email && <div className="layla-help-actions">
      <a className="layla-secondary" href={mail}>{tr('Easier on a computer? Email me this link', 'أسهل على الكمبيوتر؟ أرسل لي الرابط بالبريد')}</a>
    </div>}
  </aside>;
}

/** After the number is connected: what's left, in plain words. */
export function AfterConnect({ tr }) {
  return <section className="layla-answer" aria-labelledby="layla-after-heading">
    <h4 id="layla-after-heading">{tr('Connected ✓ What’s next', 'تم الربط ✓ ما التالي')}</h4>
    <ol>
      <li>{tr('Meta shows whether this account needs a payment method and any WhatsApp charges. Check its billing settings for current details.', 'تعرض Meta ما إذا كان هذا الحساب يحتاج إلى وسيلة دفع وأي رسوم على واتساب. راجع إعدادات الفوترة للتفاصيل الحالية.')} <a href="https://business.facebook.com/billing_hub/payment_settings" target="_blank" rel="noopener noreferrer">{tr('Open billing settings', 'فتح إعدادات الفوترة')}</a></li>
      <li>{tr('Turn Layla’s replies on in the next step.', 'فعّل ردود ليلى في الخطوة التالية.')}</li>
      <li>{tr('Test it: send “hi” to your shop from another phone and watch Layla answer.', 'جرّبها: أرسل «مرحبا» إلى متجرك من هاتف آخر وشاهد ليلى ترد.')}</li>
    </ol>
    <p className="layla-help">{tr('Keep using WhatsApp Business on your phone as usual.', 'استمر في استخدام واتساب للأعمال على هاتفك كالمعتاد.')}</p>
  </section>;
}
