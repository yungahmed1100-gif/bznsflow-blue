// Hasib copy, Arabic and English. Kept apart from the Layla dashboard strings so
// each table stays small; tests/hasib-strings.test.mjs enforces key parity.

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
  insights: 'Insights', expenses: 'Expenses', period_today: 'Today', period_7d: 'Last 7 days', period_30d: 'Last 30 days', period_month: 'This month', period_prev_month: 'Last month',
  netProfit: 'Net profit', netProfitHelp: 'Gross profit minus operating costs', sales: 'Sales', grossProfit: 'Gross profit', operatingCosts: 'Operating costs',
  cashIn: 'Cash received', owed: 'Owed to you', owedHelp: 'Unpaid balances on open orders', pendingOrders: 'Not yet confirmed', topProducts: 'Best sellers', revenue: 'Revenue', profit: 'Profit',
  noSales: 'No sales in this period yet.', cashByMethod: 'Cash received by method', costsByCategory: 'Costs by category', stockBought: 'Stock bought {amount} (reaches profit as cost of goods)',
  stockValueTile: 'Stock value at cost', lowTile: 'Low stock', outTile: 'Out of stock', buyers: 'Customers who bought', returning: 'Returning', walkInSales: 'Walk-in sales',
  demandTitle: 'What customers ask Layla for', mostWanted: 'Most wanted', lostSales: 'Asked while out of stock', askedNotBought: 'Asked, didn’t buy', notInCatalog: 'Asked for, not in your products',
  people: 'People', asks: 'Asks', bought: 'Bought', noDemand: 'No product questions in this period yet. When customers ask Layla about a product, it shows here.',
  definitions: 'How these are counted: a sale is a confirmed order that was not cancelled or returned. Revenue and profit exclude VAT. Stock purchases are not operating costs — they reach profit as cost of goods when sold.',
  truncated: 'Only the most recent records in this period were counted.', exportCsv: 'Export CSV',
  addExpense: 'Add expense', noExpenses: 'No expenses in this period.', expenseDate: 'Date paid', vendor: 'Paid to (optional)', vatIncluded: 'VAT included (OMR, optional)', voidExpense: 'Void',
  voidConfirm: 'Void this expense? It stays in the history, marked void, and stops counting.', voided: 'Void', expenseTotal: 'Total',
  readyBy: 'Ready by (optional)', depositNow: 'Deposit taken now (OMR, optional)', depositMethod: 'Deposit method', copyReceipt: 'Copy receipt', copied: 'Copied', exchange: 'Exchange',
  exchangeHelp: 'Marks this order returned (stock comes back) and starts a new order for the same customer.', due: 'Due {date}', depositFailed: 'The order was saved, but the deposit wasn’t recorded. Record it from the order.',
  amountCol: 'Amount', paidTo: 'Paid to', outOfStock: 'Out of stock',
  industryTitle: 'Set up orders and stock', industryIntro: 'Hasib is being released one industry at a time. Choose the industry that fits your shop to open orders, stock, expenses and insights.', industryLayla: 'This only changes Hasib. Layla keeps her current business details and replies.', chooseIndustry: 'Use {name}', industry: 'Industry: {name}', choosing: 'Setting up…',
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
  insights: 'التقارير', expenses: 'المصروفات', period_today: 'اليوم', period_7d: 'آخر 7 أيام', period_30d: 'آخر 30 يوماً', period_month: 'هذا الشهر', period_prev_month: 'الشهر الماضي',
  netProfit: 'صافي الربح', netProfitHelp: 'إجمالي الربح ناقص المصروفات التشغيلية', sales: 'المبيعات', grossProfit: 'إجمالي الربح', operatingCosts: 'المصروفات التشغيلية',
  cashIn: 'المبالغ المستلمة', owed: 'مستحق لك', owedHelp: 'المبالغ غير المدفوعة على الطلبات المفتوحة', pendingOrders: 'غير مؤكدة بعد', topProducts: 'الأكثر مبيعاً', revenue: 'الإيراد', profit: 'الربح',
  noSales: 'لا توجد مبيعات في هذه الفترة بعد.', cashByMethod: 'المبالغ المستلمة حسب الطريقة', costsByCategory: 'المصروفات حسب الفئة', stockBought: 'مشتريات بضاعة {amount} (تدخل الربح كتكلفة بضاعة عند البيع)',
  stockValueTile: 'قيمة المخزون بالتكلفة', lowTile: 'مخزون منخفض', outTile: 'نفد من المخزون', buyers: 'عملاء اشتروا', returning: 'عائدون', walkInSales: 'مبيعات حضورية',
  demandTitle: 'ما يسأل عنه العملاء ليلى', mostWanted: 'الأكثر طلباً', lostSales: 'سُئل عنه وهو غير متوفر', askedNotBought: 'سألوا ولم يشتروا', notInCatalog: 'طُلب وليس ضمن منتجاتك',
  people: 'الأشخاص', asks: 'الأسئلة', bought: 'اشتروا', noDemand: 'لا توجد أسئلة عن منتجات في هذه الفترة بعد. عندما يسأل العملاء ليلى عن منتج سيظهر هنا.',
  definitions: 'طريقة الحساب: البيع هو طلب مؤكد لم يُلغَ ولم يُرجع. الإيراد والربح دون ضريبة القيمة المضافة. مشتريات البضاعة ليست مصروفات تشغيلية، بل تدخل الربح كتكلفة بضاعة عند البيع.',
  truncated: 'احتُسبت أحدث السجلات فقط في هذه الفترة.', exportCsv: 'تصدير CSV',
  addExpense: 'إضافة مصروف', noExpenses: 'لا توجد مصروفات في هذه الفترة.', expenseDate: 'تاريخ الدفع', vendor: 'المدفوع له (اختياري)', vatIncluded: 'الضريبة المشمولة (ر.ع.، اختياري)', voidExpense: 'إلغاء',
  voidConfirm: 'إلغاء هذا المصروف؟ سيبقى في السجل بعلامة «ملغى» ولن يُحتسب.', voided: 'ملغى', expenseTotal: 'الإجمالي',
  readyBy: 'جاهز بتاريخ (اختياري)', depositNow: 'عربون مستلم الآن (ر.ع.، اختياري)', depositMethod: 'طريقة دفع العربون', copyReceipt: 'نسخ الإيصال', copied: 'تم النسخ', exchange: 'استبدال',
  exchangeHelp: 'يسجّل هذا الطلب كمرتجع (يعود المخزون) ويبدأ طلباً جديداً للعميل نفسه.', due: 'موعده {date}', depositFailed: 'حُفظ الطلب لكن لم يُسجَّل العربون. سجّله من صفحة الطلب.',
  amountCol: 'المبلغ', paidTo: 'المدفوع له', outOfStock: 'نفد',
  industryTitle: 'إعداد الطلبات والمخزون', industryIntro: 'نطلق حاسب لقطاع تلو الآخر. اختر القطاع المناسب لمتجرك لفتح الطلبات والمخزون والمصروفات والتقارير.', industryLayla: 'هذا يغيّر حاسب فقط. تحتفظ ليلى ببيانات نشاطك وردودها الحالية.', chooseIndustry: 'استخدام {name}', industry: 'القطاع: {name}', choosing: 'جارٍ الإعداد…',
  currency: 'ر.ع.', invalidAmount: 'أدخل مبلغاً مثل 12.500',
};
const reasons = {
  en: { insufficient_stock: 'Not enough stock. Switch the stock rule to “warn” or receive stock first.', order_conflict: 'This order changed in another tab. It has been reloaded.',
    invalid_transition: 'That status change isn’t allowed from here.', refund_exceeds_paid: 'A refund can’t be more than what was paid.', order_closed: 'This order is closed. Only refunds are possible.',
    duplicate_sku: 'Another product already uses that SKU.', invalid_item: 'Check the product: a name and a price are needed for each variant.', invalid_order_lines: 'Check the lines: quantities and prices must be valid.',
    variant_not_found: 'That product is no longer available.', hasib_unavailable: 'Orders and stock are not switched on for this account yet.', invalid_amount: 'Enter a valid amount.', invalid_expense: 'Check the expense: category, amount and date are needed, and VAT can’t exceed the amount.', pack_not_live: 'Choose an available industry to use orders and stock.' },
  ar: { insufficient_stock: 'الكمية غير كافية. غيّر قاعدة المخزون إلى «تنبيه» أو استلم بضاعة أولاً.', order_conflict: 'تغيّر هذا الطلب في نافذة أخرى، وتمت إعادة تحميله.',
    invalid_transition: 'لا يمكن تغيير الحالة بهذا الشكل.', refund_exceeds_paid: 'لا يمكن أن يتجاوز الاسترداد المبلغ المدفوع.', order_closed: 'هذا الطلب مغلق، ويمكن فقط تسجيل استرداد.',
    duplicate_sku: 'رمز SKU مستخدم لمنتج آخر.', invalid_item: 'راجع المنتج: يلزم اسم وسعر لكل خيار.', invalid_order_lines: 'راجع البنود: يجب أن تكون الكميات والأسعار صحيحة.',
    variant_not_found: 'هذا المنتج لم يعد متاحاً.', hasib_unavailable: 'الطلبات والمخزون غير مفعّلة لهذا الحساب بعد.', invalid_amount: 'أدخل مبلغاً صحيحاً.', invalid_expense: 'راجع المصروف: يلزم الفئة والمبلغ والتاريخ، ولا يمكن أن تتجاوز الضريبة المبلغ.', pack_not_live: 'اختر قطاعاً متاحاً لاستخدام الطلبات والمخزون.' },
};

