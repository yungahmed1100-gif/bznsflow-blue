import React, { useState } from 'react';

// What a WhatsApp Business owner needs before connecting, in words a 13-year-old can follow.
// Facts checked against Meta's Coexistence documentation (2026-10-02).
export const READY_ITEMS = [
  ['app', 'WhatsApp Business on your phone', 'واتساب للأعمال على هاتفك', 'The green app with a “B” in the icon — the one your customers message. Using regular WhatsApp? Download WhatsApp Business (free) and pick your same number; your chats move over.', 'التطبيق الأخضر الذي في أيقونته حرف «B»، وهو الذي يراسلك عليه عملاؤك. تستخدم واتساب العادي؟ نزّل واتساب للأعمال (مجاناً) واختر رقمك نفسه، وستنتقل محادثاتك.'],
  ['update', 'The app updated', 'التطبيق محدّث', 'Update WhatsApp Business in the App Store or Google Play.', 'حدّث واتساب للأعمال من App Store أو Google Play.'],
  ['phone', 'Your phone with you', 'هاتفك معك', 'Charged and online — you’ll scan a code with it.', 'مشحون ومتصل بالإنترنت، فستمسح به كوداً.'],
  ['facebook', 'Your Facebook login', 'تسجيل دخول فيسبوك', 'Your personal Facebook is fine. No Facebook page or business account needed — setup creates it; you just type your shop’s name.', 'يكفي حساب فيسبوك الشخصي. لا تحتاج صفحة فيسبوك ولا حساب أعمال؛ الإعداد يُنشئه لك وتكتب اسم متجرك فقط.'],
  ['screen', 'A computer or tablet, if you can', 'كمبيوتر أو جهاز لوحي إن أمكن', 'Open this page there and scan the code with your phone. Phone only? You’ll tap a link WhatsApp sends you instead.', 'افتح هذه الصفحة عليه وامسح الكود بهاتفك. هاتف فقط؟ ستضغط رابطاً يرسله لك واتساب بدلاً من ذلك.'],
  ['email', 'An email you can open', 'بريد إلكتروني تستطيع فتحه', 'For your sign-in code.', 'لاستلام رمز الدخول.'],
  ['billing', 'Billing details, if Meta asks for them', 'بيانات الفوترة إذا طلبتها Meta', 'Meta shows its own billing and any charges in its setup. BznsFlow does not set Meta’s prices.', 'تعرض Meta إعدادات الفوترة وأي رسوم ضمن خطواتها. لا تحدد BznsFlow أسعار Meta.'],
  ['details', 'Your shop’s details', 'معلومات متجرك', 'Name, what you sell, prices, opening hours and location.', 'الاسم، وما تبيعه، والأسعار، وساعات العمل، والموقع.'],
  ['human', 'A second WhatsApp number for when Layla needs a human', 'رقم واتساب ثانٍ عندما تحتاج ليلى إلى موظف', 'Your personal number or a staff member’s — not the shop number.', 'رقمك الشخصي أو رقم أحد الموظفين، وليس رقم المتجر.'],
  ['time', 'About 10 minutes', 'نحو ١٠ دقائق', 'You can stop and continue later.', 'يمكنك التوقف والمتابعة لاحقاً.'],
];
/** The "before you start" list. Acknowledgements stay in page state, not shared browser storage. */
export function ReadyChecklist({ tr, onReady }) {
  const [ticked, setTicked] = useState(() => new Set());
  const all = ticked.size === READY_ITEMS.length;
  const toggle = id => setTicked(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const start = () => onReady();
  return <section className="layla-ready" aria-labelledby="layla-ready-heading">
    <h4 id="layla-ready-heading">{tr('Before you start, have these ready', 'قبل أن تبدأ، جهّز ما يلي')}</h4>
    <ol className="layla-ready-list">{READY_ITEMS.map(([id, en, ar, enHelp, arHelp]) => <li key={id}>
      <label className="layla-check"><input type="checkbox" checked={ticked.has(id)} onChange={() => toggle(id)} />
        <span><strong>{tr(en, ar)}</strong><small>{tr(enHelp, arHelp)}</small></span></label>
    </li>)}</ol>
    <p className="layla-help"><strong>{tr('You do NOT need:', 'لا تحتاج إلى:')}</strong> {tr('a website, a Facebook page, a Meta business account, technical knowledge or a new phone number.', 'موقع إلكتروني، أو صفحة فيسبوك، أو حساب أعمال في Meta، أو خبرة تقنية، أو رقم جديد.')}</p>
    <details className="layla-good-to-know"><summary>{tr('Good to know', 'معلومات مفيدة')}</summary><ul>
      <li>{tr('You keep using WhatsApp Business on your phone as usual — Layla answers alongside you.', 'تستمر في استخدام واتساب للأعمال على هاتفك كالمعتاد، وليلى ترد بجانبك.')}</li>
      <li>{tr('Group chats stay on your phone only. Disappearing messages get switched off.', 'محادثات المجموعات تبقى في هاتفك فقط، وتُوقَف الرسائل المؤقتة.')}</li>
      <li>{tr('If you change phones, open WhatsApp Business and keep “connected apps” ticked when asked.', 'إذا غيّرت هاتفك، افتح واتساب للأعمال وأبقِ «التطبيقات المرتبطة» مفعّلة عندما يُطلب منك.')}</li>
    </ul></details>
    <button type="button" className="layla-primary" disabled={!all} aria-describedby={all ? undefined : 'layla-ready-hint'} onClick={start}>{tr('I have everything — start', 'جهّزت كل شيء، ابدأ')}</button>
    {!all && <p id="layla-ready-hint" className="layla-cta-hint">{tr(`Tick each item to continue (${ticked.size} of ${READY_ITEMS.length}).`, `ضع علامة على كل بند للمتابعة (${ticked.size} من ${READY_ITEMS.length}).`)}</p>}
  </section>;
}
