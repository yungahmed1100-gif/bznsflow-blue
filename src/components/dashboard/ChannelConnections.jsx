import React, {useState} from 'react';
import { InstagramConnection } from './InstagramConnection';
import { BrandMark } from '../ui/BrandMark';
import { messaging, setupPath } from '../../lib/dashboard/api';
import { formatPhone } from '../../lib/dashboard/phone';

export function ChannelConnections({s,data,onChange}) {
  const [busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false),[error,setError]=useState('');
  async function disconnect() {
    setBusy(true);setError('');
    try {await messaging('disconnect',{confirm:true});setConfirm(false);onChange();}
    catch(e) {setError(s.reason(e.reason));}
    finally {setBusy(false);}
  }
  return <section>
    <h1>{s.ar?'قنواتك':'Your channels'}</h1>
    <p>{s.ar?'اربط واتساب أو إنستغرام أو كليهما. تستخدم القناتان معلومات نشاطك المعتمدة.':'Connect WhatsApp, Instagram, or both. Both channels use your approved business information.'}</p>
    <section className="ld-channel-card" aria-label="WhatsApp">
      <h3><BrandMark name="whatsapp" size={26} className="layla-channel-logo" />WhatsApp</h3>
      {data.integration && <p><bdi>{formatPhone(data.integration.sender)}</bdi> · {data.messaging?.active?s.t('active'):s.t('paused')}</p>}
      <a className="ld-button" href={setupPath(s.lang)}>{data.integration?(s.ar?'إعدادات واتساب':'WhatsApp setup'):(s.ar?'ربط واتساب':'Connect WhatsApp')}</a>
      {data.integration && <button className="ld-button ld-danger" disabled={busy} onClick={()=>setConfirm(true)}>{s.ar?'فصل واتساب':'Disconnect WhatsApp'}</button>}
      {confirm && <div role="alertdialog" aria-label={s.ar?'فصل واتساب':'Disconnect WhatsApp'}>
        <p>{s.ar?'سيوقف هذا ربط واتساب في BznsFlow ويحذف بيانات الوصول المحفوظة. سيبقى رقمك مسجلاً لدى Meta وحساب إنستغرام مرتبطاً. يمكنك إزالة صلاحية التطبيق من Meta أيضاً.':'This stops WhatsApp in BznsFlow and removes its saved credentials. Your number stays registered with Meta and Instagram stays connected. You can also remove the app permission in Meta.'}</p>
        <button className="ld-button ld-danger" disabled={busy} onClick={disconnect}>{s.ar?'تأكيد الفصل':'Confirm disconnect'}</button>
        <button className="ld-button" disabled={busy} onClick={()=>setConfirm(false)}>{s.t('cancel')}</button>
      </div>}
      {error && <p role="alert">{error}</p>}
    </section>
    <InstagramConnection lang={s.lang} onChange={onChange} />
  </section>;
}
