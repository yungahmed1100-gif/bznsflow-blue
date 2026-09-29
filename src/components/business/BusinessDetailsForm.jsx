import React, { useState } from 'react';
import { BUSINESS_INDUSTRIES } from '../../lib/industries.js';
import { prefillFor, isSectorDefaultService } from '../../lib/sector-prefill.generated.js';
import { GuidedSetup } from '../onboarding/GuidedSetup.jsx';

const DIAL_CODES = [['968','Oman / عُمان'],['20','Egypt / مصر'],['971','UAE / الإمارات'],['966','Saudi Arabia / السعودية'],['973','Bahrain / البحرين'],['974','Qatar / قطر'],['965','Kuwait / الكويت'],['962','Jordan / الأردن'],['44','United Kingdom / المملكة المتحدة'],['1','United States / الولايات المتحدة']];
const blank = { sector: '', services: '', prices: '', hours: '', location: '', humanContact: '', reviewed: false };
/** A numbered step-0 section heading that says plainly whether it can be skipped. */
function Chapter({ ar, n, title, lede, required = false }) {
  const word = required ? (ar ? 'مطلوب' : 'Required') : (ar ? 'اختياري' : 'Optional');
  return <>
    <legend><span className="layla-chapter-number" aria-hidden="true">{n}</span>{title}
      <span className={`layla-chip ${required ? 'layla-chip--required' : 'layla-chip--optional'}`}>{word}</span>
    </legend>
    {lede && <p className="layla-chapter-lede">{lede}</p>}
  </>;
}
export function inferIndustry(value) { const found = BUSINESS_INDUSTRIES.find(item => item.en === value || item.ar === value); return value ? found?.id || 'other' : 'other'; }
/** Splits a saved team contact back into the form's email / country-code / number fields. */
function parseContact(raw = '') {
  if (raw.includes('@')) return { mode: 'email', code: '968', value: raw };
  const digits = raw.replace(/\D/g, '');
  const country = [...DIAL_CODES].sort((a,b) => b[0].length-a[0].length).find(([code]) => digits.startsWith(code));
  return { mode: 'whatsapp', code: country?.[0] || '968', value: country ? digits.slice(country[0].length) : digits };
}

/**
 * The business facts Layla answers from: one form for onboarding and the dashboard.
 *
 * mode="onboarding": the core facts and the one-time "I checked these business
 * facts" confirmation, which is the only review before going live.
 * mode="dashboard": every fact, including prices, hours, location and FAQs.
 * Saving there is the owner confirming the facts, and Layla answers with them
 * straight away.
 */
