import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../../lib/api';
import { useAuth, useLocale } from '../../lib/auth';
import { Button, Field, Select, TextInput, useApi, useToast } from '../../components/ui';

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function ProfilePage() {
  const { t } = useTranslation();
  const { user, refresh } = useAuth();
  const [locale, setLoc] = useLocale();
  const toast = useToast();

  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [pwOk, setPwOk] = useState(false);

  const [mfa, setMfa] = useState<{ secret: string; otpauth: string; qrDataUrl: string } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [disablePw, setDisablePw] = useState('');
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaErr, setMfaErr] = useState<string | null>(null);
  const { data: me } = useApi<any>('/api/auth/me');

  const changePassword = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setPwErr(null); setPwOk(false);
    if (newPw !== newPw2) { setPwErr(t('auth.mismatch')); return; }
    setPwBusy(true);
    try {
      await api('/api/auth/change-password', { method: 'POST', body: { currentPassword: curPw, newPassword: newPw } });
      setPwOk(true); setCurPw(''); setNewPw(''); setNewPw2('');
    } catch (err) {
      const e2 = err as ApiError;
      setPwErr(e2.code === 'WEAK_PASSWORD' ? `${t('auth.pwPolicy')} (${(e2.details ?? []).map((d) => d.path).join(', ')})`
        : e2.code === 'INVALID_CREDENTIALS' ? t('auth.invalid') : e2.message);
    } finally { setPwBusy(false); }
  };

  const enrollMfa = async (): Promise<void> => {
    setMfaErr(null); setMfaBusy(true);
    try {
      const res = await api<{ secret: string; otpauth: string; qrDataUrl: string }>('/api/auth/mfa/enroll', { method: 'POST' });
      setMfa(res);
    } catch (e) { setMfaErr((e as ApiError).message); } finally { setMfaBusy(false); }
  };

  const confirmMfa = async (): Promise<void> => {
    setMfaErr(null); setMfaBusy(true);
    try {
      await api('/api/auth/mfa/confirm', { method: 'POST', body: { code: mfaCode } });
      toast(t('profileM.mfaEnabledOk'), 'success');
      setMfa(null); setMfaCode('');
      await refresh();
    } catch { setMfaErr(t('errors.e401')); } finally { setMfaBusy(false); }
  };

  const disableMfa = async (): Promise<void> => {
    setMfaErr(null); setMfaBusy(true);
    try {
      await api('/api/auth/mfa/disable', { method: 'POST', body: { password: disablePw } });
      toast(t('common.savedOk'), 'success');
      setDisablePw('');
      await refresh();
    } catch (e) {
      const e2 = e as ApiError;
      setMfaErr(e2.code === 'RECENT_AUTH_REQUIRED' ? t('adminM.recentAuth') : t('auth.invalid'));
    } finally { setMfaBusy(false); }
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <h1>{t('profileM.title')}</h1>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="row-between">
          <div>
            <b>{user?.fullName}</b>
            <div className="small muted" dir="ltr">{user?.email}</div>
            <div className="small muted">{t(`adminM.roles.${user?.role}`)}</div>
          </div>
          <Field label={t('profileM.localePref')} htmlFor="ploc">
            <Select id="ploc" value={locale} onChange={async (e) => {
              const l = e.target.value as 'ar' | 'en';
              setLoc(l);
              if (user) { try { await api('/api/auth/locale', { method: 'POST', body: { locale: l } }); } catch { /* non-fatal */ } }
            }}>
              <option value="ar">العربية</option><option value="en">English</option>
            </Select>
          </Field>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-title">{t('profileM.changePassword')}</div>
        <form onSubmit={(e) => void changePassword(e)}>
          <Field label={t('profileM.currentPassword')} htmlFor="cp" required>
            <TextInput id="cp" type="password" required autoComplete="current-password" value={curPw} onChange={(e) => setCurPw(e.target.value)} />
          </Field>
          <div className="grid-2">
            <Field label={t('profileM.newPassword')} htmlFor="np" required hint={t('auth.pwPolicy')}>
              <TextInput id="np" type="password" required minLength={10} autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
            </Field>
            <Field label={t('profileM.confirmNew')} htmlFor="np2" required>
              <TextInput id="np2" type="password" required autoComplete="new-password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} />
            </Field>
          </div>
          {pwErr && <div className="alert alert-error">{pwErr}</div>}
          {pwOk && <div className="alert alert-success">{t('profileM.passwordChanged')}</div>}
          <Button type="submit" busy={pwBusy}>{t('common.save')}</Button>
        </form>
      </div>

      <div className="card">
        <div className="card-title">{t('profileM.mfaSection')}</div>
        {me?.user?.mfaEnabled ? (
          <>
            <p className="small" style={{ color: 'var(--green-700)' }}>✓ {t('profileM.mfaEnabledOk')}</p>
            <p className="small muted">{t('profileM.disableWarn')}</p>
            <Field label={t('auth.password')} htmlFor="dpw">
              <TextInput id="dpw" type="password" autoComplete="current-password" value={disablePw} onChange={(e) => setDisablePw(e.target.value)} />
            </Field>
            <Button variant="danger" busy={mfaBusy} disabled={!disablePw} onClick={() => void disableMfa()}>{t('profileM.disableMfa')}</Button>
          </>
        ) : mfa ? (
          <>
            <p className="small">{t('profileM.scanQr')}</p>
            <div style={{ textAlign: 'center' }}>
              <img src={mfa.qrDataUrl} alt="TOTP QR code" width={220} height={220} style={{ border: '1px solid var(--border)', borderRadius: 8 }} />
            </div>
            <p className="small muted" dir="ltr" style={{ wordBreak: 'break-all' }}>{t('auth.mfaCode')}: <b>{mfa.secret}</b></p>
            <Field label={t('profileM.confirmCode')} htmlFor="mc" required>
              <TextInput id="mc" dir="ltr" inputMode="numeric" maxLength={6} value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))} />
            </Field>
            {mfaErr && <div className="alert alert-error">{mfaErr}</div>}
            <Button busy={mfaBusy} disabled={mfaCode.length !== 6} onClick={() => void confirmMfa()}>{t('auth.mfaVerify')}</Button>
          </>
        ) : (
          <>
            <p className="small muted">{t('profileM.security')}</p>
            {mfaErr && <div className="alert alert-error">{mfaErr}</div>}
            <Button busy={mfaBusy} onClick={() => void enrollMfa()}>{t('profileM.enableMfa')}</Button>
          </>
        )}
      </div>
    </div>
  );
}
