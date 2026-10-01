import React, { useState } from 'react';
import { InstagramConnection } from '../dashboard/InstagramConnection';
import { dashboardPath } from '../../lib/dashboard/api';
import { prefillFor } from '../../lib/sector-prefill.generated.js';
import { inferIndustry } from '../business/BusinessDetailsForm.jsx';

const LIVE = ['connected', 'paused'];

// Last step: turn replies on per channel, optionally preview Layla, then open the inbox.
export function GoLiveStep({ lang, tr, data, busy, reviewMode, act, request, applyState, run, reply, onBack }) {
  const [question, setQuestion] = useState('');
  const profile = data?.profile || {};
  const tailored = prefillFor(inferIndustry(profile.sector), lang);
  const saved = !reviewMode && data?.savedToAccount;
  const whatsappLive = LIVE.includes(data?.integration?.status);
  const preview = text => { setQuestion(text); run({ action: 'preview', text }); };
  const quick = [[tr('What services do you offer?', 'ما الخدمات التي تقدمونها؟'), true], [tr('What are your opening hours?', 'ما ساعات الدوام؟'), !!profile.hours], [tr('What are your prices?', 'ما أسعاركم؟'), !!profile.prices], [tr('Can I speak to a human?', 'هل يمكنني التحدث مع موظف؟'), true]].filter(([, show]) => show);
  const sourceLabels = { faqs: tr('your approved answer', 'إجابتك المعتمدة'), services: tr('services', 'الخدمات'), prices: tr('prices', 'الأسعار'), hours: tr('opening hours', 'ساعات الدوام'), location: tr('location', 'الموقع') };
  return <section>
    <p className="layla-stage-intro">{tr('Turn replies on for each channel you connected. You can pause them any time.', 'فعّل الردود لكل قناة ربطتها. يمكنك إيقافها في أي وقت.')}</p>
    {saved && whatsappLive && <a className="layla-primary" href={dashboardPath(lang)}>{tr('Open your inbox', 'افتح المحادثات')}</a>}
    {saved && <InstagramConnection lang={lang} showInbox />}
    <details><summary>{tr('Test Layla with a question (optional)', 'اختبر ليلى بسؤال (اختياري)')}</summary>
      <p className="layla-help">{tr('A private preview. No message is sent.', 'معاينة خاصة. لا تُرسل أي رسالة.')}</p>
      <form onSubmit={e => { e.preventDefault(); act(async () => applyState(await request({ action: 'preview', text: question }))); }}><label>{tr('A customer question', 'سؤال من عميل')}
        <select aria-label={tr('Question suggestions for your business', 'اقتراحات أسئلة لنشاطك')} value="" onChange={e => { if (e.target.value) setQuestion(e.target.value); }}>
          <option value="">{tr('Choose a question to preview (optional)', 'اختر سؤالاً لمعاينته (اختياري)')}</option>{tailored.questions.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
        <textarea aria-label={tr('Customer question to preview', 'سؤال العميل للمعاينة')} required maxLength={1000} value={question} placeholder={tr('Type a real customer question or choose one above.', 'اكتب سؤالاً حقيقياً من عميل أو اختر سؤالاً أعلاه.')} onChange={e => setQuestion(e.target.value)} /></label><button className="layla-primary" disabled={busy || !question.trim()}>{tr('See Layla’s answer', 'شاهد إجابة ليلى')}</button></form>
      {(profile.faqs || []).map(faq => <button key={faq.question} className="layla-secondary" disabled={busy} onClick={() => preview(faq.question)}>{faq.question}</button>)}
      <div className="layla-quick-questions" aria-label={tr('Try a question', 'جرّب سؤالاً')}>
        {quick.map(([text]) => <button key={text} type="button" className="layla-secondary" disabled={busy} onClick={() => preview(text)}>{text}</button>)}
      </div>
      {reply && <div className="layla-answer" role="status"><strong>{tr('Synthetic preview — Layla’s answer', 'معاينة تجريبية — إجابة ليلى')}</strong>{data?.lastPreview?.question && <p><b>{tr('You:', 'أنت:')}</b> {data.lastPreview.question}</p>}<p dir="auto">{reply}</p>
        {!!data?.lastPreview?.sourceFields?.length && <p className="layla-help">{tr('Based on your saved business facts:', 'بناءً على معلومات نشاطك المحفوظة:')} {data.lastPreview.sourceFields.map(field => sourceLabels[field]).join(' · ')}</p>}
      </div>}
    </details>
    {saved && !whatsappLive && <a className={data?.integration ? 'layla-secondary' : 'layla-primary'} href={dashboardPath(lang)}>{tr('Open your inbox', 'افتح المحادثات')}</a>}
    <button className="layla-secondary" disabled={busy} onClick={onBack}>{tr('Back to channels', 'العودة إلى القنوات')}</button>
    {reviewMode && <p className="layla-help">{tr('Sign in to a dedicated review account to demonstrate live replies.', 'سجّل الدخول بحساب مراجعة مخصص لعرض الردود المباشرة.')}</p>}
  </section>;
}
