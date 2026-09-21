// AUTHORED INPUT — the intent-bearing vocabulary Layla routes on.
//
// WHAT THIS REPLACED, AND WHY THE SIMPLE THING WON. Two learned classifiers
// were built and measured against this problem before this file existed:
// nearest-neighbour over TF-IDF character n-grams, then multinomial and
// complement Naive Bayes. Under leave-one-out over the exemplar bank they
// reached 56.8% and 67.8%, and a sweep of 72 configurations — every feature
// subset, both NB variants, weight normalisation, three smoothing values —
// never passed 67.8%. The regexes they were meant to replace already scored
// 79.9%.
//
// That is not a tuning failure, it is the shape of the problem. These
// decisions turn on ONE OR TWO content words: "schedule" means hours, "rates"
// means prices, "أجر" means prices. A model that sums hundreds of overlapping
// character n-grams buries that signal under shared syntactic frame — which is
// exactly how the first version routed "can you send me your rates" to
// `location`, having matched the exemplar "send me your location" on three of
// five words. Naive Bayes then made it worse by treating every overlapping
// n-gram as independent evidence, so posteriors pinned to 1.000 while being
// wrong. With ~20 examples per class there is no fixing that with more model.
//
// So the knowledge is written down instead of inferred. What this buys over
// the regexes in domain.js — which are also keyword matching — is three
// things, and they are the whole point:
//
//   1. SUBSTRING MATCHING ON FOLDED TEXT, not `\b` word boundaries. Arabic
//      attaches its articles and pronouns, so `سعر` has to match `السعر`,
//      `بسعر`, `للسعر` and `سعرها`. domain.js enumerates surface forms —
//      `سعر|أسعار|اسعار` — and will always miss one.
//   2. THE ARABIZI SURFACE, for free. Every term below is also matched against
//      the consonant skeleton from api/_lib/layla/vectorize.js, so `سعر` and
//      `se3r` are one term and nobody authors Latin-script Arabic twice.
//   3. DATA, NOT CODE. Adding a word is a reviewable one-line edit that
//      someone who knows the Arabic and not the JavaScript can check, and
//      scripts/check-lexicon.mjs validates the file at build time.
//
// WHAT IS DELIBERATELY ABSENT: SECTOR NOUNS. There is no `treatments`, no
// `menu`, no `flavours`, no `listings` in here, even though those are exactly
// the words that were misrouting. They belong to the tenant, not to us — a
// dentist's own profile says "consultations, treatments, prices and reception
// support", and api/_lib/layla/route.js scores the question against that text.
// Authoring 23 sectors of nouns here would be a worse copy of data we already
// hold, and it would go stale the first time someone adds a sector.

/**
 * Intent → term groups.
 *
 * `ar` matches as a plain substring of the folded text: Arabic prefixes attach,
 * so a leading boundary would break `السعر`. Write the STEM, not the surface
 * form — `كلف` covers تكلفة، التكلفة، يكلف، كلفة.
 *
 * `en` matches with a leading non-alphanumeric boundary and a free suffix, so
 * `rate` matches "rates" and "rate?" but not "accurate", and `specialit`
 * covers both "speciality" and "specialities".
 *
 * Folding is api/_lib/layla/vectorize.js: NFKC, lowercase, أإآ→ا, ى→ي, ة→ه,
 * diacritics and tatweel stripped, Arabic-Indic digits to ASCII. Author the
 * FOLDED form — write `شكوي`, never `شكوى`, or the term can never match.
 */
