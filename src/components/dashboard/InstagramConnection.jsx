import React, { useState } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { callApi } from '../../lib/api-client';
import { messaging, dashboardPath } from '../../lib/dashboard/api';
import { BrandMark } from '../ui/BrandMark';

const endpoint='/api/layla-meta?surface=instagram';
const load=()=>callApi(endpoint);
const STATUS={
  connected:['Connected','مرتبط'],
  disconnected:['Disconnected','غير مرتبط'],
  revoked:['Access removed in Instagram','أُزيل الوصول من إنستغرام'],
  reconnect_required:['Needs reconnecting','يحتاج إلى إعادة الربط'],
  disconnecting:['Disconnecting…','جارٍ الفصل…'],
  deleting:['Removing Instagram data…','جارٍ حذف بيانات إنستغرام…'],
};
export function InstagramConnection({lang='en',onChange=()=>{},showInbox=false}) {
  const ar=lang==='ar', t=(en,arabic)=>ar?arabic:en;
  const state=usePolling(load,[],{interval:30000});
  const [busy,setBusy]=useState(''),[notice,setNotice]=useState(''),[confirm,setConfirm]=useState(false);
  const connection=state.data?.connection;
  const connected=connection?.status==='connected';
  // The server knows a sign-in began and Instagram never sent the person back
  // (it sometimes leaves them on its feed); finishing skips the second login.
  const stranded=!!state.data?.pendingSignIn && !connected;
  const status=STATUS[connection?.status] || ['Connection needs attention','الاتصال يحتاج إلى مراجعة'];
  // Still holds BznsFlow access (so Reconnect and Disconnect make sense). Once the
  // owner disconnects or removes the app in Instagram, the card offers a plain Connect.
  const live=['connected','reconnect_required'].includes(connection?.status);
  const removing=['deleting','disconnecting'].includes(connection?.status);
  async function run(action,extra={}) {
    setBusy(action);setNotice('');
    try {
      if(['activate','pause','check_connection'].includes(action)) {
        await messaging(action,{channel:'instagram'});
        setNotice(action==='activate'?t('Instagram replies are active.','ردود إنستغرام مفعّلة.'):action==='pause'?t('Instagram replies are paused.','ردود إنستغرام متوقفة.'):t('Instagram connection is healthy.','اتصال إنستغرام سليم.'));
      } else {
        const result=await callApi(endpoint,{body:{action,lang,...extra,...(action==='disconnect'?{confirm:true}:{})},csrf:state.data?.csrfToken});
        if(result.url) {window.location.assign(result.url);return;}
        setNotice(result.revoked===false
          ?t('Instagram disconnected in BznsFlow. To finish, remove bznsflowai in Instagram → Settings → Apps and websites.','تم فصل إنستغرام في BznsFlow. لإكمال الفصل، أزل bznsflowai من إنستغرام ← الإعدادات ← التطبيقات والمواقع.')
          :t('Instagram disconnected.','تم فصل إنستغرام.'));
        setConfirm(false);
      }
      await state.refresh({quiet:true});onChange();
    } catch(e) {
      const reasons={
        activation_not_ready:t('Save your business answers with a team contact first (Dashboard → Business).','احفظ إجابات نشاطك مع جهة اتصال للفريق أولاً (اللوحة ← نشاطك).'),
        instagram_reconnect_required:t('Instagram needs reconnecting. Click Reconnect Instagram.','يحتاج إنستغرام إلى إعادة الربط. اضغط «إعادة ربط إنستغرام».'),
        connection_not_ready:t('Meta is not delivering this account’s messages to BznsFlow yet. In Instagram turn on Allow access to messages, then click Reconnect Instagram.','لا توصل Meta رسائل هذا الحساب إلى BznsFlow بعد. فعّل «السماح بالوصول إلى الرسائل» في إنستغرام ثم اضغط «إعادة ربط إنستغرام».'),
        send_outcome_unknown:t('A reply needs checking before replies can restart. Open the inbox to review it.','هناك رد يحتاج إلى مراجعة قبل استئناف الردود. افتح المحادثات لمراجعته.'),
        sign_in_required:t('Your session ended. Sign in again.','انتهت جلستك. سجّل الدخول مجدداً.'),
        connection_busy:t('BznsFlow is still removing this Instagram account’s data. It takes a few seconds; try again shortly.','ما زال BznsFlow يحذف بيانات حساب إنستغرام هذا. يستغرق ذلك بضع ثوانٍ؛ حاول مجدداً بعد قليل.'),
        too_soon:t('Please wait a few seconds before trying again.','انتظر بضع ثوانٍ قبل المحاولة مجدداً.'),
        instagram_permissions_missing:t('Grant both requested Instagram permissions and reconnect.','امنح إذني إنستغرام المطلوبين وأعد الربط.'),
        messaging_unavailable:t('Instagram replies are not enabled yet.','ردود إنستغرام غير مفعّلة بعد.'),
        asset_in_use:t('This Instagram account is connected to another BznsFlow account.','حساب إنستغرام مرتبط بحساب آخر في BznsFlow.'),
        instagram_rate_limited:t('Meta is limiting how often BznsFlow can check Instagram. Nothing is broken; try again in a few minutes.','تحدّ Meta من عدد مرات فحص إنستغرام من BznsFlow. لا يوجد عطل؛ حاول مجدداً بعد بضع دقائق.'),
        instagram_provider_unavailable:t('Instagram did not respond. Nothing changed; try again in a minute.','لم يستجب إنستغرام. لم يتغير شيء؛ حاول مجدداً بعد دقيقة.'),
        instagram_provider_failed:t('Instagram did not respond. Nothing changed; try again in a minute.','لم يستجب إنستغرام. لم يتغير شيء؛ حاول مجدداً بعد دقيقة.'),
      };
      setNotice(reasons[e.reason] || t('Could not complete this step. Check your connection and try again.','تعذّر إكمال الخطوة. تحقق من الاتصال وحاول مجدداً.'));
      // A failed check may have changed the connection (e.g. now needs reconnecting).
      state.refresh({quiet:true});
    } finally {setBusy('');}
  }
  return <section className="ld-channel-card layla-channel-card layla-channel-card--instagram" aria-label="Instagram">
    <h3><BrandMark name="instagram" size={26} className="layla-channel-logo" />Instagram</h3>
    {connection && <p><bdi>@{connection.username}</bdi> · {t(...status)}</p>}
    {connected && <p role="status">{state.data?.active?t('Replies active','الردود مفعّلة'):t('Replies paused','الردود متوقفة')}</p>}
    <p>{t('Answer customer DMs using your approved business information.','أجب عن رسائل العملاء الخاصة باستخدام معلومات نشاطك المعتمدة.')}</p>
    {state.error && <p role="status">{t('Instagram connections are currently unavailable.','ربط إنستغرام غير متاح حالياً.')}</p>}
    {stranded && <div className="layla-channel-retry" role="status">
      <p>{t('Instagram opened its home page instead of asking you to allow BznsFlow? You are signed in to Instagram now, so select Finish connecting and it will ask straight away.','فتح إنستغرام صفحته الرئيسية بدلاً من طلب السماح لـ BznsFlow؟ أنت مسجّل الدخول في إنستغرام الآن، فاضغط «إكمال الربط» وسيطلب الإذن مباشرة.')}</p>
      <button className="ld-button ld-primary" disabled={!!busy} onClick={()=>run('connect',{retry:true})}>{t('Finish connecting','إكمال الربط')}</button>
    </div>}
    <div className="ld-actions">
      <button className="ld-button" disabled={!!busy || !state.data || removing} onClick={()=>run('connect')}>{live?t('Reconnect Instagram','إعادة ربط إنستغرام'):t('Connect Instagram','ربط إنستغرام')}</button>
      {connected && <>
        <button className="ld-button" disabled={!!busy} onClick={()=>run('check_connection')}>{t('Check connection','تحقق من الاتصال')}</button>
        <button className="ld-button ld-primary" disabled={!!busy || !state.data?.sendingEnabled} onClick={()=>run('activate')}>{t('Activate replies','تفعيل الردود')}</button>
        <button className="ld-button" disabled={!!busy} onClick={()=>run('pause')}>{t('Pause replies','إيقاف الردود')}</button>
        {showInbox && <a className="ld-button" href={dashboardPath(lang)}>{t('Open inbox','فتح المحادثات')}</a>}
      </>}
      {live && <button className="ld-button ld-danger" disabled={!!busy} onClick={()=>setConfirm(true)}>{t('Disconnect','فصل الاتصال')}</button>}
    </div>
    {confirm && <div role="alertdialog" aria-label={t('Disconnect Instagram','فصل إنستغرام')}>
      <p>{t('Stop Instagram replies and remove BznsFlow’s access? WhatsApp stays connected.','هل تريد إيقاف ردود إنستغرام وإزالة وصول BznsFlow؟ سيبقى واتساب مرتبطاً.')}</p>
      <button className="ld-button ld-danger" disabled={!!busy} onClick={()=>run('disconnect')}>{t('Confirm disconnect','تأكيد الفصل')}</button>
      <button className="ld-button" disabled={!!busy} onClick={()=>setConfirm(false)}>{t('Cancel','إلغاء')}</button>
    </div>}
    {busy && <p role="status">{t('Working…','جارٍ التنفيذ…')}</p>}
    {notice && <p role="alert">{notice}</p>}
  </section>;
}
