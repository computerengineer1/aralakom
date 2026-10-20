import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth, useLocale } from '../../lib/auth';
import { ApiError, api } from '../../lib/api';
import { Button, Field, TextInput } from '../../components/ui';
import { PageContainer } from '../../layouts/PublicLayout';

export function LoginPage() {
  const { t } = useTranslation();
  const [locale] = useLocale();
  const { login, register, verifyMfa, user } = useAuth();
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

  if (user) {
    navigate(params.get('next') || '/app', { replace: true });
  }

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
                    placeholder="user@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>

                <Field label={t('auth.password')} htmlFor="password" required>
                  <TextInput
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    dir="ltr"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                  <Link to="/forgot-password" style={{ fontSize: '0.85rem', color: 'var(--gold-600)' }}>
                    {t('auth.forgotPassword')}
                  </Link>
                </div>

                <Button type="submit" busy={busy} className="btn-block btn-primary btn-gold-gradient">
                  {t('auth.submitLogin')}
                </Button>
              </form>
            ) : (
              /* REGISTRATION FORM */
              <form onSubmit={(e) => void submitRegister(e)} noValidate>
                <Field label={locale === 'ar' ? 'الاسم الكامل' : 'Full Name'} htmlFor="fullName" required>
                  <TextInput
                    id="fullName"
                    type="text"
                    required
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </Field>

                <Field label={t('auth.email')} htmlFor="regEmail" required>
                  <TextInput
                    id="regEmail"
                    type="email"
                    autoComplete="email"
                    dir="ltr"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>

                <Field label={locale === 'ar' ? 'رقم الهاتف' : 'Phone Number'} htmlFor="regPhone">
                  <TextInput
                    id="regPhone"
                    type="tel"
                    dir="ltr"
                    autoComplete="tel"
                    placeholder="+961..."
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </Field>

                <Field label={t('auth.password')} htmlFor="regPassword" required hint={t('auth.pwPolicy')}>
                  <TextInput
                    id="regPassword"
                    type="password"
                    autoComplete="new-password"
                    dir="ltr"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>

                <Field label={t('auth.confirmPassword')} htmlFor="confirmPassword" required>
                  <TextInput
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    dir="ltr"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </Field>

                <Button type="submit" busy={busy} className="btn-block btn-primary btn-gold-gradient" style={{ marginTop: '0.6rem' }}>
                  {t('auth.submitRegister')}
                </Button>
              </form>
            )}

            {/* Discreet Management Portal Link */}
            <div style={{ marginTop: '1.6rem', textAlign: 'center', borderTop: '1px solid var(--slate-200)', paddingTop: '1rem' }}>
              <Link to="/portal" style={{ color: 'var(--slate-600)', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', textDecoration: 'none' }}>
                <span style={{ color: 'var(--gold-500)' }}>🛡️</span>
                <span>{locale === 'ar' ? 'بوابة الإدارة والتحكم (للمالك والمدراء فقط)' : 'Staff Executive Security Gateway'}</span>
              </Link>
            </div>
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
    </PageContainer>
  );
}

/**
 * High-Security Dedicated Management Portal (/portal)
 * Exclusive entry gate for Owner (Anwar Rahil) and Authorized Managers (Mahmoud Rhayel and executive staff).
 */
