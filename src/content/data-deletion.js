// Data deletion instructions, in both languages.
//
// This is the "Data Deletion Instructions URL" registered with Meta for the
// WhatsApp Embedded Signup app. Every step describes what the product does
// today: owners delete contacts and disconnect channels in the dashboard;
// full account deletion is handled by verified email requests. Retention figures match
// src/content/privacy.js. If either changes, this file must change with it.

export const DATA_DELETION_UPDATED_ISO = '2026-09-23';

const en = {
  title: 'Data Deletion Instructions',
  updated: 'Last updated 23 September 2026',
  lead: 'How to remove the data BznsFlow holds about you or your business, including data we received when you connected WhatsApp through Facebook Login for Business.',
  sections: [
    {
      h: 'Ask us to delete everything',
      p: ['Email ahmed@bznsflowai.com from the address you use to sign in, with the subject "Delete my data". Tell us the business name and, if you connected WhatsApp, the connected phone number.'],
      list: [
        'We confirm the request comes from the account owner before deleting anything.',
        'We complete the deletion within 30 days and email you when it is done. There is no charge.',
      ],
    },
    {
      h: 'What we delete',
      list: [
        'Your BznsFlow account, sign-in sessions and profile.',
        'Your business facts, services, prices and approved answers.',
        'The encrypted Meta access token and the saved IDs of your business portfolio, WhatsApp Business Account and phone number. We stop receiving and sending WhatsApp messages for that number.',
        'Contacts, lead details, consent evidence, chats and broadcast records.',
      ],
      p2: [
        'If a customer had opted out of your messages, we keep only a one-way keyed code of their number with the opt-out, so they are never messaged again. It cannot be turned back into the number.',
        'Readable message text is already deleted automatically after 30 days.',
      ],
    },
    {
      h: 'Instagram data and access',
      p: ['Include your Instagram username when requesting deletion by email. To stop the connection, select Disconnect in the Instagram connection card, or remove BznsFlow from Instagram’s connected apps. Disconnecting removes the saved credential and stops replies; existing chat records remain until deleted or their retention period ends.', 'You can delete Instagram contacts from the same Contacts screen as WhatsApp contacts. A data-deletion request delivered by Meta stops the connection and schedules deletion of its Instagram conversations and contacts. The confirmation link returned to Meta reports whether that cleanup is pending or complete. Instagram message text is retained for 30 days.'],
    },
    {
      h: 'Delete individual contacts yourself',
      p: ['In the Layla dashboard, open Contacts, choose the contact, select Delete contact, then Delete permanently. Their name, number, lead details and chat text are removed immediately. You can export your chats, contacts or a full copy of your account before deleting.'],
    },
    {
      h: 'Remove BznsFlow\'s access in Meta',
      p: ['You can also withdraw our access directly from Meta at any time, with or without emailing us:'],
      list: [
        'Open the settings of the Meta business portfolio you connected, find the list of apps connected to it, select BznsFlow (bznsflowai) and remove it.',
        'Or, from your Facebook account, open Settings, then Business integrations, and remove bznsflowai.',
      ],
      p2: ['Once access is removed, our token stops working and we can no longer read your WhatsApp Business Account or send messages from your number. Email us as well if you want the data we already hold deleted.'],
    },
    {
      h: 'If you messaged a business that uses Layla',
      p: ['That business controls its customers\' data. Ask the business to delete your contact; they can do it from their dashboard. If they cannot help, email ahmed@bznsflowai.com and we will work with them.'],
    },
  ],
};

