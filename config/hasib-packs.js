// Hasib industry packs, keyed by the same sector ids as Layla's packs.
//
// Deterministic configuration only: which modules a business sees, how its
// variants are described, which extra order fields and expense categories it
// starts with. A module is `available` (built and tested), `planned` (on the
// roadmap for this pack, hidden from the owner) or `off` (not a fit).
import { SECTOR_PACKS } from './layla-sector-packs.js';
import { BUSINESS_INDUSTRIES } from '../src/lib/industries.js';

export const HASIB_PACK_VERSION = 'hasib-packs-v3';
const t = (key, en, ar) => ({ key, en, ar });

// Demand needs Layla to capture an `item`, which only catalog sectors do; it is switched on per archetype below.
const CORE = { orders: 'available', stock: 'available', expenses: 'available', insights: 'available', demand: 'planned', digest: 'planned' };
const OFF = { appointments: 'off', plans: 'off', recipes: 'off', batches: 'off', shelfLife: 'off', jobCards: 'off', enrolments: 'off', quotes: 'off', serials: 'off', repairs: 'off', tradeIns: 'off' };

const EXPENSES = [
  t('rent', 'Rent', 'الإيجار'), t('salaries', 'Salaries', 'الرواتب'), t('stock_purchase', 'Stock purchases', 'مشتريات البضاعة'),
  t('marketing', 'Marketing', 'التسويق'), t('utilities', 'Utilities', 'الكهرباء والماء'), t('delivery', 'Delivery and courier', 'التوصيل'),
  t('fees', 'Bank and payment fees', 'رسوم بنكية ورسوم الدفع'), t('other', 'Other', 'أخرى'),
];
const extra = (...rows) => [...EXPENSES.slice(0, -1), ...rows, EXPENSES.at(-1)];

// Per-archetype defaults, refined per sector below.
const ARCHETYPE = {
  catalog: { modules: { ...CORE, ...OFF, demand: 'available' }, variantOptions: [t('size', 'Size', 'المقاس'), t('colour', 'Colour', 'اللون')], orderFields: [], expenseCategories: EXPENSES },
  booking: { modules: { ...CORE, ...OFF, appointments: 'available', plans: 'available' }, variantOptions: [], orderFields: [], expenseCategories: extra(t('supplies', 'Supplies', 'المستلزمات')) },
  project: { modules: { ...CORE, ...OFF, quotes: 'available', plans: 'available' }, variantOptions: [], orderFields: [], expenseCategories: extra(t('materials', 'Materials', 'المواد'), t('subcontract', 'Subcontractors', 'المقاولون من الباطن')) },
};

