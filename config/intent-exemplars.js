// AUTHORED INPUT — exemplar phrasings for Layla's intent router.
//
// WHAT THIS IS. A SECOND CORPUS of real phrasings per intent, independent of
// config/eval-questions.js. It routes nothing by itself. It has three jobs:
//
//   1. A HELD-OUT CHECK. scripts/calibrate-router.mjs routes these with the
//      lexicon alone, which is how four real bugs were found that the labelled
//      set never touched — including `احذفني` ("delete me") matching `بكم هذا`
//      ("how much is this"), a false opt-out on a price question.
//   2. THE BACKGROUND CORPUS for inverse document frequency in the profile
//      layer. ~190 short questions plus 46 sector descriptions is enough for
//      "what", "ما", "do you" and "لديكم" to lose their weight on their own,
//      with no stop list in any language to maintain.
//   3. AN AUTHORING TO-DO LIST. A phrasing here that the lexicon cannot reach
//      is a term worth considering — reviewed by a person, never added
//      automatically, because chasing a corpus is how a lexicon gets fitted to
//      it.
//
// IT WAS ONCE TRAINING DATA, and that is worth knowing. Two classifiers were
// fitted to these rows — nearest neighbour over TF-IDF character n-grams, then
// multinomial and complement Naive Bayes — and measured at 56.8% and 67.8%
// under leave-one-out, against regexes already scoring 79.9%. A sweep of 72
// configurations never passed 67.8%. The knowledge is written down in
// config/intent-lexicon.js instead, and its header explains why in detail.
//
// WHY THERE ARE NO SECTOR NOUNS IN HERE. This file carries the INTENT axis
// only: how much, when, where, what have you got. The vocabulary axis — that
// "treatments" means services for a dentist and "flavours" means services for
// a cake shop — is not authored anywhere, because the tenant already gave us
// their own words during onboarding. api/_lib/layla/route.js scores the
// question against the tenant's own approved profile text for exactly that.
// Authoring 23 sectors of nouns here would be re-deriving, worse, data we are
// already holding.
//
// WHY THE ARABIZI IS SPELT INCONSISTENTLY ON PURPOSE. There is no standard for
// Arabic in Latin letters, so `wagt`/`wa8t`/`waqt` are all real. The exemplars
// vary deliberately; `skeleton()` folds the vowels away and the variants are
// there to keep the consonant frames honest.
//
// DISJOINTNESS. Nothing in here may appear in config/eval-questions.js.
// tests/intent-routing.test.mjs asserts it on normalized text, because an
// exemplar copied from the evaluation set turns the score into a measurement
// of itself. When these phrasings and the eval's disagree, that is the point.

/** Intents this file can route to. A subset of CLASSIFY_INTENTS on purpose:
 *  `greeting` and `identity` are short fixed phrases the regexes already match
 *  exactly, and `unknown` is the absence of a match, never a match. */
export const EXEMPLAR_INTENTS = ['prices', 'hours', 'location', 'services', 'human', 'optout', 'disabled'];

/**
 * Exemplars per intent.
 *
 * Each entry is `[text, lang]`. `lang` is documentation and lets the coverage
 * gate check every intent carries all four modes — it is not used for matching,
 * because a real message does not announce its language.
 */
