// Privacy policy content, in both languages.
//
// NOT in src/i18n/*.js on purpose. Those files are ~292 short UI strings and
// are checked key-for-key by tests/contracts.test.mjs; dropping a few thousand
// words of prose into them would drown the interface strings and make that
// diff unreadable. This is long-form content, so it lives with content.
//
// EVERY FACTUAL CLAIM HERE WAS READ OUT OF THE CODEBASE, not from a template:
//   - the fields come from the live `web_accounts` / `web_conversations` schema
//   - the cookie list is COOKIES.md, which is itself enforced by a contract test
//   - the sub-processors are the hosts in vercel.json's CSP plus api/_lib/*
//   - retention comes from the prune intervals in the migrations
// If any of those change, this file is wrong and must change with them.

export const PRIVACY_UPDATED_ISO = '2026-09-23';

/** Shared across both languages — a table of who else touches the data. */
const PROCESSORS = [
  {
    en: ['Vercel', 'Hosts the website and runs its server code. Sees request logs, including IP addresses.', 'United States / global'],
    ar: ['Vercel', 'يستضيف الموقع ويشغّل الكود على الخادم. يطّلع على سجلات الطلبات بما فيها عناوين IP.', 'الولايات المتحدة / عالمي'],
  },
  {
    en: ['Supabase', 'The database holding your account, and chat conversations.', 'Singapore (ap-southeast-1)'],
    ar: ['Supabase', 'قاعدة البيانات التي تحفظ حسابك ومحادثاتك.', 'سنغافورة (ap-southeast-1)'],
  },
  {
    en: ['Google (Apps Script, Sheets, Gmail)', 'Sends your sign-in code and our emails, and stores enquiries in our internal sheet.', 'United States / global'],
    // Latin left intact rather than joined with Arabic "و": these are product
    // names, and "وSheets" sets a waw hard against Latin type with no space,
    // which reads as a typo. <bdi> in the table isolates the run either way.
    ar: ['Google (Apps Script, Sheets, Gmail)', 'يرسل رمز الدخول ورسائلنا، ويحفظ الطلبات في جدولنا الداخلي.', 'الولايات المتحدة / عالمي'],
  },
  {
    en: ['OpenAI', 'Generates the replies in our chat assistant. Receives the messages you type into it.', 'United States'],
    ar: ['OpenAI', 'يولّد ردود مساعد المحادثة لدينا، ويستقبل الرسائل التي تكتبها فيه.', 'الولايات المتحدة'],
  },
  {
    en: ['Meta (Facebook)', 'Measures our advertising. Receives a pseudonymous identifier, not your name.', 'United States / global'],
    ar: ['Meta (Facebook)', 'يقيس أداء إعلاناتنا. يستقبل معرّفاً مستعاراً لا اسمك.', 'الولايات المتحدة / عالمي'],
  },
  {
    en: ['Convex', 'The database for Layla business accounts: WhatsApp and Instagram conversations, contacts, lead details, consent records and broadcasts.', 'European Union (Ireland)'],
    ar: ['Convex', 'قاعدة بيانات حسابات ليلى للأنشطة: محادثات واتساب وإنستغرام وجهات الاتصال وتفاصيل العملاء المحتملين وسجلات الموافقة والرسائل الجماعية.', 'الاتحاد الأوروبي (أيرلندا)'],
  },
  {
    en: ['Meta (WhatsApp Business Platform and Instagram)', 'Carries WhatsApp and Instagram messages between a business and its customers, including text, channel-specific account identifiers, phone numbers for WhatsApp, and profile information.', 'United States / global'],
    ar: ['Meta (واتساب للأعمال وإنستغرام)', 'تنقل رسائل واتساب وإنستغرام بين النشاط وعملائه، بما فيها النصوص ومعرّفات الحسابات وأرقام واتساب ومعلومات الملفات الشخصية.', 'الولايات المتحدة / عالمي'],
  },
  {
    en: ['Resend', 'Sends the sign-in code for the Layla business dashboard.', 'United States'],
    ar: ['Resend', 'يرسل رمز الدخول إلى لوحة ليلى للأنشطة.', 'الولايات المتحدة'],
  },
  {
    en: ['Google Fonts', 'Serves the typefaces. Your browser requests them directly, which exposes your IP address to Google.', 'United States / global'],
    ar: ['Google Fonts', 'يقدّم الخطوط. يطلبها متصفحك مباشرة، ما يكشف عنوان IP لديك لشركة Google.', 'الولايات المتحدة / عالمي'],
  },
  {
    en: ['Google / LinkedIn sign-in', 'Only if you choose one of those buttons. They confirm your identity and email to us.', 'United States / global'],
    ar: ['تسجيل الدخول عبر Google / LinkedIn', 'فقط إذا اخترت أحد هذين الزرّين. يؤكّدان لنا هويتك وبريدك الإلكتروني.', 'الولايات المتحدة / عالمي'],
  },
];

