import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Seo } from '../components/ui/Seo';
import { Icon } from '../components/ui/Icon';
import { BrandMark } from '../components/ui/BrandMark';
import { getStrings } from '../i18n';
import { INDUSTRIES } from '../lib/industries';
import { countryOptions } from '../lib/countries';
import { CALENDAR_URL, WHATSAPP_URL } from '../lib/constants';
import '../styles/auth.css';

// Passwordless sign-in: email -> six-digit code -> (new accounts only) profile.
//
// A standalone page with its own local header rather than the shared NavBar.
// NavBar takes eleven props driven by scroll and menu state that lives in
// Home.jsx, and every one of its section links is a hash anchor that only
// resolves on the home page — reusing it here would mean duplicating those
// effects to render a nav that cannot navigate.
//
// WHY THE PROFILE COMES LAST: the email step never reveals whether an account
// exists (that would make the page a customer-list oracle), so the server only
// knows which fields it needs AFTER the code is verified. Returning visitors go
// email -> code -> done and are never asked for their details twice.

const RESEND_SECONDS = 60;
const DEFAULT_COUNTRY = 'AE';

// Buttons, in the order they are offered. Rendered only when the server says
// the provider is configured, so a missing secret means a missing button rather
// than a dead one.
const PROVIDER_ORDER = [
  { id: 'google', key: 'auth_oauth_google' },
  { id: 'microsoft', key: 'auth_oauth_microsoft' },
  { id: 'linkedin', key: 'auth_oauth_linkedin' },
];

// The ?e= codes api/auth-callback.js redirects back with. Kept separate from
// messageFor() below: those are JSON reason codes from a fetch, these arrive in
// the URL after a full page navigation, and the two vocabularies only look
// alike — `expired` means a stale OAuth attempt here and a stale OTP there.
const OAUTH_ERRORS = {
  cancelled: 'auth_err_cancelled',
  provider: 'auth_err_provider',
  state: 'auth_err_state',
  expired: 'auth_err_expired_oauth',
  no_email: 'auth_err_no_email',
  email_unverified: 'auth_err_email_unverified',
  rate: 'auth_err_rate',
  unavailable: 'auth_err_unavailable',
};

/** Interpolate {name} placeholders in a translation string. */
function fill(template, values) {
  return String(template ?? '').replace(/\{(\w+)\}/g, (_, k) => values[k] ?? '');
}

