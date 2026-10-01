import React, { useState } from 'react';

// Email-code sign-in that saves the browser draft to a BznsFlow account.
// Shown inline on the channels step, because connecting a channel needs an account.
export function SaveAccountPanel({ lang, tr, data, busy, act, authRequest, onSignedIn, onClaim }) {
  const [email, setEmail] = useState(''), [emailCode, setEmailCode] = useState(''), [codeSent, setCodeSent] = useState(false);
  if (data?.savedToAccount) return null;
  const submit = event => {
    event.preventDefault();
    act(async () => {
      if (!codeSent) { await authRequest('code', { email, lang }); setCodeSent(true); return; }
      try { await authRequest('session', { email, code: emailCode }); setCodeSent(false); await onSignedIn(); }
      finally { setEmailCode(''); }
    });
  };
  return <section className="layla-answer" aria-labelledby="layla-save-heading">
    <h3 id="layla-save-heading">{tr('Save your setup to connect channels', 'احفظ إعدادك لربط القنوات')}</h3>
    {!data?.accountSaveAvailable ? <p>{tr('Account saving is being configured. You can keep previewing Layla.', 'جارٍ إعداد حفظ الحساب. يمكنك متابعة معاينة ليلى.')}</p>
      : data?.account ? <div><p>{tr('Signed in as', 'تم الدخول باسم')} {data.account.email}</p><button className="layla-primary" disabled={busy} onClick={onClaim}>{tr('Save this setup', 'حفظ هذا الإعداد')}</button></div>
      : <form onSubmit={submit}>
        <p className="layla-help">{tr('We email you a six-digit code. No password needed.', 'نرسل إلى بريدك رمزاً من ستة أرقام. لا حاجة لكلمة مرور.')}</p>
        <label>{tr('Email address', 'البريد الإلكتروني')}<input type="email" required autoComplete="email" disabled={codeSent} value={email} onChange={e => setEmail(e.target.value)} /></label>
        {codeSent && <label>{tr('Six-digit email sign-in code', 'رمز الدخول من البريد — ستة أرقام')}<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={emailCode} onChange={e => setEmailCode(e.target.value.replace(/\D/g, ''))} /></label>}
        <button className="layla-primary" disabled={busy}>{codeSent ? tr('Verify and save', 'تحقق واحفظ') : tr('Email me a sign-in code', 'أرسل رمز الدخول إلى بريدي')}</button>
        {codeSent && <button type="button" className="layla-secondary" disabled={busy} onClick={() => { setCodeSent(false); setEmailCode(''); }}>{tr('Use another email or request a new code', 'بريد آخر أو طلب رمز جديد')}</button>}
      </form>}
  </section>;
}
