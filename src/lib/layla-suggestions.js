// Customer-facing prompts derived from the canonical industries list and the
// approved sector hypotheses in Market/Growth-Systems-Catalog.md. These are
// editable starting points, never claims about what a tenant offers.
//
// THIS FILE IS AUTHORED INPUT, NOT A RUNTIME MODULE. Onboarding imports
// src/lib/sector-prefill.generated.js, which scripts/gen-sector-prefill.mjs
// compiles from this file plus src/lib/industries.js and
// config/layla-sector-packs.js — failing the build if the three disagree.
// After editing here, run `npm run gen:sector-prefill` and commit the result.
const row = (en, ar, questions = []) => ({ en, ar, questions });

export const LAYLA_SUGGESTIONS = {
  'real-estate': row('Property listings, buyer questions, viewings and agent follow-up', 'قوائم العقارات وأسئلة المشترين والمعاينات ومتابعة الوكلاء', ['What properties are available?', 'What price range do you cover?', 'Can I book a viewing?', 'I want to sell my property — who can help?']),
  dental: row('Consultations, treatments, prices and reception support', 'الاستشارات والعلاجات والأسعار ودعم الاستقبال', ['What treatments do you offer?', 'How much is a consultation?', 'Do you accept insurance?', 'How do I reschedule?']),
  clinic: row('Appointments, services, prices and patient reception support', 'المواعيد والخدمات والأسعار ودعم استقبال المرضى', ['What services do you offer?', 'How much does it cost?', 'Where are you located?', 'How can I speak to reception?']),
  hvac: row('Air conditioning service, repairs, quotes and visit scheduling', 'خدمات وإصلاحات التكييف وعروض الأسعار وجدولة الزيارات', ['Can you repair my air conditioner?', 'Can I get a quote?', 'Do you serve my area?', 'When can someone visit?']),
  construction: row('Construction services, project quotes, materials and site visits', 'خدمات المقاولات وعروض المشاريع والمواد وزيارات الموقع', ['Can you quote for my project?', 'What work do you cover?', 'When can you visit the site?', 'How do I reach your team?']),
  cakes: row('Cake designs, flavours, prices, custom orders and delivery', 'تصاميم الكيك والنكهات والأسعار والطلبات الخاصة والتوصيل', ['What cake designs are available?', 'How much does it cost?', 'Can I place a custom order?', 'Do you deliver?']),
  cafe: row('Coffee, desserts, menu items, orders and opening hours', 'القهوة والحلويات وأصناف القائمة والطلبات وأوقات العمل', ['What is on the menu?', 'What is available today?', 'Can I order for delivery?', 'What time do you close?']),
  restaurant: row('Menu and dishes, reservations, orders, delivery and customer support', 'قائمة الطعام والأطباق والحجوزات والطلبات والتوصيل ودعم العملاء', ['What is on the menu?', 'Can I make a reservation?', 'Do you deliver to my area?', 'What time are you open?']),
  retail: row('Products, prices, stock, orders, delivery and returns', 'المنتجات والأسعار والمخزون والطلبات والتوصيل والاستبدال', ['Is this product available?', 'How much is it?', 'Can I order for delivery?', 'What is your return policy?']),
  beauty: row('Treatments, packages, prices, availability and salon appointments', 'العلاجات والباقات والأسعار والتوفر وحجوزات الصالون', ['What treatments do you offer?', 'How much is the package?', 'Do you have availability this week?', 'Where are you located?']),
  fitness: row('Classes, memberships, schedules, prices and wellness support', 'الحصص والعضويات والجداول والأسعار ودعم العافية', ['What classes do you offer?', 'How much is membership?', 'When is the next class?', 'How do I get started?']),
  education: row('Courses, schedules, fees, enrollment and admissions support', 'الدورات والجداول والرسوم والتسجيل ودعم القبول', ['What courses are available?', 'When does the next class start?', 'What are the fees?', 'How do I enroll?']),
  automotive: row('Vehicle servicing, repairs, quotes, parts and workshop visits', 'صيانة وإصلاح السيارات وعروض الأسعار وقطع الغيار وزيارات الورشة', ['Can you service my car?', 'Can I get a repair quote?', 'Do you have this part?', 'When can I bring my vehicle?']),
  logistics: row('Delivery services, shipment quotes, tracking and collection times', 'خدمات التوصيل وعروض الشحن وتتبع الشحنات ومواعيد الاستلام', ['Can you deliver to my area?', 'Can I get a delivery quote?', 'How do I track my shipment?', 'When can you collect it?']),
  travel: row('Travel packages, availability, prices, reservations and guest support', 'باقات السفر والتوفر والأسعار والحجوزات ودعم الضيوف', ['What packages are available?', 'How much does it cost?', 'Can I check availability?', 'How do I change my reservation?']),
  events: row('Event services, packages, availability, quotes and planning support', 'خدمات المناسبات والباقات والتوفر وعروض الأسعار ودعم التخطيط', ['Can you help with my event?', 'What packages do you offer?', 'Can I get a quote?', 'Are you available on my date?']),
  legal: row('Legal services, intake information, consultation requests and team contact', 'الخدمات القانونية ومعلومات فتح الملف وطلبات الاستشارة والتواصل مع الفريق', ['What information do you need for an intake?', 'How can I request a consultation?', 'What areas do you cover?', 'How can I speak to your team?']),
  finance: row('Accounting services, required documents, quotes and advisor contact', 'خدمات المحاسبة والمستندات المطلوبة وعروض الأسعار والتواصل مع المستشار', ['What documents do you need?', 'Which services do you provide?', 'How can I request a quote?', 'How can I speak to an advisor?']),
  marketing: row('Marketing services, project scope, proposals and team contact', 'خدمات التسويق ونطاق المشاريع والعروض والتواصل مع الفريق', ['What marketing work do you handle?', 'How does your process work?', 'Can I request a proposal?', 'How can I speak to your team?']),
  technology: row('Software services, implementation questions, support and project intake', 'خدمات البرمجيات وأسئلة التنفيذ والدعم وبدء المشروع', ['What does your software do?', 'What information do you need?', 'How can I request support?', 'How do I speak to your team?']),
  manufacturing: row('Products, specifications, minimum orders, quotes and delivery', 'المنتجات والمواصفات والحد الأدنى للطلبات وعروض الأسعار والتوصيل', ['What products do you make?', 'Can I request a quote?', 'What specifications do you need?', 'What is the delivery process?']),
  cleaning: row('Cleaning services, packages, quotes, availability and visits', 'خدمات التنظيف والباقات وعروض الأسعار والتوفر والزيارات', ['What cleaning services do you offer?', 'Can I get a quote?', 'Do you serve my area?', 'When can someone visit?']),
  other: row('Your main services, prices, availability and how customers reach your team', 'خدماتك الرئيسية والأسعار والتوفر وكيفية تواصل العملاء مع فريقك', ['What do you help customers with?', 'How much does it cost?', 'What information do you need?', 'How can I speak to someone?']),
};

// `suggestionsFor()` used to live here and shape these rows at request time. It
// was replaced by `prefillFor()` in the generated module: composing the Arabic
// questions at runtime hid the fact that every Arabic sector shared four generic
// questions while English got authored ones.