export function BusinessDetailsForm({ lang, initial = {}, initialIndustryId, mode = 'onboarding', busy = false, submitLabel, onSubmit, children }) {
  const ar = lang === 'ar';
  const tr = (en, arabic) => ar ? arabic : en;
  const dashboard = mode === 'dashboard';
  const saved = parseContact(initial.profile?.humanContact || '');
  const initialIndustry = initialIndustryId && BUSINESS_INDUSTRIES.find(item => item.id === initialIndustryId);
  const [profile, setProfile] = useState({ ...blank, ...(initial.profile || {}), ...(initialIndustry ? { sector: initialIndustry[lang] || initialIndustry.en } : {}), reviewed: dashboard || !!initial.profile?.reviewed });
  const [businessName, setName] = useState(initial.businessName || initial.profile?.businessName || '');
  const [industryId, setIndustryId] = useState(initialIndustryId || inferIndustry(initial.profile?.sector));
  const [contactMode, setContactMode] = useState(saved.mode), [countryCode, setCountryCode] = useState(saved.code), [contactValue, setContactValue] = useState(saved.value);
  const [faqQuestion, setFaqQuestion] = useState(''), [faqAnswer, setFaqAnswer] = useState('');
  const tailored = prefillFor(industryId, lang);
  const sectorFaqSuggestions = tailored.questions.filter(q => !(profile.faqs || []).some(faq => faq.question === q));
  function contactText() { if (!contactValue.trim()) return ''; return contactMode === 'email' ? contactValue.trim() : `+${countryCode}${contactValue.replace(/\D/g, '')}`; }
  // Changing sector replaces the service summary only while it is still
  // boilerplate. Once the owner has written their own, it is never clobbered.
  function selectSector(id) {
    setIndustryId(id);
    const next = BUSINESS_INDUSTRIES.find(item => item.id === id);
    const suggested = prefillFor(id, lang).service;
    setProfile(current => ({
      ...current,
      sector: next?.[lang] || next?.en || '',
      services: isSectorDefaultService(current.services) ? suggested : current.services,
      reviewed: dashboard,
    }));
  }
  // In the dashboard an edit never un-confirms the facts: saving is the review.
  const edit = patch => setProfile(current => ({ ...current, ...patch, reviewed: dashboard || patch.reviewed === true }));
  return <form onSubmit={e => { e.preventDefault(); onSubmit({ profile: { ...profile, humanContact: contactText(), reviewed: dashboard || profile.reviewed }, businessName }); }}>
          <fieldset className="layla-chapter">
          <Chapter ar={ar} n={1} title={tr('About your business', 'عن نشاطك')} required />
          <label>{tr('Business name', 'اسم النشاط')}<input required maxLength={100} autoComplete="organization" value={businessName} onChange={e => { setName(e.target.value); edit({}); }} /></label>
          <label>{tr('What does your business do?', 'ما مجال نشاطك؟')}
            <select required value={industryId} onChange={e => selectSector(e.target.value)}>
              <option value="">{tr('Choose your business type', 'اختر نوع نشاطك')}</option>
              {BUSINESS_INDUSTRIES.map(item => <option key={item.id} value={item.id}>{item[lang] || item.en}</option>)}
            </select>
            {industryId === 'other' && <textarea aria-label={tr('Describe your business', 'صف نشاطك')} required maxLength={350} rows={2} value={profile.sector} placeholder={tr('Describe your business in a few words', 'صف نشاطك بكلمات قليلة')} onChange={e => edit({ sector: e.target.value })} />}
          </label>
          </fieldset>
          <fieldset className="layla-chapter">
          <Chapter ar={ar} n={2} title={tr('What you offer', 'ماذا تقدّم')} required
            lede={tr('This is what Layla tells customers about you.', 'هذا ما ستخبر به ليلى عملاءك عنك.')} />
          {!dashboard && <GuidedSetup
            lang={lang}
            sectorId={industryId}
            busy={busy}
            onApply={patch => edit(patch)}
          />}
          <label>{tr('Short service summary', 'ملخص الخدمات')}
            <textarea required maxLength={350} rows={3} value={profile.services} placeholder={dashboard ? tr('A short summary for immediate replies. Add the full catalog below.', 'ملخص قصير للردود الفورية. أضف الكتالوج الكامل أدناه.') : tr('A short summary Layla uses in her replies.', 'ملخص قصير تستخدمه ليلى في ردودها.')} onChange={e => edit({ services: e.target.value })} />
          </label>
          {isSectorDefaultService(profile.services)
            ? <small className="layla-field-help">{tr('This is a suggestion for your industry — edit it so it describes your business.', 'هذا اقتراح لمجال نشاطك — عدّله ليصف نشاطك أنت.')}</small>
            : <button type="button" className="layla-secondary" disabled={busy} onClick={() => edit({ services: tailored.service })}>{tr('Restore the suggested summary', 'استعادة الملخص المقترح')}</button>}
          </fieldset>
          <fieldset className="layla-chapter">
          <Chapter ar={ar} n={3} title={tr('Who takes over when Layla can’t answer', 'من يتولى الرد عندما لا تعرف ليلى الإجابة')} required
            lede={tr('When a customer needs a real person, Layla passes the chat to your team here.', 'عندما يحتاج العميل إلى موظف، تحوّل ليلى المحادثة إلى فريقك هنا.')} />
          {/* Never in a disclosure: humanContact is REQUIRED by
              reviewProfile() in api/_lib/layla/domain.js. While it sat in a
              closed <details>, a customer could fill every visible field and be
              refused with `review_sector_services_contact` for an input they had
              never been shown. */}
          <label>{tr('How can customers reach your team?', 'كيف يتواصل العملاء مع فريقك؟')}
            <select aria-label={tr('Escalation contact type', 'نوع جهة اتصال التصعيد')} value={contactMode} onChange={e => { setContactMode(e.target.value); setContactValue(''); edit({ humanContact: '' }); }}>
              <option value="whatsapp">{tr('WhatsApp number (recommended)', 'رقم واتساب (موصى به)')}</option><option value="email">{tr('Email address', 'عنوان البريد الإلكتروني')}</option>
            </select>
            {contactMode === 'whatsapp' ? <div className="layla-phone-fields"><select aria-label={tr('Country code', 'رمز الدولة')} value={countryCode} onChange={e => { setCountryCode(e.target.value); edit({}); }}>{DIAL_CODES.map(([code, label]) => <option key={code} value={code}>+{code} · {label}</option>)}</select><input aria-label={tr('WhatsApp number', 'رقم واتساب')} inputMode="tel" autoComplete="tel-national" pattern="[0-9 ]{7,15}" maxLength={15} value={contactValue} placeholder={tr('WhatsApp number', 'رقم واتساب')} onChange={e => { setContactValue(e.target.value.replace(/[^0-9 ]/g, '').slice(0, 15)); edit({}); }} /></div> : <input aria-label={tr('Team email address', 'البريد الإلكتروني للفريق')} type="email" autoComplete="email" maxLength={120} value={contactValue} placeholder="team@example.com" onChange={e => { setContactValue(e.target.value); edit({}); }} />}
            <small className="layla-field-help">{contactMode === 'whatsapp' ? tr('This number must already be active on WhatsApp so your team can receive the handoff.', 'يجب أن يكون الرقم مفعّلاً على واتساب حتى يستلم فريقك التحويل.') : tr('Layla will direct customers to this team email when a human is needed.', 'ستوجّه ليلى العملاء إلى بريد الفريق عند الحاجة إلى موظف.')}</small>
          </label>
          </fieldset>
          {dashboard && <fieldset className="layla-chapter" onKeyDown={e => { if (e.key === 'Enter' && e.target instanceof HTMLInputElement) e.preventDefault(); }}>
          <Chapter ar={ar} n={4} title={tr('Details and questions', 'تفاصيل وأسئلة')}
            lede={tr('Optional. Layla answers these exactly as you write them.', 'اختياري. تجيب ليلى عنها كما تكتبها تماماً.')} />
          {/* `prices` is part of the profile schema and is validated by
              reviewProfile(), but had no input on this form at all: the only way
              to give prices was the catalog section, which is gated behind
              `savedToAccount`. A customer previewing Layla without signing in
              therefore could not state a price in any field. */}
          <details><summary>{tr('Add prices, hours and location (optional)', 'أضف الأسعار وأوقات العمل والموقع (اختياري)')}</summary>{[['prices',tr('Prices','الأسعار')],['hours',tr('Opening hours','أوقات العمل')],['location',tr('Location','الموقع')]].map(([key,label]) => <label key={key}>{label}<textarea maxLength={350} rows={2} value={profile[key]} onChange={e => edit({ [key]: e.target.value })} /></label>)}</details>
          <details><summary>{tr('Questions your customers ask (optional)', 'أسئلة يطرحها عملاؤك (اختياري)')}</summary>
            {(profile.faqs || []).map((faq,i)=><div className="layla-faq" key={i}><strong>{faq.question}</strong><p>{faq.answer}</p><button type="button" className="layla-secondary" onClick={()=>edit({faqs:profile.faqs.filter((_,index)=>index!==i)})}>{tr('Remove','حذف')}</button></div>)}
            {/* The industry's own questions, offered as one-tap fills. These were
                already authored per sector but only ever surfaced on the test
                step, so customers retyped them here. Only the ANSWER is theirs to
                write — the question is the part we can safely suggest. */}
            {sectorFaqSuggestions.length > 0 && <>
              <p className="layla-field-help">{tr('Common questions in your industry — pick one, then write your answer.', 'أسئلة شائعة في مجال نشاطك — اختر سؤالاً ثم اكتب إجابتك.')}</p>
              <div className="layla-quick-questions">
                {sectorFaqSuggestions.map(suggested => <button type="button" key={suggested} className="layla-secondary" onClick={() => setFaqQuestion(suggested)}>{suggested}</button>)}
              </div>
            </>}
            <label>{tr('Customer question','سؤال العميل')}<input maxLength={200} value={faqQuestion} onChange={e=>setFaqQuestion(e.target.value)} /></label>
            <label>{tr('Your approved answer','إجابتك المعتمدة')}<textarea maxLength={700} value={faqAnswer} onChange={e=>setFaqAnswer(e.target.value)} /></label>
            <button type="button" className="layla-secondary" disabled={!faqQuestion.trim() || !faqAnswer.trim() || (profile.faqs?.length || 0)>=12} onClick={()=>{edit({faqs:[...(profile.faqs || []),{question:faqQuestion.trim(),answer:faqAnswer.trim()}]});setFaqQuestion('');setFaqAnswer('');}}>{tr('Add question and answer','إضافة السؤال والإجابة')}</button>
          </details>
          </fieldset>}
          {children}
          <p className="layla-help">{tr('Leave unknown details blank. Layla should ask your team rather than guess.', 'اترك التفاصيل غير المعروفة فارغة. ستوجّه ليلى السؤال لفريقك بدلاً من التخمين.')}</p>
          {dashboard
            ? <p className="layla-help">{tr('Layla uses these answers as soon as you save.', 'تستخدم ليلى هذه الإجابات فور الحفظ.')}</p>
            : <label className="layla-check"><input type="checkbox" required checked={profile.reviewed} onChange={e => setProfile({ ...profile, reviewed: e.target.checked })} /><span>{tr('I checked these business facts.', 'راجعت معلومات النشاط هذه.')}</span></label>}
          <button className="layla-primary" disabled={busy || !profile.reviewed} aria-describedby={profile.reviewed ? undefined : 'layla-confirm-hint'}>{submitLabel}</button>
          {!profile.reviewed && <p id="layla-confirm-hint" className="layla-cta-hint">{tr('Tick “I checked these business facts” above to continue.', 'ضع علامة على «راجعت معلومات النشاط هذه» أعلاه للمتابعة.')}</p>}
  </form>;
}
