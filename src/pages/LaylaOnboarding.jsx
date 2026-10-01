import React, { useEffect, useRef, useState } from 'react';
import { InstagramConnection } from '../components/dashboard/InstagramConnection';
// InstagramConnection and ActivationPanel render dashboard (ld-*) controls.
import '../styles/layla-dashboard.css';
import { ActivationPanel } from '../components/dashboard/ActivationPanel';
import { dashboardPath } from '../lib/dashboard/api';
import logoImg from '../assets/logo_bznsflow.png';
import { Seo } from '../components/ui/Seo';
import '../styles/layla-onboarding.css';
import { createSignupAttempt, signupOptions } from '../lib/layla-signup.js';
import { prepareFacebook } from '../lib/meta-sdk.js';
import { callApi } from '../lib/api-client.js';
import { BusinessDetailsForm } from '../components/business/BusinessDetailsForm.jsx';
import { SaveAccountPanel } from '../components/onboarding/SaveAccountPanel.jsx';
import { WhatsAppConnect, whatsappRequirements } from '../components/onboarding/WhatsAppConnect.jsx';
import { GoLiveStep } from '../components/onboarding/GoLiveStep.jsx';
import { explain as explainReason, instagramReturnMessage } from '../lib/onboarding/explanations.js';

// Three steps, one primary action each. Ids are the saved journeyStep values
// (a legacy saved 2 opens the channels step).
const STEP_ORDER = [0, 1, 3];
const EMPTY_PRESELECT = { business: '', waba: '' };
const REFRESH_INTERVAL_MS = 5000, REFRESH_ROUNDS = 12;

