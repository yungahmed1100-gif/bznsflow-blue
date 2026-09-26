// Hasib industry packs, keyed by the same sector ids as Layla's packs.
//
// Deterministic configuration only: which modules a business sees, how its
// variants are described, which extra order fields and expense categories it
// starts with. A module is `available` (built and tested), `planned` (on the
// roadmap for this pack, hidden from the owner) or `off` (not a fit).
import { SECTOR_PACKS } from './layla-sector-packs.js';

export const HASIB_PACK_VERSION = 'hasib-packs-v1';
const t = (key, en, ar) => ({ key, en, ar });

// Expenses and Insights ship in P2; they stay hidden until their tests and UI exist.
const CORE = { orders: 'available', stock: 'available', expenses: 'planned', insights: 'planned', demand: 'planned', digest: 'planned' };
const OFF = { appointments: 'off', plans: 'off', recipes: 'off', batches: 'off', jobCards: 'off', enrolments: 'off', quotes: 'off' };

const EXPENSES = [
  t('rent', 'Rent', 'الإيجار'), t('salaries', 'Salaries', 'الرواتب'), t('stock_purchase', 'Stock purchases', 'مشتريات البضاعة'),
  t('marketing', 'Marketing', 'التسويق'), t('utilities', 'Utilities', 'الكهرباء والماء'), t('delivery', 'Delivery and courier', 'التوصيل'),
  t('fees', 'Bank and payment fees', 'رسوم بنكية ورسوم الدفع'), t('other', 'Other', 'أخرى'),
];
const extra = (...rows) => [...EXPENSES.slice(0, -1), ...rows, EXPENSES.at(-1)];

// Per-archetype defaults, refined per sector below.
const ARCHETYPE = {
  catalog: { modules: { ...CORE, ...OFF }, variantOptions: [t('size', 'Size', 'المقاس'), t('colour', 'Colour', 'اللون')], orderFields: [], expenseCategories: EXPENSES },
  booking: { modules: { ...CORE, ...OFF, appointments: 'planned', plans: 'planned' }, variantOptions: [], orderFields: [], expenseCategories: extra(t('supplies', 'Supplies', 'المستلزمات')) },
  project: { modules: { ...CORE, ...OFF, quotes: 'planned', plans: 'planned' }, variantOptions: [], orderFields: [], expenseCategories: extra(t('materials', 'Materials', 'المواد'), t('subcontract', 'Subcontractors', 'المقاولون من الباطن')) },
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
    orderFields: [{ key: 'inscription', en: 'Cake message', ar: 'العبارة على الكيك', type: 'text', max: 120 }, { key: 'pickup_at', en: 'Pickup time', ar: 'وقت الاستلام', type: 'datetime' }],
    variantOptions: [t('size', 'Size', 'الحجم'), t('flavour', 'Flavour', 'النكهة')], modules: { plans: 'planned', recipes: 'planned' },
  },
  restaurant: { variantOptions: [t('size', 'Size', 'الحجم')], modules: { recipes: 'planned', batches: 'planned' }, expenseCategories: extra(t('aggregator_fees', 'Delivery app commission', 'عمولة تطبيقات التوصيل'), t('waste', 'Waste', 'الهدر')) },
  cafe: { variantOptions: [t('size', 'Size', 'الحجم')], modules: { recipes: 'planned', batches: 'planned' }, expenseCategories: extra(t('aggregator_fees', 'Delivery app commission', 'عمولة تطبيقات التوصيل'), t('waste', 'Waste', 'الهدر')) },
  dental: { modules: { batches: 'planned' } },
  clinic: { modules: { batches: 'planned' } },
  automotive: { modules: { jobCards: 'planned' }, orderFields: [{ key: 'plate', en: 'Plate number', ar: 'رقم اللوحة', type: 'text', max: 20 }, { key: 'mileage', en: 'Mileage (km)', ar: 'العداد (كم)', type: 'number' }] },
  education: { modules: { enrolments: 'planned', appointments: 'off' } },
  'real-estate': { modules: { plans: 'off', quotes: 'off' }, expenseCategories: extra(t('commission', 'Agent commission', 'عمولة الوسطاء'), t('portal_fees', 'Listing portal fees', 'رسوم منصات الإعلانات')) },
};

function build(id, archetype) {
  const base = ARCHETYPE[archetype], own = SECTOR[id] || {};
  return Object.freeze({ id, archetype, version: HASIB_PACK_VERSION,
    modules: { ...base.modules, ...(own.modules || {}) },
    variantOptions: own.variantOptions || base.variantOptions,
    orderFields: own.orderFields || base.orderFields,
    expenseCategories: own.expenseCategories || base.expenseCategories });
}

export const HASIB_PACKS = Object.freeze({
  ...Object.fromEntries(Object.values(SECTOR_PACKS).map(p => [p.id, build(p.id, p.archetype)])),
  other: build('other', 'catalog'),
});

export function hasibPack(sectorId) { return HASIB_PACKS[sectorId] || HASIB_PACKS.other; }

/** Only modules the owner can use today; planned ones stay hidden until they ship. */
export const visibleModules = pack => Object.entries(pack.modules).filter(([, v]) => v === 'available').map(([k]) => k);