const SECTOR = {
  // First full pack: fashion and abaya boutiques.
  retail: {
    variantOptions: [t('size', 'Size', 'المقاس'), t('length', 'Length', 'الطول'), t('colour', 'Colour', 'اللون')],
    orderFields: [
      { key: 'made_to_measure', en: 'Made to measure', ar: 'تفصيل حسب المقاس', type: 'boolean' },
      { key: 'measurements', en: 'Measurements', ar: 'المقاسات', type: 'text', max: 300 },
      { key: 'fitting_date', en: 'Fitting date', ar: 'موعد القياس', type: 'date' },
    ],
    modules: { plans: 'planned' },
  },
  cakes: {
    orderFields: [
      { key: 'inscription', en: 'Cake message', ar: 'العبارة على الكيك', type: 'text', max: 120 },
      { key: 'filling', en: 'Filling', ar: 'الحشوة', type: 'text', max: 120 },
      { key: 'design_notes', en: 'Design notes', ar: 'ملاحظات التصميم', type: 'text', max: 240 },
      { key: 'allergen_request', en: 'Allergen request', ar: 'طلب متعلق بالحساسية', type: 'text', max: 160 },

    ],
    variantOptions: [t('size', 'Size', 'الحجم'), t('flavour', 'Flavour', 'النكهة')],
    modules: { plans: 'planned', recipes: 'available', batches: 'available', shelfLife: 'available' },
    expenseCategories: extra(t('aggregator_fees', 'Delivery app commission', 'عمولة تطبيقات التوصيل'), t('waste', 'Waste', 'الهدر'), t('custom_materials', 'Custom cake materials', 'مواد الكيك المخصص')),
  },
  restaurant: { variantOptions: [t('size', 'Size', 'الحجم')], modules: { recipes: 'available', batches: 'available' }, expenseCategories: extra(t('aggregator_fees', 'Delivery app commission', 'عمولة تطبيقات التوصيل'), t('waste', 'Waste', 'الهدر')) },
  cafe: {
    variantOptions: [t('size', 'Size', 'الحجم'), t('temperature', 'Temperature', 'الحرارة')],
    orderFields: [
      { key: 'milk_and_extras', en: 'Milk and extras', ar: 'الحليب والإضافات', type: 'text', max: 120 },

    ],
    modules: { recipes: 'available', batches: 'available' },
    expenseCategories: extra(t('aggregator_fees', 'Delivery app commission', 'عمولة تطبيقات التوصيل'), t('waste', 'Waste', 'الهدر')),
  },
  // Dental: operational records only. Orders read as Visits, contacts as Patients and
  // Stock as Services (treatments from Layla's catalog, supplies from stock). Nothing
  // clinical is stored: visits carry no notes and every extra field is bounded.
  dental: {
    labels: { orders: 'visits', stock: 'services', customers: 'patients' },
    sensitive: true, noOrderNotes: true, fulfilment: ['in_store'],
    // Supplies are the clinic's own stock: never offered to patients. Treatments come from Layla's catalog.
    internalStock: true, serviceItems: true,
    orderFields: [{ key: 'visit_date', en: 'Visit date', ar: 'تاريخ الزيارة', type: 'date' }, { key: 'branch', en: 'Branch', ar: 'الفرع', type: 'text', max: 40 }],
    expenseCategories: [EXPENSES[0], EXPENSES[1], t('supplies', 'Supplies', 'المستلزمات'), t('lab_fees', 'Dental lab fees', 'رسوم مختبر الأسنان'),
      t('equipment', 'Equipment maintenance', 'صيانة المعدات'), EXPENSES[3], EXPENSES[4], EXPENSES[6], EXPENSES[7]],
    // Visits are Hasib orders, so the generic booking modules stay off for dental.
    modules: { appointments: 'off', plans: 'off', batches: 'planned' },
  },
  clinic: { modules: { batches: 'planned' } },
  automotive: { modules: { jobCards: 'available' }, orderFields: [{ key: 'plate', en: 'Plate number', ar: 'رقم اللوحة', type: 'text', max: 20 }, { key: 'mileage', en: 'Mileage (km)', ar: 'العداد (كم)', type: 'number' }] },
  education: { modules: { enrolments: 'available', appointments: 'available' } },
  'real-estate': { modules: { plans: 'off', quotes: 'off' }, expenseCategories: extra(t('commission', 'Agent commission', 'عمولة الوسطاء'), t('portal_fees', 'Listing portal fees', 'رسوم منصات الإعلانات')) },
};

