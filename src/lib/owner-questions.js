// AUTHORED INPUT — the owner-voice question bank for the guided setup ladder.
//
// The sector packs already carry bilingual qualification prompts, but they are
// phrased at the tenant's CUSTOMER — "could you share your preferred date and
// time?". The business owner needs the mirror image: "which days can you take
// bookings?". That phrasing existed nowhere, which is what this file is.
//
// Keyed by ARCHETYPE, not by sector. All 23 sectors resolve to one of three
// archetypes (booking · catalog · project) via `prefillFor(id).archetype`, so
// three sets cover every sector by construction rather than by 23 copies that
// drift apart. It is the same reasoning as config/layla-sector-packs.js, which
// interpolates one template per archetype.
//
// `example` is a PLACEHOLDER, never a default value. It shows the SHAPE of a
// useful answer without asserting anything about this business, and nothing here
// is ever written into a profile — see the note in sector-prefill.generated.js.
//
// The examples are deliberately sector-NEUTRAL within an archetype. `booking`
// covers dental and legal and fitness alike, so an example naming "whitening"
// would tell a law firm this product does not understand it. Vivid-but-sometimes
// -wrong is worse than plain-and-always-right for placeholder text. The one rung
// that does get sector-specific wording is `services`, where the ladder prefers
// prefillFor(sector).service — already authored per sector and drift-gated.
//
// Arabic is authored, not machine-translated, and uses Gulf phrasing and
// Arabic-Indic numerals as a real owner in Oman would read them.

/** The profile fields the ladder asks about, in the order it asks. */
export const FIELD_RUNGS = ['services', 'prices', 'hours', 'location'];

/** How many FAQ pairs the ladder offers before it stops asking. */
export const FAQ_TARGET = 3;

/** Every archetype a sector can resolve to. `other` has no pack, so it lands on project. */
export const ARCHETYPES = ['booking', 'catalog', 'project'];
export const DEFAULT_ARCHETYPE = 'project';

const booking = {
  services: {
    question: { en: 'What can customers book with you?', ar: 'ما الذي يمكن للعملاء حجزه معك؟' },
    help: { en: 'List the treatments or services by name. Layla reads this back word for word.', ar: 'اذكر الخدمات أو العلاجات بالاسم. تقرأها ليلى حرفياً كما كتبتها.' },
    example: { en: 'Check-up, cleaning, whitening, orthodontics', ar: 'فحص، تنظيف، تبييض، تقويم' },
  },
  prices: {
    question: { en: 'What do your main services cost?', ar: 'كم تكلفة خدماتك الرئيسية؟' },
    help: { en: 'Even a starting price helps. Leave it blank if prices vary too much.', ar: 'حتى السعر الابتدائي يفيد. اتركه فارغاً إذا كانت الأسعار متفاوتة.' },
    example: { en: 'First visit 15 OMR, main service from 25 OMR', ar: 'الزيارة الأولى ١٥ ر.ع، الخدمة الرئيسية من ٢٥ ر.ع' },
  },
  hours: {
    question: { en: 'When can customers come in?', ar: 'متى يمكن للعملاء الحضور؟' },
    help: { en: 'Include the days you are closed — that is what customers ask about most.', ar: 'اذكر أيام الإغلاق أيضاً — فهي أكثر ما يسأل عنه العملاء.' },
    example: { en: 'Sunday to Thursday, 9am to 9pm. Closed Friday.', ar: 'الأحد إلى الخميس، ٩ صباحاً حتى ٩ مساءً. الجمعة مغلق.' },
  },
  location: {
    question: { en: 'Where are you, and do you have more than one branch?', ar: 'أين تقع، وهل لديك أكثر من فرع؟' },
    help: { en: 'A landmark helps more than a street name.', ar: 'ذكر علامة مميزة أنفع من اسم الشارع.' },
    example: { en: 'Al Khuwair, Muscat — one branch, parking available', ar: 'الخوير، مسقط — فرع واحد، يتوفر موقف' },
  },
};

