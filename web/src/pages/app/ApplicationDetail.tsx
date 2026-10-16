import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../../lib/api';
import { useLocale } from '../../lib/auth';
import {
  Breadcrumbs, Button, ErrorState, Field, Select, Spinner, StatusBadge, TextArea,
  useApi, useToast, fmtDateTime,
} from '../../components/ui';

interface Attachment { id: string; originalName: string; mimeType?: string; sizeBytes: number }
interface AppEvent { id: number; eventType: string; fromStatus?: string | null; toStatus?: string | null; visibility: string; messageEn?: string | null; messageAr?: string | null; createdAt: string }
interface AppDetail {
  application: Record<string, unknown> & {
    id: string; reference: string; fullName: string; phone: string; email?: string | null;
    personType: string; status: string; experienceYears: number; skills?: string | null;
    qualifications?: string | null; languages?: string | null; governorate?: string | null;
    district?: string | null; town?: string | null; preferredLocations?: string | null;
    availability?: string | null; expectedRate?: string | null; expectedRateCurrency?: string | null;
    internalNotes?: string | null; publicMessage?: string | null; evaluationScore?: number | null;
    submittedAt: string; personnelId?: string | null; consentGiven: boolean;
  };
  events: AppEvent[];
  attachments: Attachment[];
  category: { nameEn: string; nameAr: string } | null;
}

const NEXT_STATUSES: Record<string, string[]> = {
  submitted: ['under_review', 'shortlisted', 'rejected'],
  under_review: ['shortlisted', 'interview', 'approved', 'rejected'],
  shortlisted: ['interview', 'approved', 'rejected'],
  interview: ['approved', 'rejected'],
  approved: ['hired', 'rejected'],
  rejected: ['under_review'],
  hired: [],
};

