import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../../lib/api';
import { useLocale } from '../../lib/auth';
import { PageContainer } from '../../layouts/PublicLayout';
import { Button, Field, Select, StatusBadge, TextArea, TextInput, fmtDateTime } from '../../components/ui';

interface TrackResult {
  reference: string;
  status: string;
  fullName?: string;
  contactName?: string;
  publicMessage?: string | null;
  submittedAt: string;
  events: Array<{ eventType: string; toStatus?: string | null; messageEn?: string | null; messageAr?: string | null; createdAt: string }>;
  attachments?: Array<{ id: string; originalName: string; sizeBytes: number }>;
}

export default function TrackPage() {
  const { t } = useTranslation();
  const [locale] = useLocale();
  const [params, setParams] = useSearchParams();
  const [type, setType] = useState<'application' | 'request'>(
    params.get('type') === 'request' ? 'request' : 'application');
  const [reference, setReference] = useState(params.get('reference') ?? '');
  const [token, setToken] = useState(params.get('token') ?? '');
  const [result, setResult] = useState<TrackResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drType, setDrType] = useState<'correction' | 'deletion'>('correction');
  const [drMsg, setDrMsg] = useState('');
  const [drOk, setDrOk] = useState(false);

  const doTrack = async (e?: FormEvent): Promise<void> => {
    e?.preventDefault();
    if (!reference || token.length < 20) { setError(t('track.invalid')); return; }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const path = type === 'application' ? '/api/public/applications/track' : '/api/public/requests/track';
      const res = await api<TrackResult>(path, { method: 'POST', body: { reference, token } });
      setResult(res);
      setParams({ type, reference, token });
    } catch (err) {
      const e2 = err as ApiError;
      setError(e2.status === 404 ? t('track.invalid') : e2.code === 'RATE_LIMITED' ? t('errors.e429') : t('common.errorGeneric'));
    } finally { setBusy(false); }
  };

  useEffect(() => {
    if (params.get('reference') && params.get('token') && !result && !busy) void doTrack();
     
  }, []);

  const submitDataRequest = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/api/public/applications/data-request', {
        method: 'POST',
        body: { reference, token, requestType: drType, message: drMsg },
      });
      setDrOk(true);
    } catch { setError(t('common.errorGeneric')); } finally { setBusy(false); }
  };

  const statusNs = type === 'application' ? 'applicationsM.statuses' : 'requestsM.statuses';

  return (
    <PageContainer>
      <div className="form-card" style={{ maxWidth: 640, margin: '0 auto' }}>
        <h1 style={{ textAlign: 'center', marginTop: '1rem' }}>{t('track.title')}</h1>
        <p className="muted" style={{ textAlign: 'center' }}>{t('track.subtitle')}</p>
        <div className="card">
          <form onSubmit={(e) => void doTrack(e)}>
            <Field label={t('track.type')} htmlFor="ttype">
              <Select id="ttype" value={type} onChange={(e) => { setType(e.target.value as 'application' | 'request'); setResult(null); }}>
                <option value="application">{t('track.application')}</option>
                <option value="request">{t('track.contractRequest')}</option>
              </Select>
            </Field>
            <Field label={t('track.reference')} htmlFor="tref" required>
              <TextInput id="tref" dir="ltr" required value={reference} placeholder={type === 'application' ? 'APP-2026-000001' : 'REQ-2026-000001'}
                onChange={(e) => setReference(e.target.value.toUpperCase())} />
            </Field>
            <Field label={t('track.token')} htmlFor="ttok" required>
              <TextInput id="ttok" dir="ltr" required value={token} onChange={(e) => setToken(e.target.value)} />
            </Field>
            {error && <div className="alert alert-error" role="alert">{error}</div>}
            <Button type="submit" busy={busy} className="btn-block">{t('track.trackBtn')}</Button>
          </form>
        </div>

        {result && (
          <div className="card" style={{ marginTop: '1rem' }} aria-live="polite">
            <div className="row-between">
              <div>
                <div className="small muted">{result.fullName ?? result.contactName}</div>
                <div className="ref-box" style={{ fontSize: '1rem' }}>{result.reference}</div>
              </div>
              <StatusBadge status={result.status} label={t(`${statusNs}.${result.status}`, { defaultValue: result.status })} />
            </div>
            <div className="small muted">{t('track.submittedOn')}: {fmtDateTime(result.submittedAt, locale)}</div>
            {result.publicMessage && <div className="alert alert-info" style={{ marginTop: '0.8rem' }}>{result.publicMessage}</div>}
            <h3 style={{ marginTop: '1rem', fontSize: '0.95rem' }}>{t('track.history')}</h3>
            {result.events.length === 0 ? <p className="muted small">{t('track.noUpdates')}</p> : (
              <ul className="timeline">
                {result.events.map((ev, i) => (
                  <li key={i}>
                    <b>{ev.toStatus ? t(`${statusNs}.${ev.toStatus}`, { defaultValue: ev.toStatus }) : ev.eventType}</b>
                    <div className="t-date">{fmtDateTime(ev.createdAt, locale)}</div>
                    {(locale === 'ar' ? ev.messageAr ?? ev.messageEn : ev.messageEn) && (
                      <div className="small">{locale === 'ar' ? ev.messageAr ?? ev.messageEn : ev.messageEn}</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {result && type === 'application' && !drOk && (
          <div className="card" style={{ marginTop: '1rem' }}>
            <h3 style={{ fontSize: '0.95rem' }}>{t('track.dataRequest')}</h3>
            <p className="small muted">{t('track.dataRequestText')}</p>
            <form onSubmit={(e) => void submitDataRequest(e)}>
              <Field label={t('common.status')} htmlFor="drt">
                <Select id="drt" value={drType} onChange={(e) => setDrType(e.target.value as 'correction' | 'deletion')}>
                  <option value="correction">{t('track.correction')}</option>
                  <option value="deletion">{t('track.deletion')}</option>
                </Select>
              </Field>
              <Field label={t('track.drMessage')} htmlFor="drm">
                <TextArea id="drm" value={drMsg} onChange={(e) => setDrMsg(e.target.value)} maxLength={2000} />
              </Field>
              <Button type="submit" variant="outline" busy={busy}>{t('track.drSubmit')}</Button>
            </form>
          </div>
        )}
        {drOk && <div className="alert alert-success" style={{ marginTop: '1rem' }}>{t('track.drOk')}</div>}
      </div>
    </PageContainer>
  );
}
