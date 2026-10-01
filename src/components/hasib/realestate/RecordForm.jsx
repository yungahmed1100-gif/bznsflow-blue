import React from 'react';
import { PHOTO_TYPES } from '../../../lib/hasib/photo.js';
import { label, options, LOST_REASONS } from './labels.js';

const TITLES = {
  invite: ['Invite an agent', 'دعوة وكيل'], property: ['Listing', 'الإعلان'], opportunity: ['Customer requirements', 'متطلبات العميل'], viewing: ['Schedule a viewing', 'جدولة معاينة'],
  outcome: ['How did the viewing go?', 'كيف كانت المعاينة؟'], offer: ['Draft an offer', 'مسودة عرض'], counter: ['Record the counter-offer', 'تسجيل العرض المضاد'],
  draft: ['Draft a message to the customer', 'مسودة رسالة للعميل'], close: ['Close the deal', 'إغلاق الصفقة'], lost: ['Mark the deal as lost', 'تسجيل الصفقة كخاسرة'],
};

/** The one form on screen, for whichever record the agent is adding or changing. */
export function RecordForm({ form, values, setValues, ar, h, s, busy, data, manager, actorAccountId, photos, onPickPhotos, onRemovePhoto, onSubmit, onCancel }) {
  const tr = (en, arabic) => (ar ? arabic : en);
  const set = name => e => setValues(v => ({ ...v, [name]: e.target.value }));
  const field = (name, text, type = 'text', required = true, extra = {}) => (
    <label className="ld-field">{text}<input required={required} type={type} value={values[name] ?? ''} onChange={set(name)} {...extra} /></label>
  );
  const area = (name, text, required = true) => (
    <label className="ld-field">{text}<textarea required={required} maxLength={2000} value={values[name] ?? ''} onChange={set(name)} /></label>
  );
  const select = (name, text, choices, required = true) => (
    <label className="ld-field">{text}<select required={required} value={values[name] ?? ''} onChange={set(name)}>
      <option value="">{tr('Choose…', 'اختر…')}</option>{choices.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
    </select></label>
  );
  const agents = manager ? (data.team?.members || []).filter(x => x.status === 'active' && x.accountId).map(x => ({ id: x.accountId, label: x.email })) : [{ id: actorAccountId, label: tr('Me', 'أنا') }];
  const deals = (data.opportunities?.items || []).filter(x => !['won', 'lost'].includes(x.stage)).map(x => ({ id: x.id, label: `${x.contactName || tr('Customer', 'عميل')} · ${label('need', x.need, ar)} · ${x.areas.join('، ')}` }));
  const listings = (data.properties?.items || []).filter(x => x.availability !== 'unavailable').map(x => ({ id: x.id, label: `${x.label} · ${x.location}` }));
  const [en, arabic] = TITLES[form] || ['Record details', 'تسجيل التفاصيل'];
  return (
    <form className="hb-panel hb-action-fields" onSubmit={onSubmit} aria-label={ar ? arabic : en}>
      <h2>{ar ? arabic : en}</h2>
      {form === 'invite' && field('email', tr('Agent’s email', 'بريد الوكيل'), 'email')}
      {form === 'property' && <>
        {field('label', tr('Listing title', 'عنوان الإعلان'))}
        {field('reference', tr('Your reference', 'المرجع'), 'text', false)}
        {select('transactionType', tr('Sale or rent', 'بيع أو إيجار'), options('transaction', ar))}
        {field('propertyType', tr('Property type (e.g. villa, apartment)', 'نوع العقار (فيلا، شقة…)'))}
        {field('area', tr('Area', 'المنطقة'))}
        {field('location', tr('Address or landmark', 'العنوان أو المعلم'))}
        {field('price', values.transactionType === 'rent' ? tr('Rent (OMR)', 'الإيجار (ر.ع.)') : tr('Asking price (OMR)', 'السعر المطلوب (ر.ع.)'), 'number', true, { min: 0, step: '0.001' })}
        {values.transactionType === 'rent' && select('pricePeriod', tr('Rent per', 'الإيجار لكل'), [{ id: 'month', label: tr('Month', 'شهر') }, { id: 'year', label: tr('Year', 'سنة') }])}
        {field('bedrooms', tr('Bedrooms', 'غرف النوم'), 'number', false, { min: 0 })}
        {field('bathrooms', tr('Bathrooms', 'الحمامات'), 'number', false, { min: 0 })}
        {field('sizeSqm', tr('Size (m²)', 'المساحة (م²)'), 'number', false, { min: 0 })}
        {area('description', tr('Description', 'الوصف'), false)}
        {select('availability', tr('Availability', 'التوفر'), options('availability', ar))}
        {select('authorityStatus', tr('Authority to market it', 'صلاحية تسويقه'), options('authority', ar, ['confirmed', 'pending']))}
        {select('assignedAccountId', tr('Responsible agent', 'الوكيل المسؤول'), agents, false)}
        {field('features', tr('Features, separated by commas', 'المزايا، مفصولة بفواصل'), 'text', false)}
        <label className="ld-field">{tr('Photos (up to 10)', 'الصور (حتى ١٠)')}<input type="file" accept={PHOTO_TYPES.join(',')} multiple disabled={photos.length >= 10} onChange={onPickPhotos} /></label>
        <div className="hb-property-photos">{photos.map((photo, index) => <div key={photo.id}>
          {photo.preview ? <img src={photo.preview} alt={`${tr('Listing photo', 'صورة العقار')} ${index + 1}`} /> : <span>{tr('Saved photo', 'صورة محفوظة')} {index + 1}</span>}
          <button type="button" className="ld-button ld-danger" onClick={() => onRemovePhoto(photo)}>{tr('Remove', 'حذف')}</button>
        </div>)}</div>
      </>}
      {form === 'opportunity' && <>
        {!values.opportunityId && select('contactId', tr('Customer', 'العميل'), (data.contacts?.items || []).map(x => ({ id: x.id, label: x.name })))}
        {select('need', tr('They want to', 'يريد'), options('need', ar))}
        {field('areas', tr('Areas, separated by commas', 'المناطق، مفصولة بفواصل'))}
        {field('propertyTypes', tr('Property types, separated by commas', 'أنواع العقار، مفصولة بفواصل'))}
        {field('budgetMin', tr('Minimum budget (OMR)', 'الحد الأدنى للميزانية (ر.ع.)'), 'number', false, { min: 0, step: '0.001' })}
        {field('budgetMax', tr('Maximum budget (OMR)', 'الحد الأعلى للميزانية (ر.ع.)'), 'number', true, { min: 0, step: '0.001' })}
        {field('bedrooms', tr('Bedrooms', 'غرف النوم'), 'number', false, { min: 0 })}
        {select('financeReadiness', tr('Finance', 'التمويل'), options('finance', ar))}
        {select('decisionMakerReadiness', tr('Decision maker', 'صاحب القرار'), options('decision', ar))}
        {field('timeline', tr('When do they want to move?', 'متى يريد الانتقال؟'))}
        {field('mustHaves', tr('Must-haves, separated by commas', 'المتطلبات الأساسية، مفصولة بفواصل'), 'text', false)}
        {field('nextAction', tr('Next step', 'الخطوة التالية'), 'text', false)}
        {select('assignedAccountId', tr('Responsible agent', 'الوكيل المسؤول'), agents, false)}
      </>}
      {form === 'viewing' && <>
        {values.lockedDeal ? <p className="ld-help">{values.lockedDeal}</p> : select('opportunityId', tr('Deal', 'الصفقة'), deals)}
        {select('propertyId', tr('Property', 'العقار'), listings)}
        {field('scheduledAt', tr('Date and time', 'التاريخ والوقت'), 'datetime-local')}
        {select('status', tr('Status', 'الحالة'), options('viewing', ar, ['requested', 'confirmed']))}
        {field('nextAction', tr('Next step', 'الخطوة التالية'), 'text', false)}
      </>}
      {form === 'outcome' && <>
        {select('status', tr('Result', 'النتيجة'), options('viewing', ar, ['completed', 'missed', 'cancelled']))}
        {values.status === 'completed' && area('outcome', tr('What the customer thought', 'رأي العميل'))}
        {field('nextAction', tr('Next step', 'الخطوة التالية'), 'text', false)}
      </>}
      {form === 'offer' && <>
        {values.lockedDeal ? <p className="ld-help">{values.lockedDeal}</p> : select('opportunityId', tr('Deal', 'الصفقة'), deals)}
        {select('propertyId', tr('Property', 'العقار'), listings)}
        {field('amount', tr('Offer amount (OMR)', 'قيمة العرض (ر.ع.)'), 'number', true, { min: 0, step: '0.001' })}
        {area('terms', tr('Terms (payment, dates, conditions)', 'الشروط (الدفع، المواعيد، الشروط)'))}
        <p className="ld-help">{tr('The manager approves an offer before it is presented.', 'يعتمد المدير العرض قبل تقديمه.')}</p>
      </>}
      {form === 'counter' && <>
        {field('amount', tr('Counter amount (OMR)', 'قيمة العرض المضاد (ر.ع.)'), 'number', true, { min: 0, step: '0.001' })}
        {area('terms', tr('Counter terms', 'شروط العرض المضاد'))}
      </>}
      {form === 'draft' && <>
        {values.lockedDeal ? <p className="ld-help">{values.lockedDeal}</p> : select('opportunityId', tr('Deal', 'الصفقة'), deals)}
        {select('kind', tr('Message type', 'نوع الرسالة'), options('draftKind', ar))}
        {area('text', tr('Message', 'الرسالة'))}
        {field('templateId', tr('Approved template ID (only if the customer last wrote over 24 hours ago)', 'معرّف القالب المعتمد (فقط إذا مرّ على آخر رسالة من العميل أكثر من ٢٤ ساعة)'), 'text', false)}
        <p className="ld-help">{tr('The manager approves every message before it is sent.', 'يعتمد المدير كل رسالة قبل إرسالها.')}</p>
      </>}
      {form === 'close' && <>
        {field('commission', tr('Agency commission (OMR)', 'عمولة الوكالة (ر.ع.)'), 'number', true, { min: 0, step: '0.001' })}
        <p className="ld-help">{tr('Only the commission is recorded as income. The listing becomes unavailable and the deal is won.', 'تُسجَّل العمولة فقط كدخل، ويصبح العقار غير متاح وتُحتسب الصفقة رابحة.')}</p>
      </>}
      {form === 'lost' && select('reason', tr('Why was it lost?', 'لماذا خُسرت؟'), LOST_REASONS.map(([id, en2, ar2]) => ({ id, label: ar ? ar2 : en2 })))}
      <div className="ld-actions">
        <button className={`ld-button ${form === 'lost' ? 'ld-danger' : 'ld-primary'}`} disabled={busy}>{busy ? h.t('saving') : h.t('save')}</button>
        <button type="button" className="ld-button" onClick={onCancel}>{s.t('cancel')}</button>
      </div>
    </form>
  );
}
