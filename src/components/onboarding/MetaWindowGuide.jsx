import React from 'react';

/** What the owner will see in Facebook's window, step by step, so nothing there is a surprise. */
export function MetaWindowGuide({ tr, phoneOnly }) {
  const steps = [
    [tr('Log in to Facebook.', 'سجّل الدخول إلى فيسبوك.')],
    [tr('Press “Continue” to allow BznsFlow.', 'اضغط «متابعة» للسماح لـ BznsFlow.')],
    [tr('Type your shop’s WhatsApp number.', 'اكتب رقم واتساب متجرك.')],
    [tr('Check the name and photo are your shop’s, then continue.', 'تأكد أن الاسم والصورة لمتجرك ثم تابع.')],
    [tr('If asked for a “business”, type your shop’s name.', 'إذا طُلب «نشاط تجاري»، اكتب اسم متجرك.')],
    [phoneOnly
      ? tr('Open the message WhatsApp sends you from Facebook and tap its link.', 'افتح الرسالة التي يرسلها لك واتساب من فيسبوك واضغط رابطها.')
      : tr('Scan the code on screen from inside WhatsApp Business on your phone — WhatsApp also sends you a message with a link to it.', 'امسح الكود الظاهر على الشاشة من داخل واتساب للأعمال في هاتفك، ويرسل لك واتساب أيضاً رسالة فيها رابط إليه.')],
    [tr('Choose your time zone.', 'اختر منطقتك الزمنية.')],
    [tr('Accept the terms.', 'وافق على الشروط.')],
    [tr('Press “Finish”. You’ll come back here automatically.', 'اضغط «إنهاء» وستعود إلى هنا تلقائياً.')],
  ];
  return <details className="layla-meta-guide" open>
    <summary>{tr('What you’ll see in Facebook’s window', 'ما ستراه في نافذة فيسبوك')}</summary>
    <ol>{steps.map(([text], i) => <li key={i}>{text}</li>)}</ol>
    <p className="layla-help">{tr('Passwords and codes go only into Facebook’s window — BznsFlow never sees them.', 'كلمات المرور والرموز تُكتب في نافذة فيسبوك فقط، ولا تراها BznsFlow أبداً.')}</p>
  </details>;
}
