// Packaged plans — Catch → Convert → Dominate ladder, with published pricing.
// EN + AR variants; consumed by TiersSection via pages/Home.jsx.

// Which roster agents each tier adds, by `key` in data/agents.js. Tiers never
// hard-code an agent name — the card renders the name and role straight from
// the roster, so the two can't drift apart the way Khaled/Mahmood/ARIA/Ali did.
// Cumulative, matching the "Everything in X, plus" convention: a tier lists
// only the agents it adds on top of the one below it.
const TIER_AGENTS = {
  catalyst: ['layla'],
  ascend: [],
  apex: ['raqib', 'wisal', 'saqr', 'rashid'],
};

// Demand generation — these fill the funnel rather than work it, so they sit
// beside the ladder as an add-on instead of inside a tier whose bottleneck is
// about inquiries already coming in.
export const GROWTH_AGENTS = ['samira', 'adiba', 'dalil', 'rasil'];

// Published pricing: a monthly subscription plus a one-time setup fee, no
// annual commitment. OMR is what we invoice; the USD figures are the pegged
// equivalent (1 OMR = 2.6008 USD) shown for visitors outside Oman. Kept here
// rather than in the tier objects so EN and AR can never quote different
// numbers — if the peg moves, this is the only block to touch.
const TIER_PRICING = {
  catalyst: { monthly: 40, setup: 70, monthlyUsd: 104, setupUsd: 182 },
  ascend: { monthly: 120, setup: 210, monthlyUsd: 312, setupUsd: 546 },
  apex: { monthly: 300, setup: 525, monthlyUsd: 780, setupUsd: 1365 },
};

export const TIERS = [
  {
    key: 'catalyst',
    name: 'Catalyst',
    flag: null,
    popular: false,
    stage: 'Catch',
    bottleneck: 'Enquiries go unanswered',
    intro: 'The starting point: Layla handles customer chats, keeps customer details editable, and hands a conversation to a human whenever judgment is needed.',
    insideLabel: 'What it covers',
    inside: [
      'Layla customer chats in Arabic and English',
      'Editable customer and business details',
      'Explicit human handoff from the conversation',
      'Channel connection during setup',
    ],
    agents: TIER_AGENTS.catalyst,
    pricing: TIER_PRICING.catalyst,
    roiReplaces: 'A part-time receptionist',
    roiLine: 'Less per month than a single day of a receptionist’s salary, and it covers every night, weekend, and holiday. The setup fee builds it around your business once; after that it just runs.',
    payback: 'First recovered customer',
    pull: 'For the owner who just needs to stop missing enquiries.',
    nextStep: 'Layla answers everything, but the customers who don’t reply yet still need follow-up, and you still need them booked.',
    cta: 'Get Catalyst on WhatsApp',
  },
  {
    key: 'ascend',
    name: 'Ascend',
    flag: 'Most popular',
    popular: true,
    stage: 'Convert',
    bottleneck: 'Answered enquiries never get booked',
    intro: 'Everything in Catalyst plus an operational workspace for live industry records, approvals, money and conversion reporting. Real-estate brokerages can run listings, qualified opportunities, matches, viewings, offers and commissions in one place.',
    insideLabel: 'Everything in Catalyst, plus',
    inside: [
      'Live operational dashboard with tenant-owned records',
      'Real-estate listings, qualification, matches, viewings and offers',
      'Manager approvals for outbound drafts, offers, closures and commissions',
      'Money and conversion reporting based on recorded activity',
      'One manager and up to five employees with controlled permissions',
    ],
    agents: TIER_AGENTS.ascend,
    pricing: TIER_PRICING.ascend,
    roiReplaces: 'A CRM build, a lead-gen website, and reporting retainers',
    roiLine: 'One monthly fee instead of three separate invoices. A website build, a CRM, and a reporting retainer would each cost more than this on their own. The setup fee covers the build; the follow-up compounds every month it runs.',
    payback: 'One extra customer booked',
    pull: 'For the business that wants the whole funnel handled: website, capture, nurture, book.',
    nextStep: 'You convert what comes in, but across staff and locations, enquiries start falling between people.',
    cta: 'Get Ascend on WhatsApp',
  },
  {
    key: 'apex',
    name: 'Apex',
    flag: null,
    popular: false,
    stage: 'Dominate',
    bottleneck: 'Enquiries fall between staff & locations',
    intro: 'The command tier. Apex adds the structure a larger operation needs: enquiries routed to the right person automatically, priority handling, and the controls to run customer flow like an operation instead of a scramble.',
    insideLabel: 'Everything in Ascend, plus',
    inside: [
      'Automatic routing and assignment across your team, watched 24/7',
      'Multiple AI agents tuned per service line or per location',
      'Proactive outbound that reactivates dormant customers and old lead lists',
      'Deal-closing support on hot leads, plus a growth plan reviewed each quarter',
      'Priority response, priority support, advanced team reporting, and white-glove setup',
    ],
    agents: TIER_AGENTS.apex,
    pricing: TIER_PRICING.apex,
    roiReplaces: 'A full agency retainer plus a sales-ops hire',
    roiLine: 'A fraction of one sales-ops salary, covering routing, reporting, and outbound across every branch and every service line. The setup fee tunes it per location once, then it runs on your team.',
    payback: 'One reactivated customer',
    pull: 'For multi-location and multi-team businesses where enquiries can’t fall through the cracks.',
    nextStep: null,
    cta: 'Get Apex on WhatsApp',
  },
];

