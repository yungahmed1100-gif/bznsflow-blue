// Layla's setup help: the real situations owners get stuck in while connecting WhatsApp,
// each with a checked answer in English and Arabic. Matching is deterministic, so Layla
// never invents a step in Meta's flow. Anything unrecognised goes to the team on WhatsApp.
// Facts come from Meta's Embedded Signup and Coexistence documentation (checked 2026-10-02).

const S = (id, words, en, ar, extra = {}) => ({ id, words, en, ar, ...extra });

export const SCENARIOS = [
  S('regular_whatsapp', ['regular whatsapp', 'normal whatsapp', 'personal whatsapp', 'not business', 'dont have business', "don't have whatsapp business", 'واتساب عادي', 'واتساب العادي', 'الواتساب العادي', 'ما عندي واتساب اعمال', 'ماعندي واتساب للاعمال', 'شخصي'],
    'Layla works with the free WhatsApp Business app. Your number can move to it and keep its chats: 1) Download “WhatsApp Business” from the App Store or Google Play. 2) Open it and choose your same number. 3) Tap “Continue” to move your chats. Then come back here and press Connect my WhatsApp.',
    'ليلى تعمل مع تطبيق واتساب للأعمال المجاني. يمكن نقل رقمك إليه مع محادثاتك: ١) نزّل «WhatsApp Business» من App Store أو Google Play. ٢) افتحه واختر رقمك نفسه. ٣) اضغط «متابعة» لنقل المحادثات. ثم عد إلى هنا واضغط «اربط واتساب».'),
  S('which_app', ['how do i know', 'which whatsapp', 'which app', 'is it business', 'green b', 'كيف اعرف', 'اي واتساب', 'أي واتساب', 'اي تطبيق', 'حرف b'],
    'Look at the app icon on your phone: WhatsApp Business is green with a “B” inside. Regular WhatsApp has a phone inside. If you see the B, you’re ready.',
    'انظر إلى أيقونة التطبيق في هاتفك: واتساب للأعمال أخضر وبداخله حرف «B»، أما واتساب العادي فبداخله سماعة هاتف. إذا رأيت حرف B فأنت جاهز.'),
  S('update_app', ['update', 'old version', 'version', 'too old', 'latest', 'تحديث', 'حدث', 'نسخة', 'اصدار', 'إصدار', 'قديم'],
    'Open the App Store (iPhone) or Google Play (Android), search “WhatsApp Business” and tap Update. Layla needs a recent version (2.24.17 or newer).',
    'افتح App Store (آيفون) أو Google Play (أندرويد)، وابحث عن «WhatsApp Business» واضغط «تحديث». تحتاج ليلى إصداراً حديثاً (2.24.17 أو أحدث).'),
  S('no_facebook', ['no facebook', "don't have facebook", 'dont have facebook', 'without facebook', 'create facebook', 'ما عندي فيسبوك', 'ماعندي فيس', 'بدون فيسبوك', 'حساب فيسبوك'],
    'You need a Facebook login, because Meta (Facebook) runs WhatsApp. Your personal Facebook is fine. If you don’t have one, create a free account at facebook.com first, then come back.',
    'تحتاج إلى تسجيل دخول فيسبوك لأن Meta (فيسبوك) تدير واتساب. يكفي حسابك الشخصي. إذا لم يكن لديك حساب، أنشئ حساباً مجانياً على facebook.com ثم عد.'),
  S('forgot_facebook', ['forgot password', 'cant log in', "can't log in", 'facebook password', 'locked', 'نسيت كلمة', 'نسيت الباسورد', 'ما اقدر ادخل', 'كلمة السر'],
    'Reset your password at facebook.com/login/identify, then press Connect my WhatsApp again. BznsFlow never sees your Facebook password.',
    'أعد تعيين كلمة المرور من facebook.com/login/identify ثم اضغط «اربط واتساب» مجدداً. BznsFlow لا ترى كلمة مرور فيسبوك أبداً.'),
  S('no_business_account', ['business account', 'meta business', 'business manager', 'facebook page', 'website', 'portfolio', 'حساب اعمال', 'حساب أعمال', 'بزنس مانجر', 'صفحة فيسبوك', 'موقع', 'محفظة'],
    'You do not need to prepare a Facebook Page or business portfolio first. If Meta asks you to choose or create a business, follow its prompts and use your shop’s name.',
    'لا تحتاج إلى تجهيز صفحة فيسبوك أو محفظة أعمال مسبقاً. إذا طلبت Meta اختيار نشاط تجاري أو إنشاءه، اتبع التعليمات واستخدم اسم متجرك.'),
  S('qr_code', ['qr', 'scan', 'code on screen', 'barcode', 'linked devices', 'باركود', 'كود', 'امسح', 'مسح', 'الأجهزة المرتبطة'],
    'Facebook’s window shows a code. Scan it from inside WhatsApp Business on the phone with your shop’s number. WhatsApp also sends you a message with a link to the code — on one phone, just open that message and tap the link.',
    'تعرض نافذة فيسبوك كوداً. امسحه من داخل واتساب للأعمال على الهاتف الذي فيه رقم متجرك. ويرسل لك واتساب أيضاً رسالة فيها رابط إلى الكود؛ إذا كنت تستخدم هاتفاً واحداً فافتح الرسالة واضغط الرابط.'),
  S('no_message', ["didn't get", 'didnt get', 'no message', 'not received', 'never came', 'no code', 'ما وصلني', 'ماوصلت', 'ما جاني', 'لم يصل', 'ما وصل'],
    'Make sure WhatsApp Business is open on the phone with your shop’s number and has internet. The message comes from the official Facebook account inside WhatsApp Business. Wait a minute; if nothing arrives, press Connect my WhatsApp again.',
    'تأكد أن واتساب للأعمال مفتوح على الهاتف الذي فيه رقم متجرك ومتصل بالإنترنت. الرسالة تأتي من حساب فيسبوك الرسمي داخل واتساب للأعمال. انتظر دقيقة، وإذا لم يصل شيء اضغط «اربط واتساب» مجدداً.'),
  S('popup', ['nothing happens', 'popup', 'pop-up', 'window not open', "doesn't open", 'button not working', 'blocked', 'ما يفتح', 'ما فتح', 'النافذة', 'الزر ما يشتغل', 'محظور'],
    'Your browser may be blocking Facebook’s window. Allow pop-ups for this page (the icon at the end of the address bar), then press the button again. Using an in-app browser like Instagram’s? Open this page in Chrome or Safari.',
    'قد يكون متصفحك يمنع نافذة فيسبوك. اسمح بالنوافذ المنبثقة لهذه الصفحة (الأيقونة في آخر شريط العنوان) ثم اضغط الزر مجدداً. تفتح الصفحة من داخل تطبيق مثل إنستغرام؟ افتحها في Chrome أو Safari.'),
  S('facebook_error', ['error', 'invalid', 'not available', 'something went wrong', 'failed', 'خطأ', 'غير صالح', 'فشل', 'مشكلة في فيسبوك', 'ما زبط'],
    'Sorry about that — nothing has changed on your WhatsApp. Tap below to message our team with your support reference, and we’ll finish the connection with you.',
    'نعتذر عن ذلك، ولم يتغيّر شيء في واتساب لديك. اضغط أدناه لمراسلة فريقنا مع رقم المرجع، وسنكمل الربط معك.', { handoff: true }),
  S('lose_chats', ['lose', 'delete', 'chats gone', 'keep my chats', 'history', 'still use', 'keep using', 'تنحذف', 'يحذف', 'محادثاتي', 'اخسر', 'أخسر', 'اقدر استخدم'],
    'You keep WhatsApp Business on your phone and keep using it as normal — your chats stay. Layla answers alongside you, and you can take over any chat. Group chats stay on your phone only, and disappearing messages get switched off.',
    'تبقى محادثاتك ويبقى واتساب للأعمال على هاتفك وتستخدمه كالمعتاد. ليلى ترد بجانبك ويمكنك تولّي أي محادثة. محادثات المجموعات تبقى في هاتفك فقط، وتُوقَف الرسائل المؤقتة.'),
  S('cost', ['cost', 'price', 'free', 'pay', 'charge', 'card', 'how much', 'كم', 'سعر', 'مجاني', 'ادفع', 'أدفع', 'بطاقة', 'فلوس'],
    'Meta’s WhatsApp charges depend on its current pricing, your country and message type. Check the billing details shown in Meta. Your BznsFlow plan is separate.',
    'تعتمد رسوم واتساب من Meta على الأسعار الحالية وبلدك ونوع الرسالة. راجع تفاصيل الفوترة التي تعرضها Meta. اشتراك BznsFlow منفصل.'),
  S('which_number', ['which number', 'two numbers', 'more than one number', 'different number', 'اي رقم', 'أي رقم', 'رقمين', 'اكثر من رقم'],
    'Connect the number your customers already message — the one on WhatsApp Business. For “When Layla needs a human”, use a different number, like your personal WhatsApp or a staff member’s.',
    'اربط الرقم الذي يراسلك عليه العملاء أصلاً، أي رقم واتساب للأعمال. أما «عندما تحتاج ليلى إلى موظف» فاستخدم رقماً مختلفاً مثل واتساب الشخصي أو رقم أحد الموظفين.'),
  S('other_provider', ['another provider', 'api', 'twilio', 'already connected', 'other company', 'مزود', 'شركة ثانية', 'مربوط', 'api'],
    'If your number is already connected to another company’s system, open “Other ways to connect” and choose “My number already uses an API or another provider”. If it doesn’t work, tap below and we’ll move it with you.',
    'إذا كان رقمك مربوطاً بنظام شركة أخرى، افتح «طرق ربط أخرى» واختر «رقمي مرتبط بواجهة API أو مزوّد آخر». إذا لم ينجح، اضغط أدناه وسننقله معك.', { handoff: true }),
  S('changed_phone', ['new phone', 'changed phone', 'reinstall', 'disconnected', 'stopped working', 'جوال جديد', 'هاتف جديد', 'غيرت الجوال', 'انقطع', 'وقف'],
    'If you change phones or reinstall WhatsApp Business, Layla pauses. Finish setting up WhatsApp Business on the new phone and keep the “connected apps” box ticked when it asks — Layla reconnects in a few minutes.',
    'إذا غيّرت هاتفك أو أعدت تثبيت واتساب للأعمال تتوقف ليلى مؤقتاً. أكمل إعداد واتساب للأعمال على الهاتف الجديد وأبقِ خيار «التطبيقات المرتبطة» مفعّلاً عندما يسألك، وستعود ليلى خلال دقائق.'),
  S('team_contact', ['team contact', 'human', 'handover', 'who answers', 'staff number', 'جهة اتصال', 'موظف', 'تحويل', 'من يرد'],
    'That’s the WhatsApp number Layla hands customers to when she can’t answer. Use a number someone on your team checks — not the shop number you’re connecting.',
    'هو رقم الواتساب الذي تحوّل إليه ليلى العميل عندما لا تعرف الإجابة. استخدم رقماً يتابعه أحد فريقك، وليس رقم المتجر الذي تربطه.'),
  S('email_code', ['email code', 'sign in code', 'six digit', 'no email', 'spam', 'رمز الدخول', 'الكود ما وصل', 'الايميل', 'البريد', 'ستة أرقام'],
    'The sign-in code comes by email within a minute. Check your spam or promotions folder. You can request a new code after one minute.',
    'يصل رمز الدخول بالبريد خلال دقيقة. تحقّق من مجلد الرسائل غير المرغوبة أو العروض. يمكنك طلب رمز جديد بعد دقيقة.'),
  S('stuck_checklist', ['save my setup', 'saved to your account', 'greyed', 'grey button', 'disabled', "can't press", 'cant press', 'الزر رمادي', 'ما اقدر اضغط', 'محفوظ في حسابك'],
    'Look at the short list above the button: each item without a green tick still needs you. “Saved to your account” has its own button — press it. If a red message appears next to the button, it says exactly what to do.',
    'انظر إلى القائمة القصيرة فوق الزر: كل بند بدون علامة خضراء ما زال يحتاجك. «محفوظ في حسابك» له زر خاص اضغطه. وإذا ظهرت رسالة حمراء بجانب الزر فهي تخبرك بما تفعله بالضبط.'),
  S('how_long', ['how long', 'time', 'later', 'continue later', 'come back', 'كم ياخذ', 'كم يستغرق', 'وقت', 'اكمل بعدين', 'لاحقا'],
    'It takes about 10 minutes. Once you’ve signed in, your setup is saved to your account, so you can stop and continue later from the same page.',
    'يستغرق نحو ١٠ دقائق. بعد تسجيل الدخول يُحفظ إعدادك في حسابك، فيمكنك التوقف والمتابعة لاحقاً من الصفحة نفسها.'),
  S('safe', ['safe', 'secure', 'password', 'privacy', 'trust', 'see my messages', 'آمن', 'امان', 'خصوصية', 'كلمة المرور', 'تشوفون رسايلي'],
    'Your Facebook password and codes are typed only in Facebook’s own window — BznsFlow never sees them. Layla only answers from the business facts you approved, and you can pause her any time.',
    'تُكتب كلمة مرور فيسبوك والرموز في نافذة فيسبوك نفسها فقط، ولا تراها BznsFlow أبداً. ترد ليلى فقط من معلومات نشاطك التي اعتمدتها، ويمكنك إيقافها في أي وقت.'),
  S('verification', ['verify my business', 'business verification', 'documents', 'commercial registration', 'توثيق', 'تحقق النشاط', 'سجل تجاري', 'مستندات'],
    'You don’t need to verify your business or upload documents to start. Meta may suggest verification later to raise your limits — it’s optional.',
    'لا تحتاج إلى توثيق نشاطك أو رفع مستندات للبدء. قد تقترح Meta التوثيق لاحقاً لرفع الحدود، وهو اختياري.'),
  S('pause_layla', ['stop layla', 'pause', 'turn off', 'disconnect', 'wrong answer', 'اوقف ليلى', 'أوقف', 'ايقاف', 'فصل', 'رد غلط'],
    'You can pause Layla any time from Go live (or the dashboard), and take over any chat yourself. To disconnect completely, message our team and we’ll do it with you.',
    'يمكنك إيقاف ليلى مؤقتاً في أي وقت من خطوة «التشغيل» أو من لوحة التحكم، وتولّي أي محادثة بنفسك. لفصلها بالكامل راسل فريقنا وسننجز ذلك معك.'),
  S('instagram', ['instagram', 'insta', 'dm', 'انستغرام', 'انستقرام', 'إنستغرام'],
    'Instagram is separate: press “Connect Instagram” on this step and log in with your professional (business or creator) Instagram account.',
    'إنستغرام منفصل: اضغط «ربط إنستغرام» في هذه الخطوة وسجّل الدخول بحساب إنستغرام الاحترافي (نشاط تجاري أو صانع محتوى).'),
  S('human_help', ['talk to someone', 'call me', 'help me', 'do it for me', 'real person', 'support', 'كلمني', 'ساعدني', 'ساعدوني', 'موظف حقيقي', 'الدعم'],
    'Of course — tap below to message our team on WhatsApp. We’ll set it up with you.',
    'بالتأكيد، اضغط أدناه لمراسلة فريقنا على واتساب وسنجهّزه معك.', { handoff: true }),
];