// Owner-facing scope is independent of release approval. Non-live packs are local previews only.
const OWNER_PACKS = {
  retail: ['Orders', 'الطلبات', 'Products', 'المنتجات', 'orders', [['best_variant', 'Best-selling variant', 'المقاس واللون الأكثر مبيعاً'], ['unsold_stock', 'Stock unsold 60 days', 'بضاعة لم تُبع منذ ٦٠ يوماً'], ['product_requests', 'Unfilled product requests', 'طلبات منتجات لم تُلبَّ']]],
  'retail-tech': ['Orders', 'الطلبات', 'Products', 'المنتجات', 'orders', [['device_profit', 'Profit per device', 'الربح لكل جهاز'], ['unsold_stock', 'Stock held 60 days', 'بضاعة منذ ٦٠ يوماً'], ['overdue_repairs', 'Overdue repairs', 'إصلاحات متأخرة']]],
  beauty: ['Bookings', 'الحجوزات', 'Supplies', 'المستلزمات', 'bookings', [['missed_visits', 'Missed visits', 'زيارات فائتة'], ['booked_hours', 'Booked hours', 'الساعات المحجوزة'], ['return_visits', 'Completed return visits', 'زيارات متكررة مكتملة']]],
  // Dental reads Hasib orders as Visits and stock as Services (treatments plus internal supplies).
  dental: ['Visits', 'الزيارات', 'Services', 'الخدمات', 'orders', [['missed_visits', 'Missed visits', 'زيارات فائتة'], ['followups_due', 'Follow-ups due', 'متابعات مستحقة'], ['unpaid_visits', 'Unpaid visit charges', 'رسوم زيارات غير مدفوعة']]],
  clinic: ['Visits', 'الزيارات', 'Supplies', 'المستلزمات', 'bookings', [['unconfirmed_visits', 'Unconfirmed visits', 'زيارات غير مؤكدة'], ['missed_visits', 'Missed visits', 'زيارات فائتة'], ['unpaid_visits', 'Unpaid visit charges', 'رسوم زيارات غير مدفوعة']]],
  restaurant: ['Orders', 'الطلبات', 'Menu', 'القائمة', 'orders', [['waste_cost', 'Waste cost', 'تكلفة الهدر'], ['dish_profit', 'Profit by dish', 'الربح حسب الطبق'], ['channel_profit', 'Money left by sales channel', 'المتبقي حسب قناة البيع']]],
  cafe: ['Orders', 'الطلبات', 'Menu', 'القائمة', 'orders', [['drink_profit', 'Profit by drink', 'الربح حسب المشروب'], ['remake_waste', 'Milk and remake waste', 'هدر الحليب وإعادة التحضير'], ['low_ingredients', 'Ingredients running low', 'مكونات قاربت على النفاد']]],
  cakes: ['Orders', 'الطلبات', 'Products', 'المنتجات', 'orders', [['sold_baked', 'Sold versus baked', 'المباع مقارنة بالمخبوز'], ['unsold_cost', 'Unsold cost', 'تكلفة غير المباع'], ['cakes_due', 'Cakes due today', 'كيك مستحق اليوم']]],
  automotive: ['Workshop', 'الورشة', 'Parts & supplies', 'القطع والمستلزمات', 'automotive', [['approvals_waiting', 'Estimates awaiting approval', 'عروض أسعار تنتظر الموافقة'], ['past_promised', 'Vehicles past promised time', 'مركبات تجاوزت الموعد الموعود'], ['ready_for_collection', 'Ready for collection', 'جاهزة للاستلام']]],
  fitness: ['Bookings', 'الحجوزات', 'Supplies', 'المستلزمات', 'memberships', [['active_members', 'Active members', 'أعضاء نشطون'], ['absent_members', 'Absent members', 'أعضاء غائبون'], ['renewals_due', 'Renewals due', 'تجديدات مستحقة']]],
  education: ['Lessons', 'الدروس', 'Supplies', 'المستلزمات', 'lessons', [['lessons_remaining', 'Lessons remaining', 'دروس متبقية'], ['missed_lessons', 'Missed lessons', 'دروس فائتة'], ['unpaid_fees', 'Unpaid fees', 'رسوم غير مدفوعة']]],
  cleaning: ['Visits', 'الزيارات', 'Supplies', 'المستلزمات', 'jobs', [['visits_due', 'Visits due', 'زيارات مستحقة'], ['unfinished_checklists', 'Unfinished checklists', 'قوائم مهام غير مكتملة'], ['visit_profit', 'Profit per visit', 'الربح لكل زيارة']]],
  hvac: ['Jobs', 'الأعمال', 'Supplies', 'المستلزمات', 'jobs', [['services_due', 'Services due', 'صيانات مستحقة'], ['repeat_faults', 'Repeat faults', 'أعطال متكررة'], ['job_profit', 'Profit per job', 'الربح لكل عمل']]],
  construction: ['Projects', 'المشاريع', 'Procurement', 'المشتريات', 'construction', [['schedule_risk', 'Projects at schedule risk', 'مشاريع معرضة للتأخير'], ['variation_exposure', 'Submitted variation exposure', 'قيمة التغييرات المقدمة'], ['overdue_receivables', 'Overdue certified receivables', 'مستحقات معتمدة متأخرة']]],
  'real-estate': ['Deals', 'الصفقات', 'Properties', 'العقارات', 'property', [['enquiries_waiting', 'Enquiries awaiting reply', 'استفسارات تنتظر الرد'], ['viewings_due', 'Viewings due', 'معاينات مستحقة'], ['commission_owed', 'Commission owed', 'عمولات مستحقة']]],
};
const PRESENTATION = {
  retail: { icon: 'box', actions: [
    ['order', 'New order', 'طلب جديد', 'receipt', ['orders', { create: '1' }]],
    ['product', 'Add product', 'إضافة منتج', 'box', ['stock', { action: 'product' }]],
    ['import', 'Import stock', 'استيراد المخزون', 'upload', ['stock', { action: 'import' }]],
    ['followup', 'Customer follow-up', 'متابعة عميل', 'message-circle', ['customers']],
  ] },
  'retail-tech': { icon: 'smartphone', actions: [
    ['repair', 'New repair', 'تذكرة صيانة جديدة', 'wrench', ['service', { action: 'repair' }]],
    ['trade-in', 'Record trade-in', 'تسجيل جهاز استبدال', 'repeat', ['service', { action: 'trade-in' }]],
    ['warranty', 'Check warranty', 'فحص الضمان', 'shield-check', ['service', { action: 'warranty' }]],
    ['order', 'New sale', 'بيع جديد', 'receipt', ['orders', { create: '1' }]],
  ] },
  dental: { icon: 'tooth', actions: [
    ['visit', 'Add visit', 'إضافة زيارة', 'calendar', ['orders', { create: '1' }]],
    ['charge', 'Record charge', 'تسجيل رسوم', 'receipt', ['orders', { create: '1' }]],
    ['setup', 'Service or provider', 'خدمة أو مقدم', 'users', ['orders', { action: 'setup' }]],
    ['followup', 'Follow-up', 'متابعة', 'message-circle', ['customers']],
  ] },
  clinic: { icon: 'stethoscope', actions: [
    ['request', 'Appointment request', 'طلب موعد', 'calendar', ['orders', { action: 'request' }]],
    ['visit', 'Book visit', 'حجز زيارة', 'calendar', ['orders', { action: 'booking' }]],
    ['patient', 'Find patient', 'البحث عن مريض', 'users', ['customers']],
    ['supply', 'Record supply', 'تسجيل مستلزم', 'box', ['stock']],
  ] },
  automotive: { icon: 'wrench', actions: [
    ['appointment', 'Book appointment', 'حجز موعد', 'calendar', ['orders', { action: 'appointment' }]],
    ['vehicle', 'Add vehicle', 'إضافة مركبة', 'car', ['orders', { action: 'vehicle' }]],
    ['work-order', 'Open work order', 'فتح أمر عمل', 'wrench', ['orders', { action: 'work-order' }]],
    ['part', 'Find a part', 'البحث عن قطعة', 'box', ['stock']],
  ] },
  construction: { icon: 'building-2', actions: [
    ['project', 'New project', 'مشروع جديد', 'building-2', ['orders', { action: 'project' }]],
    ['progress', 'Record progress', 'تسجيل التقدم', 'bar-chart', ['orders', { action: 'progress' }]],
    ['variation', 'Draft variation', 'مسودة تغيير', 'receipt', ['orders', { action: 'variation' }]],
    ['procurement', 'Add commitment', 'إضافة التزام شراء', 'box', ['stock', { action: 'commitment' }]],
  ] },
  'real-estate': { icon: 'building-2', actions: [
    ['property', 'Add property', 'إضافة عقار', 'home', ['stock', { action: 'property' }]],
    ['opportunity', 'Add opportunity', 'إضافة فرصة', 'users', ['orders', { action: 'opportunity' }]],
    ['viewing', 'Schedule viewing', 'جدولة معاينة', 'calendar', ['orders', { action: 'viewing' }]],
    ['offer', 'Draft offer', 'مسودة عرض', 'receipt', ['orders', { action: 'offer' }]],
    ['follow-up', 'Draft follow-up', 'مسودة متابعة', 'message-circle', ['orders', { action: 'follow-up' }]],
  ] },
};
function ownerConfig(id) {
  const row = OWNER_PACKS[id] || OWNER_PACKS.retail;
  const metricGo = metric => metric === 'overdue_repairs' ? ['service']
    : ['unsold_stock', 'low_ingredients', 'unsold_cost'].includes(metric) ? ['stock']
      : ['commission_owed'].includes(metric) ? ['money'] : ['orders'];
  return { ownerUi: { work: { en: row[0], ar: row[1] }, stock: { en: row[2], ar: row[3] }, workflow: row[4] },
    dashboard: PRESENTATION[id] || PRESENTATION.retail,
    todayMetrics: row[5].map(([id, en, ar]) => ({ id, en, ar, go: metricGo(id) })),
    thresholds: { unsoldDays: 60, absenceDays: 14 } };
}

