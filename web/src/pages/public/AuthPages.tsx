import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../lib/auth';
import { ApiError, api } from '../../lib/api';
import { Button, Field, TextInput } from '../../components/ui';
import { PageContainer } from '../../layouts/PublicLayout';
import { IconLock } from '../../components/Icons';

export function LoginPage() {
  const { t } = useTranslation();
  const { login, verifyMfa, user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) { navigate('/app', { replace: true }); }

  const submit = async (e: FormEvent): Promise<void> => {
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
      <div className="card form-card" style={{ maxWidth: 440, marginTop: '2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <span className="avatar" style={{ width: 52, height: 52, margin: '0 auto', background: 'var(--navy-800)' }} aria-hidden>
            <IconLock size={24} />
          </span>
          <h1 style={{ fontSize: '1.3rem', marginTop: '0.7rem' }}>{mfaRequired ? t('auth.mfaTitle') : t('auth.loginTitle')}</h1>
        </div>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {!mfaRequired ? (
          <form onSubmit={(e) => void submit(e)} noValidate>
            <Field label={t('auth.email')} htmlFor="email" required>
              <TextInput id="email" type="email" autoComplete="username" dir="ltr" required
                value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label={t('auth.password')} htmlFor="password" required>
              <TextInput id="password" type="password" autoComplete="current-password" required
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Button type="submit" busy={busy} className="btn-block">{t('auth.signIn')}</Button>
            <div style={{ textAlign: 'center', marginTop: '0.9rem' }}>
              <Link to="/forgot-password" className="small">{t('auth.forgot')}</Link>
            </div>
          </form>
        ) : (
          <form onSubmit={(e) => void submitMfa(e)} noValidate>
            <p className="muted small">{t('auth.mfaHint')}</p>
            <Field label={t('auth.mfaCode')} htmlFor="totp" required>
              <TextInput id="totp" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} dir="ltr"
                autoComplete="one-time-code" required value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))} />
            </Field>
            <Button type="submit" busy={busy} className="btn-block">{t('auth.mfaVerify')}</Button>
          </form>
        )}
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
      await api('/api/auth/forgot-password', { method: 'POST', body: { email } });
      setSent(true);
    } catch (err) {
      setError((err as ApiError).code === 'RATE_LIMITED' ? t('errors.e429') : t('common.errorGeneric'));
    } finally { setBusy(false); }
  };

  return (
    <PageContainer>
      <div className="card form-card" style={{ maxWidth: 440, marginTop: '2rem' }}>
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
            <Button type="submit" busy={busy} className="btn-block">{t('auth.sendReset')}</Button>
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
      <div className="card form-card" style={{ maxWidth: 440, marginTop: '2rem' }}>
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
              <TextInput id="npw" type="password" autoComplete="new-password" required minLength={10}
                value={pw} onChange={(e) => setPw(e.target.value)} />
            </Field>
            <Field label={t('auth.confirmPassword')} htmlFor="npw2" required>
              <TextInput id="npw2" type="password" autoComplete="new-password" required
                value={pw2} onChange={(e) => setPw2(e.target.value)} />
            </Field>
            <Button type="submit" busy={busy} disabled={!token} className="btn-block">{t('common.save')}</Button>
          </form>
        )}
      </div>
    </PageContainer>
  );
}