export const TIERS_AR = [
  {
    key: 'catalyst',
    name: 'كاتاليست',
    flag: null,
    popular: false,
    stage: 'الالتقاط',
    bottleneck: 'الاستفسارات تبقى دون رد',
    intro: 'نقطة البداية: تدير ليلى محادثات العملاء، وتبقى بيانات العملاء قابلة للتعديل، وتسلّم المحادثة لإنسان عندما يلزم القرار البشري.',
    insideLabel: 'ما الذي يغطّيه',
    inside: [
      'محادثات ليلى مع العملاء بالعربية والإنجليزية',
      'بيانات العملاء والنشاط قابلة للتعديل',
      'تسليم صريح للمحادثة إلى إنسان',
      'ربط القناة أثناء الإعداد',
    ],
    agents: TIER_AGENTS.catalyst,
    pricing: TIER_PRICING.catalyst,
    roiReplaces: 'موظف استقبال بدوام جزئي',
    roiLine: 'شهرياً أقل من أجر يوم واحد لموظف استقبال — ويغطّي كل ليلة وعطلة وإجازة. رسوم الإعداد تبنيه حول أعمالك مرة واحدة، وبعدها يعمل وحده.',
    payback: 'أول عميل مُستردّ',
    pull: 'للمالك الذي يحتاج فقط أن يتوقف عن تفويت الاستفسارات.',
    nextStep: 'ليلى ترد على الجميع — لكن العملاء الذين لا يردّون بعد يحتاجون متابعة، وما زلت تحتاج حجزهم.',
    cta: 'احصل على كاتاليست عبر واتساب',
  },
  {
    key: 'ascend',
    name: 'أسيند',
    flag: 'الأكثر شيوعاً',
    popular: true,
    stage: 'التحويل',
    bottleneck: 'الاستفسارات المُجابة لا تُحجَز',
    intro: 'كل ما في كاتاليست، إضافة إلى مساحة تشغيل للسجلات الحية والموافقات والأموال وتقارير التحويل. تستطيع مكاتب العقارات إدارة القوائم والفرص المؤهلة والمطابقات والمعاينات والعروض والعمولات في مكان واحد.',
    insideLabel: 'كل ما في كاتاليست، بالإضافة إلى',
    inside: [
      'لوحة تشغيل حية بسجلات تخص نشاطك فقط',
      'قوائم عقارية وتأهيل ومطابقات ومعاينات وعروض',
      'موافقات المدير لمسودات الرسائل والعروض والإغلاق والعمولات',
      'تقارير الأموال والتحويل المبنية على النشاط المسجل',
      'مدير واحد وحتى خمسة موظفين بصلاحيات مضبوطة',
    ],
    agents: TIER_AGENTS.ascend,
    pricing: TIER_PRICING.ascend,
    roiReplaces: 'بناء CRM وموقع لجذب العملاء وباقات تقارير',
    roiLine: 'رسم شهري واحد بدل ثلاث فواتير منفصلة — بناء موقع، ونظام CRM، وباقة تقارير، كل واحد منها يكلّف أكثر من هذا وحده. رسوم الإعداد تغطي البناء، والمتابعة تتراكم كل شهر يعمل فيه.',
    payback: 'عميل إضافي واحد محجوز',
    pull: 'للأعمال التي تريد المسار كله منجزاً — موقع، التقاط، رعاية، حجز.',
    nextStep: 'أنت تحوّل ما يصل — لكن عبر الموظفين والفروع، تبدأ الاستفسارات بالسقوط بين الأشخاص.',
    cta: 'احصل على أسيند عبر واتساب',
  },
  {
    key: 'apex',
    name: 'أبيكس',
    flag: null,
    popular: false,
    stage: 'السيطرة',
    bottleneck: 'الاستفسارات تسقط بين الموظفين والفروع',
    intro: 'الباقة الأعلى. أبيكس يضيف البنية التي تحتاجها العمليات الأكبر — استفسارات تُوجَّه للشخص المناسب تلقائياً، أولوية في المعالجة، وأدوات لإدارة تدفق العملاء كعملية منظّمة لا كفوضى.',
    insideLabel: 'كل ما في أسيند، بالإضافة إلى',
    inside: [
      'توجيه وتعيين آلي عبر فريقك، تحت مراقبة 24/7',
      'وكلاء ذكاء اصطناعي متعددون مُهيَّأون لكل خط خدمة أو فرع',
      'تواصل صادر استباقي يعيد تنشيط العملاء الخاملين وقوائم العملاء القديمة',
      'دعم إغلاق الصفقات على العملاء الساخنين، مع خطة نمو تُراجَع كل ربع',
      'استجابة بأولوية، دعم بأولوية، تقارير فريق متقدمة، وإعداد فاخر',
    ],
    agents: TIER_AGENTS.apex,
    pricing: TIER_PRICING.apex,
    roiReplaces: 'باقة وكالة كاملة مع توظيف عمليات مبيعات',
    roiLine: 'جزء بسيط من راتب موظف عمليات مبيعات واحد، يغطّي التوجيه والتقارير والتواصل الصادر عبر كل فرع وكل خط خدمة. رسوم الإعداد تُهيّئه لكل موقع مرة واحدة، ثم يعمل مع فريقك.',
    payback: 'عميل واحد مُعاد تنشيطه',
    pull: 'للأعمال متعددة الفروع والفِرَق حيث لا يمكن أن تسقط الاستفسارات بين الشقوق.',
    nextStep: null,
    cta: 'احصل على أبيكس عبر واتساب',
  },
];