const COOKIES = [
  {
    en: ['bf_locale', 'Necessary', '1 year', 'Remembers whether you chose Arabic or English.'],
    ar: ['bf_locale', 'ضروري', 'سنة واحدة', 'يتذكّر اختيارك للعربية أو الإنجليزية.'],
  },
  {
    en: ['bf_session', 'Necessary', '30 days', 'Keeps you signed in. Holds a random token; the database stores only a hash of it.'],
    ar: ['bf_session', 'ضروري', '٣٠ يوماً', 'يبقيك مسجّل الدخول. يحمل رمزاً عشوائياً، ولا تحفظ قاعدة البيانات سوى بصمته.'],
  },
  {
    en: ['bf_csrf', 'Necessary', '30 days', 'Protects your session from cross-site request forgery.'],
    ar: ['bf_csrf', 'ضروري', '٣٠ يوماً', 'يحمي جلستك من تزوير الطلبات عبر المواقع.'],
  },
  {
    en: ['bf_oauth', 'Necessary', '10 minutes', 'Holds one in-progress social sign-in. Deleted the moment you return.'],
    ar: ['bf_oauth', 'ضروري', '١٠ دقائق', 'يحفظ عملية تسجيل دخول جارية عبر مزوّد. يُحذف فور عودتك.'],
  },
  {
    en: ['_fbp, _fbc', 'Marketing', '~90 days', 'Set by the Meta pixel to measure our advertising.'],
    ar: ['_fbp, _fbc', 'تسويقي', '~٩٠ يوماً', 'يضعهما بيكسل Meta لقياس أداء إعلاناتنا.'],
  },
  {
    en: ['bznsflow_chat_session, bf_playbook_seen, bf_uid', 'Browser storage', 'Until cleared', 'Keep your chat continuous, stop a pop-up repeating, and identify you to Meta pseudonymously.'],
    ar: ['bznsflow_chat_session, bf_playbook_seen, bf_uid', 'تخزين المتصفح', 'حتى تمسحها', 'تُبقي محادثتك متصلة، وتمنع تكرار نافذة منبثقة، وتعرّفك إلى Meta باسم مستعار.'],
  },
];

