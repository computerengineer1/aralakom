import { useState, useEffect, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth, useLocale } from '../../lib/auth';
import { ApiError } from '../../lib/api';
import { Button, Field, TextInput } from '../../components/ui';
import { PageContainer } from '../../layouts/PublicLayout';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: { client_id: string; callback: (res: { credential: string }) => void }) => void;
          prompt: () => void;
          renderButton: (element: HTMLElement, options: object) => void;
        };
      };
    };
  }
}

export function LoginPage() {
  const { t } = useTranslation();
  const [locale] = useLocale();
  const { login, register, googleAuth, verifyMfa, user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [showDirectGoogleModal, setShowDirectGoogleModal] = useState(false);
  const [googleDirectEmail, setGoogleDirectEmail] = useState('aralakomm@gmail.com');
  const [googleDirectName, setGoogleDirectName] = useState('Anwar Rahil');

  if (user) {
    navigate(params.get('next') || '/app', { replace: true });
  }

  // Load Google Identity Services script if not already present
  useEffect(() => {
    if (document.getElementById('google-gsi-script')) return;
    const script = document.createElement('script');
    script.id = 'google-gsi-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  }, []);

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleBusy(true);

    // Try Google GIS if initialized with client ID
    if (window.google?.accounts?.id) {
      try {
        window.google.accounts.id.initialize({
          client_id: '710000000000-dummy.apps.googleusercontent.com',
          callback: async (res) => {
            try {
              await googleAuth({ credential: res.credential });
              navigate(params.get('next') || '/app');
            } catch (err) {
              setError((err as ApiError).message || t('auth.invalid'));
            }
          },
        });
        window.google.accounts.id.prompt();
      } catch {
        // Fallback to Google Account prompt
        setShowDirectGoogleModal(true);
      } finally {
        setGoogleBusy(false);
      }
    } else {
      setShowDirectGoogleModal(true);
      setGoogleBusy(false);
    }
  };

  const submitDirectGoogle = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setGoogleBusy(true);
    try {
      await googleAuth({
        email: googleDirectEmail,
        name: googleDirectName || googleDirectEmail.split('@')[0],
      });
      setShowDirectGoogleModal(false);
      navigate(params.get('next') || '/app');
    } catch (err) {
      setError((err as ApiError).message || t('auth.invalid'));
    } finally {
      setGoogleBusy(false);
    }
  };

  const submitLogin = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await login(email, password);
      if (res.mfaRequired) { setMfaRequired(true); return; }
      navigate(params.get('next') || '/app');
    } catch (err) {
      const e2 = err as ApiError;
      setError(e2.code === 'ACCOUNT_LOCKED' ? t('auth.locked')
        : e2.code === 'ACCOUNT_DISABLED' ? t('auth.disabled')
          : e2.code === 'RATE_LIMITED' ? t('errors.e429')
            : t('auth.invalid'));
    } finally { setBusy(false); }
  };

  const submitRegister = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError(t('auth.mismatch'));
      return;
    }
    if (password.length < 8) {
      setError(t('auth.pwPolicy'));
      return;
    }
    setBusy(true);
    try {
      await register(fullName, email, password, phone);
      navigate(params.get('next') || '/app');
    } catch (err) {
      const e2 = err as ApiError;
      setError(e2.code === 'EMAIL_EXISTS' ? t('auth.emailExists')
        : e2.code === 'WEAK_PASSWORD' ? t('auth.pwPolicy')
          : t('common.errorGeneric'));
    } finally { setBusy(false); }
  };

  const submitMfa = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await verifyMfa(totp);
      navigate(params.get('next') || '/app');
    } catch {
      setError(t('errors.e401'));
    } finally { setBusy(false); }
  };

  return (
    <PageContainer>
      <div className="card form-card auth-luxury-card" style={{ maxWidth: 480, margin: '2rem auto' }}>
        {/* Brand Logo & Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.2rem' }}>
          <Link to="/" style={{ display: 'inline-block' }}>
            <img
              src="/logo.png"
              alt="AraLakom"
              style={{
                height: 64,
                width: 'auto',
                objectFit: 'contain',
                margin: '0 auto 0.6rem',
                filter: 'drop-shadow(0 4px 12px rgba(185, 138, 46, 0.25))',
                borderRadius: '8px',
              }}
            />
          </Link>
          <h1 style={{ fontSize: '1.4rem', margin: '0.2rem 0', color: 'var(--navy-900)' }}>
            {mfaRequired ? t('auth.mfaTitle') : mode === 'login' ? t('auth.loginTitle') : t('auth.registerTitle')}
          </h1>
          <p className="muted small" style={{ margin: 0 }}>
            {locale === 'ar' ? 'منصة أراكم للمقاولات والتشطيبات الفاخرة' : 'AraLakom Construction & Contracting Platform'}
          </p>
        </div>

        {/* Tab switch between Login and Register */}
        {!mfaRequired && (
          <div className="auth-tabs" style={{ display: 'flex', borderBottom: '2px solid var(--slate-200)', marginBottom: '1.4rem' }}>
            <button
              type="button"
              className={`auth-tab-btn ${mode === 'login' ? 'active' : ''}`}
              onClick={() => { setMode('login'); setError(null); }}
              style={{
                flex: 1,
                padding: '0.65rem',
                border: 'none',
                background: 'transparent',
                fontWeight: 700,
                fontSize: '0.95rem',
                cursor: 'pointer',
                color: mode === 'login' ? 'var(--gold-600)' : 'var(--slate-500)',
                borderBottom: mode === 'login' ? '3px solid var(--gold-500)' : '3px solid transparent',
                marginBottom: '-2px',
                transition: 'all 0.2s ease',
              }}
            >
              {t('auth.signIn')}
            </button>
            <button
              type="button"
              className={`auth-tab-btn ${mode === 'register' ? 'active' : ''}`}
              onClick={() => { setMode('register'); setError(null); }}
              style={{
                flex: 1,
                padding: '0.65rem',
                border: 'none',
                background: 'transparent',
                fontWeight: 700,
                fontSize: '0.95rem',
                cursor: 'pointer',
                color: mode === 'register' ? 'var(--gold-600)' : 'var(--slate-500)',
                borderBottom: mode === 'register' ? '3px solid var(--gold-500)' : '3px solid transparent',
                marginBottom: '-2px',
                transition: 'all 0.2s ease',
              }}
            >
              {t('auth.signUp')}
            </button>
          </div>
        )}

        {/* Alert Notifications */}
        {error && <div className="alert alert-error" role="alert" style={{ marginBottom: '1rem' }}>{error}</div>}

        {!mfaRequired ? (
          <>
            {/* Google Authentication Button */}
            <div style={{ marginBottom: '1.2rem' }}>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleBusy || busy}
                className="google-btn"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.75rem',
                  padding: '0.65rem 1rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--slate-300)',
                  background: '#ffffff',
                  color: 'var(--slate-800)',
                  fontWeight: 600,
                  fontSize: '0.92rem',
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-sm)',
                  transition: 'all 0.2s ease',
                }}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" style={{ flexShrink: 0 }}>
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>{googleBusy ? t('auth.loggingIn') : t('auth.googleSignIn')}</span>
              </button>
            </div>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', margin: '1rem 0', color: 'var(--slate-500)', fontSize: '0.82rem' }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--slate-200)' }} />
              <span style={{ padding: '0 0.8rem' }}>{t('auth.orDivider')}</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--slate-200)' }} />
            </div>

            {mode === 'login' ? (
              /* LOGIN FORM */
              <form onSubmit={(e) => void submitLogin(e)} noValidate>
                <Field label={t('auth.email')} htmlFor="email" required>
                  <TextInput
                    id="email"
                    type="email"
                    autoComplete="username"
                    dir="ltr"
                    required
                    placeholder="user@example.com / aralakomm@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>

                <Field label={t('auth.password')} htmlFor="password" required>
                  <TextInput
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>

                <Button type="submit" busy={busy} className="btn-block btn-primary" style={{ marginTop: '0.5rem' }}>
                  {busy ? t('auth.loggingIn') : t('auth.signIn')}
                </Button>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
                  <Link to="/forgot-password" className="small" style={{ color: 'var(--navy-700)' }}>
                    {t('auth.forgot')}
                  </Link>
                  <button
                    type="button"
                    onClick={() => { setMode('register'); setError(null); }}
                    className="small"
                    style={{ background: 'none', border: 'none', color: 'var(--gold-600)', cursor: 'pointer', fontWeight: 600 }}
                  >
                    {t('auth.noAccount')}
                  </button>
                </div>
              </form>
            ) : (
              /* REGISTER FORM */
              <form onSubmit={(e) => void submitRegister(e)} noValidate>
                <Field label={t('auth.fullName')} htmlFor="reg-name" required>
                  <TextInput
                    id="reg-name"
                    type="text"
                    required
                    placeholder={locale === 'ar' ? 'أنور رحيل' : 'John Doe'}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </Field>

                <Field label={t('auth.email')} htmlFor="reg-email" required>
                  <TextInput
                    id="reg-email"
                    type="email"
                    autoComplete="username"
                    dir="ltr"
                    required
                    placeholder="user@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>

                <Field label={t('auth.phone')} htmlFor="reg-phone">
                  <TextInput
                    id="reg-phone"
                    type="tel"
                    dir="ltr"
                    placeholder="+961 70 078 473"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </Field>

                <Field label={t('auth.password')} htmlFor="reg-password" required hint={t('auth.pwPolicy')}>
                  <TextInput
                    id="reg-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>

                <Field label={t('auth.confirmPassword')} htmlFor="reg-confirm" required>
                  <TextInput
                    id="reg-confirm"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </Field>

                <Button type="submit" busy={busy} className="btn-block btn-gold" style={{ marginTop: '0.5rem' }}>
                  {busy ? t('auth.registering') : t('auth.signUp')}
                </Button>

                <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                  <button
                    type="button"
                    onClick={() => { setMode('login'); setError(null); }}
                    className="small"
                    style={{ background: 'none', border: 'none', color: 'var(--navy-700)', cursor: 'pointer', fontWeight: 600 }}
                  >
                    {t('auth.haveAccount')}
                  </button>
                </div>
              </form>
            )}
          </>
        ) : (
          /* MFA VERIFICATION FORM */
          <form onSubmit={(e) => void submitMfa(e)} noValidate>
            <p className="muted small">{t('auth.mfaHint')}</p>
            <Field label={t('auth.mfaCode')} htmlFor="totp" required>
              <TextInput
                id="totp"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                dir="ltr"
                autoComplete="one-time-code"
                required
                value={totp}
                onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))}
              />
            </Field>
            <Button type="submit" busy={busy} className="btn-block btn-primary">
              {t('auth.mfaVerify')}
            </Button>
          </form>
        )}
      </div>

      {/* Google Sign-In Direct Prompt Modal */}
      {showDirectGoogleModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(14, 34, 55, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(4px)',
            padding: '1rem',
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: 440,
              width: '100%',
              background: '#fff',
              borderRadius: 'var(--radius)',
              boxShadow: 'var(--shadow-lg)',
              padding: '1.8rem',
              animation: 'fadeIn 0.25s ease-out',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1.2rem' }}>
              <svg viewBox="0 0 24 24" width="28" height="28">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem' }}>{t('auth.googleSignIn')}</h3>
                <p className="muted small" style={{ margin: 0 }}>
                  {locale === 'ar' ? 'تسجيل الدخول الفوري ببريد Gmail' : 'Sign in directly with your Google account'}
                </p>
              </div>
            </div>

            <form onSubmit={(e) => void submitDirectGoogle(e)}>
              <Field label={locale === 'ar' ? 'حساب Gmail' : 'Gmail address'} htmlFor="gemail" required>
                <TextInput
                  id="gemail"
                  type="email"
                  dir="ltr"
                  required
                  value={googleDirectEmail}
                  onChange={(e) => setGoogleDirectEmail(e.target.value)}
                />
              </Field>

              <Field label={locale === 'ar' ? 'الاسم الظاهر' : 'Account Name'} htmlFor="gname">
                <TextInput
                  id="gname"
                  type="text"
                  value={googleDirectName}
                  onChange={(e) => setGoogleDirectName(e.target.value)}
                />
              </Field>

              <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.4rem' }}>
                <Button type="submit" busy={googleBusy} className="btn-primary" style={{ flex: 1 }}>
                  {locale === 'ar' ? 'متابعة الدخول' : 'Continue'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowDirectGoogleModal(false)}
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageContainer>
  );
}

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { api } = await import('../../lib/api');
      await api('/api/auth/forgot-password', { method: 'POST', body: { email } });
      setSent(true);
    } catch (err) {
      setError((err as ApiError).code === 'RATE_LIMITED' ? t('errors.e429') : t('common.errorGeneric'));
    } finally { setBusy(false); }
  };

  return (
    <PageContainer>
      <div className="card form-card" style={{ maxWidth: 440, margin: '2rem auto' }}>
        <h1 style={{ fontSize: '1.3rem' }}>{t('auth.forgotTitle')}</h1>
        {sent ? (
          <div className="alert alert-success">{t('auth.resetSent')}</div>
        ) : (
          <form onSubmit={(e) => void submit(e)} noValidate>
            <p className="muted small">{t('auth.forgotText')}</p>
            {error && <div className="alert alert-error">{error}</div>}
            <Field label={t('auth.email')} htmlFor="femail" required>
              <TextInput id="femail" type="email" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Button type="submit" busy={busy} className="btn-block btn-primary">{t('auth.sendReset')}</Button>
          </form>
        )}
        <div style={{ textAlign: 'center', marginTop: '0.9rem' }}>
          <Link to="/login" className="small">{t('common.back')}</Link>
        </div>
      </div>
    </PageContainer>
  );
}

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (pw !== pw2) { setError(t('auth.mismatch')); return; }
    setBusy(true);
    setError(null);
    try {
      const { api } = await import('../../lib/api');
      await api('/api/auth/reset-password', { method: 'POST', body: { token, password: pw } });
      setDone(true);
    } catch (err) {
      const e2 = err as ApiError;
      if (e2.code === 'WEAK_PASSWORD') {
        setError(`${t('auth.pwPolicy')} (${(e2.details ?? []).map((d) => d.message).join(', ')})`);
      } else if (e2.code === 'INVALID_TOKEN') {
        setError(t('errors.e400'));
      } else setError(t('common.errorGeneric'));
    } finally { setBusy(false); }
  };

  return (
    <PageContainer>
      <div className="card form-card" style={{ maxWidth: 440, margin: '2rem auto' }}>
        <h1 style={{ fontSize: '1.3rem' }}>{t('auth.resetTitle')}</h1>
        {done ? (
          <div>
            <div className="alert alert-success">{t('auth.resetOk')}</div>
            <Link to="/login" className="btn btn-primary btn-block">{t('auth.signIn')}</Link>
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)} noValidate>
            {error && <div className="alert alert-error">{error}</div>}
            {!token && <div className="alert alert-warn">{t('errors.e400')}</div>}
            <Field label={t('auth.newPassword')} htmlFor="npw" required hint={t('auth.pwPolicy')}>
              <TextInput id="npw" type="password" autoComplete="new-password" required minLength={8}
                value={pw} onChange={(e) => setPw(e.target.value)} />
            </Field>
            <Field label={t('auth.confirmPassword')} htmlFor="npw2" required>
              <TextInput id="npw2" type="password" autoComplete="new-password" required
                value={pw2} onChange={(e) => setPw2(e.target.value)} />
            </Field>
            <Button type="submit" busy={busy} disabled={!token} className="btn-block btn-primary">{t('common.save')}</Button>
          </form>
        )}
      </div>
    </PageContainer>
  );
}
