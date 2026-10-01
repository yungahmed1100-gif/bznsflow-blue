// Plain English and Arabic for every Real Estate code the server sends.
const L = {
  stage: { new: ['New', 'جديدة'], contacted: ['Contacted', 'تم التواصل'], qualified: ['Qualified', 'مؤهلة'], viewing: ['Viewing', 'معاينة'], offer: ['Offer', 'عرض'], won: ['Won', 'رابحة'], lost: ['Lost', 'خاسرة'] },
  need: { buy: ['Buy', 'شراء'], rent: ['Rent', 'إيجار'], sell: ['Sell', 'بيع'], invest: ['Invest', 'استثمار'] },
  viewing: { requested: ['Requested', 'مطلوبة'], confirmed: ['Confirmed', 'مؤكدة'], completed: ['Completed', 'مكتملة'], missed: ['Missed', 'فائتة'], cancelled: ['Cancelled', 'ملغاة'] },
  offer: { draft: ['Waiting for approval', 'بانتظار الموافقة'], approved: ['Approved', 'معتمد'], presented: ['Presented', 'مقدَّم'], countered: ['Countered', 'عرض مضاد'], accepted: ['Accepted', 'مقبول'], rejected: ['Rejected', 'مرفوض'], withdrawn: ['Withdrawn', 'مسحوب'] },
  draft: { draft: ['Waiting for approval', 'بانتظار الموافقة'], queued: ['Sending', 'قيد الإرسال'], queued_template: ['Sending as template', 'يُرسل كقالب'], provider_submitted: ['Sent', 'أُرسلت'],
    template_required: ['Needs an approved template', 'يحتاج قالباً معتمداً'], blocked: ['Not sent (customer opted out)', 'لم تُرسل (ألغى العميل الاشتراك)'], failed: ['Failed to send', 'تعذّر الإرسال'] },
  draftKind: { follow_up: ['Follow-up', 'متابعة'], viewing_confirmation: ['Viewing confirmation', 'تأكيد معاينة'], offer: ['Offer message', 'رسالة عرض'] },
  availability: { available: ['Available', 'متاح'], reserved: ['Reserved', 'محجوز'], unavailable: ['Sold or let', 'مباع أو مؤجر'] },
  authority: { confirmed: ['Authority to market confirmed', 'صلاحية التسويق مؤكدة'], pending: ['Authority pending', 'الصلاحية معلقة'], expired: ['Authority expired', 'انتهت الصلاحية'] },
  transaction: { sale: ['Sale', 'بيع'], rent: ['Rent', 'إيجار'] },
  finance: { cash: ['Cash buyer', 'دفع نقدي'], ready: ['Finance ready', 'التمويل جاهز'], in_progress: ['Finance in progress', 'التمويل قيد الإجراء'], unknown: ['Not known yet', 'غير معروف بعد'] },
  decision: { ready: ['Decides alone', 'صاحب القرار'], consulting: ['Consulting others', 'يستشير آخرين'], unknown: ['Not known yet', 'غير معروف بعد'] },
  match: { suggested: ['Suggested', 'مقترح'], interested: ['Interested', 'مهتم'], rejected: ['Not interested', 'غير مهتم'] },
  check: { identity: ['Customer identity', 'هوية العميل'], authority: ['Authority to sell or let', 'صلاحية البيع أو التأجير'], financing: ['Financing', 'التمويل'], agreement: ['Signed agreement', 'الاتفاقية الموقعة'], completion: ['Completion and handover', 'الإتمام والتسليم'] },
  checkStatus: { pending: ['Pending', 'معلق'], confirmed: ['Confirmed', 'مؤكد'], not_applicable: ['Not applicable', 'لا ينطبق'] },
  commission: { due: ['Due', 'مستحقة'], paid: ['Paid', 'مدفوعة'] },
  task: { first_response_overdue: ['First reply is late', 'تأخّر الرد الأول'], second_attempt_overdue: ['Second reply is late', 'تأخّرت المحاولة الثانية'], stale_listing: ['Listing needs verifying', 'الإعلان يحتاج تحققاً'],
    viewing_outcome_missing: ['Viewing has no outcome', 'معاينة بلا نتيجة'], offer_unanswered: ['Offer waiting for an answer', 'عرض بانتظار الرد'], no_verified_match: ['No verified listing matches', 'لا يوجد إعلان موثّق مطابق'],
    template_required: ['Message needs an approved template', 'الرسالة تحتاج قالباً معتمداً'], send_failed: ['A reply failed to send', 'تعذّر إرسال رد'] },
};

/** `label('stage', 'won', ar)` → "Won" / "رابحة"; unknown codes fall back to the code itself. */
export const label = (group, code, ar) => (L[group]?.[code]?.[ar ? 1 : 0]) || code || '—';
export const options = (group, ar, codes = Object.keys(L[group])) => codes.map(id => ({ id, label: label(group, id, ar) }));

export const OPEN_STAGES = ['new', 'contacted', 'qualified', 'viewing', 'offer'];
export const CHECKS = ['identity', 'authority', 'financing', 'agreement', 'completion'];
export const LOST_REASONS = [['bought_elsewhere', 'Bought or rented elsewhere', 'اشترى أو استأجر من جهة أخرى'], ['budget', 'Budget does not fit', 'الميزانية غير مناسبة'],
  ['no_response', 'Customer stopped responding', 'توقّف العميل عن الرد'], ['not_ready', 'Not ready to move', 'غير مستعد للانتقال'], ['other', 'Other', 'أخرى']];
// Where each viewing and offer may go next (mirrors convex/hasib/realEstateState.js).
export const VIEWING_NEXT = { requested: ['confirmed', 'completed', 'missed', 'cancelled'], confirmed: ['completed', 'missed', 'cancelled'] };
export const OFFER_NEXT = { approved: ['presented', 'withdrawn'], presented: ['countered', 'accepted', 'rejected', 'withdrawn'], countered: ['countered', 'accepted', 'rejected', 'withdrawn'] };
/** Steps that end something, which ask for confirmation first. */
export const FINAL_STEPS = new Set(['accepted', 'rejected', 'withdrawn', 'cancelled', 'missed']);
