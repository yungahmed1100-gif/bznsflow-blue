import React, { useEffect, useRef, useState } from 'react';
import { ActivationPanel } from '../components/dashboard/ActivationPanel';
import { dashboardPath } from '../lib/dashboard/api';
import logoImg from '../assets/logo_bznsflow.png';
import { Seo } from '../components/ui/Seo';
import '../styles/layla-onboarding.css';
import { signupOptions, signupInit, createSignupAttempt } from '../lib/layla-signup.js';
import { INDUSTRIES } from '../lib/industries.js';
import { prefillFor, isSectorDefaultService } from '../lib/sector-prefill.generated.js';
import { readCatalogFile } from '../lib/catalog-import.js';
import { portfolioStatus } from '../lib/portfolio.js';
import { callApi } from '../lib/api-client.js';

const blank = { sector: '', services: '', prices: '', hours: '', location: '', humanContact: '', reviewed: false };
const COUNTRY_CODES = [['968','Oman / عُمان'],['20','Egypt / مصر'],['971','UAE / الإمارات'],['966','Saudi Arabia / السعودية'],['973','Bahrain / البحرين'],['974','Qatar / قطر'],['965','Kuwait / الكويت'],['962','Jordan / الأردن'],['44','United Kingdom / المملكة المتحدة'],['1','United States / الولايات المتحدة']];
const explanations = {
  sign_in_required: 'Save your setup with a verified email before connecting WhatsApp.', customer_invitation_required: 'The review path is open to Meta reviewers without a BznsFlow invitation.',
  customer_onboarding_not_enabled: 'The review path is open without a BznsFlow invitation. Meta connection is waiting for the Blue test configuration.',
  coexistence_not_verified: 'Meta has not confirmed that this number can stay in the WhatsApp Business app. Your app has not been disconnected.',
  business_app_requires_coexistence: 'This number uses WhatsApp Business. Choose “Keep using my WhatsApp Business app.”',
  onboarding_in_progress_or_limited: 'A connection is already in progress, or you have reached the attempt limit. Finish the current connection or try again later.',
  draft_not_claimable: 'Finish or cancel the current Meta operation, then save your setup again. Your account is already signed in.',
  too_soon: 'Please wait one minute before requesting another code.', too_many: 'Too many attempts. Please wait before trying again.', code_invalid: 'This sign-in code is invalid or expired. Check it or request a new code.', send_failed: 'The sign-in email could not be confirmed. Please wait before requesting another code.', account_unavailable: 'Account saving is not available yet. Your website preview still works.', refresh_throttled: 'Please wait a few seconds before checking again.', profile_changed: 'Your business facts changed. Try the answer again before approving it.',
  test_routing_not_verified: 'This number has an existing connection. Assisted setup is needed to preserve its routing.', meta_connection_unavailable: 'Meta’s connection could not be confirmed. Check again or contact support with the reference below.',
  website_url_invalid: 'Use a public HTTPS website address.', website_unavailable: 'This page could not be read. Paste your business facts instead.', website_empty: 'No readable text was found. Paste your facts instead.', website_too_large: 'This page is too large to import. Paste a short excerpt instead.', website_redirect_limit: 'This website redirects too many times. Use its final page address.',
  catalog_file_too_large:'Use a file smaller than 15 MB.',catalog_file_type:'Use PDF, CSV, XLSX, DOCX, TXT, JPG, PNG or WebP.',catalog_file_empty:'No readable catalog information was found.',
  catalog_limit:'A catalog can contain up to 1,000 active services or products.',invalid_catalog_entry:'Review the extracted item name and price, then try again.',catalog_unavailable:'The catalog could not be saved. Please try again.',
  owner_connection_unavailable: 'Direct connection is only available to the BznsFlow owner account while its server credential is configured.',
  customer_live_release_pending_review: 'Automatic customer replies will become available after Meta approval and our connection checks.',
  asset_in_use: 'This WhatsApp number or business account is already connected to another BznsFlow account. Sign in with that account, or choose a different number.',
  attempt_limit: 'This setup has reached its connection attempt limit. Contact ahmed@bznsflowai.com with the reference below.',
  attempt_expired: 'The Meta connection expired. Please prepare a new connection.', attempt_used: 'This Meta connection attempt was already used. Please prepare a new connection.',
  operation_conflict: 'Another connection step is still running. Reload to check your setup before retrying.', session_expired: 'Your setup session expired. Reload the page to continue.',
  invalid_signup_result: 'Meta did not return the WhatsApp business account and number you chose. Check any IDs you entered, then retry and select both.',
  token_permissions_incomplete: 'Meta did not grant every permission Layla needs. Retry and keep all requested permissions selected.',
  waba_not_granted: 'The selected WhatsApp business account was not shared with BznsFlow. Retry and select it in the Meta window.',
  phone_not_in_customer_waba: 'The selected number does not belong to the shared WhatsApp business account. Retry and choose a number from that account.',
  sender_not_verified: 'Meta has not confirmed this number’s details yet. Please try again in a few minutes.',
};
const arabicExplanations = {
  website_url_invalid:'استخدم رابط HTTPS لموقع عام.', website_unavailable:'تعذّرت قراءة الصفحة. الصق معلومات نشاطك بدلاً من ذلك.', website_empty:'لم نجد نصاً قابلاً للقراءة. الصق المعلومات مباشرة.', website_too_large:'الصفحة كبيرة جداً. الصق مقتطفاً قصيراً.', website_redirect_limit:'تحويلات كثيرة في الرابط. استخدم الرابط النهائي للصفحة.',
  catalog_file_too_large:'استخدم ملفاً أصغر من ١٥ ميجابايت.',catalog_file_type:'استخدم PDF أو CSV أو XLSX أو DOCX أو TXT أو JPG أو PNG أو WebP.',catalog_file_empty:'لم نجد معلومات كتالوج قابلة للقراءة.',
  catalog_limit:'يمكن أن يحتوي الكتالوج على ١٠٠٠ خدمة أو منتج نشط كحد أقصى.',invalid_catalog_entry:'راجع اسم العنصر وسعره المستخرج ثم حاول مجدداً.',catalog_unavailable:'تعذّر حفظ الكتالوج. حاول مجدداً.',
  sign_in_required:'احفظ إعدادك ببريد إلكتروني موثّق قبل ربط واتساب.',
  account_unavailable:'حفظ الحساب غير متاح حالياً. يمكنك متابعة المعاينة.', send_failed:'تعذّر تأكيد إرسال رمز الدخول. انتظر قبل طلب رمز جديد.',
  code_invalid:'رمز الدخول غير صحيح أو انتهت صلاحيته.', too_soon:'انتظر دقيقة قبل طلب رمز آخر.', too_many:'محاولات كثيرة. انتظر قبل إعادة المحاولة.',
  refresh_throttled:'انتظر بضع ثوانٍ قبل التحقق مجدداً.', profile_changed:'تغيّرت معلومات النشاط. جرّب الإجابة مجدداً قبل اعتمادها.',
  test_routing_not_verified:'الرقم مرتبط بإعداد آخر. نحتاج إلى مساعدتك على الربط دون تعطيل الاتصال الحالي.',
  meta_connection_unavailable:'تعذّر تأكيد اتصال Meta. تحقّق من الاتصال أو تواصل معنا برقم المرجع أدناه.',
  coexistence_not_verified:'لم تؤكد Meta أهلية الرقم للاستخدام المتزامن. لم نفصل تطبيقك.',
  attempt_expired:'انتهت مهلة ربط Meta. جهّز محاولة جديدة.', popup_blocked:'اسمح بنافذة فيسبوك المنبثقة ثم حاول مجدداً.',
  meta_cancelled:'أُلغيت محاولة ربط Meta. يمكنك المحاولة مجدداً.', permission_rejected:'رُفضت أذونات Meta. راجعها وأعد المحاولة.', missing_code:'لم ترسل Meta رمز الربط. أعد المحاولة.',
  owner_connection_unavailable:'الربط المباشر متاح فقط لحساب مالك BznsFlow عند إعداد بيانات اعتماد الخادم.',
  asset_in_use:'رقم واتساب هذا أو حساب الأعمال مرتبط بحساب آخر في BznsFlow. سجّل الدخول بذلك الحساب، أو اختر رقماً مختلفاً.',
  attempt_limit:'بلغ هذا الإعداد الحد الأقصى لمحاولات الربط. تواصل مع ahmed@bznsflowai.com برقم المرجع أدناه.',
  attempt_used:'استُخدمت محاولة ربط Meta هذه من قبل. جهّز محاولة جديدة.', operation_conflict:'خطوة ربط أخرى ما زالت قيد التنفيذ. أعد تحميل الصفحة للتحقق قبل المحاولة.',
  session_expired:'انتهت جلسة الإعداد. أعد تحميل الصفحة للمتابعة.', invalid_signup_result:'لم ترسل Meta حساب واتساب للأعمال والرقم اللذين اخترتهما. تحقّق من المعرّفات التي أدخلتها ثم أعد المحاولة واختر كليهما.',
  token_permissions_incomplete:'لم تمنح Meta كل الأذونات التي تحتاجها ليلى. أعد المحاولة وأبقِ جميع الأذونات المطلوبة محددة.',
  waba_not_granted:'لم يُشارَك حساب أعمال واتساب المحدد مع BznsFlow. أعد المحاولة واختره في نافذة Meta.',
  phone_not_in_customer_waba:'الرقم المحدد لا يتبع حساب الأعمال المشارَك. أعد المحاولة واختر رقماً من ذلك الحساب.',
  sender_not_verified:'لم تؤكد Meta تفاصيل هذا الرقم بعد. حاول مجدداً بعد بضع دقائق.',
  business_app_requires_coexistence:'هذا الرقم يستخدم تطبيق واتساب للأعمال. اختر «الاستمرار في استخدام تطبيق واتساب للأعمال».',
};
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
  const [profile, setProfile] = useState(blank), [businessName, setName] = useState(''), [path, setPath] = useState('coexistence');
  const [industryId, setIndustryId] = useState('other');
  const [contactMode, setContactMode] = useState('whatsapp'), [countryCode, setCountryCode] = useState('968'), [contactValue, setContactValue] = useState('');
  function inferIndustry(value) { const found = INDUSTRIES.find(item => item.en === value || item.ar === value); return found?.id || 'other'; }
  function contactText() { if (!contactValue.trim()) return ''; return contactMode === 'email' ? contactValue.trim() : `+${countryCode}${contactValue.replace(/\D/g, '')}`; }
  const [prepared, setPrepared] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [question, setQuestion] = useState(''), [reply, setReply] = useState(null);
  const [pin, setPin] = useState('');
  const [preBusiness, setPreBusiness] = useState(''), [preWaba, setPreWaba] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState(''), [imported, setImported] = useState(null);
  const [importingFile,setImportingFile]=useState(false);
  const [catalogTab,setCatalogTab]=useState('services'),[catalog,setCatalog]=useState([]),[catalogLoaded,setCatalogLoaded]=useState(false),[catalogCursor,setCatalogCursor]=useState(null),[selectedCatalogKey,setSelectedCatalogKey]=useState('');
  const [catalogDraft,setCatalogDraft]=useState({nameEn:'',nameAr:'',benefitEn:'',benefitAr:'',descriptionEn:'',descriptionAr:'',category:'',availability:'',priceType:'fixed',priceLabel:'',currency:'OMR',unit:''});
  const [faqQuestion, setFaqQuestion] = useState(''), [faqAnswer, setFaqAnswer] = useState('');
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
    if (data?.account && !data?.savedToAccount) act(async()=>applyState(await request({action:'claim_draft'})));
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
  function explain(reason) { return ar ? arabicExplanations[reason] || 'تعذّر إكمال الخطوة. يبقى إعدادك محفوظاً. حاول مجدداً أو تواصل معنا.' : explanations[reason] || 'We could not finish that step. Your setup is saved. Please try again or contact ahmed@bznsflowai.com.'; }
  async function request(body) {
    const surface = reviewMode ? 'customer-review' : 'customer';
    // 60s: signup and website import both wait on Meta or a third-party site.
    return callApi(`/api/layla-meta?surface=${surface}`, { body, csrf, timeout: 60000 });
  }
  async function act(task) { if (actionBusy.current) return; actionBusy.current = true; setBusy(true); setError(''); try { await task(); } catch (e) { setError(explain(e.message)); } finally { actionBusy.current = false; setBusy(false); } }
  function applyState(r) {
    // Returning from the dashboard sign-in: a saved, connected account goes straight back.
    if (!reviewMode && new URLSearchParams(window.location.search).get('next') === 'dashboard') {
      if (r.account && r.savedToAccount && ['connected', 'paused'].includes(r.integration?.status)) { window.location.replace(dashboardPath(lang)); return; }
      if (!r.account) setSaveOpen(true);
    }
    setData(r); setAvailable(r.available === true); setCsrf(r.csrfToken || '');
    setReply(r.lastPreview?.text || null);
    setPath(r.integration?.path || r.prepared?.path || 'coexistence');
    setStep(r.journeyStep ?? (r.profile ? 2 : 0));
    if (r.prepared) prepareFacebook(r.prepared).then(() => setPrepared(r.prepared)).catch(() => setError('Meta could not load. Reload to retry.'));
    if (r.profile) {
      setProfile(r.profile); setName(r.profile.businessName); setIndustryId(inferIndustry(r.profile.sector));
      const raw = r.profile.humanContact || '';
      if (raw.includes('@')) { setContactMode('email'); setContactValue(raw); }
      else {
        const digits = raw.replace(/\D/g, '');
        const country = [...COUNTRY_CODES].sort((a,b) => b[0].length-a[0].length).find(([code]) => digits.startsWith(code));
        setContactMode('whatsapp'); setCountryCode(country?.[0] || '968'); setContactValue(country ? digits.slice(country[0].length) : digits);
      }

    }
  }
  async function loadCatalog(cursor=0){const r=await request({action:'catalog_list',cursor,limit:50});setCatalog(current=>cursor?[...current,...(r.catalog.entries||[])]:r.catalog.entries||[]);setCatalogCursor(r.catalog.cursor);setCatalogLoaded(true);}
  async function saveCatalogDraft(source='manual',value=catalogDraft){
    const selected=catalog.find(item=>item.entryKey===(value.entryKey||selectedCatalogKey));
    const addingPrice=catalogTab==='prices'&&selected;
    const nextPrice=value.priceLabel?{type:value.priceType||'fixed',currency:value.currency||'OMR',unit:value.unit||'',label:value.priceLabel}:null;
    const entry={entryKey:value.entryKey||selected?.entryKey||crypto.randomUUID(),kind:value.kind||selected?.kind||'service',nameEn:value.nameEn||selected?.nameEn||'',nameAr:value.nameAr||selected?.nameAr||'',category:value.category||selected?.category||'',benefitEn:value.benefitEn||selected?.benefitEn||'',benefitAr:value.benefitAr||selected?.benefitAr||'',descriptionEn:value.descriptionEn||selected?.descriptionEn||'',descriptionAr:value.descriptionAr||selected?.descriptionAr||'',availability:value.availability||selected?.availability||'',prices:addingPrice?[...(selected.prices||[]),nextPrice].filter(Boolean).slice(0,20):(value.prices||[]).length?value.prices:(nextPrice?[nextPrice]:[]),source:String(source).slice(0,700),confidence:source==='manual'?1:Number(value.confidence||.7),laylaUseEn:value.laylaUseEn||selected?.laylaUseEn||'Answer customer questions about this service and its approved price.',laylaUseAr:value.laylaUseAr||selected?.laylaUseAr||'الإجابة عن أسئلة العملاء حول هذه الخدمة وسعرها المعتمد.',sortOrder:selected?.sortOrder??catalog.length};
    await request({action:'catalog_save',entry});setCatalogDraft({nameEn:'',nameAr:'',benefitEn:'',benefitAr:'',descriptionEn:'',descriptionAr:'',category:'',availability:'',priceType:'fixed',priceLabel:'',currency:'OMR',unit:''});setSelectedCatalogKey('');await loadCatalog();
  }
  async function saveImportedCatalog(){
    const values=(imported?.extracted?.entries||[]).slice(0,Math.max(0,1000-catalog.length)).map((value,index)=>({entryKey:crypto.randomUUID(),kind:value.kind||'service',nameEn:value.nameEn||'',nameAr:value.nameAr||'',category:value.category||'',benefitEn:value.benefitEn||'',benefitAr:value.benefitAr||'',descriptionEn:value.descriptionEn||'',descriptionAr:value.descriptionAr||'',availability:value.availability||'',prices:(value.prices||[]).slice(0,20),source:String(imported.url).slice(0,700),confidence:Number(value.confidence||.7),laylaUseEn:value.laylaUseEn||'Answer customer questions about this service and its approved price.',laylaUseAr:value.laylaUseAr||'الإجابة عن أسئلة العملاء حول هذه الخدمة وسعرها المعتمد.',sortOrder:catalog.length+index}));
    for(let index=0;index<values.length;index+=25)await request({action:'catalog_save_many',entries:values.slice(index,index+25)});
    await loadCatalog();
  }
  useEffect(() => {
    let active = true;
    if(reviewMode && window.location.hash.startsWith('#access=')) {
      let access=window.location.hash.slice(8);
      window.history.replaceState(null,'',window.location.pathname);
      authRequest('session',{reviewAccess:access}).then(()=>window.location.replace(`${ar?'':'/en'}/layla/setup`)).catch(()=>{if(active){setError(tr('Reviewer access expired or could not be verified.','انتهى رابط المراجعة أو تعذّر التحقق منه.'));setChecking(false);}}).finally(()=>{access=undefined;});
      return()=>{active=false;};
    }
    request().then(r => { if (active) applyState(r); }).catch(() => {
      if (active) setError(tr('We could not restore your saved setup. Reload to try again.', 'تعذّر استعادة إعدادك المحفوظ. أعد تحميل الصفحة للمحاولة مجدداً.'));
    }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; pending.current?.dispose(); pending.current = null; };
  }, []);
  useEffect(() => { heading.current?.focus(); setPin(''); }, [step]);
  useEffect(()=>{if(data?.account&&data?.savedToAccount&&csrf&&!catalogLoaded&&!actionBusy.current)loadCatalog().catch(()=>{});},[data?.account?.email,data?.savedToAccount,csrf,catalogLoaded]);
  async function saveBusiness() {
    await act(async () => {
      const r = await request({ action: 'profile', profile: { ...profile, humanContact: contactText() }, businessName });
      applyState(r);
    });
  }
  function goTo(journeyStep) { return act(async () => applyState(await request({ action: 'save_progress', journeyStep }))); }
  useEffect(() => {
    if (!prepared) return;
    const receive = event => pending.current?.message(event);
    window.addEventListener('message', receive);
    const timer = setTimeout(() => {
      if (pending.current) pending.current.cancel('attempt_expired');
      else { setPrepared(null); setBusy(false); setError('The Meta connection expired. Please prepare a new connection.'); }
    }, Math.max(0, prepared.expiresAt - Date.now()));
    return () => { window.removeEventListener('message', receive); clearTimeout(timer); };
  }, [prepared]);
  useEffect(() => {
    if (step !== 1 || !data?.integration || !['reconciliation_required','verifying'].includes(data.status)) return;
    let rounds = 0;
    const timer = setInterval(() => {
      if (++rounds > 12) { clearInterval(timer); return; }
      if (document.visibilityState === 'visible' && !actionBusy.current && !pending.current) act(async () => applyState(await request({action:'refresh'})));
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
        const errors = {attempt_expired:'The Meta connection expired. Please prepare a new connection.',permission_rejected:'Meta permissions were declined. Please review the requested permissions and retry.',missing_code:'Meta did not return a connection code. Please retry.',meta_cancelled:'The Meta connection was cancelled. You can try again.',popup_blocked:'Allow the Facebook popup, then try again.'};
        setError(ar ? explain(reason) : errors[reason] || 'Meta could not finish the connection. Please try again.');
        // Release the durable unclaimed attempt. A failed cancellation remains
        // visible and expires server-side; it never triggers a second exchange.
        request({action:'cancel',attempt:prepared.attempt,state:prepared.state}).catch(error => setError(error.message === 'attempt_expired' ? 'The Meta connection expired. Please prepare a new connection.' : 'Cancellation could not be saved. Reload to check your setup before retrying.'));
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
  const steps = [tr('Your business', 'نشاطك التجاري'), tr('Connect WhatsApp', 'ربط واتساب'), tr('Try the answers', 'جرّب الإجابات'), tr('Your setup', 'إعدادك')];
  const tailored = prefillFor(industryId, lang);
  const sectorFaqSuggestions = tailored.questions.filter(q => !(profile.faqs || []).some(faq => faq.question === q));
  // Changing sector replaces the service summary only while it is still
  // boilerplate. Once the customer has written their own, it is never clobbered.
  function selectSector(id) {
    setIndustryId(id);
    const next = INDUSTRIES.find(item => item.id === id);
    const suggested = prefillFor(id, lang).service;
    setProfile(current => ({
      ...current,
      sector: next?.[lang] || next?.en || '',
      services: isSectorDefaultService(current.services) ? suggested : current.services,
      reviewed: false,
    }));
  }
  return <main className="layla-customer" dir={ar ? 'rtl' : 'ltr'} lang={lang}>
    <Seo lang={lang} title={tr('Set up Layla | BznsFlow', 'إعداد ليلى | BznsFlow')} description={tr('Connect your business to Layla.', 'اربط نشاطك التجاري بليلى.')} noindex />
    <header className="layla-customer-nav"><a href={ar ? '/' : '/en'} aria-label="BznsFlow"><img src={logoImg} alt="" width="40" height="40" />BznsFlow</a><nav aria-label={tr('Page navigation','التنقل في الصفحة')}><a className="layla-back-home" href={ar ? '/' : '/en'}>{tr('Back to main website','العودة إلى الموقع الرئيسي')}</a><a href={`${ar ? '/en' : ''}/layla/${reviewMode ? 'review' : 'setup'}`} lang={ar ? 'en' : 'ar'}>{ar ? 'English' : 'العربية'}</a></nav></header>
    <div className="layla-customer-layout">
      <aside className="layla-intro">
        <h1>{tr('Meet your new front desk.', 'تعرّف على موظفة استقبالك الجديدة.')}</h1>
        <p>{tr('Teach Layla about your business. Connect WhatsApp. Review her answers before she starts.', 'عرّف ليلى على نشاطك، واربط واتساب، ثم راجع إجاباتها قبل أن تبدأ.')}</p>
        <img src="/images/layla-onboarding-transparent.png" width="768" height="1376" alt={tr('Layla, wearing a teal jacket and a headset', 'ليلى ترتدي سترة بلون أزرق مخضر وسماعة رأس')} fetchpriority="high" />
        <p className="layla-intro-note">{tr('Your business. Your number. You stay in control.', 'نشاطك. رقمك. والقرار دائماً لك.')}</p>
      </aside>
      <div className="layla-workspace">
        <ol className="layla-customer-steps">{[0,2,1,3].map((i, position) => <li key={steps[i]} aria-current={step === i ? 'step' : undefined}><span aria-hidden="true">{position + 1}</span>{steps[i]}</li>)}</ol>
        <h2 ref={heading} tabIndex={-1}>{steps[step]}</h2>
        {data?.account && <p>{tr('Signed in as','تم الدخول باسم')} {data.account.email} <button className="layla-secondary" disabled={busy} onClick={signOut}>{tr('Sign out / Use another account','تسجيل الخروج / استخدام حساب آخر')}</button></p>}
        {error && <p className="layla-error" role="alert">{error}</p>}
        {data?.profile && <p className="layla-help">{data.savedToAccount ? tr('Saved to your account', 'محفوظ في حسابك') : tr('Preview saved in this browser for 24 hours.', 'المعاينة محفوظة في هذا المتصفح لمدة ٢٤ ساعة.')}</p>}
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
        {step === 0 && <form onSubmit={e => { e.preventDefault(); saveBusiness(); }}>
          <p>{tr('Give Layla the facts your customers ask about. You can edit these later.', 'زوّد ليلى بالمعلومات التي يسأل عنها عملاؤك. يمكنك تعديلها لاحقاً.')}</p>
          <label>{tr('Business name', 'اسم النشاط')}<input required maxLength={100} autoComplete="organization" value={businessName} onChange={e => { setName(e.target.value); setProfile({ ...profile, reviewed: false }); }} /></label>
          <label>{tr('What does your business do?', 'ما مجال نشاطك؟')}
            <select className="layla-suggestion" required value={industryId} onChange={e => selectSector(e.target.value)}>
              <option value="">{tr('Choose your business type', 'اختر نوع نشاطك')}</option>
              {INDUSTRIES.map(item => <option key={item.id} value={item.id}>{item[lang] || item.en}</option>)}
            </select>
            {industryId === 'other' && <textarea required maxLength={350} rows={2} value={profile.sector} placeholder={tr('Describe your business in a few words', 'صف نشاطك بكلمات قليلة')} onChange={e => setProfile({ ...profile, sector: e.target.value, reviewed: false })} />}
          </label>
          <label>{tr('Short service summary', 'ملخص الخدمات')}
            <textarea required maxLength={350} rows={3} value={profile.services} placeholder={tr('A short summary for immediate replies. Add the full catalog below.', 'ملخص قصير للردود الفورية. أضف الكتالوج الكامل أدناه.')} onChange={e => setProfile({ ...profile, services: e.target.value, reviewed: false })} />
          </label>
          {/* The summary arrives pre-filled from the sector. Say so plainly, so an
              industry description is not mistaken for a description of this
              business — and offer the suggestion back if they clear it. */}
          {isSectorDefaultService(profile.services)
            ? <small className="layla-field-help">{tr('This is a suggestion for your industry — edit it so it describes your business.', 'هذا اقتراح لمجال نشاطك — عدّله ليصف نشاطك أنت.')}</small>
            : <button type="button" className="layla-secondary" disabled={busy} onClick={() => setProfile({ ...profile, services: tailored.service, reviewed: false })}>{tr('Restore the suggested summary', 'استعادة الملخص المقترح')}</button>}
          {data?.savedToAccount&&<section className="layla-answer" aria-labelledby="catalog-heading"><h3 id="catalog-heading">{tr('Services & prices','الخدمات والأسعار')}</h3><div className="layla-quick-questions"><button type="button" className={catalogTab==='services'?'layla-primary':'layla-secondary'} onClick={()=>setCatalogTab('services')}>{tr('Services','الخدمات')}</button><button type="button" className={catalogTab==='prices'?'layla-primary':'layla-secondary'} onClick={()=>setCatalogTab('prices')}>{tr('Prices','الأسعار')}</button></div>
            <p>{tr('Add up to 1,000 services or products. Imported information stays a draft until you publish it.','أضف حتى ١٠٠٠ خدمة أو منتج. تبقى المعلومات المستوردة مسودة حتى تنشرها.')}</p>
            {catalogTab==='services'?<><label>{tr('Service name in English','اسم الخدمة بالإنجليزية')}<input maxLength={160} value={catalogDraft.nameEn} onChange={e=>setCatalogDraft({...catalogDraft,nameEn:e.target.value})}/></label><label>{tr('Service name in Arabic','اسم الخدمة بالعربية')}<input dir="rtl" maxLength={160} value={catalogDraft.nameAr} onChange={e=>setCatalogDraft({...catalogDraft,nameAr:e.target.value})}/></label><label>{tr('How does it help customers?','كيف تساعد العملاء؟')}<textarea maxLength={700} value={ar?catalogDraft.benefitAr:catalogDraft.benefitEn} onChange={e=>setCatalogDraft({...catalogDraft,[ar?'benefitAr':'benefitEn']:e.target.value})}/></label><label>{tr('Details Layla may explain','تفاصيل يمكن لليلى شرحها')}<textarea maxLength={700} value={ar?catalogDraft.descriptionAr:catalogDraft.descriptionEn} onChange={e=>setCatalogDraft({...catalogDraft,[ar?'descriptionAr':'descriptionEn']:e.target.value})}/></label></>:<><label>{tr('Choose a service','اختر خدمة')}<select required value={selectedCatalogKey} onChange={e=>setSelectedCatalogKey(e.target.value)}><option value="">{tr('Select an existing service','اختر خدمة موجودة')}</option>{catalog.map(item=><option key={item.entryKey} value={item.entryKey}>{(ar?item.nameAr:item.nameEn)||item.nameEn||item.nameAr}</option>)}</select></label><label>{tr('Price type','نوع السعر')}<select value={catalogDraft.priceType} onChange={e=>setCatalogDraft({...catalogDraft,priceType:e.target.value})}>{[['fixed',tr('Fixed','ثابت')],['from',tr('Starting from','ابتداءً من')],['range',tr('Range','نطاق')],['free',tr('Free','مجاني')],['quote',tr('Quote required','بحسب عرض السعر')],['recurring',tr('Recurring','متكرر')],['unavailable',tr('Not available','غير متاح')]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label>{tr('Displayed price','السعر المعروض')}<input maxLength={160} placeholder={tr('Example: From 20 OMR','مثال: ابتداءً من ٢٠ ر.ع.')} value={catalogDraft.priceLabel} onChange={e=>setCatalogDraft({...catalogDraft,priceLabel:e.target.value})}/></label><label>{tr('Currency','العملة')}<select value={catalogDraft.currency} onChange={e=>setCatalogDraft({...catalogDraft,currency:e.target.value})}>{['OMR','AED','SAR','USD'].map(v=><option key={v}>{v}</option>)}</select></label></>}
            <button type="button" className="layla-primary" disabled={busy||(catalogTab==='services'?!(catalogDraft.nameEn.trim()||catalogDraft.nameAr.trim()):!selectedCatalogKey||!catalogDraft.priceLabel.trim())} onClick={()=>act(()=>saveCatalogDraft())}>{catalogTab==='services'?tr('Add service','إضافة خدمة'):tr('Add price','إضافة سعر')}</button>
            {catalog.map(item=><div className="layla-faq" key={item.entryKey}><strong>{(ar?item.nameAr:item.nameEn)||item.nameEn||item.nameAr}</strong><p>{(ar?item.benefitAr:item.benefitEn)||item.descriptionEn||item.descriptionAr}</p>{item.prices?.map((p,i)=><p key={i}>{p.label}</p>)}<small>{item.status==='approved'?tr('Approved','معتمد'):tr('Draft','مسودة')}</small><button type="button" className="layla-secondary" onClick={()=>act(async()=>{await request({action:'catalog_archive',entryKey:item.entryKey});await loadCatalog();})}>{tr('Archive','أرشفة')}</button></div>)}
            {!!catalog.length&&<button type="button" className="layla-secondary" disabled={busy} onClick={()=>act(async()=>{await request({action:'catalog_publish'});await loadCatalog();})}>{tr('Approve and publish catalog','اعتماد ونشر الكتالوج')}</button>}
            {catalogCursor!==null&&<button type="button" className="layla-secondary" disabled={busy} onClick={()=>act(()=>loadCatalog(catalogCursor))}>{tr('Load more services','عرض خدمات إضافية')}</button>}
          </section>}
          <details><summary>{tr('Questions your customers ask (optional)', 'أسئلة يطرحها عملاؤك (اختياري)')}</summary>
            {(profile.faqs || []).map((faq,i)=><div className="layla-faq" key={i}><strong>{faq.question}</strong><p>{faq.answer}</p><button type="button" className="layla-secondary" onClick={()=>setProfile({...profile,faqs:profile.faqs.filter((_,index)=>index!==i),reviewed:false})}>{tr('Remove','حذف')}</button></div>)}
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
            <button type="button" className="layla-secondary" disabled={!faqQuestion.trim() || !faqAnswer.trim() || (profile.faqs?.length || 0)>=12} onClick={()=>{setProfile({...profile,faqs:[...(profile.faqs || []),{question:faqQuestion.trim(),answer:faqAnswer.trim()}],reviewed:false});setFaqQuestion('');setFaqAnswer('');}}>{tr('Add question and answer','إضافة السؤال والإجابة')}</button>
          </details>
          {data?.websiteImportAvailable && <details><summary>{tr('Fill this in from your website — the fastest way', 'املأ هذا من موقعك — الطريقة الأسرع')}</summary>
            <label>{tr('Import from your website','استيراد من موقعك')}<input type="url" placeholder="https://example.com/services" maxLength={2000} value={websiteUrl} onChange={e=>setWebsiteUrl(e.target.value)} /></label>
            <button type="button" className="layla-secondary" disabled={busy || !websiteUrl} onClick={()=>act(async()=>{const r=await request({action:'import_website',url:websiteUrl});setImported(r.imported);})}>{tr('Scan relevant pages','فحص الصفحات ذات الصلة')}</button>
            {imported&&/^https:\/\//.test(imported.url)&&<div><p>{tr('Source:','المصدر:')} <a href={imported.url} target="_blank" rel="noopener noreferrer">{imported.url}</a></p><h4>{tr('1. What are they?','١. ما الخدمات أو المنتجات؟')}</h4><p>{imported.extracted?.questions?.whatTheyAre}</p><h4>{tr('2. How do they help customers?','٢. كيف تخدم العملاء؟')}</h4><p>{imported.extracted?.questions?.howTheyHelp||tr('Review the extracted services below.','راجع الخدمات المستخرجة أدناه.')}</p><h4>{tr('3. How will Layla use this?','٣. كيف ستستخدم ليلى هذه المعلومات؟')}</h4><p>{tr('Layla uses approved services, prices and policies to answer accurately without guessing.','تستخدم ليلى الخدمات والأسعار والسياسات المعتمدة للإجابة بدقة دون تخمين.')}</p>{imported.partial&&<p className="layla-notice">{tr('Useful information was extracted; oversized content was skipped.','تم استخراج المعلومات المفيدة وتجاوز المحتوى الكبير.')}</p>}{data?.savedToAccount&&!!imported.extracted?.entries?.length&&<button type="button" className="layla-primary" disabled={busy} onClick={()=>act(saveImportedCatalog)}>{tr('Add all extracted drafts','إضافة كل المسودات المستخرجة')}</button>}{data?.savedToAccount&&imported.extracted?.entries?.map((entry,i)=><button key={i} type="button" className="layla-secondary" onClick={()=>act(()=>saveCatalogDraft(imported.url,{...entry,priceLabel:entry.prices?.[0]?.label,priceType:entry.prices?.[0]?.type,currency:entry.prices?.[0]?.currency,unit:entry.prices?.[0]?.unit}))}>{tr('Add draft:','إضافة مسودة:')} {entry.nameEn||entry.nameAr}</button>)}</div>}
          </details>}
          {data?.savedToAccount&&<details><summary>{tr('Upload a price list or catalog — we read it for you','ارفع قائمة أسعار أو كتالوج — نقرأه عنك')}</summary><p>{tr('PDF, CSV, XLSX, DOCX, TXT, JPG, PNG or WebP. The file is read in your browser and extracted items remain drafts.','PDF أو CSV أو XLSX أو DOCX أو TXT أو JPG أو PNG أو WebP. يُقرأ الملف في متصفحك وتبقى العناصر المستخرجة مسودات.')}</p><input type="file" accept=".pdf,.csv,.xlsx,.docx,.txt,.jpg,.jpeg,.png,.webp" disabled={busy||importingFile} onChange={async e=>{const file=e.target.files?.[0];if(!file)return;setImportingFile(true);setError('');try{const parsed=await readCatalogFile(file);setImported({url:file.name,text:parsed.text,partial:parsed.partial,extracted:{questions:{whatTheyAre:parsed.text.slice(0,500),howTheyHelp:'',howLaylaUsesIt:''},entries:parsed.entries}});}catch(error){setError(explain(error.message));}finally{setImportingFile(false);e.target.value='';}}}/>{importingFile&&<p role="status">{tr('Reading catalog…','جارٍ قراءة الكتالوج…')}</p>}{imported&&!/^https:\/\//.test(imported.url)&&<div><p>{tr('Extracted draft items:','العناصر المستخرجة كمسودة:')} {imported.extracted?.entries?.length||0}</p>{!!imported.extracted?.entries?.length&&<button type="button" className="layla-primary" disabled={busy} onClick={()=>act(saveImportedCatalog)}>{tr('Add all extracted drafts','إضافة كل المسودات المستخرجة')}</button>}{imported.extracted?.entries?.map((entry,i)=><button key={i} type="button" className="layla-secondary" onClick={()=>act(()=>saveCatalogDraft(imported.url,{...entry,priceLabel:entry.prices?.[0]?.label,priceType:entry.prices?.[0]?.type,currency:entry.prices?.[0]?.currency,unit:entry.prices?.[0]?.unit}))}>{tr('Add draft:','إضافة مسودة:')} {entry.nameEn||entry.nameAr}</button>)}</div>}</details>}
          {/* Open by default, and never collapsed: humanContact is REQUIRED by
              reviewProfile() in api/_lib/layla/domain.js. While this sat closed,
              a customer could fill every visible field, confirm the facts and be
              refused with `review_sector_services_contact` for an input they had
              never been shown. */}
          <details open><summary>{tr('Team contact — required before connecting WhatsApp', 'جهة اتصال الفريق — مطلوبة قبل ربط واتساب')}</summary>
          <label>{tr('How can customers reach your team?', 'كيف يتواصل العملاء مع فريقك؟')}
            <select className="layla-suggestion" aria-label={tr('Escalation contact type', 'نوع جهة اتصال التصعيد')} value={contactMode} onChange={e => { setContactMode(e.target.value); setContactValue(''); setProfile({ ...profile, humanContact: '', reviewed: false }); }}>
              <option value="whatsapp">{tr('WhatsApp number (recommended)', 'رقم واتساب (موصى به)')}</option><option value="email">{tr('Email address', 'عنوان البريد الإلكتروني')}</option>
            </select>
            {contactMode === 'whatsapp' ? <div className="layla-phone-fields"><select aria-label={tr('Country code', 'رمز الدولة')} value={countryCode} onChange={e => { setCountryCode(e.target.value); setProfile({ ...profile, reviewed: false }); }}>{COUNTRY_CODES.map(([code, label]) => <option key={code} value={code}>+{code} · {label}</option>)}</select><input inputMode="tel" autoComplete="tel-national" pattern="[0-9 ]{7,15}" maxLength={15} value={contactValue} placeholder={tr('WhatsApp number', 'رقم واتساب')} onChange={e => { setContactValue(e.target.value.replace(/[^0-9 ]/g, '').slice(0, 15)); setProfile({ ...profile, reviewed: false }); }} /></div> : <input type="email" autoComplete="email" maxLength={120} value={contactValue} placeholder="team@example.com" onChange={e => { setContactValue(e.target.value); setProfile({ ...profile, reviewed: false }); }} />}
            <small className="layla-field-help">{contactMode === 'whatsapp' ? tr('This number must already be active on WhatsApp so your team can receive the handoff.', 'يجب أن يكون الرقم مفعّلاً على واتساب حتى يستلم فريقك التحويل.') : tr('Layla will direct customers to this team email when a human is needed.', 'ستوجّه ليلى العملاء إلى بريد الفريق عند الحاجة إلى موظف.')}</small>
          </label>
          </details>
          {/* `prices` is part of the profile schema and is validated by
              reviewProfile(), but had no input on this form at all: the only way
              to give prices was the catalog section, which is gated behind
              `savedToAccount`. A customer previewing Layla without signing in
              therefore could not state a price in any field. */}
          <details><summary>{tr('Add prices, hours and location (optional)', 'أضف الأسعار وأوقات العمل والموقع (اختياري)')}</summary>{[['prices',tr('Prices','الأسعار')],['hours',tr('Opening hours','أوقات العمل')],['location',tr('Location','الموقع')]].map(([key,label]) => <label key={key}>{label}<textarea maxLength={350} rows={2} value={profile[key]} onChange={e => setProfile({ ...profile, [key]: e.target.value, reviewed: false })} /></label>)}</details>
          <p className="layla-help">{tr('Leave unknown details blank. Layla should ask your team rather than guess.', 'اترك التفاصيل غير المعروفة فارغة. ستوجّه ليلى السؤال لفريقك بدلاً من التخمين.')}</p>
          <label className="layla-check"><input type="checkbox" required checked={profile.reviewed} onChange={e => setProfile({ ...profile, reviewed: e.target.checked })} /><span>{tr('I checked these business facts.', 'راجعت معلومات النشاط هذه.')}</span></label>
          {!checking && !available && <p className="layla-notice" role="status">{tr('Your business facts are saved securely for 24 hours without a BznsFlow login. Meta connection is waiting for verified Blue test setup.', 'تُحفظ معلومات نشاطك بأمان لمدة ٢٤ ساعة دون تسجيل دخول إلى BznsFlow. ينتظر ربط Meta التحقق من إعداد الاختبار في Blue.')}</p>}
          <button className="layla-primary" disabled={busy || checking || !profile.reviewed}>{checking ? tr('Checking secure setup…','جارٍ التحقق من الإعداد الآمن…') : tr('Try Layla','جرّب ليلى')}</button>
          <p className="layla-help">{tr('No messages are sent during setup.', 'لا تُرسل أي رسائل أثناء الإعداد.')}</p>
        </form>}
        {step === 1 && <section>
          {data?.status === 'reconciliation_required' && <p role="status">{tr('Meta’s result needs verification. Check your connection before trying again.', 'تحتاج نتيجة Meta إلى التحقق. تحقّق من الاتصال قبل المحاولة مجدداً.')}</p>}
          {busy && prepared && <button className="layla-secondary" onClick={() => pending.current?.cancel('meta_cancelled')}>{tr('Cancel this attempt','إلغاء هذه المحاولة')}</button>}
          {data?.integration && <p className="layla-notice">{tr('Selected number:', 'الرقم المحدّد:')} <bdi>+{data.integration.sender}</bdi></p>}
          {data?.selection && <section className="layla-answer"><h3>{tr('Choose the number you intended to connect', 'اختر الرقم الذي تريد ربطه')}</h3>
            {data.selection.candidates.map(phone=><button key={phone.id} className="layla-secondary" disabled={busy || Date.now() >= data.selection.expiresAt} onClick={()=>act(async()=>applyState(await request({action:'select_phone',phone:phone.id})))}><bdi>+{phone.sender}</bdi></button>)}
            <button className="layla-secondary" disabled={busy} onClick={()=>act(async()=>applyState(await request({action:'cancel_selection'})))}>{tr('Cancel this selection', 'إلغاء الاختيار')}</button>
          </section>}
          {data?.connectionChecks && <ul className="layla-checklist">{[['path',tr('Number type verified','التحقق من نوع الرقم')],['registered',tr('Number registered','تسجيل الرقم')],['routing',tr('Blue connection verified','التحقق من ربط Blue')]].map(([key,label])=><li key={key}>{data.connectionChecks[key] ? '✓' : '○'} {label}</li>)}</ul>}
          {data?.connectionChecks?.portfolio?.name && <p className="layla-notice">{tr('Connected business portfolio:', 'محفظة الأعمال المربوطة:')} <bdi>{data.connectionChecks.portfolio.name}</bdi>{{verified:tr(' · Verified',' · موثّقة'),pending:tr(' · Verification pending',' · التوثيق قيد المراجعة'),not_verified:tr(' · Not verified',' · غير موثّقة')}[portfolioStatus(data.connectionChecks.portfolio.verificationStatus)] || ''}</p>}
          {data?.connectionChecks?.nameStatus && <p className="layla-help">{tr('Meta display-name status:', 'حالة اسم العرض لدى Meta:')} {data.connectionChecks.nameStatus}</p>}
          {data?.diagnostic && <p className="layla-notice">{explain(data.diagnostic.reason)}<br/>{tr('Support reference:', 'مرجع الدعم:')} {data.diagnostic.stage}-{data.diagnostic.at}{data.diagnostic.providerCode ? ` · Meta ${data.diagnostic.providerCode}` : ''}</p>}
          {data?.integration?.sender?.startsWith('1555') && <p className="layla-help">{tr('This resembles a Meta-provided 555 number. Check the selected number and display-name approval in WhatsApp Manager before using it for customers.', 'يبدو أن هذا رقم 555 مقدّم من Meta. تحقّق من الرقم وموافقة اسم العرض في مدير واتساب قبل استخدامه للعملاء.')}</p>}
          {data?.integration && <p role="status">{['connected','paused'].includes(data.integration.status)
            ? tr('This number is already connected. Manage replies and conversations below.', 'هذا الرقم مرتبط بالفعل. يمكنك إدارة الردود والمحادثات أدناه.')
            : tr('This number is already saved. Complete the registration step if shown, or check your connection below to continue.', 'هذا الرقم محفوظ بالفعل. أكمل خطوة التسجيل إن ظهرت، أو تحقّق من الاتصال أدناه للمتابعة.')}</p>}
          {data?.ownerConnectAvailable && !prepared && <section className="layla-answer" aria-labelledby="layla-owner-number">
            <h3 id="layla-owner-number">{tr('BznsFlow’s own number', 'رقم BznsFlow الخاص')}</h3>
            <p>{tr('This number was added directly in Meta, so Meta’s signup window cannot list it. Connect it with BznsFlow’s approved server credential instead.', 'أُضيف هذا الرقم مباشرة في Meta، لذلك لا تعرضه نافذة التسجيل. اربطه باستخدام بيانات الاعتماد المعتمدة لدى BznsFlow.')}</p>
            <button className="layla-primary" disabled={busy} onClick={() => act(async () => applyState(await request({ action: 'connect_owner_number' })))}>{busy ? tr('Connecting…', 'جارٍ الربط…') : tr('Connect +968 7113 4025 directly', 'ربط ‎+968 7113 4025 مباشرة')}</button>
          </section>}
          {!data?.integration && !data?.selection && <>
          <p>{tr('Choose the number you want Layla to help with.', 'اختر الرقم الذي تريد أن تعمل ليلى عليه.')}</p>
          <fieldset disabled={busy || !!prepared}><legend>{tr('Your WhatsApp number', 'رقم واتساب الخاص بك')}</legend>
            <label className="layla-choice"><input type="radio" name="number-path" checked={path === 'coexistence'} onChange={() => setPath('coexistence')} /><span><strong>{tr('Keep my WhatsApp Business app', 'الاستمرار باستخدام تطبيق واتساب للأعمال')}</strong><small>{tr('Keep using your app. Meta checks whether your number is eligible for Coexistence.', 'استمر باستخدام تطبيقك. تتحقق Meta من أهلية رقمك للاستخدام المتزامن.')}</small></span></label>
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
          {!data?.profile?.humanContact && <p className="layla-notice">{tr('Add a team contact in your business details before connecting WhatsApp. You can keep trying the preview.', 'أضف جهة اتصال للفريق في معلومات نشاطك قبل ربط واتساب. يمكنك متابعة المعاينة الآن.')}</p>}
          {!prepared ? <button className="layla-primary" disabled={busy || !available || !data?.profile?.humanContact || !!data?.integration || !!data?.selection || (!reviewMode && !data?.savedToAccount)} onClick={() => act(async () => { const r = await request({ action: 'begin', path, ...(path !== 'coexistence' && preBusiness ? { business: preBusiness } : {}), ...(path !== 'coexistence' && preWaba ? { waba: preWaba } : {}) }); await prepareFacebook(r); setPrepared(r); })}>{busy ? tr('Preparing…','جارٍ التجهيز…') : tr('Prepare secure connection','تجهيز الربط الآمن')}</button> : <button className="layla-primary" disabled={busy} onClick={connect}>{busy ? tr('Complete the Meta window…','أكمل الخطوات في نافذة Meta…') : tr('Connect with Facebook','الربط عبر فيسبوك')}</button>}
          </>}
          <button className="layla-secondary" disabled={busy || !!prepared} onClick={() => goTo(0)}>{tr('Back to business details','العودة إلى معلومات النشاط')}</button>
        </section>}
        {step === 2 && <section>
          <p className="layla-notice">{tr('Website preview — no WhatsApp message sent.', 'معاينة الموقع — لا تُرسل أي رسائل واتساب.')}</p>
          {data?.integration && <p className="layla-notice">{tr('Selected number:','الرقم المحدّد:')} <bdi>+{data.integration.sender}</bdi> · {['connected','paused'].includes(data.integration.status) ? tr('Connection checks passed','اجتاز فحوص الاتصال') : tr('Connection needs attention','الاتصال يحتاج إلى مراجعة')}</p>}
          <p>{tr('Ask about your business. You can edit the facts and try again before connecting WhatsApp.', 'اسأل عن نشاطك. يمكنك تعديل المعلومات وإعادة التجربة قبل ربط واتساب.')}</p>
          <form onSubmit={e => { e.preventDefault(); act(async () => { const r = await request({ action: 'preview', text: question }); applyState(r); }); }}><label>{tr('A customer question','سؤال من عميل')}
            <select className="layla-suggestion" aria-label={tr('Question suggestions for your business', 'اقتراحات أسئلة لنشاطك')} value="" onChange={e => { if (e.target.value) setQuestion(e.target.value); }}>
              <option value="">{tr('Choose a question to preview (optional)', 'اختر سؤالاً لمعاينته (اختياري)')}</option>{tailored.questions.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
            <textarea required maxLength={1000} value={question} placeholder={tr('Type a real customer question or choose one above.', 'اكتب سؤالاً حقيقياً من عميل أو اختر سؤالاً أعلاه.')} onChange={e => setQuestion(e.target.value)} /></label><button className="layla-primary" disabled={busy || !question.trim()}>{tr('See Layla’s answer','شاهد إجابة ليلى')}</button></form>
          {(profile.faqs || []).map(faq=><button key={faq.question} className="layla-secondary" disabled={busy} onClick={()=>{setQuestion(faq.question);act(async()=>applyState(await request({action:'preview',text:faq.question})));}}>{faq.question}</button>)}
          <div className="layla-quick-questions" aria-label={tr('Try a question', 'جرّب سؤالاً')}>
            {[[tr('What services do you offer?', 'ما الخدمات التي تقدمونها؟'), true], [tr('What are your opening hours?', 'ما ساعات الدوام؟'), !!profile.hours], [tr('What are your prices?', 'ما أسعاركم؟'), !!profile.prices], [tr('Can I speak to a human?', 'هل يمكنني التحدث مع موظف؟'), true]].filter(([,show]) => show).map(([text]) => <button key={text} type="button" className="layla-secondary" disabled={busy} onClick={() => { setQuestion(text); act(async () => applyState(await request({ action: 'preview', text }))); }}>{text}</button>)}
          </div>
          {reply && <div className="layla-answer" role="status"><strong>{tr('Synthetic preview — Layla’s answer','معاينة تجريبية — إجابة ليلى')}</strong>{data?.lastPreview?.question && <p><b>{tr('You:', 'أنت:')}</b> {data.lastPreview.question}</p>}<p dir="auto">{reply}</p>
            {!!data?.lastPreview?.sourceFields?.length && <p className="layla-help">{tr('Based on your saved business facts:', 'بناءً على معلومات نشاطك المحفوظة:')} {data.lastPreview.sourceFields.map(field => ({faqs:tr('your approved answer','إجابتك المعتمدة'),services:tr('services','الخدمات'),prices:tr('prices','الأسعار'),hours:tr('opening hours','ساعات الدوام'),location:tr('location','الموقع')}[field])).join(' · ')}</p>}
            <button className="layla-secondary" disabled={busy} onClick={() => goTo(0)}>{tr('Edit this information', 'تعديل هذه المعلومات')}</button>
          </div>}
          <p>{tr('Recommended checks: a factual question, a question you cannot answer, and a request for your team.', 'اختبارات مقترحة: سؤال عن معلومات النشاط، سؤال لا تتوفر إجابته، وطلب التواصل مع الفريق.')}</p>
          <button className="layla-primary" disabled={busy || !reply} onClick={() => act(async () => applyState(await request({ action: 'review_preview', profileVersion: data.profileVersion })))}>{tr('The answer looks right', 'الإجابة مناسبة')}</button>
          <button className="layla-secondary" disabled={busy} onClick={() => !reviewMode && !data?.savedToAccount ? saveAccount() : goTo(1)}>{tr('Save and connect WhatsApp', 'احفظ واربط واتساب')}</button>
          <button className="layla-secondary" disabled={busy} onClick={() => goTo(0)}>{tr('Edit business details','تعديل معلومات النشاط')}</button>
        </section>}
        {step === 3 && <section>
          <p className="layla-notice">{tr('Website preview complete', 'اكتملت معاينة الموقع')}</p>
          <p>{['connected','paused'].includes(data?.integration?.status) ? tr('WhatsApp connection checks passed. Manage replies below.', 'اجتاز ربط واتساب الفحوص. يمكنك إدارة الردود أدناه.') : tr('Your answers are ready to preview. WhatsApp connection still needs to be completed or verified.', 'إجاباتك جاهزة للمعاينة. ما زال ربط واتساب يحتاج إلى إكمال أو تحقق.')}</p>
          <button className="layla-primary" disabled={busy} onClick={() => !reviewMode && !data?.savedToAccount ? saveAccount() : goTo(1)}>{tr('Continue WhatsApp setup', 'متابعة إعداد واتساب')}</button>
          <button className="layla-secondary" disabled={busy} onClick={() => goTo(2)}>{tr('Back to answers','العودة إلى الإجابات')}</button>
          {reviewMode && <p className="layla-help">{tr('Sign in to a dedicated review account to demonstrate live replies.', 'سجّل الدخول بحساب مراجعة مخصص لعرض الردود المباشرة.')}</p>}
        </section>}
        {step === 1 && <button className="layla-secondary" disabled={busy} onClick={() => goTo(2)}>{tr('Continue previewing', 'متابعة المعاينة')}</button>}
        {data?.integration && <button className="layla-secondary" disabled={busy} onClick={() => act(async () => applyState(await request({ action: 'refresh' })))}>{tr('Check my connection','التحقق من الاتصال')}</button>}
        {!reviewMode && data?.savedToAccount && data?.integration && <ActivationPanel key={`${data.account?.email}:${data.integration.id}`} lang={lang} setup={data} onPreview={()=>goTo(2)}/>}
        {step === 1 && data?.integration?.path === 'new_number' && data.integration.status === 'registration_required' && <form autoComplete="off" onSubmit={e => { e.preventDefault(); const body = { action: 'register_number', integration: data.integration.id, pin, confirm: true }; setPin(''); act(async () => { try { applyState(await request(body)); } finally { delete body.pin; } }); }}><p>{tr('Finish registering this separate number:','أكمل تسجيل هذا الرقم المنفصل:')} <bdi>+{data.integration.sender}</bdi></p><label>{tr('Create a six-digit WhatsApp PIN','أنشئ رمز PIN لواتساب من ستة أرقام')}<small>{tr('Choose and save your own PIN. If this number already has a two-step verification PIN, use it. This is not an SMS code.', 'اختر رمزاً واحفظه. إذا كان للرقم رمز تحقق بخطوتين، استخدم الرمز الحالي. هذا ليس رمز SMS.')}</small><input type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{6}" maxLength={6} required value={pin} onChange={e => setPin(e.target.value.replace(/\D/g,'').slice(0,6))} /></label><button className="layla-primary" disabled={busy || pin.length !== 6}>{tr('Confirm this number’s registration','تأكيد تسجيل هذا الرقم')}</button></form>}
        <footer className="layla-customer-footer"><a href={ar ? '/privacy' : '/en/privacy'}>{tr('Privacy','الخصوصية')}</a><a href="mailto:ahmed@bznsflowai.com">{tr('Need a hand?','تحتاج مساعدة؟')}</a></footer>
      </div>
    </div>
  </main>;
}