const ar = {
  title: 'تعليمات حذف البيانات',
  updated: 'آخر تحديث ٢٣ سبتمبر ٢٠٢٦',
  lead: 'كيف تحذف البيانات التي تحتفظ بها BznsFlow عنك أو عن نشاطك، بما فيها البيانات التي استلمناها عند ربط واتساب عبر تسجيل الدخول بفيسبوك للأعمال.',
  sections: [
    {
      h: 'اطلب منّا حذف كل شيء',
      p: ['راسلنا على ahmed@bznsflowai.com من البريد الذي تسجّل الدخول به، بعنوان "احذف بياناتي". اذكر اسم النشاط، ورقم الهاتف المربوط إن كنت قد ربطت واتساب.'],
      list: [
        'نتأكد من أن الطلب صادر عن صاحب الحساب قبل حذف أي شيء.',
        'نُكمل الحذف خلال ٣٠ يوماً ونراسلك عند الانتهاء، بلا رسوم.',
      ],
    },
    {
      h: 'ما الذي نحذفه',
      list: [
        'حسابك في BznsFlow وجلسات الدخول وملفك الشخصي.',
        'معلومات نشاطك وخدماته وأسعاره والإجابات المعتمدة.',
        'رمز الوصول المشفّر من Meta والمعرّفات المحفوظة لمحفظة أعمالك وحساب واتساب للأعمال ورقم الهاتف. ونتوقف عن استقبال رسائل واتساب وإرسالها لذلك الرقم.',
        'جهات الاتصال وتفاصيل العملاء المحتملين ودليل الموافقة والمحادثات وسجلات الرسائل الجماعية.',
      ],
      p2: [
        'إذا كان أحد العملاء قد ألغى اشتراكه في رسائلك، نحتفظ فقط برمز مشفّر أحادي الاتجاه لرقمه مع إلغاء الاشتراك، حتى لا يُراسَل مجدداً. ولا يمكن تحويله إلى الرقم.',
        'نص الرسائل المقروء يُحذف تلقائياً بعد ٣٠ يوماً.',
      ],
    },
    {
      h: 'بيانات إنستغرام والوصول',
      p: ['اذكر اسم مستخدم إنستغرام عند طلب الحذف بالبريد. لإيقاف الاتصال اختر «فصل الاتصال» في بطاقة إنستغرام، أو أزل BznsFlow من التطبيقات المرتبطة في إنستغرام. الفصل يحذف بيانات الوصول ويوقف الردود؛ وتبقى المحادثات حتى حذفها أو انتهاء مدة الاحتفاظ بها.', 'يمكنك حذف جهات اتصال إنستغرام من شاشة جهات الاتصال نفسها. طلب حذف البيانات الذي ترسله Meta يوقف الاتصال ويضيف محادثات إنستغرام وجهات اتصالها إلى قائمة الحذف. يعرض رابط التأكيد المُعاد إلى Meta ما إذا كان الحذف قيد التنفيذ أو مكتملاً. تُحفظ نصوص رسائل إنستغرام لمدة ٣٠ يوماً.'],
    },
    {
      h: 'احذف جهات اتصال بعينها بنفسك',
      p: ['في لوحة ليلى افتح جهات الاتصال، واختر جهة الاتصال، ثم «حذف جهة الاتصال» ثم «حذف نهائي». يُحذف اسمها ورقمها وتفاصيلها ونص محادثتها فوراً. ويمكنك تصدير محادثاتك أو جهات اتصالك أو نسخة كاملة من حسابك قبل الحذف.'],
    },
    {
      h: 'ألغِ وصول BznsFlow من Meta',
      p: ['يمكنك أيضاً سحب وصولنا مباشرة من Meta في أي وقت، سواء راسلتنا أم لا:'],
      list: [
        'افتح إعدادات محفظة أعمال Meta التي ربطتها، وابحث عن قائمة التطبيقات المرتبطة بها، واختر BznsFlow (bznsflowai) ثم أزله.',
        'أو من حسابك على فيسبوك افتح الإعدادات ثم عمليات تكامل الأعمال، وأزل bznsflowai.',
      ],
      p2: ['بعد إلغاء الوصول يتوقف رمزنا عن العمل، ولا يعود بإمكاننا قراءة حساب واتساب للأعمال أو الإرسال من رقمك. راسلنا أيضاً إن أردت حذف البيانات التي لدينا بالفعل.'],
    },
    {
      h: 'إذا راسلت نشاطاً يستخدم ليلى',
      p: ['ذلك النشاط هو المتحكم في بيانات عملائه. اطلب منه حذف جهة اتصالك، ويمكنه ذلك من لوحته. وإن لم يستطع المساعدة راسلنا على ahmed@bznsflowai.com وسنتعاون معه.'],
    },
  ],
};

export const DATA_DELETION = { en, ar };