const GROUPED = new Intl.NumberFormat('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export function createHasibStrings(lang) {
  const isAr = lang === 'ar', table = isAr ? ar : en;
  const t = (key, vars = {}) => String(table[key] ?? en[key] ?? key).replace(/\{(\w+)\}/g, (m, name) => (vars[name] ?? m));
  const reason = code => (isAr ? reasons.ar : reasons.en)[code] || null;
  // Display figures are grouped (1,282.000); inputs and exports keep the plain form parseAmount reads.
  const amount = minor => GROUPED.format(minor / 1000);
  const money = minor => `${amount(minor)} ${table.currency}`;
  const name = row => (isAr ? row.nameAr || row.nameEn : row.nameEn || row.nameAr) || '';
  // Arabic counts agree with the number: طلب واحد، طلبان، 3–10 طلبات، 11+ طلباً.
  const orders = n => isAr ? (n === 1 ? 'طلب واحد' : n === 2 ? 'طلبان' : n >= 3 && n <= 10 ? `${n} طلبات` : `${n} طلباً`) : `${n} ${n === 1 ? 'order' : 'orders'}`;
  return { t, reason, amount, money, name, orders, lang, ar: isAr };
}
export const HASIB_EN_KEYS = Object.keys(en), HASIB_AR_KEYS = Object.keys(ar);
export const HASIB_REASON_KEYS = { en: Object.keys(reasons.en), ar: Object.keys(reasons.ar) };