function build(id, archetype) {
  const base = ARCHETYPE[archetype], own = SECTOR[id] || {};
  return Object.freeze({ id, archetype, version: HASIB_PACK_VERSION, ...ownerConfig(id),
    modules: { ...base.modules, ...(own.modules || {}) },
    variantOptions: own.variantOptions || base.variantOptions,
    orderFields: own.orderFields || base.orderFields,
    expenseCategories: own.expenseCategories || base.expenseCategories,
    ...(own.labels ? { labels: own.labels, sensitive: !!own.sensitive, noOrderNotes: !!own.noOrderNotes, fulfilment: own.fulfilment, internalStock: !!own.internalStock, serviceItems: !!own.serviceItems } : {}) });
}

// Hasib-only packs: industries finer than Layla's sectors, chosen in Hasib's industry setting.
const TECH = Object.freeze({ id: 'retail-tech', archetype: 'catalog', version: HASIB_PACK_VERSION, ...ownerConfig('retail-tech'),
  modules: { ...ARCHETYPE.catalog.modules, serials: 'available', repairs: 'available', tradeIns: 'available' },
  variantOptions: [t('model', 'Model', 'الموديل'), t('storage', 'Storage', 'السعة'), t('colour', 'Colour', 'اللون'), t('condition', 'Condition', 'الحالة')],
  orderFields: [],
  expenseCategories: extra(t('repair_parts', 'Repair parts', 'قطع غيار الصيانة'), t('warranty_claims', 'Warranty claims and shipping', 'مطالبات الضمان والشحن')) });

