// GENERATED FILE — do not edit by hand.
//
// Source of truth: src/lib/industries.js, src/lib/layla-suggestions.js and
// config/layla-sector-packs.js. Regenerate with `npm run gen:sector-prefill`;
// `npm run prebuild` fails if this file drifts from those three.
//
// Onboarding shows these as EDITABLE DRAFTS. Nothing here is a claim about a
// customer's business — a pre-filled field always arrives with the profile
// marked unreviewed, so the customer still confirms it before Layla uses it.

export const SECTOR_PREFILL = {
  "real-estate": {
    archetype: "project",
    services: { en: "Property listings, buyer questions, viewings and agent follow-up", ar: "قوائم العقارات وأسئلة المشترين والمعاينات ومتابعة الوكلاء" },
    questions: {
      en: ["What properties are available?", "What price range do you cover?", "Can I book a viewing?", "I want to sell my property — who can help?"],
      ar: ["ما الخدمات المتاحة في العقارات؟", "كم تبلغ الأسعار؟", "ما مواعيد العمل والتوفر؟", "كيف أتواصل مع الفريق؟"],
    },
  },
  dental: {
    archetype: "booking",
    services: { en: "Consultations, treatments, prices and reception support", ar: "الاستشارات والعلاجات والأسعار ودعم الاستقبال" },
    questions: {
      en: ["What treatments do you offer?", "How much is a consultation?", "Do you accept insurance?", "How do I reschedule?"],
      ar: ["ما الخدمات المتاحة في عيادات الأسنان؟", "كم تبلغ الأسعار؟", "ما مواعيد العمل والتوفر؟", "كيف أتواصل مع الفريق؟"],
    },
  },
  clinic: {
    archetype: "booking",
    services: { en: "Appointments, services, prices and patient reception support", ar: "المواعيد والخدمات والأسعار ودعم استقبال المرضى" },
    questions: {
      en: ["What services do you offer?", "How much does it cost?", "Where are you located?", "How can I speak to reception?"],
      ar: ["ما الخدمات المتاحة في العيادات الطبية؟", "كم تبلغ الأسعار؟", "ما مواعيد العمل والتوفر؟", "كيف أتواصل مع الفريق؟"],
    },
  },
  hvac: {
    archetype: "project",
    services: { en: "Air conditioning service, repairs, quotes and visit scheduling", ar: "خدمات وإصلاحات التكييف وعروض الأسعار وجدولة الزيارات" },
    questions: {
      en: ["Can you repair my air conditioner?", "Can I get a quote?", "Do you serve my area?", "When can someone visit?"],
      ar: ["ما الخدمات المتاحة في التكييف؟", "كم تبلغ الأسعار؟", "ما مواعيد العمل والتوفر؟", "كيف أتواصل مع الفريق؟"],
    },
  },
  construction: {
    archetype: "project",
    services: { en: "Construction services, project quotes, materials and site visits", ar: "خدمات المقاولات وعروض المشاريع والمواد وزيارات الموقع" },
    questions: {
      en: ["Can you quote for my project?", "What work do you cover?", "When can you visit the site?", "How do I reach your team?"],
      ar: ["ما الخدمات المتاحة في المقاولات؟", "كم تبلغ الأسعار؟", "ما مواعيد العمل والتوفر؟", "كيف أتواصل مع الفريق؟"],
    },
  },
  cakes: {
    archetype: "catalog",
    services: { en: "Cake designs, flavours, prices, custom orders and delivery", ar: "تصاميم الكيك والنكهات والأسعار والطلبات الخاصة والتوصيل" },
    questions: {
      en: ["What cake designs are available?", "How much does it cost?", "Can I place a custom order?", "Do you deliver?"],
      ar: ["ما الخدمات المتاحة في الكيك؟", "كم تبلغ الأسعار؟", "ما مواعيد العمل والتوفر؟", "كيف أتواصل مع الفريق؟"],
    },
  },
  cafe: {
    archetype: "catalog",
    services: { en: "Coffee, desserts, menu items, orders and opening hours", ar: "القهوة والحلويات وأصناف القائمة والطلبات وأوقات العمل" },
    questions: {
      en: ["What is on the menu?", "What is available today?", "Can I order for delivery?", "What time do you close?"],
      ar: ["ما الخدمات المتاحة في القهوة والحلويات؟", "كم تبلغ الأسعار؟", "ما مواعيد العمل والتوفر؟", "كيف أتواصل مع الفريق؟"],
    },
  },
  restaurant: {
    archetype: "catalog",
    services: { en: "Menu and dishes, reservations, orders, delivery and customer support", ar: "قائمة الطعام والأطباق والحجوزات والطلبات والتوصيل ودعم العملاء" },
    questions: {
      en: ["What is on the menu?", "Can I make a reservation?", "Do you deliver to my area?", "What time are you open?"],
      ar: ["ما الخدمات المتاحة في المطاعم؟", "كم تبلغ الأسعار؟", "ما مواعيد العمل والتوفر؟", "كيف أتواصل مع الفريق؟"],
    },
  },
  retail: {
    archetype: "catalog",
    services: { en: "Products, prices, stock, orders, delivery and returns", ar: "المنتجات والأسعار والمخزون والطلبات والتوصيل والاستبدال" },
    questions: {
      en: ["Is this product available?", "How much is it?", "Can I order for delivery?", "What is your return policy?"],
      ar: ["ما الخدمات المتاحة في التجزئة والتجارة الإلكترونية؟", "كم تبلغ الأسعار؟", "ما مواعيد العمل والتوفر؟", "كيف أتواصل مع الفريق؟"],
    },
  },
  beauty: {
    archetype: "booking",
    services: { en: "Treatments, packages, prices, availability and salon appointments", ar: "العلاجات والباقات والأسعار والتوفر وحجوزات الصالون" },
    questions: {
      en: ["What treatments do you offer?", "How much is the package?", "Do you have availability this week?", "Where are you located?"],
      ar: ["ما الخدمات المتاحة في التجميل والصالونات؟", "كم تبلغ الأسعار؟", "ما مواعيد العمل والتوفر؟", "كيف أتواصل مع الفريق؟"],
    },
  },
  fitness: {
    archetype: "booking",
    services: { en: "Classes, memberships, schedules, prices and wellness support", ar: "الحصص والعضويات والجداول والأسعار ودعم العافية" },
    questions: {
      en: ["What classes do you offer?", "How much is membership?", "When is the next class?", "How do I get started?"],
      ar: ["ما الخدمات المتاحة في اللياقة والعافية؟", "كم تبلغ الأسعار؟", "ما مواعيد العمل والتوفر؟", "كيف أتواصل مع الفريق؟"],
    },
  },
  education: {
    archetype: "project",
    services: { en: "Courses, schedules, fees, enrollment and admissions support", ar: "الدورات والجداول والرسوم والتسجيل ودعم القبول" },
    questions: {
      en: ["What courses are available?", "When does the next class start?", "What are the fees?", "How do I enroll?"],
      ar: ["ما الخدمات المتاحة في التعليم والتدريب؟", "كم تبلغ الأسعار؟", "ما مواعيد العمل والتوفر؟", "كيف أتواصل مع الفريق؟"],
    },
  },
  automotive: {
    archetype: "booking",
    services: { en: "Vehicle servicing, repairs, quotes, parts and workshop visits", ar: "صيانة وإصلاح السيارات وعروض الأسعار وقطع الغيار وزيارات الورشة" },
    questions: {
      en: ["Can you service my car?", "Can I get a repair quote?", "Do you have this part?", "When can I bring my vehicle?"],
      ar: ["ما الخدمات المتاحة في السيارات؟", "كم تبلغ الأسعار؟", "ما مواعيد العمل والتوفر؟", "كيف أتواصل مع الفريق؟"],
    },
  },
  logistics: {
    archetype: "project",
    services: { en: "Delivery services, shipment quotes, tracking and collection times", ar: "خدمات التوصيل وعروض الشحن وتتبع الشحنات ومواعيد الاستلام" },
    questions: {
      en: ["Can you deliver to my area?", "Can I get a delivery quote?", "How do I track my shipment?", "When can you collect it?"],
      ar: ["ما الخدمات المتاحة في الشحن والتوصيل؟", "كم تبلغ الأسعار؟", "ما مواعيد العمل والتوفر؟", "كيف أتواصل مع الفريق؟"],
    },
  },
  travel: {
    archetype: "project",
    services: { en: "Travel packages, availability, prices, reservations and guest support", ar: "باقات السفر والتوفر والأسعار والحجوزات ودعم الضيوف" },
    questions: {
      en: ["What packages are available?", "How much does it cost?", "Can I check availability?", "How do I change my reservation?"],
      ar: ["ما الخدمات المتاحة في السفر والضيافة؟", "كم تبلغ الأسعار؟", "ما مواعيد العمل والتوفر؟", "كيف أتواصل مع الفريق؟"],
    },
  },
  events: {
    archetype: "project",
    services: { en: "Event services, packages, availability, quotes and planning support", ar: "خدمات المناسبات والباقات والتوفر وعروض الأسعار ودعم التخطيط" },
    questions: {
      en: ["Can you help with my event?", "What packages do you offer?", "Can I get a quote?", "Are you available on my date?"],
      ar: ["ما الخدمات المتاحة في المناسبات والأعراس؟", "كم تبلغ الأسعار؟", "ما مواعيد العمل والتوفر؟", "كيف أتواصل مع الفريق؟"],
    },
  },
  legal: {
    archetype: "booking",
    services: { en: "Legal services, intake information, consultation requests and team contact", ar: "الخدمات القانونية ومعلومات فتح الملف وطلبات الاستشارة والتواصل مع الفريق" },
    questions: {
      en: ["What information do you need for an intake?", "How can I request a consultation?", "What areas do you cover?", "How can I speak to your team?"],
      ar: ["ما الخدمات المتاحة في الخدمات القانونية؟", "كم تبلغ الأسعار؟", "ما مواعيد العمل والتوفر؟", "كيف أتواصل مع الفريق؟"],
    },
  },
  finance: {
    archetype: "booking",
    services: { en: "Accounting services, required documents, quotes and advisor contact", ar: "خدمات المحاسبة والمستندات المطلوبة وعروض الأسعار والتواصل مع المستشار" },
    questions: {
      en: ["What documents do you need?", "Which services do you provide?", "How can I request a quote?", "How can I speak to an advisor?"],
      ar: ["ما الخدمات المتاحة في المالية والمحاسبة؟", "كم تبلغ الأسعار؟", "ما مواعيد العمل والتوفر؟", "كيف أتواصل مع الفريق؟"],
    },
  },
  marketing: {
    archetype: "project",
    services: { en: "Marketing services, project scope, proposals and team contact", ar: "خدمات التسويق ونطاق المشاريع والعروض والتواصل مع الفريق" },
    questions: {
      en: ["What marketing work do you handle?", "How does your process work?", "Can I request a proposal?", "How can I speak to your team?"],
      ar: ["ما الخدمات المتاحة في التسويق والوكالات؟", "كم تبلغ الأسعار؟", "ما مواعيد العمل والتوفر؟", "كيف أتواصل مع الفريق؟"],
    },
  },
  technology: {
    archetype: "project",
    services: { en: "Software services, implementation questions, support and project intake", ar: "خدمات البرمجيات وأسئلة التنفيذ والدعم وبدء المشروع" },
    questions: {
      en: ["What does your software do?", "What information do you need?", "How can I request support?", "How do I speak to your team?"],
      ar: ["ما الخدمات المتاحة في التقنية والبرمجيات؟", "كم تبلغ الأسعار؟", "ما مواعيد العمل والتوفر؟", "كيف أتواصل مع الفريق؟"],
    },
  },
  manufacturing: {
    archetype: "project",
    services: { en: "Products, specifications, minimum orders, quotes and delivery", ar: "المنتجات والمواصفات والحد الأدنى للطلبات وعروض الأسعار والتوصيل" },
    questions: {
      en: ["What products do you make?", "Can I request a quote?", "What specifications do you need?", "What is the delivery process?"],
      ar: ["ما الخدمات المتاحة في التصنيع؟", "كم تبلغ الأسعار؟", "ما مواعيد العمل والتوفر؟", "كيف أتواصل مع الفريق؟"],
    },
  },
  cleaning: {
    archetype: "booking",
    services: { en: "Cleaning services, packages, quotes, availability and visits", ar: "خدمات التنظيف والباقات وعروض الأسعار والتوفر والزيارات" },
    questions: {
      en: ["What cleaning services do you offer?", "Can I get a quote?", "Do you serve my area?", "When can someone visit?"],
      ar: ["ما الخدمات المتاحة في النظافة وإدارة المرافق؟", "كم تبلغ الأسعار؟", "ما مواعيد العمل والتوفر؟", "كيف أتواصل مع الفريق؟"],
    },
  },
  other: {
    archetype: null,
    services: { en: "Your main services, prices, availability and how customers reach your team", ar: "خدماتك الرئيسية والأسعار والتوفر وكيفية تواصل العملاء مع فريقك" },
    questions: {
      en: ["What do you help customers with?", "How much does it cost?", "What information do you need?", "How can I speak to someone?"],
      ar: ["ما الخدمات المتاحة في مجال آخر؟", "كم تبلغ الأسعار؟", "ما مواعيد العمل والتوفر؟", "كيف أتواصل مع الفريق؟"],
    },
  },
};