export default function LaylaOnboarding({ lang = 'ar', reviewMode = false }) {
  const ar = lang === 'ar';
  const tr = (en, arabic) => ar ? arabic : en;
  const [available, setAvailable] = useState(false);
  const [checking, setChecking] = useState(true);
  const heading = useRef(null);
  const [data, setData] = useState(null), [csrf, setCsrf] = useState(''), [step, setStep] = useState(0);
  const [path, setPath] = useState('coexistence'), [preselect, setPreselect] = useState(EMPTY_PRESELECT);
  const [prepared, setPrepared] = useState(null), [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [reply, setReply] = useState(null);
  const [saveOpen, setSaveOpen] = useState(false);
  // WhatsApp work starts only when the customer asks for it, so an Instagram-only
  // setup never opens a Meta attempt or spends the attempt budget.
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  // Read after mount: the page is prerendered without a query string, so
  // rendering this banner on the first pass would not match the HTML.
  const [instagramReturn, setInstagramReturn] = useState(null);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search), status = query.get('instagram');
    const text = instagramReturnMessage(status, query.get('reason'), lang);
    setInstagramReturn(text ? { ok: status === 'connected', text } : null);
  }, [lang]);
  const authCsrf = useRef('');
  async function authRequest(action, body) {
    if (!authCsrf.current) {
      const r = await fetch('/api/auth-session', {credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)}).then(r=>r.json());
      if (!r.ok) throw Error(r.reason); authCsrf.current = r.csrfToken;
    }
    const r = await fetch(action === 'code' ? '/api/auth-code' : '/api/auth-session', {method:'POST',credentials:'same-origin',signal:AbortSignal.timeout(30000),headers:{'Content-Type':'application/json','x-csrf-token':authCsrf.current},body:JSON.stringify(body)}).then(r=>r.json());
    if (!r.ok) throw Error(r.reason); return r;
  }
  async function signOut() {
    await act(async()=>{
      const session=await fetch('/api/auth-session',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)}).then(r=>r.json());
      if(!session.ok)throw Error(session.reason);
      const result=await fetch('/api/auth-session',{method:'DELETE',credentials:'same-origin',signal:AbortSignal.timeout(10000),headers:{'x-csrf-token':session.csrfToken}}).then(r=>r.json());
      if(!result.ok)throw Error(result.reason);
      setData(null);setReply(null);setPrepared(null);
      window.location.replace(`${ar? '':'/en'}/layla/setup`);
    });
  }
  const pending = useRef(null), actionBusy = useRef(false);
  // Errors appear next to the step's action, not at the top of the page, and take focus so they are seen and read.
  const errorRef = useRef(null);
  useEffect(() => { if (error) { errorRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }); errorRef.current?.focus({ preventScroll: true }); } }, [error]);
  // The path Meta's window was last prepared for automatically: at most once per
  // path, so an abandoned or failed attempt never burns the attempt budget in a loop.
  const autoPrepared = useRef(null);
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
    if (r.prepared) {
      autoPrepared.current = r.prepared.path; setWhatsappOpen(true);
      prepareFacebook(r.prepared).then(() => setPrepared(r.prepared)).catch(() => setError(explain('meta_sdk_unavailable')));
    }
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
  useEffect(() => { heading.current?.focus(); }, [step]);
  async function saveBusiness({ profile, businessName }) {
    // The channels step that follows asks for sign-in inline when it is needed.
    await act(async () => applyState(await request({ action: 'profile', profile, businessName })));
  }

  // Meta's window --------------------------------------------------------------
  async function prepare(forPath = path, forPreselect = preselect) {
    if (preparing) return;
    setPreparing(true); setError('');
    try {
      const named = forPath === 'coexistence' ? {} : Object.fromEntries(Object.entries(forPreselect).filter(([, v]) => v));
      const r = await request({ action: 'begin', path: forPath, ...named });
      await prepareFacebook(r);
      setPrepared(r);
    } catch (e) { setError(explain(e.message)); }
    finally { setPreparing(false); }
  }
  // Releases an unused prepared attempt so another can begin (the server allows one at a time).
  async function discardPrepared() {
    const current = prepared;
    if (!current || pending.current) return;
    setPreparing(true);
    try { await request({ action: 'cancel', attempt: current.attempt, state: current.state }); }
    catch (e) { if (e.message !== 'attempt_expired') setError(explain('cancel_failed')); }
    finally { setPrepared(null); setPreparing(false); }
  }
  function changePath(next) {
    if (next === path) return;
    setPath(next);
    if (prepared && prepared.path !== next) discardPrepared();
  }
  function changePreselect(next) {
    setPreselect(next);
    if (prepared) discardPrepared();
  }
  // Signed in with a setup still only in this browser: attach it to the account once, automatically,
  // so connecting a channel is never blocked behind a button the owner has to find.
  const claimTried = useRef(false);
  useEffect(() => {
    if (reviewMode || claimTried.current || busy || checking || !data?.account || data.savedToAccount || !data.profile || !data.accountSaveAvailable) return;
    claimTried.current = true;
    run({ action: 'claim_draft' });
  }, [data?.account, data?.savedToAccount, data?.profile, busy, checking]);
  const ready = whatsappRequirements({ data, available, reviewMode }).every(([, ok]) => ok);
  const hasPreselect = path !== 'coexistence' && (preselect.business || preselect.waba);
  const canAutoPrepare = whatsappOpen && step === 1 && !checking && ready && !prepared && !preparing && !busy && !hasPreselect &&
    !data?.integration && !data?.selection && !data?.ownerConnectAvailable && !['reconciliation_required', 'verifying'].includes(data?.status);
  useEffect(() => {
    if (!canAutoPrepare || autoPrepared.current === path) return;
    autoPrepared.current = path;
    prepare(path, preselect);
  }, [canAutoPrepare, path]);
  useEffect(() => {
    if (!prepared) return;
    const receive = event => pending.current?.message(event);
    window.addEventListener('message', receive);
    const timer = setTimeout(() => {
      if (pending.current) pending.current.cancel('attempt_expired');
      else setPrepared(null);
    }, Math.max(0, prepared.expiresAt - Date.now()));
    return () => { window.removeEventListener('message', receive); clearTimeout(timer); };
  }, [prepared]);
  useEffect(() => {
    if (step !== 1 || !data?.integration || !['reconciliation_required','verifying'].includes(data.status)) return;
    let rounds = 0;
    const timer = setInterval(() => {
      if (++rounds > REFRESH_ROUNDS) { clearInterval(timer); return; }
      if (document.visibilityState === 'visible' && !actionBusy.current && !pending.current) run({action:'refresh'});
    }, REFRESH_INTERVAL_MS);
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
      failed: (reason, reference) => {
        pending.current = null; setPrepared(null); setBusy(false);
        setError(reference ? `${explain(reason)} ${tr('Meta reference:', 'مرجع Meta:')} ${reference}` : explain(reason));
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
    // Must stay synchronous inside this click, or the browser blocks Meta's popup.
    try { window.FB.login(attempt.callback, signupOptions(prepared)); }
    catch { attempt.cancel('popup_blocked'); }
    finally { window.open = originalOpen; if (!captured) attempt.cancel('popup_blocked'); }
  }
  async function leaveChannels(journeyStep) {
    await discardPrepared();
    return run({ action: 'save_progress', journeyStep });
  }
  const goTo = journeyStep => run({ action: 'save_progress', journeyStep });

  const steps = { 0: tr('Your business', 'نشاطك التجاري'), 1: tr('Connect your channels', 'ربط قنواتك'), 3: tr('Go live', 'التشغيل') };
  // journeyStep ids are not in the order the customer walks them.
  const currentPosition = Math.max(0, STEP_ORDER.indexOf(step));
  const needsAccount = !reviewMode && !data?.savedToAccount;
  const errorNote = error ? <p ref={errorRef} tabIndex={-1} className="layla-error" role="alert">{error}</p> : null;
  const saveProps = { lang, tr, data, busy, act, authRequest,
    onSignedIn: async () => { applyState(await request()); applyState(await request({ action: 'claim_draft' })); setSaveOpen(false); },
    onClaim: () => run({ action: 'claim_draft' }) };
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
        {data?.profile && <p className={data.savedToAccount ? 'layla-saved' : 'layla-saved layla-saved--preview'}>{data.savedToAccount ? tr('Saved to your account', 'محفوظ في حسابك') : tr('Preview saved in this browser for 24 hours.', 'المعاينة محفوظة في هذا المتصفح لمدة ٢٤ ساعة.')}</p>}
        {saveOpen && step !== 1 && needsAccount && <SaveAccountPanel {...saveProps} />}
        {step !== 0 && step !== 1 && errorNote}
        {step === 0 && <BusinessDetailsForm key={data?.profileVersion ?? 'new'} lang={lang} mode="onboarding" initial={{ profile: data?.profile, businessName: data?.profile?.businessName }} busy={busy || checking} onSubmit={saveBusiness}
          submitLabel={checking ? tr('Checking secure setup…','جارٍ التحقق من الإعداد الآمن…') : tr('Save and continue','احفظ وتابع')}>
          {errorNote}
          {!checking && !available && <p className="layla-notice layla-notice--progress" role="status">{tr('Your business facts are saved securely for 24 hours without a BznsFlow login. Meta connection is waiting for verified Blue test setup.', 'تُحفظ معلومات نشاطك بأمان لمدة ٢٤ ساعة دون تسجيل دخول إلى BznsFlow. ينتظر ربط Meta التحقق من إعداد الاختبار في Blue.')}</p>}
        </BusinessDetailsForm>}
        {step === 1 && <section className="layla-channel-stage">
          <p>{tr('Choose Instagram, WhatsApp, or both. Each connection has its own reply controls.', 'اختر إنستغرام أو واتساب أو كليهما. لكل اتصال أدوات مستقلة للتحكم بالردود.')}</p>
          {needsAccount && !data?.account && <SaveAccountPanel {...saveProps} />}
          {needsAccount && !data?.account && errorNote}
          {!needsAccount && !reviewMode && <InstagramConnection lang={lang} showInbox />}
          <WhatsAppConnect tr={tr} explain={explain} open={whatsappOpen} onOpen={() => setWhatsappOpen(true)} data={data} busy={busy} available={available} reviewMode={reviewMode}
            prepared={prepared} preparing={preparing} path={path} onPathChange={changePath} preselect={preselect} onPreselectChange={changePreselect}
            onPrepare={() => { autoPrepared.current = path; prepare(); }} onConnect={connect} onCancelAttempt={reason => pending.current?.cancel(reason)}
            run={run} act={act} request={request} applyState={applyState}
            errorNote={needsAccount && !data?.account ? null : errorNote} onClaim={() => run({ action: 'claim_draft' })} />
          <button className="layla-secondary" disabled={busy} onClick={() => leaveChannels(0)}>{tr('Back to business details','العودة إلى معلومات النشاط')}</button>
          <button className="layla-primary" disabled={busy} onClick={() => leaveChannels(3)}>{tr('Continue to go live', 'متابعة إلى التشغيل')}</button>
        </section>}
        {step === 3 && <GoLiveStep lang={lang} tr={tr} data={data} busy={busy} reviewMode={reviewMode} act={act} request={request} applyState={applyState} run={run} reply={reply} onBack={() => goTo(1)} />}
        {!reviewMode && data?.savedToAccount && data?.integration && <ActivationPanel key={`${data.account?.email}:${data.integration.id}`} lang={lang} setup={data}/>}
        <footer className="layla-customer-footer"><a href={ar ? '/privacy' : '/en/privacy'}>{tr('Privacy','الخصوصية')}</a><a href="mailto:ahmed@bznsflowai.com">{tr('Need a hand?','تحتاج مساعدة؟')}</a></footer>
      </div>
    </div>
  </main>;
}
