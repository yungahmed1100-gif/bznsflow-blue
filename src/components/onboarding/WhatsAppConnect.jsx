import React, { useState } from 'react';
import { BrandMark } from '../ui/BrandMark';
import { MetaWindowGuide } from './MetaWindowGuide.jsx';
import { ReadyChecklist } from './ReadyChecklist.jsx';
import { SetupHelpLinks, AfterConnect, usePhoneOnly } from './SetupHelpLinks.jsx';
import { WhichWhatsApp } from './WhichWhatsApp.jsx';

const PATHS = ['coexistence', 'existing_cloud', 'new_number'];

/** Everything the customer must have before Meta's window can open, in order. */
export function whatsappRequirements({ data, available, reviewMode }) {
  return [
    ['account', reviewMode || !!data?.savedToAccount],
    ['contact', !!data?.profile?.humanContact],
    ['meta', !!available],
  ];
}

function PathChoice({ tr, path, value, onChange, children }) {
  return <label className="layla-choice"><input type="radio" name="number-path" checked={path === value} onChange={() => onChange(value)} /><span>{children}</span></label>;
}

// WhatsApp card on the channels step: number type, Meta's signup window, the
// verification checklist and the new-number registration PIN.
export function WhatsAppConnect({ tr, explain, open, onOpen, errorNote, onClaim, data, busy, available, reviewMode, prepared, preparing, path, onPathChange, preselect, onPreselectChange, onPrepare, onConnect, onCancelAttempt, run, act, request, applyState }) {
  const [pin, setPin] = useState('');
  const [businessApp, setBusinessApp] = useState(false);
  const [appReady, setAppReady] = useState(false);
  const phoneOnly = usePhoneOnly();
  const requirements = whatsappRequirements({ data, available, reviewMode });
  const ready = requirements.every(([, ok]) => ok);
  const labels = {
    account: tr('Setup saved to your account', 'الإعداد محفوظ في حسابك'),
    contact: tr('Team contact added in business details', 'إضافة جهة اتصال للفريق في معلومات النشاط'),
    meta: tr('WhatsApp connection available', 'ربط واتساب متاح'),
  };
  const integration = data?.integration;
  const ownPrepared = prepared && prepared.path === path;
  const register = event => {
    event.preventDefault();
    const body = { action: 'register_number', integration: integration.id, pin, confirm: true };
    setPin('');
    act(async () => { try { applyState(await request(body)); } finally { delete body.pin; } });
  };
  const changePath = next => {
    if (next !== path) { setBusinessApp(false); setAppReady(false); onPathChange(next); }
  };
  return <section className="layla-channel-card layla-channel-card--whatsapp" aria-labelledby="whatsapp-channel-heading">
    <h3 id="whatsapp-channel-heading"><BrandMark name="whatsapp" size={26} className="layla-channel-logo" />WhatsApp</h3>
    {data?.status === 'reconciliation_required' && <p role="status">{tr('Meta’s result needs verification. Check your connection before trying again.', 'تحتاج نتيجة Meta إلى التحقق. تحقّق من الاتصال قبل المحاولة مجدداً.')}</p>}
    {integration && <p className="layla-notice">{tr('Selected number:', 'الرقم المحدّد:')} <bdi>+{integration.sender}</bdi></p>}
    {integration?.path === 'coexistence' && !['connected', 'paused'].includes(integration.status) && <p className="layla-notice layla-notice--progress" role="status">{tr('Keep the WhatsApp Business app open on your phone while Meta finishes connecting and syncing. This can take a few minutes.', 'أبقِ تطبيق واتساب للأعمال مفتوحاً على هاتفك حتى تُكمل Meta الربط والمزامنة. قد يستغرق ذلك بضع دقائق.')}</p>}
    {data?.selection && <section className="layla-answer"><h3>{tr('Choose the number you intended to connect', 'اختر الرقم الذي تريد ربطه')}</h3>
      {data.selection.candidates.map(phone => <button key={phone.id} className="layla-secondary" disabled={busy || Date.now() >= data.selection.expiresAt} onClick={() => run({ action: 'select_phone', phone: phone.id })}><bdi>+{phone.sender}</bdi></button>)}
      {!integration && errorNote}
      <button className="layla-secondary" disabled={busy} onClick={() => run({ action: 'cancel_selection' })}>{tr('Cancel this selection', 'إلغاء الاختيار')}</button>
    </section>}
    {data?.connectionChecks && <ul className="layla-checklist">{[['path', tr('Number type verified', 'التحقق من نوع الرقم')], ['registered', tr('Number registered', 'تسجيل الرقم')], ['routing', tr('Blue connection verified', 'التحقق من ربط Blue')]].map(([key, label]) => <li key={key} data-ok={data.connectionChecks[key] ? '' : undefined}>{label}<span className="ld-visually-hidden">{data.connectionChecks[key] ? tr(': done', ': تم') : tr(': waiting', ': قيد الانتظار')}</span></li>)}</ul>}
    {data?.connectionChecks?.nameStatus && <p className="layla-help">{tr('Meta display-name status:', 'حالة اسم العرض لدى Meta:')} {data.connectionChecks.nameStatus}</p>}
    {data?.diagnostic && <p className="layla-notice layla-notice--problem">{explain(data.diagnostic.reason)}<br />{tr('Support reference:', 'مرجع الدعم:')} {data.diagnostic.stage}-{data.diagnostic.at}{data.diagnostic.providerCode ? ` · Meta ${data.diagnostic.providerCode}` : ''}</p>}
    {integration?.sender?.startsWith('1555') && <p className="layla-help">{tr('This resembles a Meta-provided 555 number. Check the selected number and display-name approval in WhatsApp Manager before using it for customers.', 'يبدو أن هذا رقم 555 مقدّم من Meta. تحقّق من الرقم وموافقة اسم العرض في مدير واتساب قبل استخدامه للعملاء.')}</p>}
    {integration && <p role="status">{['connected', 'paused'].includes(integration.status)
      ? tr('This number is connected. Turn on replies in the next step.', 'هذا الرقم مرتبط. فعّل الردود في الخطوة التالية.')
      : tr('This number is saved. Complete the registration step if shown, or check your connection to continue.', 'هذا الرقم محفوظ. أكمل خطوة التسجيل إن ظهرت، أو تحقّق من الاتصال للمتابعة.')}</p>}
    {integration && ['connected', 'paused'].includes(integration.status) && <AfterConnect tr={tr} />}
    {integration && errorNote}
    {integration && <button className="layla-secondary" disabled={busy} onClick={() => run({ action: 'refresh' })}>{tr('Check my connection', 'التحقق من الاتصال')}</button>}
    {data?.ownerConnectAvailable && !prepared && <section className="layla-answer" aria-labelledby="layla-owner-number">
      <h3 id="layla-owner-number">{tr('BznsFlow’s own number', 'رقم BznsFlow الخاص')}</h3>
      <p>{tr('This number was added directly in Meta, so Meta’s signup window cannot list it. Connect it with BznsFlow’s approved server credential instead.', 'أُضيف هذا الرقم مباشرة في Meta، لذلك لا تعرضه نافذة التسجيل. اربطه باستخدام بيانات الاعتماد المعتمدة لدى BznsFlow.')}</p>
      <button className="layla-primary" disabled={busy} onClick={() => run({ action: 'connect_owner_number' })}>{busy ? tr('Connecting…', 'جارٍ الربط…') : tr('Connect +968 7113 4025 directly', 'ربط ‎+968 7113 4025 مباشرة')}</button>
    </section>}
    {!integration && !data?.selection && !open && <>
      <p>{tr('Let Layla answer your WhatsApp customers. You choose the number next.', 'دع ليلى تردّ على عملائك في واتساب. ستختار الرقم في الخطوة التالية.')}</p>
      {errorNote}
      <button className="layla-primary" disabled={busy} onClick={onOpen}>{tr('Connect WhatsApp', 'ربط واتساب')}</button>
    </>}
    {!integration && !data?.selection && open && <>
      <fieldset disabled={busy}><legend>{tr('Which WhatsApp number should Layla answer?', 'ما رقم واتساب الذي ستردّ عليه ليلى؟')}</legend>
        <PathChoice tr={tr} path={path} value={PATHS[0]} onChange={changePath}><strong>{tr('Keep my WhatsApp Business app', 'الاستمرار باستخدام تطبيق واتساب للأعمال')} <span className="layla-chip layla-chip--recommended">{tr('Recommended', 'موصى به')}</span></strong><small>{tr('Keep using your app on your phone. Meta checks whether your number is eligible.', 'استمر باستخدام التطبيق على هاتفك. تتحقق Meta من أهلية رقمك.')}</small></PathChoice>
        <PathChoice tr={tr} path={path} value={PATHS[1]} onChange={changePath}><strong>{tr('My number already uses an API or another provider', 'رقمي مرتبط بواجهة API أو مزوّد آخر')}</strong><small>{tr('Select your existing account and registered number in Meta. A connection with conflicting routing needs assisted setup.', 'اختر الحساب والرقم المسجّل في Meta. إذا كان الربط الحالي يتعارض مع هذا الإعداد فسنساعدك على إكماله.')}</small></PathChoice>
        <PathChoice tr={tr} path={path} value={PATHS[2]} onChange={changePath}><strong>{tr('Use another number I own', 'استخدام رقم آخر أملكه')}</strong><small>{tr('You need access to SMS or calls. BznsFlow does not supply a number.', 'تحتاج إلى استقبال رسائل SMS أو المكالمات. لا توفر BznsFlow رقماً جديداً.')}</small></PathChoice>
      </fieldset>
      {path === 'coexistence' && !appReady && <>
        {!businessApp && <WhichWhatsApp tr={tr} onBusiness={() => setBusinessApp(true)} />}
        {businessApp && <ReadyChecklist tr={tr} onReady={() => setAppReady(true)} />}
      </>}
      {(path !== 'coexistence' || appReady) && <>
      {path !== 'coexistence' && <details className="layla-preselect"><summary>{tr('My number is in a different Meta business portfolio (optional)', 'رقمي في محفظة أعمال مختلفة في Meta (اختياري)')}</summary>
        <p className="layla-help">{tr('Enter its IDs from Meta Business Suite → Settings so Meta opens on the right business.', 'أدخل معرّفاته من Meta Business Suite ← الإعدادات لتفتح Meta على النشاط الصحيح.')}</p>
        <label>{tr('Meta business portfolio ID', 'معرّف محفظة الأعمال في Meta')}<small>{tr('Settings → Business info', 'الإعدادات ← معلومات النشاط')}</small><input inputMode="numeric" autoComplete="off" dir="ltr" maxLength={30} disabled={busy} value={preselect.business} onChange={e => onPreselectChange({ ...preselect, business: e.target.value.replace(/\D/g, '').slice(0, 30) })} /></label>
        <label>{tr('WhatsApp Business account ID', 'معرّف حساب واتساب للأعمال')}<small>{tr('Settings → Accounts → WhatsApp accounts', 'الإعدادات ← الحسابات ← حسابات واتساب')}</small><input inputMode="numeric" autoComplete="off" dir="ltr" maxLength={30} disabled={busy} value={preselect.waba} onChange={e => onPreselectChange({ ...preselect, waba: e.target.value.replace(/\D/g, '').slice(0, 30) })} /></label>
      </details>}
      {!ready && <ul id="whatsapp-requirements" className="layla-checklist" aria-label={tr('Before connecting WhatsApp', 'قبل ربط واتساب')}>{requirements.map(([key, ok]) => <li key={key} data-ok={ok ? '' : undefined}>
        {/* An unmet item is never a dead end: saving to the account is one press away. */}
        {key === 'account' && !ok && data?.account && data?.accountSaveAvailable
          ? <button type="button" className="layla-secondary" disabled={busy} onClick={onClaim}>{busy ? tr('Saving your setup to your account…', 'جارٍ حفظ إعدادك في حسابك…') : tr('Save my setup to my account', 'احفظ إعدادي في حسابي')}</button>
          : labels[key]}
        <span className="ld-visually-hidden">{ok ? tr(': done', ': تم') : tr(': needed', ': مطلوب')}</span></li>)}</ul>}
      {ready && <p className="layla-help">{tr('Meta’s window opens next. Log in with the Facebook account that manages your business. Passwords and codes go only into Meta’s window.', 'ستفتح نافذة Meta. سجّل الدخول بحساب فيسبوك الذي يدير نشاطك. أدخل كلمات المرور والرموز في نافذة Meta فقط.')}</p>}
      {ready && path === 'coexistence' && <MetaWindowGuide tr={tr} phoneOnly={phoneOnly} />}
      {!ready && <p id="whatsapp-requirements-hint" className="layla-cta-hint">{tr('Complete the items above to continue.', 'أكمل البنود أعلاه للمتابعة.')}</p>}
      {errorNote}
      {ownPrepared
        ? <button className="layla-primary" disabled={busy} onClick={onConnect}>{busy ? tr('Complete the Meta window…', 'أكمل الخطوات في نافذة Meta…') : tr('Connect with Facebook', 'الربط عبر فيسبوك')}</button>
        : <button className="layla-primary" disabled={busy || preparing || !ready} aria-describedby={ready ? undefined : 'whatsapp-requirements whatsapp-requirements-hint'} onClick={onPrepare}>{preparing ? tr('Getting Meta ready…', 'جارٍ تجهيز Meta…') : tr('Get Meta ready', 'تجهيز الربط مع Meta')}</button>}
      {busy && ownPrepared && <button className="layla-secondary" onClick={() => onCancelAttempt('meta_cancelled')}>{tr('Cancel this attempt', 'إلغاء هذه المحاولة')}</button>}
      </>}
      <SetupHelpLinks tr={tr} businessName={data?.profile?.businessName} reference={data?.diagnostic?.at ? `${data.diagnostic.stage}-${data.diagnostic.at}` : ''} email={data?.account?.email} phoneOnly={phoneOnly} />
    </>}
    {integration?.path === 'new_number' && integration.status === 'registration_required' && <form autoComplete="off" onSubmit={register}>
      <p>{tr('Finish registering this separate number:', 'أكمل تسجيل هذا الرقم المنفصل:')} <bdi>+{integration.sender}</bdi></p>
      <label>{tr('Create a six-digit WhatsApp PIN', 'أنشئ رمز PIN لواتساب من ستة أرقام')}<small>{tr('Choose and save your own PIN. If this number already has a two-step verification PIN, use it. This is not an SMS code.', 'اختر رمزاً واحفظه. إذا كان للرقم رمز تحقق بخطوتين، استخدم الرمز الحالي. هذا ليس رمز SMS.')}</small><input type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{6}" maxLength={6} required value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} /></label>
      <button className="layla-primary" disabled={busy || pin.length !== 6}>{tr('Confirm this number’s registration', 'تأكيد تسجيل هذا الرقم')}</button>
    </form>}
  </section>;
}