/** The free-text sector; it has no pack and shows a description box instead. */
export const FREE_TEXT_SECTOR = "other";

/**
 * Pre-fill drafts for one sector, in one language.
 *
 * @param {string} sectorId an id from INDUSTRIES
 * @param {'en'|'ar'} [lang]
 * @returns {{ archetype: string|null, service: string, questions: string[] }}
 */
export function prefillFor(sectorId, lang = 'en') {
  const row = SECTOR_PREFILL[sectorId] || SECTOR_PREFILL[FREE_TEXT_SECTOR];
  const locale = lang === 'ar' ? 'ar' : 'en';
  return { archetype: row.archetype, service: row.services[locale], questions: row.questions[locale] };
}

/**
 * Is this service summary still untouched boilerplate?
 *
 * True for blank text and for any sector's suggested summary in either
 * language. Changing sector may replace a summary only while this holds — once
 * the customer has written a word of their own, their text is theirs, and a
 * later sector change must never silently discard it.
 *
 * It is also the signal that a summary has been accepted without being read:
 * a profile whose services text is still the sector default describes the
 * industry rather than the business.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function isSectorDefaultService(text) {
  const value = String(text || '').trim();
  if (!value) return true;
  return Object.values(SECTOR_PREFILL).some(
    (row) => row.services.en === value || row.services.ar === value
  );
}