export const EXEMPLARS = {
  // The price axis. Gulf Arabic has several unrelated ways to ask, and `أجر`
  // (fee) and `يكلف` (costs) are the two the production regex never knew.
  prices: [
    ['بكم هذا', 'ar'], ['ما هي الأسعار', 'ar'], ['كم يكلف', 'ar'],
    ['ما تكلفة ذلك', 'ar'], ['كم أجر ذلك', 'ar'], ['ايش الاسعار عندكم', 'ar'],
    ['عندكم قائمة أسعار', 'ar'], ['هل يوجد عرض أو خصم', 'ar'], ['كم المبلغ المطلوب', 'ar'],
    ['what does it cost', 'en'], ['how much do you charge', 'en'], ['what is the price', 'en'],
    ['can you send me your rates', 'en'], ['is there a fee for that', 'en'],
    ['what is your pricing', 'en'], ['do you have a price list', 'en'], ['any discount available', 'en'],
    ['how much would that be', 'en'], ['what am I looking at cost wise', 'en'],
    ['kam el se3r', 'arabizi'], ['bekam hatha', 'arabizi'], ['esh el as3ar', 'arabizi'],
    ['kam yekallef', 'arabizi'], ['3ndkom as3ar', 'arabizi'],
    ['كم the cost', 'mixed'], ['what السعر', 'mixed'], ['price كم', 'mixed'],
  ],

  // Opening times. `الدوام` is the word actually used in the Gulf for working
  // hours and carries no English cognate.
  hours: [
    ['ما مواعيد العمل', 'ar'], ['متى تفتحون الأبواب', 'ar'], ['ما وقت الدوام', 'ar'],
    ['هل أنتم مفتوحون الآن', 'ar'], ['متى تغلقون', 'ar'], ['تعملون يوم الجمعة', 'ar'],
    ['ما أوقات العمل في رمضان', 'ar'], ['هل تفتحون في نهاية الأسبوع', 'ar'],
    ['what time do you open', 'en'], ['when are you closed', 'en'], ['are you open today', 'en'],
    ['what days do you work', 'en'], ['do you work on fridays', 'en'],
    ['what is your schedule', 'en'], ['until what time are you open', 'en'],
    ['emta tftho', 'arabizi'], ['wagt el dawam', 'arabizi'], ['entom maftoheen alan', 'arabizi'],
    ['emta tsakron', 'arabizi'],
    ['متى you open', 'mixed'], ['what وقت الدوام', 'mixed'],
  ],

  // Where you are. `وين` is Gulf dialect and `فين` is Egyptian; both arrive.
  location: [
    ['وين أنتم', 'ar'], ['ما هو عنوانكم', 'ar'], ['في أي منطقة أنتم', 'ar'],
    ['كيف أصل إليكم', 'ar'], ['أرسل لي الموقع', 'ar'], ['هل لديكم فرع آخر', 'ar'],
    ['فين المكان', 'ar'], ['في أي شارع', 'ar'], ['هل تغطون منطقتي', 'ar'],
    ['where can I find you', 'en'], ['what area are you in', 'en'], ['send me your location', 'en'],
    ['how do I get to you', 'en'], ['do you have another branch', 'en'],
    ['which street are you on', 'en'], ['do you cover my area', 'en'],
    ['wen entom', 'arabizi'], ['esh el 3enwan', 'arabizi'], ['feen el makan', 'arabizi'],
    ['kaif awsal lakom', 'arabizi'],
    ['وين your branch', 'mixed'], ['what العنوان', 'mixed'],
  ],

  // What the business does, asked WITHOUT naming the thing. A question that
  // names the thing — "what treatments", "what is on your menu" — is routed by
  // the tenant's own profile text in api/_lib/layla/route.js, not from here.
  services: [
    ['ما الذي تقدمونه', 'ar'], ['ماذا تعملون بالضبط', 'ar'], ['ايش عندكم', 'ar'],
    ['ما هو نشاطكم', 'ar'], ['ماذا يوجد لديكم', 'ar'], ['هل تقدمون هذه الخدمة', 'ar'],
    ['ما المتوفر عندكم', 'ar'], ['أخبرني عن أعمالكم', 'ar'], ['ايش تسوون', 'ar'],
    ['what do you do', 'en'], ['what can you help with', 'en'], ['what have you got', 'en'],
    ['tell me what you provide', 'en'], ['what is available', 'en'],
    ['do you handle that kind of work', 'en'], ['what sort of business is this', 'en'],
    ['what options do I have', 'en'],
    ['shu tqadmon', 'arabizi'], ['esh 3endkom', 'arabizi'], ['shu el 3ard', 'arabizi'],
    ['eish tsawoon', 'arabizi'],
    ['ايش available عندكم', 'mixed'], ['what تقدمون', 'mixed'],
  ],

  // Hand off to a person. Under-routing this is the expensive direction: a
  // frustrated customer kept talking to a bot is the complaint that reaches
  // the owner.
  human: [
    ['أريد التحدث مع شخص', 'ar'], ['وصلني بالموظف', 'ar'], ['أبغى واحد من الفريق', 'ar'],
    ['في أحد يرد علي', 'ar'], ['أريد تقديم شكوى', 'ar'], ['هذا رد آلي ما أريده', 'ar'],
    ['I need to speak to someone', 'en'], ['put me through to a person', 'en'],
    ['can a real human help me', 'en'], ['I want to make a complaint', 'en'],
    ['transfer me to your team', 'en'], ['this bot is not helping', 'en'],
    ['abi atkalam ma3 wahed', 'arabizi'], ['wen el mowathaf', 'arabizi'],
    ['abi shakwa', 'arabizi'],
    ['أريد real person', 'mixed'], ['connect me مع الفريق', 'mixed'],
  ],

  // Stop messaging. Deliberately only phrasings whose ENTIRE point is to stop —
  // never a complaint, never "stop sending me the wrong size". A false opt-out
  // silences a live customer permanently, so api/_lib/layla/route.js holds this
  // intent to a higher score and a shorter message than the rest.
  optout: [
    ['لا تراسلني مرة أخرى', 'ar'], ['أوقف الرسائل', 'ar'], ['ألغِ اشتراكي', 'ar'],
    ['كفى رسائل', 'ar'], ['أزلني من القائمة', 'ar'], ['لا أريد أي رسائل', 'ar'],
    ['stop messaging me', 'en'], ['remove me from your list', 'en'],
    ['no more messages please', 'en'], ['cancel my subscription', 'en'],
    ['opt me out', 'en'], ['I do not want to receive these', 'en'],
    ['wagef el rasayel', 'arabizi'], ['la tersel li shay', 'arabizi'],
    ['alghi el eshtirak', 'arabizi'], ['shil esmi men el list', 'arabizi'],
    ['stop الرسائل', 'mixed'], ['لا أريد messages', 'mixed'],
  ],

  // Things Layla cannot do. She answers questions; she does not act. Routing
  // these correctly is what keeps her from appearing to take a booking she
  // never took — the failure mode that costs a real appointment slot.
  disabled: [
    ['احجز لي موعد', 'ar'], ['أريد تثبيت حجز', 'ar'], ['سجلني في الموعد', 'ar'],
    ['غيّر موعدي إلى الغد', 'ar'], ['ألغِ حجزي', 'ar'], ['أرسل لي تذكير قبل الموعد', 'ar'],
    ['book me in for tomorrow', 'en'], ['I want to reserve a slot', 'en'],
    ['reschedule my appointment', 'en'], ['cancel my booking', 'en'],
    ['put me on the calendar', 'en'], ['send me a reminder before it', 'en'],
    ['ehjez li maw3ed', 'arabizi'], ['abi ahajez', 'arabizi'], ['ghayer maw3edi', 'arabizi'],
    ['احجز appointment', 'mixed'], ['book لي موعد', 'mixed'],
  ],
};