// Common questions shown as one-tap chips when the panel opens.
export const SUGGESTED = ['regular_whatsapp', 'no_business_account', 'qr_code', 'cost', 'lose_chats'];
export const SUGGESTION_LABELS = {
  regular_whatsapp: ['I use regular WhatsApp', 'أستخدم واتساب العادي'],
  no_business_account: ['Do I need a business account?', 'هل أحتاج حساب أعمال؟'],
  qr_code: ['How do I scan the code?', 'كيف أمسح الكود؟'],
  cost: ['Is it free?', 'هل هو مجاني؟'],
  lose_chats: ['Will I lose my chats?', 'هل ستنحذف محادثاتي؟'],
};

/** Lowercase, drop Arabic diacritics and unify letter forms, so spellings match. */
export function normalise(text) {
  return String(text || '').toLowerCase()
    .replace(/[ً-ٰٟ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[’'`]/g, "'").replace(/\s+/g, ' ').trim();
}

/** The best-matching scenario for a question, or null. Longer phrase matches count for more. */
export function matchScenario(question) {
  const q = normalise(question);
  if (!q) return null;
  let best = null, bestScore = 0;
  for (const scenario of SCENARIOS) {
    let score = 0;
    for (const word of scenario.words) { const w = normalise(word); if (w && q.includes(w)) score += w.length; }
    if (score > bestScore) { best = scenario; bestScore = score; }
  }
  return best;
}

/**
 * Layla's answer to a setup question, in the widget's reply shape. Unrecognised questions
 * hand over to the team with the question attached, instead of guessing.
 */
export function setupHelpReply(question, lang = 'en', reference = '') {
  const ar = lang === 'ar', scenario = matchScenario(question);
  const raw = String(question || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200);
  // Never echo likely credentials, verification codes or PINs into a prefilled support message.
  const sensitive = /\b(?:pin|otp|pass(?:word|code)?|verification\s+code|security\s+code|token|secret)\b|رمز\s*(?:التحقق|الدخول|pin)|كلمه\s*المرور|كلمة\s*المرور|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?[\d٠-٩۰-۹][\d٠-٩۰-۹\s().-]{7,}[\d٠-٩۰-۹])|\b\d{6,}\b/i.test(raw);
  const safeQuestion = sensitive ? '' : raw;
  const context = `${ar ? 'مساعدة الإعداد' : 'Setup help'}${reference ? ` (${String(reference).replace(/[^a-z0-9-]/gi, '').slice(0, 32)})` : ''}${safeQuestion ? `: ${safeQuestion}` : ''}`;
  if (sensitive) return {
    reply: ar
      ? 'لحمايتك، لا تشارك كلمات المرور أو رموز PIN أو التحقق مع أي شخص، بما في ذلك فريقنا. لم نرسل سؤالك أو نحفظه. إذا احتجت مساعدة، تواصل معنا دون هذه المعلومات.'
      : 'For your security, never share passwords, PINs or verification codes with anyone, including our team. Your question was not sent or saved. If you need help, contact us without those details.',
    handoff: true, handoffContext: `${ar ? 'مساعدة الإعداد' : 'Setup help'}${reference ? ` (${String(reference).replace(/[^a-z0-9-]/gi, '').slice(0, 32)})` : ''}`, scenario: null,
  };
  if (!scenario) return { reply: ar ? 'لست متأكدة من هذا. اضغط أدناه لمراسلة فريقنا على واتساب وسيساعدك شخص حقيقي.' : 'I’m not sure about that one. Tap below to message our team on WhatsApp — a real person will help.', handoff: true, handoffContext: context, scenario: null };
  return { reply: ar ? scenario.ar : scenario.en, handoff: !!scenario.handoff, handoffContext: scenario.handoff ? context : '', scenario: scenario.id };
}
