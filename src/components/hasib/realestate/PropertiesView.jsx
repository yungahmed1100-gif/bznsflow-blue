import React from 'react';
import { formatDateTime } from '../../../lib/dashboard/format';
import { Money } from '../Badges';
import { Icon } from '../../ui/Icon';
import { EmptyState, PageHeader } from '../DashboardVisuals';
import { label } from './labels.js';

const DAY = 86400000;

/** Listings, each with its verification state and a one-tap "verified today". */
export function PropertiesView({ ar, h, s, data, busy, timezone, freshnessDays = 30, onAdd, onEdit, onVerify }) {
  const tr = (en, arabic) => (ar ? arabic : en);
  const rows = data.properties?.items || [];
  const fresh = row => row.verificationAt && row.verificationAt >= Date.now() - freshnessDays * DAY;
  return <>
    <PageHeader title={tr('Properties', 'العقارات')} description={tr('Only listings verified in the last 30 days, with authority to market them, are offered to customers.', 'تُعرض على العملاء فقط الإعلانات الموثقة خلال آخر ٣٠ يوماً والتي لديك صلاحية تسويقها.')} icon="home" primary={{ label: tr('Add a listing', 'إضافة إعلان'), onClick: onAdd }} />
    {rows.length ? <div className="hb-real-grid">{rows.map(row => <article className="hb-panel hb-property-card" key={row.id}>
      {row.photoUrls?.find(Boolean)
        ? <img src={row.photoUrls.find(Boolean)} alt={row.label} loading="lazy" className="hb-property-cover" />
        : <div className="hb-property-cover"><Icon name="home" size={42} /><span>{tr('No photos yet', 'لا توجد صور بعد')}</span></div>}
      <div className="hb-property-body">
        <div className="hb-status-line"><h2>{row.label}</h2><span className="ld-chip">{label('availability', row.availability, ar)}</span></div>
        <p>{[row.reference, row.propertyType, row.area || row.location].filter(Boolean).join(' · ')}</p>
        <p><b><Money h={h} minor={row.askingPriceMinor} /></b>{row.pricePeriod && row.pricePeriod !== 'total' && ` / ${row.pricePeriod === 'year' ? tr('year', 'سنة') : tr('month', 'شهر')}`}{row.bedrooms ? ` · ${row.bedrooms} ${tr('bedrooms', 'غرف')}` : ''}</p>
        <p className={fresh(row) && row.authorityStatus === 'confirmed' ? '' : 'hb-warn'}>
          {label('authority', row.authorityStatus || 'pending', ar)} · {row.verificationAt ? `${tr('verified', 'تم التحقق')} ${formatDateTime(row.verificationAt, s.lang, timezone)}` : tr('never verified', 'لم يُتحقق منه')}
        </p>
        <div className="ld-actions">
          {row.availability === 'available' && <button type="button" className="ld-button" disabled={busy} onClick={() => onVerify(row)}>{tr('Mark verified today', 'تم التحقق اليوم')}</button>}
          <button type="button" className="ld-button ld-quiet" disabled={busy} onClick={() => onEdit(row)}>{tr('Edit', 'تعديل')}</button>
        </div>
      </div>
    </article>)}</div>
      : <EmptyState icon="home" title={tr('No listings yet', 'لا توجد إعلانات بعد')} description={tr('Add a listing with its price, photos and authority to market it.', 'أضف إعلاناً بسعره وصوره وصلاحية تسويقه.')} action={{ label: tr('Add a listing', 'إضافة إعلان'), onClick: onAdd }} />}
  </>;
}
