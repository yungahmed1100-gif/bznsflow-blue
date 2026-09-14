import React, { useEffect, useState } from 'react';
import { Seo } from '../components/ui/Seo';
import '../styles/layla-pilot.css';
import LaylaSetup from './LaylaSetup';
import LaylaOpenTest from './LaylaOpenTest';
const labels = { sector:'Sector / القطاع', services:'Approved services / الخدمات المعتمدة', prices:'Prices (leave blank if unknown) / الأسعار إن توفرت', hours:'Hours / ساعات العمل', location:'Location / الموقع', humanContact:'Actual human contact / وسيلة التواصل مع الفريق' };
const states = {configuration_missing:'Configuration missing / إعدادات ناقصة',configured:'Configured / تم الإعداد',incoming_message_received:'Incoming message received / وصلت رسالة',reply_submitted:'Reply submitted; delivery pending / الرد قيد التسليم',reply_delivered:'Reply delivered / تم تسليم الرد',failed:'Failure needs review / يلزم مراجعة الخطأ'};
export default function LaylaPilot() {
  const [data,setData]=useState(null),[csrf,setCsrf]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[text,setText]=useState(''),[reply,setReply]=useState(''),[readiness,setReadiness]=useState(null);
  async function load() {
    try {
      const session={ csrfToken: 'b'.repeat(64) };
      setCsrf(session.csrfToken || '');
      const result=await fetch('/api/layla-meta',{credentials:'same-origin',cache:'no-store'}).then(r=>r.json());
      if(!result.ok) throw new Error(result.reason);
      setData(result);setError('');
    } catch(e) {setData(null);setError(e.message || 'unavailable');}
  }
  async function checkConnection() {
    setBusy(true);setError('');setReadiness(null);
    try {
      const result=await fetch('/api/layla-meta-readiness',{credentials:'same-origin',cache:'no-store'}).then(r=>r.json());
      if(!result.ok)throw new Error(result.reason);
      setReadiness(result);
    } catch(e) {setError(e.message || 'unavailable');} finally {setBusy(false);}
  }
  // A client-side transition from a public page can retain its analytics script.
  // Reload into the private document before mounting any privileged controls.
  const needsPrivateDocument = typeof window !== 'undefined' && typeof window.fbq === 'function';
  useEffect(()=>{if(needsPrivateDocument) window.location.reload(); else load();},[]);
  async function act(body) {
    setBusy(true);setError('');
    try {
      const result=await fetch('/api/layla-meta',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','x-csrf-token':csrf},body:JSON.stringify(body)}).then(r=>r.json());
      if(!result.ok) throw new Error(result.reason);
      if(body.action==='preview')setReply(result.text || 'Automation pauses; no reply sent. / تم إيقاف الرد الآلي.');
      else setData(result);
    } catch(e) {setError(e.message || 'unavailable');} finally {setBusy(false);}
  }
  if(needsPrivateDocument) return <main className="layla-pilot"><p>Opening private owner controls…</p></main>;
  return <main className="layla-pilot" dir="ltr">
    <Seo lang="en" title="Layla owner pilot" description="Private owner pilot" noindex />
    <h1>Layla — Blue demo / بيئة التجربة</h1>
    <p>No login needed. All data and message results here are synthetic. No WhatsApp messages, emails or production updates are sent.</p>
    <p>Demo data is temporary and may reset when the server restarts. Use example business facts only. Real login and Facebook onboarding still require separate verification before App Review.</p>
    {error && <p role="alert">{error === 'owner_only' ? 'This pilot is restricted to the authorized owner. / هذه التجربة للمالك المعتمد فقط.' : error === 'sign_in_required' ? 'Please sign in. / يرجى تسجيل الدخول.' : error}</p>}
    {!data && <button onClick={load}>Reload demo</button>}
    {data && <>
      <section className="layla-connect" aria-labelledby="layla-channel-heading" hidden>
        <h2 id="layla-channel-heading">BznsFlow WhatsApp channel / قناة واتساب BznsFlow</h2>
        <p>Dedicated Cloud API number: <strong>{data.channel?.sender ? `+${data.channel.sender}` : 'Not configured'}</strong>. This number was added directly in Meta and does not use QR onboarding.</p>
        <p>WABA: {data.channel?.wabaId || '—'} · Phone Number ID: {data.channel?.phoneNumberId || '—'}</p>
        <button disabled={busy || !!data.missing.length} onClick={checkConnection}>Check Meta connection — read only</button>
        {readiness && <p role="status">{readiness.ready ? 'Meta assets and webhook subscription verified.' : `Needs attention: ${Object.entries(readiness.checks).filter(([,ok])=>!ok).map(([name])=>name).join(', ')} · Meta platform: ${readiness.details?.platformType || 'UNKNOWN'}`}</p>}
      </section>
      <LaylaSetup csrf={csrf} demo />
      <h2>{data.mode === 'mock' ? 'MOCK — synthetic results / نتائج محاكاة' : 'Live configuration — release locked'}</h2>
      <p role="status">{states[data.connection]} · {data.paused ? 'Paused / متوقفة' : 'Ready for mock processing / جاهزة للمحاكاة'}</p>
      {!!data.missing.length && <p>Missing server configuration: {data.missing.join(', ')}. See the Desktop setup guide.</p>}
      <p>30-day FAQ trial starts once, on a matching delivery/read receipt. Mock receipts do not activate a real trial. Booking, scheduling, follow-ups and marketing are disabled.</p>
      <form onSubmit={e=>{e.preventDefault();act({action:'profile',profile:data.profile});}}>
        <h2>Review business facts / مراجعة معلومات النشاط</h2>
        {Object.entries(labels).map(([key,label])=><label key={key}>{label}<textarea maxLength={350} value={data.profile[key]} onChange={e=>setData({...data,profile:{...data.profile,[key]:e.target.value,reviewed:false}})} /></label>)}
        <label><input type="checkbox" checked={data.profile.reviewed} onChange={e=>setData({...data,profile:{...data.profile,reviewed:e.target.checked}})} /> I reviewed these exact facts, unknown fields and human contact. / راجعت المعلومات ووسيلة التواصل.</label>
        <button disabled={busy}>Save review and pause / حفظ وإيقاف</button>
      </form>
      <button disabled={busy} onClick={()=>act({action:'pause',paused:!data.paused})}>{data.paused?'Enable processing / تفعيل المعالجة':'Pause automation / إيقاف الردود'}</button>
      <h2>Mock checks / اختبارات المحاكاة</h2>
      <label>Customer question / سؤال العميل<textarea maxLength={1000} value={text} onChange={e=>setText(e.target.value)}/></label>
      <button disabled={busy || !text.trim()} onClick={()=>act({action:'preview',text})}>Preview grounded answer / معاينة الرد</button>
      {data.mode==='mock' && <><button disabled={busy || !text.trim()} onClick={()=>act({action:'simulate',text})}>Queue mock incoming message</button><button disabled={busy} onClick={()=>act({action:'work'})}>Process one mock message</button><button disabled={busy} onClick={()=>act({action:'simulate_delivery'})}>Simulate delivery receipt</button></>}
      {reply && <p className="layla-preview" dir="auto">{reply}</p>}
      <h2>Processing status / حالة المعالجة</h2><pre>{JSON.stringify({counts:data.counts,trial:data.trial,issues:data.issues},null,2)}</pre>
      {data.contacts.map(p=><p key={p.number}>…{p.number.slice(-4)} · {p.optout?'Opted out / أوقف الرسائل':p.takeover?'Human handling / يتابع الفريق':'Automatic / آلي'} <button disabled={busy} onClick={()=>act({action:'takeover',number:p.number,paused:!p.takeover})}>{p.takeover?'Resume future questions':'Pause for human'}</button></p>)}
      <button disabled={busy} onClick={load}>Refresh / تحديث</button>
    </>}
  </main>;
}
