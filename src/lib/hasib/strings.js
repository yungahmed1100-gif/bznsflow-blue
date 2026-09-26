// Hasib copy, Arabic and English. Kept apart from the Layla dashboard strings so
// each table stays small; tests/hasib-strings.test.mjs enforces key parity.
import { formatMinor } from '../../../convex/hasib/money.js';

const en = {
  orders: 'Orders', stock: 'Stock', newOrder: 'New order', createOrder: 'Create order', orderNumber: 'Order #{number}', noOrders: 'No orders yet. Create one from a chat or here.',
  allOrders: 'All orders', customer: 'Customer', walkIn: 'Walk-in customer', customerName: 'Customer name (optional)', total: 'Total', balance: 'Balance', paid: 'Paid', items: 'Items',
  created: 'Created', channel: 'Channel', status: 'Status', payment: 'Payment', addItem: 'Add product', searchItems: 'Search products or SKU', noItemsFound: 'No matching product.',
  customLine: 'Custom line', lineName: 'Description', qty: 'Qty', unitPrice: 'Unit price', discount: 'Discount', remove: 'Remove', subtotal: 'Subtotal', vat: 'VAT', delivery: 'Delivery',
  deliveryFee: 'Delivery fee', fulfilment: 'Fulfilment', area: 'Area', notes: 'Notes', confirmNow: 'Confirm now (takes stock)', saveOrder: 'Save order', saving: 'Saving…',
  pricesIncludeVat: 'Prices include VAT', fromChat: 'Prefilled from the chat. Check before saving.', unmatched: 'Layla captured “{text}”, which doesn’t match a product. Add it below.',
  onHand: '{count} in stock', shortWarning: 'Some items are short on stock. The order was saved and flagged.', stockShort: 'Short on stock',
  recordPayment: 'Record payment', amount: 'Amount (OMR)', method: 'Method', reference: 'Reference (optional)', refund: 'Refund', payments: 'Payments', noPayments: 'No payments yet.',
  moveTo: 'Move to', history: 'History', lines: 'Lines', close: 'Close', cancel: 'Cancel', save: 'Save', loading: 'Loading…', loadMore: 'Load more', retry: 'Try again',
  products: 'Products', addProduct: 'Add product', editProduct: 'Edit product', noProducts: 'No products yet. Add your first product to start tracking stock.', lowStockOnly: 'Low stock only',
  nameAr: 'Name (Arabic)', nameEn: 'Name (English)', category: 'Category', unit: 'Unit', kind: 'Type', kind_product: 'Product', kind_service: 'Service', trackStock: 'Track stock',
  variants: 'Variants', addVariant: 'Add variant', sku: 'SKU', price: 'Price (OMR)', cost: 'Cost (OMR)', reorderPoint: 'Alert at', openingStock: 'Opening stock', archive: 'Archive',
  archiveConfirm: 'Archive {name}? It leaves the list; its orders and stock history stay.', adjustStock: 'Adjust stock', reasonLabel: 'Reason', quantity: 'Quantity', unitCost: 'Unit cost (OMR, optional)',
  move_stock_in: 'Received stock', move_return: 'Customer return', move_adjustment: 'Correction (+/−)', move_damage: 'Damaged or lost', move_sale: 'Sold', move_sale_reversal: 'Sale reversed', move_opening: 'Opening stock',
  lowStock: 'Low', stockValue: 'Stock at cost', ordersSummary: '{count} orders · lifetime {total} · owes {balance}', noOrdersForContact: 'No orders yet.',
  st_pending: 'New', st_confirmed: 'Confirmed', st_ready: 'Ready', st_out_for_delivery: 'Out for delivery', st_failed_delivery: 'Delivery failed', st_delivered: 'Delivered', st_completed: 'Completed', st_cancelled: 'Cancelled', st_returned: 'Returned',
  pay_unpaid: 'Unpaid', pay_partial: 'Part paid', pay_paid: 'Paid', pay_overpaid: 'Overpaid',
  ch_whatsapp: 'WhatsApp', ch_instagram: 'Instagram', ch_walk_in: 'Walk-in', ch_phone: 'Phone', ch_website: 'Website', ch_other: 'Other',
  ful_pickup: 'Pickup', ful_delivery: 'Delivery', ful_in_store: 'In store',
  pm_cash: 'Cash', pm_cod: 'Cash on delivery', pm_card: 'Card', pm_bank_transfer: 'Bank transfer', pm_payment_link: 'Payment link', pm_other: 'Other',
  currency: 'OMR', invalidAmount: 'Enter an amount like 12.500',
};
const ar = {
  orders: 'الطلبات', stock: 'المخزون', newOrder: 'طلب جديد', createOrder: 'إنشاء طلب', orderNumber: 'طلب رقم {number}', noOrders: 'لا توجد طلبات بعد. أنشئ طلباً من محادثة أو من هنا.',
  allOrders: 'كل الطلبات', customer: 'العميل', walkIn: 'عميل حضوري', customerName: 'اسم العميل (اختياري)', total: 'الإجمالي', balance: 'المتبقي', paid: 'المدفوع', items: 'الأصناف',
  created: 'التاريخ', channel: 'القناة', status: 'الحالة', payment: 'الدفع', addItem: 'إضافة منتج', searchItems: 'ابحث عن منتج أو رمز SKU', noItemsFound: 'لا يوجد منتج مطابق.',
  customLine: 'بند مخصص', lineName: 'الوصف', qty: 'الكمية', unitPrice: 'سعر الوحدة', discount: 'الخصم', remove: 'حذف', subtotal: 'المجموع الفرعي', vat: 'ضريبة القيمة المضافة', delivery: 'التوصيل',
  deliveryFee: 'رسوم التوصيل', fulfilment: 'طريقة التسليم', area: 'المنطقة', notes: 'ملاحظات', confirmNow: 'تأكيد الآن (يخصم من المخزون)', saveOrder: 'حفظ الطلب', saving: 'جارٍ الحفظ…',
  pricesIncludeVat: 'الأسعار شاملة الضريبة', fromChat: 'تمت التعبئة من المحادثة. راجعها قبل الحفظ.', unmatched: 'التقطت ليلى «{text}» ولا يطابق أي منتج. أضفه بالأسفل.',
  onHand: 'المتوفر {count}', shortWarning: 'بعض الأصناف غير متوفرة بالكمية الكافية. حُفظ الطلب مع تنبيه.', stockShort: 'نقص في المخزون',
  recordPayment: 'تسجيل دفعة', amount: 'المبلغ (ر.ع.)', method: 'طريقة الدفع', reference: 'المرجع (اختياري)', refund: 'استرداد', payments: 'الدفعات', noPayments: 'لا توجد دفعات بعد.',
  moveTo: 'نقل إلى', history: 'السجل', lines: 'البنود', close: 'إغلاق', cancel: 'إلغاء', save: 'حفظ', loading: 'جارٍ التحميل…', loadMore: 'عرض المزيد', retry: 'حاول مجدداً',
  products: 'المنتجات', addProduct: 'إضافة منتج', editProduct: 'تعديل المنتج', noProducts: 'لا توجد منتجات بعد. أضف أول منتج لبدء متابعة المخزون.', lowStockOnly: 'المخزون المنخفض فقط',
  nameAr: 'الاسم (عربي)', nameEn: 'الاسم (إنجليزي)', category: 'الفئة', unit: 'الوحدة', kind: 'النوع', kind_product: 'منتج', kind_service: 'خدمة', trackStock: 'متابعة المخزون',
  variants: 'الخيارات', addVariant: 'إضافة خيار', sku: 'رمز SKU', price: 'السعر (ر.ع.)', cost: 'التكلفة (ر.ع.)', reorderPoint: 'تنبيه عند', openingStock: 'الرصيد الافتتاحي', archive: 'أرشفة',
  archiveConfirm: 'أرشفة {name}؟ سيختفي من القائمة، وتبقى طلباته وسجل مخزونه.', adjustStock: 'تعديل المخزون', reasonLabel: 'السبب', quantity: 'الكمية', unitCost: 'تكلفة الوحدة (ر.ع.، اختياري)',
  move_stock_in: 'استلام بضاعة', move_return: 'مرتجع من عميل', move_adjustment: 'تصحيح (+/−)', move_damage: 'تالف أو مفقود', move_sale: 'مبيع', move_sale_reversal: 'إلغاء بيع', move_opening: 'رصيد افتتاحي',
  lowStock: 'منخفض', stockValue: 'قيمة المخزون بالتكلفة', ordersSummary: '{count} طلبات · الإجمالي {total} · المتبقي {balance}', noOrdersForContact: 'لا توجد طلبات بعد.',
  st_pending: 'جديد', st_confirmed: 'مؤكد', st_ready: 'جاهز', st_out_for_delivery: 'قيد التوصيل', st_failed_delivery: 'تعذّر التوصيل', st_delivered: 'تم التوصيل', st_completed: 'مكتمل', st_cancelled: 'ملغى', st_returned: 'مرتجع',
  pay_unpaid: 'غير مدفوع', pay_partial: 'مدفوع جزئياً', pay_paid: 'مدفوع', pay_overpaid: 'مدفوع بالزيادة',
  ch_whatsapp: 'واتساب', ch_instagram: 'إنستغرام', ch_walk_in: 'حضوري', ch_phone: 'هاتف', ch_website: 'الموقع', ch_other: 'أخرى',
  ful_pickup: 'استلام', ful_delivery: 'توصيل', ful_in_store: 'في المحل',
  pm_cash: 'نقداً', pm_cod: 'الدفع عند الاستلام', pm_card: 'بطاقة', pm_bank_transfer: 'تحويل بنكي', pm_payment_link: 'رابط دفع', pm_other: 'أخرى',
  currency: 'ر.ع.', invalidAmount: 'أدخل مبلغاً مثل 12.500',
};
const reasons = {
  en: { insufficient_stock: 'Not enough stock. Switch the stock rule to “warn” or receive stock first.', order_conflict: 'This order changed in another tab. It has been reloaded.',
    invalid_transition: 'That status change isn’t allowed from here.', refund_exceeds_paid: 'A refund can’t be more than what was paid.', order_closed: 'This order is closed. Only refunds are possible.',
    duplicate_sku: 'Another product already uses that SKU.', invalid_item: 'Check the product: a name and a price are needed for each variant.', invalid_order_lines: 'Check the lines: quantities and prices must be valid.',
    variant_not_found: 'That product is no longer available.', hasib_unavailable: 'Orders and stock are not switched on for this account yet.', invalid_amount: 'Enter a valid amount.' },
  ar: { insufficient_stock: 'الكمية غير كافية. غيّر قاعدة المخزون إلى «تنبيه» أو استلم بضاعة أولاً.', order_conflict: 'تغيّر هذا الطلب في نافذة أخرى، وتمت إعادة تحميله.',
    invalid_transition: 'لا يمكن تغيير الحالة بهذا الشكل.', refund_exceeds_paid: 'لا يمكن أن يتجاوز الاسترداد المبلغ المدفوع.', order_closed: 'هذا الطلب مغلق، ويمكن فقط تسجيل استرداد.',
    duplicate_sku: 'رمز SKU مستخدم لمنتج آخر.', invalid_item: 'راجع المنتج: يلزم اسم وسعر لكل خيار.', invalid_order_lines: 'راجع البنود: يجب أن تكون الكميات والأسعار صحيحة.',
    variant_not_found: 'هذا المنتج لم يعد متاحاً.', hasib_unavailable: 'الطلبات والمخزون غير مفعّلة لهذا الحساب بعد.', invalid_amount: 'أدخل مبلغاً صحيحاً.' },
};

export function createHasibStrings(lang) {
  const isAr = lang === 'ar', table = isAr ? ar : en;
  const t = (key, vars = {}) => String(table[key] ?? en[key] ?? key).replace(/\{(\w+)\}/g, (m, name) => (vars[name] ?? m));
  const reason = code => (isAr ? reasons.ar : reasons.en)[code] || null;
  const amount = minor => formatMinor(minor);
  const money = minor => `${formatMinor(minor)} ${table.currency}`;
  const name = row => (isAr ? row.nameAr || row.nameEn : row.nameEn || row.nameAr) || '';
  return { t, reason, amount, money, name, lang, ar: isAr };
}
export const HASIB_EN_KEYS = Object.keys(en), HASIB_AR_KEYS = Object.keys(ar);
export const HASIB_REASON_KEYS = { en: Object.keys(reasons.en), ar: Object.keys(reasons.ar) };