export const HASIB_PACKS = Object.freeze({
  ...Object.fromEntries(Object.values(SECTOR_PACKS).map(p => [p.id, build(p.id, p.archetype)])),
  other: build('other', 'catalog'),
  'retail-tech': TECH,
});

export function hasibPack(sectorId) { return HASIB_PACKS[sectorId] || HASIB_PACKS.other; }

/** Only modules the owner can use today; planned ones stay hidden until they ship. */
export const visibleModules = pack => Object.entries(pack.modules).filter(([, v]) => v === 'available').map(([k]) => k);

// Sectors ship one at a time. A pack opens Hasib only once its setup, tests and
// acceptance evidence exist; the others stay hidden even though they are configured.
export const HASIB_LIVE_PACKS = Object.freeze(['retail', 'retail-tech', 'dental', 'real-estate', 'construction', 'automotive']);
export const HASIB_PREVIEW_PACKS = Object.freeze(Object.keys(OWNER_PACKS).filter(id => !HASIB_LIVE_PACKS.includes(id)));
const labelFor = id => BUSINESS_INDUSTRIES.find(industry => industry.id === id);
export const isLivePack = id => HASIB_LIVE_PACKS.includes(id);
export const isPreviewPack = id => HASIB_PREVIEW_PACKS.includes(id);
export const livePackSummaries = () => HASIB_LIVE_PACKS.map(id => ({ ...labelFor(id), status: 'live', live: true, built: true }));

// The Business Setup catalog is also Hasib's catalog. Status is release evidence:
// live for real data, preview for founder-only synthetic data, pending otherwise.
export function industryCatalog() {
  const all = BUSINESS_INDUSTRIES.map(industry => {
    const status = isLivePack(industry.id) ? 'live' : isPreviewPack(industry.id) ? 'preview' : 'pending';
    return { ...industry, status, live: status === 'live', built: status !== 'pending' };
  });
  return ['live', 'preview', 'pending'].flatMap(status => all.filter(industry => industry.status === status));
}