const en = {
  title: 'Privacy Policy',
  updated: 'Last updated 23 September 2026',
  lead: 'This explains what BznsFlow collects when you use this website, why, who else sees it, and what you can ask us to do about it. It is written to be read, not to be survived.',
  processorsHead: ['Who', 'What they do', 'Where'],
  cookiesHead: ['Name', 'Type', 'Lasts', 'What it does'],
  sections: [
    {
      h: 'Who we are',
      p: [
        'BznsFlow builds and runs AI front-office, website, CRM and automation systems for businesses. This policy covers the website at www.bznsflowai.com and the sign-in, chat and enquiry features on it.',
        'It does not cover systems we build and operate for a client under a separate agreement. In those, the client is responsible for their own customers\' data and we act on their instructions.',
        'For anything in this policy, contact ahmed@bznsflowai.com.',
      ],
    },
    {
      h: 'What we collect',
      p: ['Three ways, and they are quite different.'],
      sub: [
        {
          h: 'What you give us',
          list: [
            'When you sign in: your email address. That is all that is needed to create an account.',
            'When you complete your profile: your name, phone number, country and industry.',
            'When you request the playbook: your name and email address.',
            'When you use the chat assistant: whatever you type into it, and the replies.',
          ],
        },
        {
          h: 'What we collect automatically',
          list: [
            'Your IP address, briefly, as part of limiting how often our sign-in and chat endpoints can be called. It is used as a counter key and expires within days.',
            'Standard server request logs, held by our hosting provider.',
            'The page you were on when you submitted an enquiry.',
            'Anonymous performance measurements about how fast pages load.',
          ],
        },
        {
          h: 'What sign-in providers tell us',
          p: [
            'If you sign in with Google or LinkedIn, we receive your email address, your name, and a permanent identifier that provider uses for you. We store that identifier so we recognise you next time, even if you later change your email with them.',
            'We never receive your password, and we cannot see anything else in your account there.',
          ],
        },
      ],
    },
    {
      h: 'What we never collect',
      list: [
        'We do not ask for or store payment card details anywhere on this website.',
        'We do not store your one-time sign-in codes. Only a one-way hash is kept, so a copy of our database could not be used to log in as you.',
        'We do not store your session token either — only a hash of it.',
        'We do not buy personal data from third parties.',
      ],
    },
    {
      h: 'Layla for businesses: WhatsApp and Instagram messages',
      p: [
        'A business that connects its WhatsApp number to Layla decides why its customers\' data is processed. For that data the business is responsible, and BznsFlow processes it on the business\'s behalf. If you messaged a business that uses Layla, contact that business first; we will help them answer you.',
      ],
      sub: [
        {
          h: 'Connecting WhatsApp through Meta',
          p: [
            'A business connects its WhatsApp number through Meta\'s own sign-up window (Facebook Login for Business, WhatsApp Embedded Signup). The business owner chooses which business portfolio, WhatsApp Business Account and phone number to share.',
          ],
          list: [
            'We receive an access token limited to the assets the owner shared. It is stored encrypted, used only by our server, and never sent to a browser or included in exports.',
            'We read the WhatsApp Business Account and phone number: their IDs, the number, its registration and display-name status and messaging limit, and the business\'s approved message templates.',
            'We do not receive the owner\'s Facebook password, profile, friends, email address or any other Facebook account data, and Facebook Login is not used to sign in to BznsFlow.',
            'The owner can remove our access at any time from the apps connected to their Meta business portfolio, or by emailing us. See our data deletion page at /en/data-deletion.',
          ],
        },
        {
          h: 'Connecting Instagram',
          p: ['You may connect an Instagram professional account through Instagram Login, independently of WhatsApp. We store the account ID and username, encrypted access credentials, customer-scoped identifiers and direct-message conversations. We refresh valid credentials so the connection can continue.'],
          list: ['We use this access to answer customer-initiated DMs and let your team take over conversations. Instagram contacts are kept separate from WhatsApp contacts. We do not use this connection for public comments, publishing or marketing broadcasts.', 'Instagram message text and message records follow the 30-day retention below. Disconnecting stops replies and removes the saved access credential; it does not automatically delete existing conversations. You may delete contacts in the dashboard or request deletion. Removing access through Meta stops the connection; a Meta data-deletion request also schedules deletion of the associated Instagram conversations and contacts.'],
        },
        {
          h: 'What Layla stores for a business',
          list: [
            'Contacts: each customer\'s WhatsApp number, their WhatsApp profile name, a name they give in the chat, and a name the business enters. A contact is created when a customer messages the business, or when the business adds or imports it.',
            'Lead details: answers a customer gives to Layla\'s short questions, such as the service wanted, a preferred date or area, a budget or a timeline, with where each detail came from. For medical, legal and finance businesses Layla only asks for booking details, never symptoms, case details or finances.',
            'Qualification: whether the required details are complete. Layla marks this with fixed rules, and the business can change it. No automated decision with legal or similarly significant effect is made.',
            'Consent evidence: for contacts a business adds or imports for marketing, the source, date and purpose of the customer\'s permission, as confirmed by the business, and when it was recorded.',
            'Opt-outs: a customer who replies stop or taps "Stop promotions" is excluded from all marketing and cannot be messaged from the dashboard.',
            'Broadcasts: which approved WhatsApp template was sent to which contact, the values filled into it, and its delivery status.',
          ],
        },
        {
          h: 'How long it is kept',
          list: [
            'Readable message text: 30 days, then deleted. It cannot be restored.',
            'Message delivery records and broadcast send records: 30 days.',
            'Contacts, lead details and consent evidence: until the business deletes the contact or its account.',
            'When a contact is deleted, its name, number, lead details and chat text are removed. If the customer had opted out, we keep only a one-way keyed code of the number and the opt-out, so they are never messaged again.',
          ],
        },
        {
          h: 'Exports',
          p: ['A business can export its own chats (CSV or PDF), its contacts (CSV) and a full copy of its account (ZIP). Exports contain only that business\'s retained data and never include credentials or our internal identifiers.'],
        },
      ],
    },
    {
      h: 'Why we use it, and on what basis',
      list: [
        'To sign you in and keep you signed in — necessary to provide a service you asked for.',
        'To reply to your enquiry and follow it up — necessary to take steps at your request before entering a contract.',
        'To send the guide or resource you asked for — your consent, given when you submitted the form.',
        'To limit abuse of our sign-in and chat endpoints — our legitimate interest in keeping the service working and our costs bounded.',
        'To measure our advertising — your consent, where required.',
      ],
      p: ['We do not sell your personal data, and we do not share it with anyone for their own marketing.'],
    },
    {
      h: 'Who else sees it',
      p: [
        'We use a small number of service providers. Each only receives what it needs to do its job.',
        'Two are worth calling out specifically. Messages you type into our chat assistant are sent to OpenAI to generate a reply. And our advertising measurement sends Meta a pseudonymous identifier — not your name, email or phone.',
      ],
      table: 'processors',
    },
    {
      h: 'Where your data is stored',
      p: [
        'Our database is hosted in Singapore. Our hosting, email and other providers operate in the United States and elsewhere.',
        'If you are in a country that restricts sending personal data abroad, be aware that using this site involves such a transfer. We rely on our providers\' standard contractual protections for this.',
      ],
    },
    {
      h: 'How long we keep it',
      list: [
        'Unused sign-in codes: deleted within about a day.',
        'Expired sessions: deleted about a week after they expire.',
        'Rate-limiting counters, which include IP addresses: days, not months.',
        'Your account and profile: kept while your account exists, so you do not have to re-enter it. Ask us and we will delete it.',
        'Chat conversations and enquiry records: kept while we may still need them to follow up with you or to show what we agreed.',
      ],
    },
    {
      h: 'How we protect it',
      list: [
        'The whole site is served over HTTPS and browsers are instructed never to use an unencrypted connection.',
        'Sign-in codes and session tokens are only ever stored as one-way hashes, never in a readable form.',
        'Our database denies all access by default. Only our own server code can read it, using a key that is never sent to your browser.',
        'Sign-in attempts are rate-limited, and a code is locked after five wrong guesses.',
      ],
      p: ['No system is perfectly secure, and we will not claim otherwise. If we ever discover a breach affecting your data, we will tell you.'],
    },
    {
      h: 'Your rights',
      p: ['Whatever country you are in, you can ask us to:'],
      list: [
        'Tell you what we hold about you.',
        'Give you a copy of it.',
        'Correct anything wrong.',
        'Delete it.',
        'Stop using it for marketing.',
        'Stop using it altogether, where our reason for doing so was our own legitimate interest.',
      ],
      p2: [
        'Email ahmed@bznsflowai.com. We will respond within 30 days. There is no charge, and we will not ask why.',
        'If you are in the UK or EU and you are not satisfied with our answer, you may complain to your national data protection authority.',
      ],
    },
    {
      h: 'Cookies and similar technologies',
      p: ['A full technical breakdown, kept in step with the code, is in our repository\'s COOKIES.md. In short:'],
      table: 'cookies',
      p2: [
        'The ones marked Necessary cannot be turned off — the site cannot sign you in or protect that sign-in without them. The marketing ones can be blocked in your browser settings, or with any standard content blocker, without breaking the site.',
      ],
    },
    {
      h: 'Children',
      p: ['This site is for businesses and is not directed at children. We do not knowingly collect data from anyone under 18. If you believe a child has given us their details, email us and we will delete them.'],
    },
    {
      h: 'Changes to this policy',
      p: ['If we change how we handle your data, we will update this page and the date at the top. If the change is significant and we hold your email address, we will tell you directly rather than relying on you noticing.'],
    },
    {
      h: 'Contact us',
      p: ['Email ahmed@bznsflowai.com, or message us on WhatsApp using the button on any page. We read everything.'],
    },
  ],
};