export function PortalPage() {
  const [locale] = useLocale();
  const { login, logout, user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If already logged in as staff, proceed directly to control dashboard
  if (user) {
    const isStaff = ['owner', 'admin', 'pm', 'accountant', 'hr', 'engineer'].includes(user.role);
    if (isStaff) {
      navigate(params.get('next') || '/app', { replace: true });
    }
  }

  const submitPortalLogin = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const res = await login(email, password);
      if (res.mfaRequired) {
        navigate('/login');
        return;
      }

      // Check current user role after login
      const meRes = await api<{ user: { role: string; fullName: string } | null }>('/api/auth/me');
      if (!meRes.user || !['owner', 'admin', 'pm', 'accountant', 'hr', 'engineer'].includes(meRes.user.role)) {
        await logout();
        setError(
          locale === 'ar'
            ? 'غير مصرح: هذا المدخل مخصص حصرياً للمالك وفريق الإدارة التنفيذي للشركة. تم حظر محاولة الوصول وتسجيلها.'
            : 'Access Denied: This executive portal is exclusively reserved for the Owner and Management team. Attempt logged.'
        );
        return;
      }

      navigate(params.get('next') || '/app');
    } catch (err) {
      const e2 = err as ApiError;
      setError(
        e2.code === 'ACCOUNT_LOCKED'
          ? (locale === 'ar' ? 'تم قفل الحساب مؤقتاً بسبب تكرار المحاولات غير الصحيحة لحماية النظام.' : 'Account temporarily locked due to repeated attempts.')
          : e2.code === 'ACCOUNT_DISABLED'
            ? (locale === 'ar' ? 'هذا الحساب معطّل. تواصل مع الدعم الفني.' : 'This account is disabled.')
            : (locale === 'ar' ? 'بيانات الاعتماد غير صحيحة. يرجى التحقق من البريد وكلمة المرور الخاصة بالإدارة.' : 'Invalid executive credentials. Access denied.')
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageContainer>
      <div
        className="card form-card portal-card"
        style={{
          maxWidth: 480,
          margin: '2.5rem auto',
          background: 'linear-gradient(145deg, #09131e 0%, #0d1e30 100%)',
          border: '1px solid rgba(185, 138, 46, 0.45)',
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.45)',
          borderRadius: '16px',
          color: '#ffffff',
          padding: '2.4rem 2rem',
        }}
      >
        {/* Security Badge */}
        <div style={{ textAlign: 'center', marginBottom: '1.4rem' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.35rem 0.9rem',
              background: 'rgba(185, 138, 46, 0.15)',
              border: '1px solid rgba(185, 138, 46, 0.5)',
              borderRadius: '20px',
              fontSize: '0.78rem',
              fontWeight: 800,
              color: 'var(--gold-400)',
              letterSpacing: '0.04em',
              marginBottom: '1rem',
            }}
          >
            <span>🛡️</span>
            <span>{locale === 'ar' ? 'بوابة الإدارة والتحكم التنفيذية' : 'EXECUTIVE SECURITY GATEWAY'}</span>
          </div>

          <Link to="/" style={{ display: 'inline-block' }}>
            <img
              src="/logo.png"
              alt="AraLakom"
              style={{
                height: 70,
                width: 'auto',
                objectFit: 'contain',
                margin: '0 auto 0.6rem',
                filter: 'drop-shadow(0 4px 16px rgba(185, 138, 46, 0.4))',
                borderRadius: '8px',
              }}
            />
          </Link>

          <h1 style={{ fontSize: '1.45rem', margin: '0.3rem 0', color: '#fff', fontWeight: 800 }}>
            {locale === 'ar' ? 'تسجيل دخول الإدارة العليا' : 'Executive Management Access'}
          </h1>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#a0b3c6', lineHeight: 1.5 }}>
            {locale === 'ar'
              ? 'منطقة محمية مخصصة للمالك والإدارة التنفيذية للتحكم وإدارة مشاريع وعمليات الشركة.'
              : 'Restricted administrative environment for Owner and authorized management.'}
          </p>
        </div>

        {error && (
          <div
            className="alert alert-error"
            role="alert"
            style={{
              marginBottom: '1.2rem',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#fca5a5',
              fontSize: '0.88rem',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={(e) => void submitPortalLogin(e)} noValidate>
          <div style={{ marginBottom: '1.2rem' }}>
            <label
              htmlFor="portalEmail"
              style={{ display: 'block', fontSize: '0.88rem', fontWeight: 700, color: 'var(--gold-400)', marginBottom: '0.4rem' }}
            >
              {locale === 'ar' ? 'البريد الإلكتروني المعتمد للإدارة' : 'Authorized Staff Email'}
            </label>
            <input
              id="portalEmail"
              type="email"
              autoComplete="username"
              dir="ltr"
              required
              placeholder="management@aralakom.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                background: 'rgba(14, 34, 55, 0.85)',
                border: '1px solid rgba(185, 138, 46, 0.4)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '0.95rem',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ marginBottom: '1.4rem' }}>
            <label
              htmlFor="portalPassword"
              style={{ display: 'block', fontSize: '0.88rem', fontWeight: 700, color: 'var(--gold-400)', marginBottom: '0.4rem' }}
            >
              {locale === 'ar' ? 'كلمة المرور الأمنية' : 'Security Password'}
            </label>
            <input
              id="portalPassword"
              type="password"
              autoComplete="current-password"
              dir="ltr"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                background: 'rgba(14, 34, 55, 0.85)',
                border: '1px solid rgba(185, 138, 46, 0.4)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '0.95rem',
                outline: 'none',
              }}
            />
          </div>

          <Button
            type="submit"
            busy={busy}
            className="btn-block btn-gold btn-gold-gradient"
            style={{
              padding: '0.8rem',
              fontSize: '1rem',
              fontWeight: 800,
              borderRadius: '8px',
              border: 'none',
              color: '#0e2237',
              boxShadow: '0 4px 14px rgba(185, 138, 46, 0.4)',
            }}
          >
            {busy ? (locale === 'ar' ? 'جارٍ التحقق الأمني...' : 'Authenticating...') : (locale === 'ar' ? 'تسجيل الدخول إلى لوحة التحكم' : 'Access Control Center')}
          </Button>
        </form>

        <div style={{ marginTop: '1.8rem', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '1rem', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: '0.78rem', color: '#7e93a8' }}>
            🔒 {locale === 'ar' ? 'اتصال مشفر بتشفير 256-Bit SSL. حماية فائقة ضد هجمات التخمين.' : '256-Bit SSL Encrypted & Brute-Force Protected.'}
          </p>
          <div style={{ marginTop: '0.6rem' }}>
            <Link to="/login" style={{ color: 'var(--gold-400)', fontSize: '0.82rem', textDecoration: 'none' }}>
              ← {locale === 'ar' ? 'الرجوع لصفحة العملاء والجمهور' : 'Return to Public Login'}
            </Link>
          </div>
        </div>
      </div>
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
      await api('/api/auth/password/forgot', { method: 'POST', body: { email } });
      setSent(true);
    } catch {
      setSent(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageContainer>
      <div className="card form-card" style={{ maxWidth: 440, margin: '3rem auto' }}>
        <h1>{t('auth.forgotPassword')}</h1>
        {sent ? (
          <div className="alert alert-info">
            <p>{t('auth.resetSent')}</p>
            <Link to="/login">{t('auth.backToLogin')}</Link>
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)} noValidate>
            {error && <div className="alert alert-error">{error}</div>}
            <Field label={t('auth.email')} htmlFor="email" required>
              <TextInput
                id="email"
                type="email"
                required
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Button type="submit" busy={busy} className="btn-block btn-primary">
              {t('common.submit')}
            </Button>
          </form>
        )}
      </div>
    </PageContainer>
  );
}

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(t('auth.mismatch'));
      return;
    }
    setBusy(true);
    try {
      await api('/api/auth/password/reset', { method: 'POST', body: { token, password } });
      setDone(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      const e2 = err as ApiError;
      setError(e2.code === 'INVALID_TOKEN' ? t('auth.tokenInvalid') : t('common.errorGeneric'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageContainer>
      <div className="card form-card" style={{ maxWidth: 440, margin: '3rem auto' }}>
        <h1>{t('auth.resetPassword')}</h1>
        {done ? (
          <div className="alert alert-success">{t('auth.passwordUpdated')}</div>
        ) : (
          <form onSubmit={(e) => void submit(e)} noValidate>
            {error && <div className="alert alert-error">{error}</div>}
            <Field label={t('auth.password')} htmlFor="password" required hint={t('auth.pwPolicy')}>
              <TextInput
                id="password"
                type="password"
                required
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Field label={t('auth.confirmPassword')} htmlFor="confirm" required>
              <TextInput
                id="confirm"
                type="password"
                required
                dir="ltr"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>
            <Button type="submit" busy={busy} className="btn-block btn-primary">
              {t('common.submit')}
            </Button>
          </form>
        )}
      </div>
    </PageContainer>
  );
}