export const INTENT_TERMS = {
  // Ordered first because of PRECEDENCE below, not because it matches most.
  optout: {
    ar: ['لا تراسلني', 'لا ترسل', 'اوقف الرسائل', 'وقف الرسائل', 'الغ الاشتراك', 'الغي الاشتراك',
      'ازلني', 'احذفني', 'كفي رسائل', 'مالي رغبه', 'لا اريد رسائل'],
    // `stop` followed by a determiner, never `stop` alone. "can I stop by your
    // shop?" is six words and would otherwise silence a live customer — the one
    // error in this intent that is both unrecoverable and invisible. The
    // determiner is what separates "stop the messages" from "stop by".
    en: ['stop messaging', 'stop sending', 'stop the', 'stop all', 'stop these',
      'stop those', 'stop your', 'stop el', 'stop this',
      'unsubscribe', 'remove me', 'delete me', 'no more messages',
      // `cancel my` alone is a booking cancellation and lives under `disabled`,
      // which outranks nothing but is checked first for it. Naming the
      // subscription is what makes it an opt-out.
      'cancel my subscription', 'cancel the subscription', 'cancel my messages',
      'opt me out', 'opt out', 'take me off'],
  },

  human: {
    ar: ['موظف', 'بشري', 'شكوي', 'شخص حقيقي', 'احد يرد', 'اتكلم مع', 'اتحدث مع', 'وصلني',
      'حولني', 'مسئول', 'مسؤول', 'خدمه العملاء'],
    en: ['human', 'person', 'agent', 'complaint', 'representative', 'speak to someone',
      'talk to someone', 'real person', 'customer service', 'manager', 'supervisor'],
  },

  // Actions Layla cannot take. NOTE: `marketing`/`تسويق` are deliberately NOT
  // here. They used to sit in domain.js's booking guard, which meant a
  // marketing agency asking "what marketing services do you offer?" was told
  // Layla cannot make bookings. Marketing as a disabled FEATURE is enforced
  // in domain.js `guard()` on job.feature, which is the right place for it;
  // the word itself is a legitimate service noun for one of our 23 sectors.
  disabled: {
    ar: ['احجز', 'حجز', 'مواعيد لي', 'ثبت لي', 'الغ حجزي', 'غير موعدي', 'اجل موعدي',
      'ذكرني', 'سجلني'],
    // `موعد` ("appointment") is matched only on the exact surface, never folded.
    // Its skeleton is `m3d`, and so is `مواعيد` ("times") — the two share a root
    // and opposite intents, so folding made "ما مواعيد العمل" ("what are your
    // working hours") route to `disabled`, which outranks `hours`. Everything in
    // `exactOnly` is here for that reason: a fold that loses the distinction.
    exactOnly: ['موعد'],
    en: ['book me', 'booking', 'book a', 'book an', 'reserve', 'reservation', 'appointment',
      'reschedule', 'cancel my', 'put me on', 'sign me up', 'remind me'],
  },

  prices: {
    ar: ['سعر', 'سعار', 'بكم', 'بكام', 'كلف', 'يكلف', 'ثمن', 'رسوم', 'اجر', 'مبلغ', 'خصم', 'قيمه',
      'فاتوره', 'كم ياخذ', 'ميزانيه', 'عرض خاص'],
    en: ['price', 'pricing', 'cost', 'how much', 'rate', 'fee', 'charge', 'quote',
      'discount', 'tariff', 'budget', 'afford', 'expensive', 'cheap'],
  },

  hours: {
    ar: ['دوام', 'ساعات', 'اوقات', 'وقت', 'مواعيد العمل', 'وقت العمل', 'تفتح', 'تغلق', 'تسكر',
      'مفتوح', 'مغلق', 'متي تبدا', 'نهايه الاسبوع', 'يوم الجمعه', 'تعملون يوم', 'تداوم'],
    en: ['hours', 'opening', 'open', 'close', 'closed', 'schedule', 'what time', 'time do you',
      'days do you', 'do you work on', 'working day', 'weekend', 'shift', 'timing'],
  },

  location: {
    ar: ['وين', 'وين انتم', 'اين', 'موقع', 'عنوان', 'فرع', 'منطقه', 'شارع', 'مكان', 'خريطه',
      'كيف اصل', 'تغطون', 'توصلون', 'قريب من', 'مقركم'],
    en: ['where', 'location', 'address', 'branch', 'area', 'street', 'directions', 'map',
      'how do i get', 'situated', 'based in', 'nearby', 'reach you'],
  },

  // Generic "what have you got" phrasing ONLY. Sector nouns live in the
  // tenant's profile — see the note at the top of this file.
  services: {
    ar: ['خدمات', 'خدمه', 'تقدمون', 'تقدمه', 'توفرون', 'متوفر', 'عندكم', 'لديكم',
      'تعملون', 'نشاطكم', 'تسوون', 'انواع', 'اصناف', 'تنفذون', 'تصنعون', 'تبيعون', 'يوجد لديكم',
      'اخبرني عن', 'اعمالكم'],
    // `متاح` ("available") folds to the three letters `mth`, and the Arabizi
    // spelling of موظف ("employee") is `mowathaf`, folding to `mthf` — so a
    // question asking for a member of staff matched a services term and never
    // reached the handoff. Exact surface only.
    exactOnly: ['متاح'],
    en: ['services', 'service', 'offer', 'provide', 'do you do', 'do you have', 'what do you',
      'available', 'options', 'what kind', 'what sort', 'what type', 'sell', 'stock',
      'specialit', 'do you cover', 'do you take on', 'what can you'],
  },
};

/**
 * Tie-break order when two intents match the same number of terms.
 *
 * `optout` and `human` outrank everything because under-routing them is the
 * expensive direction: a missed opt-out is a compliance failure, and a
 * frustrated customer kept talking to a bot is the complaint that reaches the
 * owner. Among the four field intents this reproduces the order already in
 * domain.js and already agreed: someone asking price-and-something wants the
 * price.
 */
export const PRECEDENCE = ['optout', 'human', 'disabled', 'prices', 'hours', 'location', 'services'];

/**
 * Phrasings that mean "advise ME", and so keep the medical guard closed.
 *
 * domain.js refuses any message containing a medical term, which is right for
 * "what medicine should I take?" and wrong for "what treatments do you offer?"
 * — a dentist's service list, refused because it contains the word `علاج`.
 * api/_lib/layla/route.js reopens that guard when the message asks what the
 * BUSINESS offers, and these are what keep it shut when the message is instead
 * about the PERSON.
 *
 * The distinction is grammatical, not statistical: second person about the
 * business (`تقدمون`, `عندكم`, "do you offer") versus first person about the
 * sender (`عندي`, `لحالتي`, "should I", "for my"). Note `عندي` ("I have") and
 * `عندكم` ("you have") differ by one letter and sit on opposite sides of it,
 * which is precisely why this is a list of frames rather than a keyword count.
 */
export const ADVICE_FRAMES = {
  ar: ['لحالتي', 'يناسبني', 'المناسب لي', 'عندي', 'اعاني', 'مريض', 'الم', 'وجع',
    'هل احتاج', 'جرعه', 'اعراض', 'حالتي', 'يصير لي', 'ينفع لي'],
  en: ['should i', 'for my', 'i have', 'my condition', 'my pain', 'do i need',
    'is it safe', 'side effect', 'dosage', 'dose', 'recommend for me', 'i am suffering',
    'diagnose me', 'what is wrong with'],
};
