import React, { useEffect, useRef, useState } from 'react';
import { InstagramConnection } from '../components/dashboard/InstagramConnection';
// InstagramConnection and ActivationPanel render dashboard (ld-*) controls.
import '../styles/layla-dashboard.css';
import { ActivationPanel } from '../components/dashboard/ActivationPanel';
import { dashboardPath } from '../lib/dashboard/api';
import logoImg from '../assets/logo_bznsflow.png';
import { Seo } from '../components/ui/Seo';
import { BrandMark } from '../components/ui/BrandMark';
import '../styles/layla-onboarding.css';
import { signupOptions, signupInit, createSignupAttempt } from '../lib/layla-signup.js';
import { prefillFor } from '../lib/sector-prefill.generated.js';
import { callApi } from '../lib/api-client.js';
import { BusinessDetailsForm, inferIndustry } from '../components/business/BusinessDetailsForm.jsx';
import { explain as explainReason, instagramReturnMessage } from '../lib/onboarding/explanations.js';

// Three steps, one primary action each. Ids are the saved journeyStep values
// (a legacy saved 2 opens the channels step).
const STEP_ORDER = [0, 1, 3];
let sdkPromise;
function loadFacebook() {
  if (window.FB) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://connect.facebook.net/en_US/sdk.js'; script.async = true;
    const fail = () => { clearTimeout(timer); script.remove(); reject(new Error('meta_sdk_unavailable')); };
    const timer = setTimeout(fail, 15000);
    script.onload = () => { clearTimeout(timer); if (window.FB) resolve(); else fail(); };
    script.onerror = fail; document.head.appendChild(script);
  }).catch(error => { sdkPromise = null; throw error; });
  return sdkPromise;
}
async function prepareFacebook(prepared) {
  await loadFacebook();
  window.FB.init(signupInit(prepared));
}
export default function LaylaOnboarding({ lang = 'ar', reviewMode = false }) {
  const ar = lang === 'ar';
  const tr = (en, arabic) => ar ? arabic : en;
  const [available, setAvailable] = useState(false);
  const [checking, setChecking] = useState(true);
  const heading = useRef(null);
  const [data, setData] = useState(null), [csrf, setCsrf] = useState(''), [step, setStep] = useState(0);
  const [path, setPath] = useState('coexistence');
  const [prepared, setPrepared] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [question, setQuestion] = useState(''), [reply, setReply] = useState(null);
  const [pin, setPin] = useState('');
  // Read after mount: the page is prerendered without a query string, so
  // rendering this banner on the first pass would not match the HTML.
  const [instagramReturn, setInstagramReturn] = useState(null);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search), status = query.get('instagram');
    const text = instagramReturnMessage(status, query.get('reason'), lang);
    setInstagramReturn(text ? { ok: status === 'connected', text } : null);
  }, [lang]);
  const [preBusiness, setPreBusiness] = useState(''), [preWaba, setPreWaba] = useState('');
  const [saveOpen, setSaveOpen] = useState(false), [email, setEmail] = useState(''), [emailCode, setEmailCode] = useState(''), [codeSent, setCodeSent] = useState(false);
  const authCsrf = useRef('');
  async function authRequest(action, body) {
    if (!authCsrf.current) {
      const r = await fetch('/api/auth-session', {credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)}).then(r=>r.json());
      if (!r.ok) throw Error(r.reason); authCsrf.current = r.csrfToken;
    }
    const r = await fetch(action === 'code' ? '/api/auth-code' : '/api/auth-session', {method:'POST',credentials:'same-origin',signal:AbortSignal.timeout(30000),headers:{'Content-Type':'application/json','x-csrf-token':authCsrf.current},body:JSON.stringify(body)}).then(r=>r.json());
    if (!r.ok) throw Error(r.reason); return r;
  }
  function saveAccount() {
    setSaveOpen(true);
    if (data?.account && !data?.savedToAccount) run({action:'claim_draft'});
  }
  async function signOut() {
    await act(async()=>{
      const session=await fetch('/api/auth-session',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)}).then(r=>r.json());
      if(!session.ok)throw Error(session.reason);
      const result=await fetch('/api/auth-session',{method:'DELETE',credentials:'same-origin',signal:AbortSignal.timeout(10000),headers:{'x-csrf-token':session.csrfToken}}).then(r=>r.json());
      if(!result.ok)throw Error(result.reason);
      setData(null);setReply(null);setPrepared(null);setEmail('');setEmailCode('');
      window.location.replace(`${ar? '':'/en'}/layla/setup`);
    });
  }
  const pending = useRef(null), actionBusy = useRef(false);
  const explain = reason => explainReason(reason, lang);
  async function request(body) {
    const surface = reviewMode ? 'customer-review' : 'customer';
    // 60s: signup and website import both wait on Meta or a third-party site.
    return callApi(`/api/layla-meta?surface=${surface}`, { body, csrf, timeout: 60000 });
  }
  async function act(task) { if (actionBusy.current) return; actionBusy.current = true; setBusy(true); setError(''); try { await task(); } catch (e) { setError(explain(e.message)); } finally { actionBusy.current = false; setBusy(false); } }
  // Most actions save one step and redraw the page from the server's answer.
  const run = body => act(async () => applyState(await request(body)));
  function applyState(r) {
    // Returning from the dashboard sign-in: a saved, connected account goes straight back.
    if (!reviewMode && new URLSearchParams(window.location.search).get('next') === 'dashboard') {
      if (r.account && r.savedToAccount && ['connected', 'paused'].includes(r.integration?.status)) { window.location.replace(dashboardPath(lang)); return; }
      if (!r.account) setSaveOpen(true);
    }
    setData(r); setAvailable(r.available === true); setCsrf(r.csrfToken || '');
    setReply(r.lastPreview?.text || null);
    setPath(r.integration?.path || r.prepared?.path || 'coexistence');
    setStep(r.journeyStep === 2 || r.journeyStep === undefined || r.journeyStep === null ? (r.profile ? 1 : 0) : r.journeyStep);
    if (r.prepared) prepareFacebook(r.prepared).then(() => setPrepared(r.prepared)).catch(() => setError(explain('meta_sdk_unavailable')));
  }
  useEffect(() => {
    let active = true;
    if(reviewMode && window.location.hash.startsWith('#access=')) {
      let access=window.location.hash.slice(8);
      window.history.replaceState(null,'',window.location.pathname);
      authRequest('session',{reviewAccess:access}).then(()=>window.location.replace(`${ar?'':'/en'}/layla/setup`)).catch(()=>{if(active){setError(explain('review_access_invalid'));setChecking(false);}}).finally(()=>{access=undefined;});
      return()=>{active=false;};
    }
    request().then(r => { if (active) applyState(r); }).catch(() => {
      if (active) setError(explain('restore_failed'));
    }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; pending.current?.dispose(); pending.current = null; };
  }, []);
  useEffect(() => { heading.current?.focus(); setPin(''); }, [step]);
  async function saveBusiness({ profile, businessName }) {
    await act(async () => {
      const r = await request({ action: 'profile', profile, businessName });
      applyState(r);
      // Signing in comes right after the one review, so the owner can connect a channel.
      if (!reviewMode && !r.savedToAccount) setSaveOpen(true);
    });
  }
  function goTo(journeyStep) { return run({ action: 'save_progress', journeyStep }); }
  useEffect(() => {
    if (!prepared) return;
    const receive = event => pending.current?.message(event);
    window.addEventListener('message', receive);
    const timer = setTimeout(() => {
      if (pending.current) pending.current.cancel('attempt_expired');
      else { setPrepared(null); setBusy(false); setError(explain('attempt_expired')); }
    }, Math.max(0, prepared.expiresAt - Date.now()));
    return () => { window.removeEventListener('message', receive); clearTimeout(timer); };
  }, [prepared]);
  useEffect(() => {
    if (step !== 1 || !data?.integration || !['reconciliation_required','verifying'].includes(data.status)) return;
    let rounds = 0;
    const timer = setInterval(() => {
      if (++rounds > 12) { clearInterval(timer); return; }
      if (document.visibilityState === 'visible' && !actionBusy.current && !pending.current) run({action:'refresh'});
    }, 5000);
    return () => clearInterval(timer);
  }, [step, data?.integration?.id, data?.status, csrf]);
  function connect() {
    if (!prepared || Date.now() >= prepared.expiresAt) { setPrepared(null); return; }
    setBusy(true); setError('');
    const attempt = createSignupAttempt({
      prepared,
      complete: async body => {
        pending.current = null; setPrepared(null);
        await act(async () => {
          const r = await request(body); applyState(r);
        });
      },
      failed: reason => {
        pending.current = null; setPrepared(null); setBusy(false);
        setError(explain(reason));
        // Release the durable unclaimed attempt. A failed cancellation remains
        // visible and expires server-side; it never triggers a second exchange.
        request({action:'cancel',attempt:prepared.attempt,state:prepared.state}).catch(error => setError(explain(error.message === 'attempt_expired' ? 'attempt_expired' : 'cancel_failed')));
      },
    });
    pending.current = attempt;
    const originalOpen = window.open;
    let captured = false;
    window.open = function (...args) {
      const popup = originalOpen.apply(window,args);
      captured = true; attempt.capture(popup);
      return popup;
    };
    try {
      window.FB.login(attempt.callback,signupOptions(prepared));
    } catch { attempt.cancel('popup_blocked'); }
    finally { window.open = originalOpen; if (!captured) attempt.cancel('popup_blocked'); }
  }
  const steps = { 0: tr('Your business', 'نشاطك التجاري'), 1: tr('Connect your channels', 'ربط قنواتك'), 3: tr('Go live', 'التشغيل') };
  // journeyStep ids are not in the order the customer walks them.
  const currentPosition = Math.max(0, STEP_ORDER.indexOf(step));
  const profile = data?.profile || {};
  const tailored = prefillFor(inferIndustry(profile.sector), lang);
  return <main className="layla-customer" dir={ar ? 'rtl' : 'ltr'} lang={lang}>
    <Seo lang={lang} title={tr('Set up Layla | BznsFlow', 'إعداد ليلى | BznsFlow')} description={tr('Connect your business to Layla.', 'اربط نشاطك التجاري بليلى.')} noindex />
    <header className="layla-customer-nav"><a href={ar ? '/' : '/en'} aria-label="BznsFlow"><img src={logoImg} alt="" width="40" height="40" />BznsFlow</a><nav aria-label={tr('Page navigation','التنقل في الصفحة')}><a className="layla-back-home" href={ar ? '/' : '/en'}>{tr('Back to main website','العودة إلى الموقع الرئيسي')}</a><a href={`${ar ? '/en' : ''}/layla/${reviewMode ? 'review' : 'setup'}`} lang={ar ? 'en' : 'ar'}>{ar ? 'English' : 'العربية'}</a></nav></header>
    <div className="layla-customer-layout">
      <aside className="layla-intro">
        <h1>{tr('Meet your new front desk.', 'تعرّف على موظفة استقبالك الجديدة.')}</h1>
        <p>{tr('Tell Layla about your business, connect Instagram, WhatsApp or both, and go live. Three steps, a few minutes.', 'عرّف ليلى على نشاطك، واربط إنستغرام أو واتساب أو كليهما، ثم ابدأ التشغيل. ثلاث خطوات في دقائق.')}</p>
        <img src="/images/layla-onboarding-transparent.png" width="768" height="1376" alt={tr('Layla, wearing a teal jacket and a headset', 'ليلى ترتدي سترة بلون أزرق مخضر وسماعة رأس')} fetchpriority="high" />
        <p className="layla-intro-note">{tr('Your business. Your channels. You stay in control.', 'نشاطك. قنواتك. والقرار دائماً لك.')}</p>
      </aside>
      <div className="layla-workspace">
        <ol className="layla-customer-steps" aria-label={tr('Setup progress','مراحل الإعداد')}>{STEP_ORDER.map((i, position) => {
          const state = position < currentPosition ? 'done' : position === currentPosition ? 'current' : 'upcoming';
          return <li key={steps[i]} data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="layla-step-mark" aria-hidden="true">{state === 'done' ? '✓' : position + 1}</span>
            <span className="layla-step-name">{steps[i]}</span>
            {state === 'done' && <span className="ld-visually-hidden">{tr(' — done',' — مكتملة')}</span>}
          </li>;
        })}</ol>
        <p className="layla-step-count" aria-hidden="true">{tr(`Step ${currentPosition + 1} of ${STEP_ORDER.length}`, `الخطوة ${(currentPosition + 1).toLocaleString('ar-EG')} من ${STEP_ORDER.length.toLocaleString('ar-EG')}`)} · {steps[step]}</p>
        <h2 ref={heading} tabIndex={-1}>{steps[step]}</h2>
        {instagramReturn && <p className={instagramReturn.ok ? 'layla-saved' : 'layla-notice layla-notice--problem'} role={instagramReturn.ok ? 'status' : 'alert'}>{instagramReturn.text}</p>}
        {data?.account && <p>{tr('Signed in as','تم الدخول باسم')} {data.account.email} <button className="layla-secondary" disabled={busy} onClick={signOut}>{tr('Sign out / Use another account','تسجيل الخروج / استخدام حساب آخر')}</button></p>}
        {error && <p className="layla-error" role="alert">{error}</p>}
        {data?.profile && <p className={data.savedToAccount ? 'layla-saved' : 'layla-saved layla-saved--preview'}>{data.savedToAccount ? tr('Saved to your account', 'محفوظ في حسابك') : tr('Preview saved in this browser for 24 hours.', 'المعاينة محفوظة في هذا المتصفح لمدة ٢٤ ساعة.')}</p>}
        {saveOpen && !data?.savedToAccount && <section className="layla-answer" aria-label={tr('Save your setup','حفظ إعدادك')}>
          <h3>{tr('Save your setup','حفظ إعدادك')}</h3>
          {!data?.accountSaveAvailable ? <p>{tr('Account saving is being configured. You can keep previewing Layla.', 'جارٍ إعداد حفظ الحساب. يمكنك متابعة معاينة ليلى.')}</p> : data?.account ? <div><p>{tr('Signed in as','تم الدخول باسم')} {data.account.email}</p><button className="layla-primary" disabled={busy} onClick={saveAccount}>{tr('Save this setup','حفظ هذا الإعداد')}</button></div> : <form onSubmit={e=>{e.preventDefault();act(async()=>{
            if (!codeSent) {await authRequest('code',{email,lang});setCodeSent(true);}
            else {try {await authRequest('session',{email,code:emailCode});setCodeSent(false);applyState(await request());applyState(await request({action:'claim_draft'}));setSaveOpen(false);} finally {setEmailCode('');}}
          });}}>
            <label>{tr('Email address','البريد الإلكتروني')}<input type="email" required autoComplete="email" disabled={codeSent} value={email} onChange={e=>setEmail(e.target.value)} /></label>
            {codeSent && <label>{tr('Six-digit email sign-in code','رمز الدخول من البريد — ستة أرقام')}<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={emailCode} onChange={e=>setEmailCode(e.target.value.replace(/\D/g,''))}/></label>}
            <button className="layla-primary" disabled={busy}>{codeSent ? tr('Verify and save','تحقق واحفظ') : tr('Email me a sign-in code','أرسل رمز الدخول إلى بريدي')}</button>
            {codeSent && <button type="button" className="layla-secondary" disabled={busy} onClick={()=>{setCodeSent(false);setEmailCode('');}}>{tr('Use another email or request a new code','بريد آخر أو طلب رمز جديد')}</button>}
          </form>}
        </section>}
        {step === 0 && <BusinessDetailsForm key={data?.profileVersion ?? 'new'} lang={lang} mode="onboarding" initial={{ profile: data?.profile, businessName: data?.profile?.businessName }} busy={busy || checking} onSubmit={saveBusiness}
          submitLabel={checking ? tr('Checking secure setup…','جارٍ التحقق من الإعداد الآمن…') : tr('Save and continue','احفظ وتابع')}>
          {!checking && !available && <p className="layla-notice layla-notice--progress" role="status">{tr('Your business facts are saved securely for 24 hours without a BznsFlow login. Meta connection is waiting for verified Blue test setup.', 'تُحفظ معلومات نشاطك بأمان لمدة ٢٤ ساعة دون تسجيل دخول إلى BznsFlow. ينتظر ربط Meta التحقق من إعداد الاختبار في Blue.')}</p>}
        </BusinessDetailsForm>}
        {step === 1 && <section className="layla-channel-stage">
          <p>{tr('Choose Instagram, WhatsApp, or both. Each connection has its own reply controls.', 'اختر إنستغرام أو واتساب أو كليهما. لكل اتصال أدوات مستقلة للتحكم بالردود.')}</p>
          {!reviewMode && data?.savedToAccount && <InstagramConnection lang={lang} showInbox />}
          {!reviewMode && !data?.savedToAccount && <p>{tr('Save your setup to your account to connect Instagram or WhatsApp.', 'احفظ إعدادك في حسابك لربط إنستغرام أو واتساب.')}</p>}
          <section className="layla-channel-card layla-channel-card--whatsapp" aria-labelledby="whatsapp-channel-heading">
          <h3 id="whatsapp-channel-heading"><BrandMark name="whatsapp" size={26} className="layla-channel-logo" />WhatsApp</h3>
          {data?.status === 'reconciliation_required' && <p role="status">{tr('Meta’s result needs verification. Check your connection before trying again.', 'تحتاج نتيجة Meta إلى التحقق. تحقّق من الاتصال قبل المحاولة مجدداً.')}</p>}
          {busy && prepared && <button className="layla-secondary" onClick={() => pending.current?.cancel('meta_cancelled')}>{tr('Cancel this attempt','إلغاء هذه المحاولة')}</button>}
          {data?.integration && <p className="layla-notice">{tr('Selected number:', 'الرقم المحدّد:')} <bdi>+{data.integration.sender}</bdi></p>}
          {data?.selection && <section className="layla-answer"><h3>{tr('Choose the number you intended to connect', 'اختر الرقم الذي تريد ربطه')}</h3>
            {data.selection.candidates.map(phone=><button key={phone.id} className="layla-secondary" disabled={busy || Date.now() >= data.selection.expiresAt} onClick={()=>run({action:'select_phone',phone:phone.id})}><bdi>+{phone.sender}</bdi></button>)}
            <button className="layla-secondary" disabled={busy} onClick={()=>run({action:'cancel_selection'})}>{tr('Cancel this selection', 'إلغاء الاختيار')}</button>
          </section>}
          {data?.connectionChecks && <ul className="layla-checklist">{[['path',tr('Number type verified','التحقق من نوع الرقم')],['registered',tr('Number registered','تسجيل الرقم')],['routing',tr('Blue connection verified','التحقق من ربط Blue')]].map(([key,label])=><li key={key} data-ok={data.connectionChecks[key] ? '' : undefined}>{label}<span className="ld-visually-hidden">{data.connectionChecks[key] ? tr(': done',': تم') : tr(': waiting',': قيد الانتظار')}</span></li>)}</ul>}
          {data?.connectionChecks?.nameStatus && <p className="layla-help">{tr('Meta display-name status:', 'حالة اسم العرض لدى Meta:')} {data.connectionChecks.nameStatus}</p>}
          {data?.diagnostic && <p className="layla-notice layla-notice--problem">{explain(data.diagnostic.reason)}<br/>{tr('Support reference:', 'مرجع الدعم:')} {data.diagnostic.stage}-{data.diagnostic.at}{data.diagnostic.providerCode ? ` · Meta ${data.diagnostic.providerCode}` : ''}</p>}
          {data?.integration?.sender?.startsWith('1555') && <p className="layla-help">{tr('This resembles a Meta-provided 555 number. Check the selected number and display-name approval in WhatsApp Manager before using it for customers.', 'يبدو أن هذا رقم 555 مقدّم من Meta. تحقّق من الرقم وموافقة اسم العرض في مدير واتساب قبل استخدامه للعملاء.')}</p>}
          {data?.integration && <p role="status">{['connected','paused'].includes(data.integration.status)
            ? tr('This number is already connected. Manage replies and conversations below.', 'هذا الرقم مرتبط بالفعل. يمكنك إدارة الردود والمحادثات أدناه.')
            : tr('This number is already saved. Complete the registration step if shown, or check your connection below to continue.', 'هذا الرقم محفوظ بالفعل. أكمل خطوة التسجيل إن ظهرت، أو تحقّق من الاتصال أدناه للمتابعة.')}</p>}
          {data?.ownerConnectAvailable && !prepared && <section className="layla-answer" aria-labelledby="layla-owner-number">
            <h3 id="layla-owner-number">{tr('BznsFlow’s own number', 'رقم BznsFlow الخاص')}</h3>
            <p>{tr('This number was added directly in Meta, so Meta’s signup window cannot list it. Connect it with BznsFlow’s approved server credential instead.', 'أُضيف هذا الرقم مباشرة في Meta، لذلك لا تعرضه نافذة التسجيل. اربطه باستخدام بيانات الاعتماد المعتمدة لدى BznsFlow.')}</p>
            <button className="layla-primary" disabled={busy} onClick={() => run({ action: 'connect_owner_number' })}>{busy ? tr('Connecting…', 'جارٍ الربط…') : tr('Connect +968 7113 4025 directly', 'ربط ‎+968 7113 4025 مباشرة')}</button>
          </section>}
          {!data?.integration && !data?.selection && <>
          <p>{tr('Choose the number you want Layla to help with.', 'اختر الرقم الذي تريد أن تعمل ليلى عليه.')}</p>
          <fieldset disabled={busy || !!prepared}><legend>{tr('Your WhatsApp number', 'رقم واتساب الخاص بك')}</legend>
            <label className="layla-choice"><input type="radio" name="number-path" checked={path === 'coexistence'} onChange={() => setPath('coexistence')} /><span><strong>{tr('Keep my WhatsApp Business app', 'الاستمرار باستخدام تطبيق واتساب للأعمال')} <span className="layla-chip layla-chip--recommended">{tr('Recommended','موصى به')}</span></strong><small>{tr('Keep using your app. Meta checks whether your number is eligible for Coexistence.', 'استمر باستخدام تطبيقك. تتحقق Meta من أهلية رقمك للاستخدام المتزامن.')}</small></span></label>
            <label className="layla-choice"><input type="radio" name="number-path" checked={path === 'existing_cloud'} onChange={() => setPath('existing_cloud')} /><span><strong>{tr('My number already uses an API or another provider', 'رقمي مرتبط بواجهة API أو مزوّد آخر')}</strong><small>{tr('Select your existing account and registered number in Meta. A connection with conflicting routing needs assisted setup.', 'اختر الحساب والرقم المسجّل في Meta. إذا كان الربط الحالي يتعارض مع هذا الإعداد فسنساعدك على إكماله.')}</small></span></label>
            <label className="layla-choice"><input type="radio" name="number-path" checked={path === 'new_number'} onChange={() => setPath('new_number')} /><span><strong>{tr('Use another number I own', 'استخدام رقم آخر أملكه')}</strong><small>{tr('You need access to SMS or calls. BznsFlow does not supply a number.', 'تحتاج إلى استقبال رسائل SMS أو المكالمات. لا توفر BznsFlow رقماً جديداً.')}</small></span></label>
          </fieldset>
          {path !== 'coexistence' && <fieldset className="layla-preselect" disabled={busy || !!prepared}><legend>{tr('Open Meta on the right business (optional)', 'فتح Meta على النشاط الصحيح (اختياري)')}</legend>
            <p className="layla-help">{tr('If your number belongs to a different business portfolio than the one Meta shows, enter its IDs from Meta Business Suite → Settings.', 'إذا كان رقمك يتبع محفظة أعمال غير التي تعرضها Meta، أدخل معرّفاتها من Meta Business Suite ← الإعدادات.')}</p>
            <label>{tr('Meta business portfolio ID', 'معرّف محفظة الأعمال في Meta')}<small>{tr('Settings → Business info', 'الإعدادات ← معلومات النشاط')}</small><input inputMode="numeric" autoComplete="off" dir="ltr" maxLength={30} value={preBusiness} onChange={e => setPreBusiness(e.target.value.replace(/\D/g, '').slice(0, 30))} /></label>
            <label>{tr('WhatsApp Business account ID', 'معرّف حساب واتساب للأعمال')}<small>{tr('Settings → Accounts → WhatsApp accounts', 'الإعدادات ← الحسابات ← حسابات واتساب')}</small><input inputMode="numeric" autoComplete="off" dir="ltr" maxLength={30} value={preWaba} onChange={e => setPreWaba(e.target.value.replace(/\D/g, '').slice(0, 30))} /></label>
          </fieldset>}
          <p>{tr('Use the Facebook account that manages your business. Passwords and verification codes belong only in Meta’s window.', 'استخدم حساب فيسبوك الذي يدير نشاطك. أدخل كلمات المرور ورموز التحقق في نافذة Meta فقط.')}</p>
          {!reviewMode && !data?.savedToAccount && <button className="layla-primary" disabled={busy} onClick={saveAccount}>{tr('Save your setup first','احفظ إعدادك أولاً')}</button>}
          {!data?.profile?.humanContact && <p className="layla-notice layla-notice--problem">{tr('Add a team contact in your business details before connecting WhatsApp. You can keep trying the preview.', 'أضف جهة اتصال للفريق في معلومات نشاطك قبل ربط واتساب. يمكنك متابعة المعاينة الآن.')}</p>}
          {!prepared ? <button className="layla-primary" disabled={busy || !available || !data?.profile?.humanContact || !!data?.integration || !!data?.selection || (!reviewMode && !data?.savedToAccount)} onClick={() => act(async () => { const r = await request({ action: 'begin', path, ...(path !== 'coexistence' && preBusiness ? { business: preBusiness } : {}), ...(path !== 'coexistence' && preWaba ? { waba: preWaba } : {}) }); await prepareFacebook(r); setPrepared(r); })}>{busy ? tr('Preparing…','جارٍ التجهيز…') : tr('Prepare secure connection','تجهيز الربط الآمن')}</button> : <button className="layla-primary" disabled={busy} onClick={connect}>{busy ? tr('Complete the Meta window…','أكمل الخطوات في نافذة Meta…') : tr('Connect with Facebook','الربط عبر فيسبوك')}</button>}
          </>}
          </section>
          <button className="layla-secondary" disabled={busy || !!prepared} onClick={() => goTo(0)}>{tr('Back to business details','العودة إلى معلومات النشاط')}</button>
        </section>}
        {step === 1 && <button className="layla-primary" disabled={busy || !!prepared} onClick={() => goTo(3)}>{tr('Continue to go live', 'متابعة إلى التشغيل')}</button>}
        {step === 3 && <p className="layla-stage-intro">{tr('Turn replies on for each channel you connected. You can pause them any time.', 'فعّل الردود لكل قناة ربطتها. يمكنك إيقافها في أي وقت.')}</p>}
        {data?.integration && <button className="layla-secondary" disabled={busy} onClick={() => run({ action: 'refresh' })}>{tr('Check my connection','التحقق من الاتصال')}</button>}
        {step === 3 && !reviewMode && data?.savedToAccount && <InstagramConnection lang={lang} showInbox />}
        {!reviewMode && data?.savedToAccount && data?.integration && <ActivationPanel key={`${data.account?.email}:${data.integration.id}`} lang={lang} setup={data}/>}
        {step === 3 && <section>
          <details><summary>{tr('Test Layla with a question (optional)', 'اختبر ليلى بسؤال (اختياري)')}</summary>
          <p className="layla-help">{tr('A private preview. No message is sent.', 'معاينة خاصة. لا تُرسل أي رسالة.')}</p>
          <form onSubmit={e => { e.preventDefault(); act(async () => { const r = await request({ action: 'preview', text: question }); applyState(r); }); }}><label>{tr('A customer question','سؤال من عميل')}
            <select aria-label={tr('Question suggestions for your business', 'اقتراحات أسئلة لنشاطك')} value="" onChange={e => { if (e.target.value) setQuestion(e.target.value); }}>
              <option value="">{tr('Choose a question to preview (optional)', 'اختر سؤالاً لمعاينته (اختياري)')}</option>{tailored.questions.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
            <textarea aria-label={tr('Customer question to preview', 'سؤال العميل للمعاينة')} required maxLength={1000} value={question} placeholder={tr('Type a real customer question or choose one above.', 'اكتب سؤالاً حقيقياً من عميل أو اختر سؤالاً أعلاه.')} onChange={e => setQuestion(e.target.value)} /></label><button className="layla-primary" disabled={busy || !question.trim()}>{tr('See Layla’s answer','شاهد إجابة ليلى')}</button></form>
          {(profile.faqs || []).map(faq=><button key={faq.question} className="layla-secondary" disabled={busy} onClick={()=>{setQuestion(faq.question);run({action:'preview',text:faq.question});}}>{faq.question}</button>)}
          <div className="layla-quick-questions" aria-label={tr('Try a question', 'جرّب سؤالاً')}>
            {[[tr('What services do you offer?', 'ما الخدمات التي تقدمونها؟'), true], [tr('What are your opening hours?', 'ما ساعات الدوام؟'), !!profile.hours], [tr('What are your prices?', 'ما أسعاركم؟'), !!profile.prices], [tr('Can I speak to a human?', 'هل يمكنني التحدث مع موظف؟'), true]].filter(([,show]) => show).map(([text]) => <button key={text} type="button" className="layla-secondary" disabled={busy} onClick={() => { setQuestion(text); run({ action: 'preview', text }); }}>{text}</button>)}
          </div>
          {reply && <div className="layla-answer" role="status"><strong>{tr('Synthetic preview — Layla’s answer','معاينة تجريبية — إجابة ليلى')}</strong>{data?.lastPreview?.question && <p><b>{tr('You:', 'أنت:')}</b> {data.lastPreview.question}</p>}<p dir="auto">{reply}</p>
            {!!data?.lastPreview?.sourceFields?.length && <p className="layla-help">{tr('Based on your saved business facts:', 'بناءً على معلومات نشاطك المحفوظة:')} {data.lastPreview.sourceFields.map(field => ({faqs:tr('your approved answer','إجابتك المعتمدة'),services:tr('services','الخدمات'),prices:tr('prices','الأسعار'),hours:tr('opening hours','ساعات الدوام'),location:tr('location','الموقع')}[field])).join(' · ')}</p>}
          </div>}
          </details>
          {!reviewMode && data?.savedToAccount && <a className="layla-primary" href={dashboardPath(lang)}>{tr('Open your inbox', 'افتح المحادثات')}</a>}
          <button className="layla-secondary" disabled={busy} onClick={() => goTo(1)}>{tr('Back to channels', 'العودة إلى القنوات')}</button>
          {reviewMode && <p className="layla-help">{tr('Sign in to a dedicated review account to demonstrate live replies.', 'سجّل الدخول بحساب مراجعة مخصص لعرض الردود المباشرة.')}</p>}
        </section>}
        {step === 1 && data?.integration?.path === 'new_number' && data.integration.status === 'registration_required' && <form autoComplete="off" onSubmit={e => { e.preventDefault(); const body = { action: 'register_number', integration: data.integration.id, pin, confirm: true }; setPin(''); act(async () => { try { applyState(await request(body)); } finally { delete body.pin; } }); }}><p>{tr('Finish registering this separate number:','أكمل تسجيل هذا الرقم المنفصل:')} <bdi>+{data.integration.sender}</bdi></p><label>{tr('Create a six-digit WhatsApp PIN','أنشئ رمز PIN لواتساب من ستة أرقام')}<small>{tr('Choose and save your own PIN. If this number already has a two-step verification PIN, use it. This is not an SMS code.', 'اختر رمزاً واحفظه. إذا كان للرقم رمز تحقق بخطوتين، استخدم الرمز الحالي. هذا ليس رمز SMS.')}</small><input type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{6}" maxLength={6} required value={pin} onChange={e => setPin(e.target.value.replace(/\D/g,'').slice(0,6))} /></label><button className="layla-primary" disabled={busy || pin.length !== 6}>{tr('Confirm this number’s registration','تأكيد تسجيل هذا الرقم')}</button></form>}
        <footer className="layla-customer-footer"><a href={ar ? '/privacy' : '/en/privacy'}>{tr('Privacy','الخصوصية')}</a><a href="mailto:ahmed@bznsflowai.com">{tr('Need a hand?','تحتاج مساعدة؟')}</a></footer>
      </div>
    </div>
  </main>;
}
