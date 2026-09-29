import React from 'react';

const statusText = (status, ar) => status === 'live' ? (ar ? 'مباشر' : 'Live') : status === 'preview' ? (ar ? 'للمعاينة فقط' : 'Preview only') : (ar ? 'قيد الانتظار' : 'Pending');

export function FounderIndustryPreview({ s, industries = [], current = '', onChange }) {
  const selected = industries.find(industry => industry.id === current);
  return (
    <section className="hb-founder-preview" aria-label={s.ar ? 'معاينة المؤسس للقطاعات' : 'Founder industry preview'}>
      <label>{s.ar ? 'معاينة قطاع ببيانات تجريبية' : 'Preview an industry with synthetic data'}
        <select value={current} onChange={event => onChange(event.target.value)}>
          <option value="">{s.ar ? 'لوحة نشاطي المباشرة — بيانات حقيقية' : 'My live dashboard — real data'}</option>
          {industries.map(industry => <option key={industry.id} value={industry.id} disabled={!industry.built}>
            {(s.ar ? industry.ar : industry.en)} — {statusText(industry.status, s.ar)}
          </option>)}
        </select>
      </label>
      {current && selected?.status !== 'live' && <p role="status">{s.ar ? 'معاينة للقراءة فقط. لن تتغير إعدادات نشاطك أو سجلاتك.' : 'Read-only preview. Your business setup and records stay unchanged.'}</p>}
    </section>
  );
}