const catalog = {
  services: {
    question: { en: 'What do you sell?', ar: 'ماذا تبيع؟' },
    help: { en: 'Name the categories customers ask for. You can add the full list later.', ar: 'اذكر الأصناف التي يطلبها العملاء. يمكنك إضافة القائمة الكاملة لاحقاً.' },
    example: { en: 'Coffee, cold drinks, cakes and pastries', ar: 'قهوة، مشروبات باردة، كيك ومعجنات' },
  },
  prices: {
    question: { en: 'What do your popular items cost?', ar: 'كم أسعار أكثر منتجاتك طلباً؟' },
    help: { en: 'A few real prices are worth more than a full list.', ar: 'بعض الأسعار الحقيقية أنفع من قائمة كاملة.' },
    example: { en: 'Most items 1 to 5 OMR, larger orders from 12 OMR', ar: 'معظم الأصناف من ١ إلى ٥ ر.ع، الطلبات الكبيرة من ١٢ ر.ع' },
  },
  hours: {
    question: { en: 'When are you open, and how much notice do orders need?', ar: 'ما مواعيد العمل، وكم يحتاج الطلب من وقت مسبق؟' },
    help: { en: 'Notice periods stop customers asking for something today that takes two days.', ar: 'ذكر المدة المسبقة يمنع طلب شيء اليوم يحتاج يومين.' },
    example: { en: 'Daily 7am to 11pm. Large orders need 24 hours notice.', ar: 'يومياً من ٧ صباحاً حتى ١١ مساءً. الطلبات الكبيرة تحتاج ٢٤ ساعة.' },
  },
  location: {
    question: { en: 'Where do customers collect from, and do you deliver?', ar: 'من أين يستلم العملاء، وهل توصّل؟' },
    help: { en: 'Say which areas you deliver to and what it costs.', ar: 'اذكر المناطق التي توصّل إليها وتكلفة التوصيل.' },
    example: { en: 'Qurum, Muscat. Delivery across Muscat for 2 OMR.', ar: 'القرم، مسقط. توصيل داخل مسقط بـ ٢ ر.ع.' },
  },
};

const project = {
  services: {
    question: { en: 'What kind of work do you take on?', ar: 'ما نوع الأعمال التي تنفذها؟' },
    help: { en: 'Describe the jobs you want enquiries about — and the ones you do not.', ar: 'اذكر الأعمال التي تريد استفسارات عنها، والتي لا تريدها.' },
    example: { en: 'AC installation, servicing and repair for homes and offices', ar: 'تركيب وصيانة وإصلاح المكيفات للمنازل والمكاتب' },
  },
  prices: {
    question: { en: 'How do you price your work?', ar: 'كيف تحدد أسعار أعمالك؟' },
    help: { en: 'A call-out fee or a starting range is enough. Layla will not quote beyond what you write.', ar: 'أجر الزيارة أو نطاق ابتدائي يكفي. لن تذكر ليلى سعراً غير ما كتبته.' },
    example: { en: 'Site visit 10 OMR. Most jobs from 35 OMR.', ar: 'زيارة الموقع ١٠ ر.ع. معظم الأعمال من ٣٥ ر.ع.' },
  },
  hours: {
    question: { en: 'When can customers reach you, and how soon can you start?', ar: 'متى يمكن للعملاء الوصول إليك، وكم يلزم للبدء؟' },
    help: { en: 'Lead time matters as much as working hours for this kind of work.', ar: 'مدة البدء مهمة كأهمية ساعات العمل في هذا النوع من الأعمال.' },
    example: { en: 'Saturday to Thursday, 8am to 6pm. Usually on site within two days.', ar: 'السبت إلى الخميس، ٨ صباحاً حتى ٦ مساءً. عادة نبدأ خلال يومين.' },
  },
  location: {
    question: { en: 'Which areas do you cover?', ar: 'ما المناطق التي تغطيها؟' },
    help: { en: 'Coverage stops enquiries you cannot serve, which saves your team time.', ar: 'تحديد التغطية يمنع استفسارات لا تستطيع خدمتها، ويوفر وقت فريقك.' },
    example: { en: 'All of Muscat and Barka. Outside that by arrangement.', ar: 'كل مسقط وبركاء. خارجها بالاتفاق.' },
  },
};

export const OWNER_QUESTIONS = { booking, catalog, project };

/**
 * FAQ copy is shared across archetypes: the value of an FAQ does not depend on
 * the kind of business, and previewAnswer resolves an exact FAQ match before
 * catalog and before the intent router — so these are the highest-leverage
 * words a customer can give us.
 */
export const FAQ_COPY = {
  question: { en: 'What do customers ask you most often?', ar: 'ما أكثر ما يسألك عنه العملاء؟' },
  help: {
    en: 'Layla answers these exactly as you write them, so they are the most valuable thing you can add.',
    ar: 'تجيب ليلى عن هذه الأسئلة بنص إجابتك حرفياً، لذلك هي أهم ما يمكنك إضافته.',
  },
  answerQuestion: { en: 'And what should Layla answer?', ar: 'وبماذا تجيب ليلى؟' },
  answerHelp: { en: 'Write it the way you would say it to a customer.', ar: 'اكتبها كما تقولها لعميلك.' },
};

/** Copy for the closing rung, which shows everything back before the form is submitted. */
export const REVIEW_COPY = {
  question: { en: 'Here is what Layla will know', ar: 'هذا ما ستعرفه ليلى' },
  help: {
    en: 'Check every line. Nothing is used until you tick the confirmation below.',
    ar: 'راجع كل سطر. لا يُستخدم أي شيء حتى تؤكد بالأسفل.',
  },
};

/** Resolve a sector's archetype to a question set, never returning undefined. */
export function questionsFor(archetype) {
  return OWNER_QUESTIONS[archetype] || OWNER_QUESTIONS[DEFAULT_ARCHETYPE];
}