export default function ApplicationDetail() {
  const { id } = useParams();
  const { t } = useTranslation();
  const [locale] = useLocale();
  const toast = useToast();
  const { data, loading, error, reload } = useApi<AppDetail>(`/api/applications/${id}`);

  const [newStatus, setNewStatus] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [publicEn, setPublicEn] = useState('');
  const [publicAr, setPublicAr] = useState('');
  const [score, setScore] = useState('');
  const [notifyApplicant, setNotifyApplicant] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');

  if (loading) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;
  const a = data.application;

  const changeStatus = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!newStatus) return;
    setBusy(true); setActionErr(null);
    try {
      await api(`/api/applications/${a.id}/status`, {
        method: 'POST',
        body: {
          status: newStatus,
          internalNote: internalNote || null,
          publicMessageEn: publicEn || null,
          publicMessageAr: publicAr || null,
          evaluationScore: score ? Number(score) : null,
          notifyApplicant,
        },
      });
      toast(t('common.savedOk'), 'success');
      setNewStatus(''); setInternalNote(''); setPublicEn(''); setPublicAr(''); setScore('');
      reload();
    } catch (err) {
      const e2 = err as ApiError;
      setActionErr(e2.code === 'INVALID_TRANSITION' ? e2.message : e2.code === 'RECENT_AUTH_REQUIRED' ? t('adminM.recentAuth') : e2.message);
    } finally { setBusy(false); }
  };

  const addNote = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!noteText.trim()) return;
    await api(`/api/applications/${a.id}/notes`, { method: 'POST', body: { note: noteText, visibility: 'internal' } });
    setNoteText('');
    reload();
  };

  const details: Array<[string, React.ReactNode]> = [
    [t('track.reference'), <span className="ltr-span">{a.reference}</span>],
    [t('applicationsM.applicant'), a.fullName],
    [t('personnelM.phone'), <span className="ltr-span" dir="ltr">{a.phone}</span>],
    ...(a.email ? [[t('auth.email'), <span dir="ltr">{a.email}</span>]] as Array<[string, React.ReactNode]> : []),
    [t('personnelM.type'), t(`personnelM.personType.${a.personType}`)],
    [t('personnelM.category'), data.category ? (locale === 'ar' ? data.category.nameAr : data.category.nameEn) : '—'],
    [t('personnelM.experience'), t('personnelM.years', { n: a.experienceYears })],
    [t('personnelM.governorate'), [a.governorate, a.district, a.town].filter(Boolean).join(' — ') || '—'],
    ...(a.preferredLocations ? [[t('applicationsM.preferredLocations'), a.preferredLocations]] as Array<[string, React.ReactNode]> : []),
    ...(a.availability ? [[t('apply.availability'), a.availability]] as Array<[string, React.ReactNode]> : []),
    ...(a.expectedRate ? [[t('applicationsM.expectedRate'), <span className="ltr-span mono-num">{a.expectedRate} {a.expectedRateCurrency}</span>]] as Array<[string, React.ReactNode]> : []),
    ...(a.languages ? [[t('personnelM.languagesSpoken'), a.languages]] as Array<[string, React.ReactNode]> : []),
    [t('applicationsM.submitted'), fmtDateTime(a.submittedAt, locale)],
    ...(a.personnelId ? [[t('personnelM.recordNo'), <Link to={`/app/personnel/${a.personnelId}`}>{String(a.personnelId).slice(0, 8)}…</Link>]] as Array<[string, React.ReactNode]> : []),
  ];

  const allowed = NEXT_STATUSES[a.status] ?? [];

  return (
    <div>
      <Breadcrumbs items={[{ label: t('applicationsM.title'), to: '/app/applications' }, { label: a.reference }]} />
      <div className="row-between">
        <h1>{a.fullName} <StatusBadge status={a.status} label={t(`applicationsM.statuses.${a.status}`)} /></h1>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div>
          <div className="card">
            <div className="card-title">{t('personnelM.details')}</div>
            <div className="detail-grid">
              {details.map(([k, v], i) => <div className="detail-item" key={i}><div className="k">{k}</div><div className="v">{v}</div></div>)}
            </div>
            {a.skills && <p className="small" style={{ marginTop: '0.7rem' }}><b>{t('apply.skills')}:</b> {a.skills}</p>}
            {a.qualifications && <p className="small"><b>{t('apply.qualifications')}:</b> <span style={{ whiteSpace: 'pre-line' }}>{a.qualifications}</span></p>}
          </div>

          {data.attachments.length > 0 && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <div className="card-title">{t('applicationsM.attachments')}</div>
              {data.attachments.map((f) => (
                <div key={f.id} className="row-between" style={{ padding: '0.3rem 0', borderBottom: '1px solid var(--slate-100)' }}>
                  <span className="small">📎 {f.originalName} <span className="muted">({Math.round(f.sizeBytes / 1024)} KB)</span></span>
                  <a className="btn btn-outline btn-sm" href={`/api/files/${f.id}/download`} target="_blank" rel="noreferrer">{t('common.download')}</a>
                </div>
              ))}
            </div>
          )}

          <div className="card" style={{ marginTop: '1rem' }}>
            <div className="card-title">{t('applicationsM.events')}</div>
            <ul className="timeline">
              {data.events.map((ev) => (
                <li key={ev.id}>
                  <b>{ev.toStatus ? t(`applicationsM.statuses.${ev.toStatus}`, { defaultValue: ev.toStatus }) : ev.eventType}</b>
                  {ev.visibility === 'applicant' && <span className="badge badge-blue" style={{ marginInlineStart: '0.4rem' }}>{t('applicationsM.visibleToApplicant')}</span>}
                  <div className="t-date">{fmtDateTime(ev.createdAt, locale)}</div>
                  {(locale === 'ar' ? ev.messageAr ?? ev.messageEn : ev.messageEn) && (
                    <div className="small">{locale === 'ar' ? ev.messageAr ?? ev.messageEn : ev.messageEn}</div>
                  )}
                </li>
              ))}
              {data.events.length === 0 && <span className="muted small">{t('common.noResults')}</span>}
            </ul>
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-title">{t('applicationsM.changeStatus')}</div>
            {allowed.length === 0 ? (
              <p className="muted small">—</p>
            ) : (
              <form onSubmit={(e) => void changeStatus(e)}>
                <Field label={t('common.status')} htmlFor="st" required>
                  <Select id="st" value={newStatus} onChange={(e) => setNewStatus(e.target.value)} required>
                    <option value="">—</option>
                    {allowed.map((s) => <option key={s} value={s}>{t(`applicationsM.statuses.${s}`)}</option>)}
                  </Select>
                </Field>
                {newStatus === 'hired' && <div className="alert alert-info">{t('applicationsM.convertNote')}</div>}
                <Field label={t('applicationsM.internalNotes')} htmlFor="inote">
                  <TextArea id="inote" value={internalNote} onChange={(e) => setInternalNote(e.target.value)} />
                </Field>
                <Field label={t('applicationsM.publicMessage') + ' (EN)'} htmlFor="pen">
                  <TextArea id="pen" value={publicEn} onChange={(e) => setPublicEn(e.target.value)} />
                </Field>
                <Field label={t('applicationsM.publicMessage') + ' (AR)'} htmlFor="par">
                  <TextArea id="par" dir="rtl" value={publicAr} onChange={(e) => setPublicAr(e.target.value)} />
                </Field>
                <Field label={t('applicationsM.score')} htmlFor="score">
                  <TextInputScore id="score" value={score} onChange={setScore} />
                </Field>
                <label className="checkbox-row small" style={{ marginBottom: '0.8rem' }}>
                  <input type="checkbox" checked={notifyApplicant} onChange={(e) => setNotifyApplicant(e.target.checked)} />
                  {t('applicationsM.notify')}
                </label>
                {actionErr && <div className="alert alert-error">{actionErr}</div>}
                <Button type="submit" busy={busy} disabled={!newStatus}>{t('common.confirm')}</Button>
              </form>
            )}
          </div>

          <div className="card" style={{ marginTop: '1rem' }}>
            <div className="card-title">{t('applicationsM.addNote')}</div>
            <form onSubmit={(e) => void addNote(e)}>
              <TextArea placeholder={t('applicationsM.notePlaceholder')} value={noteText} onChange={(e) => setNoteText(e.target.value)} />
              <div style={{ marginTop: '0.6rem' }}>
                <Button type="submit" size="sm" variant="outline" disabled={!noteText.trim()}>{t('common.save')}</Button>
              </div>
            </form>
            {a.internalNotes && (
              <p className="small muted" style={{ marginTop: '0.8rem', whiteSpace: 'pre-line' }}><b>{t('applicationsM.internalNotes')}:</b><br />{a.internalNotes}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TextInputScore({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <input id={id} className="input" type="number" min={0} max={10} dir="ltr" value={value}
      onChange={(e) => onChange(e.target.value)} />
  );
}