const ar = {
  title: 'سياسة الخصوصية',
  updated: 'آخر تحديث ٢٣ سبتمبر ٢٠٢٦',
  lead: 'توضّح هذه الصفحة ما تجمعه BznsFlow عند استخدامك لهذا الموقع، ولماذا، ومن يطّلع عليه غيرنا، وما الذي يمكنك أن تطلبه منّا بشأنه. كُتبت لتُقرأ، لا لتُحتمل.',
  processorsHead: ['الجهة', 'ما تقوم به', 'أين'],
  cookiesHead: ['الاسم', 'النوع', 'المدة', 'وظيفته'],
  sections: [
    {
      h: 'من نحن',
      p: [
        'تبني BznsFlow وتشغّل أنظمة الاستقبال الذكي والمواقع وإدارة العملاء والأتمتة للشركات. تغطّي هذه السياسة موقع www.bznsflowai.com وما فيه من تسجيل دخول ومحادثة ونماذج تواصل.',
        'ولا تغطّي الأنظمة التي نبنيها ونشغّلها لعميل بموجب اتفاق منفصل؛ ففي تلك الحالة يكون العميل مسؤولاً عن بيانات عملائه ونعمل نحن وفق تعليماته.',
        'لأي استفسار بخصوص هذه السياسة، راسلنا على ahmed@bznsflowai.com.',
      ],
    },
    {
      h: 'ما الذي نجمعه',
      p: ['بثلاث طرق مختلفة تماماً.'],
      sub: [
        {
          h: 'ما تعطينا إياه',
          list: [
            'عند تسجيل الدخول: بريدك الإلكتروني فقط، وهو كل ما يلزم لإنشاء حساب.',
            'عند استكمال ملفك: اسمك ورقم هاتفك ودولتك ومجال عملك.',
            'عند طلب الدليل: اسمك وبريدك الإلكتروني.',
            'عند استخدام مساعد المحادثة: ما تكتبه فيه والردود عليه.',
          ],
        },
        {
          h: 'ما نجمعه تلقائياً',
          list: [
            'عنوان IP الخاص بك، لفترة قصيرة، ضمن تحديد عدد مرات استخدام تسجيل الدخول والمحادثة. يُستخدم كمفتاح عدّاد وينتهي خلال أيام.',
            'سجلات الطلبات المعتادة لدى مزوّد الاستضافة.',
            'الصفحة التي كنت فيها عند إرسال طلبك.',
            'قياسات أداء مجهولة الهوية عن سرعة تحميل الصفحات.',
          ],
        },
        {
          h: 'ما يخبرنا به مزوّدو تسجيل الدخول',
          p: [
            'إذا سجّلت الدخول عبر Google أو LinkedIn، نستلم بريدك الإلكتروني واسمك ومعرّفاً ثابتاً يستخدمه المزوّد لك. نحفظ هذا المعرّف لنتعرّف عليك لاحقاً حتى لو غيّرت بريدك لديهم.',
            'لا نستلم كلمة مرورك إطلاقاً، ولا يمكننا الاطلاع على أي شيء آخر في حسابك هناك.',
          ],
        },
      ],
    },
    {
      h: 'ما لا نجمعه أبداً',
      list: [
        'لا نطلب بيانات بطاقات الدفع ولا نحفظها في أي مكان على هذا الموقع.',
        'لا نحفظ رموز الدخول لمرة واحدة، بل بصمة أحادية الاتجاه فقط، فلا تكفي نسخة من قاعدة بياناتنا لتسجيل الدخول باسمك.',
        'ولا نحفظ رمز جلستك أيضاً، بل بصمته فقط.',
        'لا نشتري بيانات شخصية من أطراف أخرى.',
      ],
    },
    {
      h: 'ليلى للأنشطة: رسائل واتساب وإنستغرام',
      p: [
        'النشاط الذي يربط رقم واتساب الخاص به بليلى هو من يحدد سبب معالجة بيانات عملائه، وهو المسؤول عنها، وتعالجها BznsFlow نيابةً عنه. إذا راسلت نشاطاً يستخدم ليلى فتواصل مع ذلك النشاط أولاً، وسنساعده على الرد عليك.',
      ],
      sub: [
        {
          h: 'ربط واتساب عبر Meta',
          p: [
            'يربط النشاط رقم واتساب الخاص به عبر نافذة التسجيل التابعة لـ Meta نفسها (تسجيل الدخول عبر فيسبوك للأعمال، التسجيل المضمّن لواتساب). ويختار صاحب النشاط أي محفظة أعمال وأي حساب واتساب للأعمال وأي رقم هاتف يشاركه.',
          ],
          list: [
            'نستلم رمز وصول مقصوراً على الأصول التي شاركها صاحب النشاط. يُحفظ مشفّراً، ولا يستخدمه إلا خادمنا، ولا يُرسل إلى المتصفح ولا يُضمَّن في التصدير.',
            'نقرأ حساب واتساب للأعمال ورقم الهاتف: معرّفاتهما، والرقم، وحالة تسجيله وحالة اسم العرض وحد المراسلة، وقوالب الرسائل المعتمدة للنشاط.',
            'لا نستلم كلمة مرور فيسبوك لصاحب النشاط ولا ملفه الشخصي ولا أصدقاءه ولا بريده الإلكتروني ولا أي بيانات أخرى من حسابه على فيسبوك، ولا يُستخدم تسجيل الدخول عبر فيسبوك للدخول إلى BznsFlow.',
            'يمكن لصاحب النشاط إلغاء وصولنا في أي وقت من التطبيقات المرتبطة بمحفظة أعماله في Meta، أو بمراسلتنا. راجع صفحة حذف البيانات على /data-deletion.',
          ],
        },
        {
          h: 'ربط إنستغرام',
          p: ['يمكنك ربط حساب إنستغرام احترافي عبر تسجيل الدخول بإنستغرام، بشكل مستقل عن واتساب. نحفظ معرّف الحساب واسم المستخدم وبيانات الوصول المشفّرة ومعرّفات العملاء ومحادثات الرسائل الخاصة. نجدّد بيانات الوصول الصالحة لاستمرار الاتصال.'],
          list: ['نستخدم هذا الوصول للرد على الرسائل التي يبدأها العملاء ولتمكين فريقك من تولّي المحادثات. تبقى جهات اتصال إنستغرام منفصلة عن واتساب. لا نستخدم هذا الربط للتعليقات العامة أو النشر أو البث التسويقي.', 'تُحفظ نصوص رسائل إنستغرام وسجلاتها لمدة ٣٠ يوماً وفق التفاصيل أدناه. فصل الاتصال يوقف الردود ويحذف بيانات الوصول المحفوظة ولا يحذف المحادثات السابقة تلقائياً. يمكنك حذف جهات الاتصال من اللوحة أو طلب الحذف. إزالة الوصول من Meta توقف الاتصال؛ وطلب حذف البيانات عبر Meta يضيف محادثات إنستغرام وجهات اتصالها إلى قائمة الحذف.'],
        },
        {
          h: 'ما تحفظه ليلى للنشاط',
          list: [
            'جهات الاتصال: رقم واتساب لكل عميل، واسم ملفه على واتساب، والاسم الذي يذكره في المحادثة، والاسم الذي يدخله النشاط. تُنشأ جهة الاتصال عندما يراسل العميل النشاط، أو عندما يضيفها النشاط أو يستوردها.',
            'تفاصيل العميل المحتمل: إجابات العميل عن أسئلة ليلى القصيرة، مثل الخدمة المطلوبة أو الموعد أو المنطقة المفضلة أو الميزانية أو الوقت المتوقع، مع مصدر كل تفصيل. وفي الأنشطة الطبية والقانونية والمالية لا تسأل ليلى إلا عن تفاصيل الحجز، ولا تسأل عن الأعراض أو تفاصيل القضايا أو الأوضاع المالية.',
            'التأهيل: هل اكتملت التفاصيل المطلوبة. تحدده ليلى بقواعد ثابتة، ويمكن للنشاط تغييره. ولا يُتخذ أي قرار آلي له أثر قانوني أو أثر مماثل.',
            'دليل الموافقة: لجهات الاتصال التي يضيفها النشاط أو يستوردها للتسويق، مصدر إذن العميل وتاريخه والغرض منه كما يؤكده النشاط، ووقت تسجيله.',
            'إلغاء الاشتراك: العميل الذي يرد بطلب الإيقاف أو يضغط "إيقاف العروض" يُستبعد من كل التسويق ولا يمكن مراسلته من اللوحة.',
            'الرسائل الجماعية: أي قالب واتساب معتمد أُرسل إلى أي جهة اتصال، والقيم التي مُلئ بها، وحالة تسليمه.',
          ],
        },
        {
          h: 'مدة الاحتفاظ',
          list: [
            'نص الرسائل المقروء: ٣٠ يوماً ثم يُحذف، ولا يمكن استعادته.',
            'سجلات تسليم الرسائل وسجلات إرسال الرسائل الجماعية: ٣٠ يوماً.',
            'جهات الاتصال وتفاصيل العملاء المحتملين ودليل الموافقة: حتى يحذف النشاط جهة الاتصال أو حسابه.',
            'عند حذف جهة اتصال تُحذف بياناتها ورقمها وتفاصيلها ونص محادثتها. وإذا كان العميل قد ألغى الاشتراك نحتفظ فقط برمز مشفّر أحادي الاتجاه للرقم مع إلغاء الاشتراك، حتى لا يُراسَل مجدداً.',
          ],
        },
        {
          h: 'التصدير',
          p: ['يمكن للنشاط تصدير محادثاته (CSV أو PDF) وجهات اتصاله (CSV) ونسخة كاملة من حسابه (ZIP). لا يحتوي التصدير إلا على بيانات ذلك النشاط المحفوظة، ولا يتضمن بيانات الدخول أو معرّفاتنا الداخلية.'],
        },
      ],
    },
    {
      h: 'لماذا نستخدمها وعلى أي أساس',
      list: [
        'لتسجيل دخولك وإبقائك مسجّلاً — ضروري لتقديم خدمة طلبتها بنفسك.',
        'للردّ على طلبك ومتابعته — ضروري لاتخاذ خطوات بناءً على طلبك قبل التعاقد.',
        'لإرسال الدليل أو المادة التي طلبتها — بموافقتك التي منحتها عند إرسال النموذج.',
        'للحدّ من إساءة استخدام تسجيل الدخول والمحادثة — مصلحتنا المشروعة في إبقاء الخدمة تعمل وضبط تكاليفها.',
        'لقياس أداء إعلاناتنا — بموافقتك حيثما تكون مطلوبة.',
      ],
      p: ['لا نبيع بياناتك الشخصية، ولا نشاركها مع أحد لأغراضه التسويقية.'],
    },
    {
      h: 'من يطّلع عليها غيرنا',
      p: [
        'نستعين بعدد محدود من مزوّدي الخدمة، ولا يستلم أيٌّ منهم سوى ما يلزمه لأداء عمله.',
        'اثنان منهم يستحقان الإشارة الصريحة: الرسائل التي تكتبها في مساعد المحادثة تُرسل إلى OpenAI لتوليد الرد. وقياس إعلاناتنا يرسل إلى Meta معرّفاً مستعاراً — لا اسمك ولا بريدك ولا هاتفك.',
      ],
      table: 'processors',
    },
    {
      h: 'أين تُحفظ بياناتك',
      p: [
        'قاعدة بياناتنا مستضافة في سنغافورة. أما الاستضافة والبريد وبقية المزوّدين فيعملون في الولايات المتحدة وغيرها.',
        'إذا كنت في بلد يقيّد نقل البيانات الشخصية إلى الخارج، فاعلم أن استخدام هذا الموقع ينطوي على نقل كهذا. ونعتمد في ذلك على الضمانات التعاقدية المعيارية لدى مزوّدينا.',
      ],
    },
    {
      h: 'كم نحتفظ بها',
      list: [
        'رموز الدخول غير المستخدمة: تُحذف خلال يوم تقريباً.',
        'الجلسات المنتهية: تُحذف بعد نحو أسبوع من انتهائها.',
        'عدّادات تحديد المعدّل، وتشمل عناوين IP: أيام لا أشهر.',
        'حسابك وملفك: يبقيان ما بقي حسابك، حتى لا تعيد إدخالهما. اطلب منّا حذفهما ونفعل.',
        'المحادثات وسجلات الطلبات: تبقى ما دمنا قد نحتاجها لمتابعتك أو لبيان ما اتفقنا عليه.',
      ],
    },
    {
      h: 'كيف نحميها',
      list: [
        'الموقع كله يُقدَّم عبر HTTPS، والمتصفحات مُوجَّهة ألّا تستخدم اتصالاً غير مشفّر أبداً.',
        'رموز الدخول ورموز الجلسات تُحفظ كبصمات أحادية الاتجاه فقط، ولا تُحفظ بصيغة قابلة للقراءة.',
        'قاعدة بياناتنا ترفض كل وصول افتراضياً؛ ولا يقرؤها إلا الكود على خادمنا بمفتاح لا يصل متصفحك إطلاقاً.',
        'محاولات تسجيل الدخول محدودة المعدّل، ويُقفل الرمز بعد خمس محاولات خاطئة.',
      ],
      p: ['لا يوجد نظام آمن تماماً، ولن ندّعي غير ذلك. وإن اكتشفنا يوماً خرقاً يمسّ بياناتك، فسنخبرك.'],
    },
    {
      h: 'حقوقك',
      p: ['أياً كان بلدك، يمكنك أن تطلب منّا:'],
      list: [
        'أن نخبرك بما لدينا عنك.',
        'أن نعطيك نسخة منه.',
        'أن نصحّح أي خطأ فيه.',
        'أن نحذفه.',
        'أن نتوقف عن استخدامه للتسويق.',
        'أن نتوقف عن استخدامه كلياً، حيث كان سببنا هو مصلحتنا المشروعة.',
      ],
      p2: [
        'راسلنا على ahmed@bznsflowai.com وسنردّ خلال ٣٠ يوماً. بلا رسوم، ولن نسألك عن السبب.',
        'وإذا كنت في المملكة المتحدة أو الاتحاد الأوروبي ولم يُرضك ردّنا، فلك أن تشتكي إلى هيئة حماية البيانات في بلدك.',
      ],
    },
    {
      h: 'ملفات تعريف الارتباط وما شابهها',
      p: ['التفصيل التقني الكامل، المحدَّث مع الكود، موجود في ملف COOKIES.md لدينا. وباختصار:'],
      table: 'cookies',
      p2: [
        'ما وُسم بأنه ضروري لا يمكن إيقافه، إذ لا يستطيع الموقع تسجيل دخولك ولا حماية ذلك الدخول بدونه. أما التسويقية فيمكن حجبها من إعدادات متصفحك أو بأي مانع محتوى معتاد دون أن يتعطّل الموقع.',
      ],
    },
    {
      h: 'الأطفال',
      p: ['هذا الموقع موجّه للشركات وليس للأطفال. ولا نجمع عن قصد بيانات من هم دون ١٨ عاماً. وإن كنت تعتقد أن طفلاً زوّدنا ببياناته، فراسلنا وسنحذفها.'],
    },
    {
      h: 'تعديل هذه السياسة',
      p: ['إذا غيّرنا طريقة تعاملنا مع بياناتك، فسنحدّث هذه الصفحة والتاريخ في أعلاها. وإن كان التغيير جوهرياً ولدينا بريدك، فسنخبرك مباشرة بدل انتظار أن تلاحظ.'],
    },
    {
      h: 'تواصل معنا',
      p: ['راسلنا على ahmed@bznsflowai.com أو عبر واتساب من الزر الموجود في أي صفحة. نقرأ كل ما يصلنا.'],
    },
  ],
};

/** Rows for the two tables, already picked for the requested language. */
export function privacyTables(lang) {
  const key = lang === 'ar' ? 'ar' : 'en';
  return {
    processors: PROCESSORS.map((r) => r[key]),
    cookies: COOKIES.map((r) => r[key]),
  };
}

export const PRIVACY = { en, ar };