export default function SignIn({ lang = 'ar' }) {
  const t = getStrings(lang);
  const ar = lang === 'ar';


  const [step, setStep] = useState('email'); // email | code | profile | done
  useEffect(() => {
    if (step === 'done' && new URLSearchParams(window.location.search).get('next') === 'layla') window.location.assign(ar ? '/layla/setup' : '/en/layla/setup');
  }, [step, ar]);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [profile, setProfile] = useState({
    name: '', phone: '', country: DEFAULT_COUNTRY, industry: '',
  });
  const [account, setAccount] = useState(null);
  const [returning, setReturning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resendIn, setResendIn] = useState(0);
  // Which social buttons this deployment can actually offer. Empty until the
  // mount request answers, so the prerendered HTML shows none — better than
  // rendering three and hiding two once the JSON lands.
  const [providers, setProviders] = useState([]);

  const csrf = useRef('');
  // Focus the field that just became relevant, so a step change does not leave a
  // keyboard or screen-reader user stranded at the top of the page.
  const stepHeading = useRef(null);

  const countries = useMemo(() => countryOptions(lang), [lang]);

  /**
   * One fetch wrapper for every call. `credentials: 'same-origin'` is what
   * carries bf_session; the CSRF header is what the server checks it against.
   */
  const call = useCallback(async (path, method, body) => {
    const res = await fetch(path, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...(csrf.current ? { 'x-csrf-token': csrf.current } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }, []);

  const session = useCallback((method, body) => call('/api/auth-session', method, body), [call]);
  const requestCode = useCallback((body) => call('/api/auth-code', 'POST', body), [call]);

  /** Map a server reason code to copy. The server sends codes, not prose. */
  const messageFor = useCallback((data) => {
    switch (data?.reason) {
      case 'email':      return t.auth_err_email;
      case 'no_code':    return t.auth_err_expired;
      case 'locked':     return t.auth_err_locked;
      case 'too_soon':   return t.auth_err_too_soon;
      case 'too_many':   return t.auth_err_too_many;
      case 'rate_ip':
      case 'rate_global':return t.auth_err_rate;
      case 'send_failed':return t.auth_err_send;
      case 'invalid':    return t.auth_err_field;
      case 'bad_code':
        return data.attemptsLeft > 0
          ? fill(t.auth_err_code, { attempts: data.attemptsLeft })
          : t.auth_err_code_last;
      default:           return t.auth_err_generic;
    }
  }, [t]);

  /**
   * Where an authenticated account goes next.
   *
   * One function because two call sites — the mount effect and a successful code
   * verification — reach this same decision. They were duplicated, which is the
   * shape where a future third outcome gets added to one copy and returning
   * visitors are silently stranded on the wrong step.
   */
  const applyAccount = useCallback((data) => {
    setAccount(data.account);
    if (data.needsProfile) {
      // A social sign-in hands us a name the emailed code never could, so seed
      // the form with it rather than making someone retype what Google just
      // told us. Only ever fills a blank — never overwrites something typed.
      const given = data.account?.name;
      if (given) setProfile((p) => (p.name ? p : { ...p, name: given }));
      setStep('profile');
      return;
    }
    setReturning(true);
    setStep('done');
  }, []);

  /** Curried field setter using the updater form, so it cannot read stale state. */
  const field = useCallback(
    (key) => (e) => setProfile((p) => ({ ...p, [key]: e.target.value })),
    [],
  );

  // Mint the CSRF token and pick up an existing session. The site is prerendered
  // by vite-react-ssg, so there is no server render that could have set the
  // cookie — this first request is what issues it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await session('GET');
        if (cancelled) return;
        csrf.current = data?.csrfToken || '';
        if (Array.isArray(data?.providers)) setProviders(data.providers);
        if (data?.account) applyAccount(data);
      } catch {
        // Offline or blocked. The form still renders; the first submit reports it.
      }
    })();
    return () => { cancelled = true; };
  }, [session, applyAccount]);

  // Surface a failed social sign-in. api/auth-callback.js has no page to render
  // into, so it reports by redirecting back here with ?e=<code>.
  //
  // The parameter is stripped afterwards so a refresh does not re-show an error
  // about an attempt that is long over — and so the address bar of someone who
  // just cancelled does not keep saying so.
  useEffect(() => {
    if (typeof window === 'undefined') return; // prerendered by vite-react-ssg
    const params = new URLSearchParams(window.location.search);
    const code = params.get('e');
    if (!code) return;

    setError(t[OAUTH_ERRORS[code]] || t.auth_err_generic);
    window.history.replaceState({}, '', window.location.pathname);
    // Runs once on mount: the URL is read and cleared in the same pass, so
    // re-running on a language change would find nothing anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resend countdown, mirroring the server's 60-second per-address throttle so
  // the button is disabled rather than pressed into a guaranteed 429.
  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const id = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  useEffect(() => { stepHeading.current?.focus?.(); }, [step]);

  const sendCode = useCallback(async (e) => {
    e?.preventDefault?.();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const { status, data } = await requestCode({ email: email.trim(), lang });
      if (status === 200 && data?.ok) {
        setStep('code');
        setCode('');
        setResendIn(RESEND_SECONDS);
      } else {
        setError(messageFor(data));
      }
    } catch {
      setError(t.auth_err_generic);
    } finally {
      setBusy(false);
    }
  }, [busy, requestCode, email, lang, messageFor, t]);

  const verifyCode = useCallback(async (e) => {
    e?.preventDefault?.();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const { status, data } = await session('POST', { email: email.trim(), code });
      if (status === 200 && data?.ok) {
        applyAccount(data);
      } else {
        setError(messageFor(data));
      }
    } catch {
      setError(t.auth_err_generic);
    } finally {
      setBusy(false);
    }
  }, [busy, session, code, email, messageFor, applyAccount, t]);

  const saveProfile = useCallback(async (e) => {
    e?.preventDefault?.();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const { status, data } = await session('PATCH', {
        ...profile,
        lang,
        pageUrl: typeof window !== 'undefined' ? window.location.href : '',
      });
      if (status === 200 && data?.ok) {
        setAccount(data.account);
        setReturning(false);
        setStep('done');
      } else {
        setError(messageFor(data));
      }
    } catch {
      setError(t.auth_err_generic);
    } finally {
      setBusy(false);
    }
  }, [busy, session, lang, messageFor, profile, t]);

  const signOut = useCallback(async () => {
    setBusy(true);
    try { await session('DELETE'); } catch { /* the cookie is cleared server-side */ }
    setAccount(null); setReturning(false); setEmail(''); setCode('');
    setProfile({ name: '', phone: '', country: DEFAULT_COUNTRY, industry: '' });
    setStep('email'); setBusy(false); setError('');
  }, [session]);

  const steps = [t.auth_step_email, t.auth_step_code, t.auth_step_profile];
  const stepIndex = { email: 0, code: 1, profile: 2, done: 3 }[step];

  return (
    <>
      <Seo
        lang={lang}
        path="/signin"
        title={t.auth_seo_title}
        description={t.auth_seo_desc}
        noindex
      />

      <main className="auth-shell" id="main-content">
        <div className="auth-aurora" aria-hidden="true">
          <span className="auth-blob auth-blob--a" />
          <span className="auth-blob auth-blob--b" />
        </div>

        <header className="auth-nav">
          <a className="auth-brand" href={ar ? '/' : '/en'}>
            <img src="/logo.png" alt="BznsFlow" width="40" height="40" />
            <span>BznsFlow</span>
          </a>
          <a className="auth-lang" href={ar ? '/en/signin' : '/signin'}>
            <Icon name="globe" size={15} />
            <span>{ar ? 'English' : 'العربية'}</span>
          </a>
        </header>

        <div className="auth-card">
          {step !== 'done' && (
            <ol className="auth-steps" aria-label={t.auth_title}>
              {steps.map((label, i) => (
                <li
                  key={label}
                  aria-current={stepIndex === i ? 'step' : undefined}
                  className={stepIndex > i ? 'is-done' : undefined}
                >
                  <span className="auth-step-dot">
                    {stepIndex > i ? <Icon name="check" size={12} /> : i + 1}
                  </span>
                  {label}
                </li>
              ))}
            </ol>
          )}

          {error && <p className="auth-error" role="alert">{error}</p>}

          {step === 'email' && (
            <form className="auth-form" onSubmit={sendCode}>
              <p className="section-label">{t.auth_eyebrow}</p>
              <h1 className="auth-title" tabIndex={-1} ref={stepHeading}>{t.auth_title}</h1>
              {/* The default copy promises an emailed code, which is the wrong
                  sentence to put directly above three provider buttons. */}
              <p className="auth-sub">
                {providers.length > 0 ? t.auth_sub_social : t.auth_sub}
              </p>

              {providers.length > 0 && (
                <>
                  <div className="auth-providers">
                    {PROVIDER_ORDER.filter((p) => providers.includes(p.id)).map((p) => (
                      /* A real link, not a button with a click handler. An OAuth
                         redirect cannot happen inside fetch, so this has to be a
                         full-page navigation — and as an anchor it also works
                         before React hydrates, and gives middle-click and
                         open-in-new-tab for free. */
                      <a
                        key={p.id}
                        className="auth-provider"
                        href={`/api/auth-oauth?provider=${p.id}&lang=${lang}`}
                        aria-disabled={busy || undefined}
                        onClick={busy ? (e) => e.preventDefault() : undefined}
                      >
                        <BrandMark name={p.id} size={18} />
                        <span>{t[p.key]}</span>
                      </a>
                    ))}
                  </div>
                  <p className="auth-or"><span>{t.auth_oauth_or}</span></p>
                </>
              )}

              <div className="auth-field">
                <label htmlFor="auth-email">{t.auth_email_label}</label>
                <input
                  id="auth-email" name="email" type="email" required
                  autoComplete="email" inputMode="email" autoFocus
                  placeholder={t.auth_email_ph}
                  value={email} onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <button type="submit" className="btn btn-primary btn-large auth-submit" disabled={busy}>
                <Icon name="mail" size={18} />
                <span>{busy ? t.auth_email_sending : t.auth_email_cta}</span>
              </button>

              <p className="auth-privacy">{t.auth_privacy}</p>
            </form>
          )}

          {step === 'code' && (
            <form className="auth-form" onSubmit={verifyCode}>
              <p className="section-label">{t.auth_eyebrow}</p>
              <h1 className="auth-title" tabIndex={-1} ref={stepHeading}>{t.auth_step_code}</h1>
              <p className="auth-sub" role="status" aria-live="polite">
                {fill(t.auth_code_sent, { email: email.trim() })}
              </p>

              <div className="auth-field">
                <label htmlFor="auth-code">{t.auth_code_label}</label>
                <input
                  id="auth-code" name="code" type="text" required autoFocus
                  inputMode="numeric" autoComplete="one-time-code"
                  pattern="[0-9]*" className="auth-code-input"
                  placeholder={t.auth_code_ph}
                  value={code}
                  /* The six-digit cap lives here rather than in maxLength on
                     purpose. maxLength truncates the RAW value before this
                     handler runs, so pasting "123 456" would be cut to "123 45"
                     and then stripped to five digits — silently losing one. */
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-large auth-submit"
                disabled={busy || code.length !== 6}
              >
                <Icon name="shield-check" size={18} />
                <span>{busy ? t.auth_code_verifying : t.auth_code_cta}</span>
              </button>

              <div className="auth-alt">
                <button
                  type="button" className="auth-link"
                  onClick={sendCode} disabled={busy || resendIn > 0}
                >
                  {resendIn > 0
                    ? fill(t.auth_code_resend_in, { seconds: resendIn })
                    : t.auth_code_resend}
                </button>
                <button
                  type="button" className="auth-link"
                  onClick={() => { setStep('email'); setError(''); setCode(''); }}
                >
                  {t.auth_code_change}
                </button>
              </div>
            </form>
          )}

          {step === 'profile' && (
            <form className="auth-form" onSubmit={saveProfile}>
              <p className="section-label">{t.auth_eyebrow}</p>
              <h1 className="auth-title" tabIndex={-1} ref={stepHeading}>{t.auth_step_profile}</h1>
              <p className="auth-sub">{t.auth_profile_sub}</p>

              <div className="auth-field">
                <label htmlFor="auth-name">{t.auth_name_label}</label>
                <input
                  id="auth-name" name="name" type="text" required autoFocus
                  autoComplete="name" maxLength={100}
                  placeholder={t.auth_name_ph}
                  value={profile.name}
                  onChange={field('name')}
                />
              </div>

              <div className="auth-field">
                <label htmlFor="auth-country">{t.auth_country_label}</label>
                <select
                  id="auth-country" name="country" required
                  value={profile.country}
                  onChange={field('country')}
                >
                  {countries.map((c, i) => (
                    <React.Fragment key={c.iso}>
                      {/* A rule after the priority markets, so the jump from
                          "regional" to "everywhere else" is visible. */}
                      {i > 0 && countries[i - 1].priority && !c.priority && (
                        <option disabled>──────────</option>
                      )}
                      <option value={c.iso}>{c.name} (+{c.dial})</option>
                    </React.Fragment>
                  ))}
                </select>
              </div>

              <div className="auth-field">
                <label htmlFor="auth-phone">{t.auth_phone_label}</label>
                <div className="auth-phone">
                  {/* Not an input: the dial code is derived from the country
                      above, so letting it be edited would just let the two
                      disagree. bdi keeps '+971' rendering LTR inside RTL copy. */}
                  <bdi className="auth-dial" aria-hidden="true">
                    +{countries.find((c) => c.iso === profile.country)?.dial || ''}
                  </bdi>
                  <input
                    id="auth-phone" name="phone" type="tel" required
                    autoComplete="tel-national" inputMode="tel" maxLength={20}
                    placeholder={t.auth_phone_ph}
                    value={profile.phone}
                    onChange={field('phone')}
                  />
                </div>
                <p className="auth-hint">{t.auth_phone_hint}</p>
              </div>

              <div className="auth-field">
                <label htmlFor="auth-industry">{t.auth_industry_label}</label>
                <select
                  id="auth-industry" name="industry" required
                  value={profile.industry}
                  onChange={field('industry')}
                >
                  <option value="" disabled>{t.auth_industry_ph}</option>
                  {INDUSTRIES.map((s) => (
                    <option key={s.id} value={s.id}>{ar ? s.ar : s.en}</option>
                  ))}
                </select>
              </div>

              <button type="submit" className="btn btn-primary btn-large auth-submit" disabled={busy}>
                <Icon name="building-2" size={18} />
                <span>{busy ? t.auth_profile_saving : t.auth_profile_cta}</span>
              </button>

              <p className="auth-privacy">{t.auth_privacy}</p>
            </form>
          )}

          {step === 'done' && (
            <div className="auth-done">
              <span className="auth-done-mark" aria-hidden="true">
                <Icon name="check" size={26} />
              </span>
              <h1 className="auth-title" tabIndex={-1} ref={stepHeading}>
                {returning ? t.auth_done_back : t.auth_done_title}
              </h1>
              <p className="auth-sub">
                {returning ? t.auth_done_back_sub : t.auth_done_sub}
              </p>
              {account?.email && <p className="auth-whoami"><bdi>{account.email}</bdi></p>}

              <a
                className="btn btn-primary btn-large auth-submit"
                href={CALENDAR_URL} target="_blank" rel="noopener noreferrer"
              >
                <Icon name="calendar" size={18} />
                <span>{t.auth_done_book}</span>
              </a>
              <a
                className="btn btn-ghost btn-large auth-submit"
                href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer"
              >
                <Icon name="whatsapp" size={18} />
                <span>{t.auth_done_whatsapp}</span>
              </a>

              <div className="auth-alt">
                <button type="button" className="auth-link" onClick={signOut} disabled={busy}>
                  {t.auth_signout}
                </button>
                <a className="auth-link" href={ar ? '/' : '/en'}>{t.auth_back}</a>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
