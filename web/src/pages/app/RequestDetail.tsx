import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../../lib/api';
import { useAuth, useLocale } from '../../lib/auth';
import { usePublicData } from '../../lib/publicData';
import {
  Breadcrumbs, Button, ErrorState, Field, Modal, Select, Spinner, StatusBadge, TextArea,
  TextInput, Money, useApi, useToast, fmtDate, fmtDateTime,
} from '../../components/ui';

interface ReqEvent { id: number; eventType: string; toStatus?: string | null; visibility: string; messageEn?: string | null; messageAr?: string | null; createdAt: string }
interface SiteVisit { id: string; scheduledAt: string; status: string; location?: string | null }
interface ReqDetail {
  request: Record<string, unknown> & {
    id: string; reference: string; contactName: string; phone: string; email?: string | null;
    company?: string | null; language: 'ar' | 'en'; status: string; categoryId?: string | null;
    description: string; governorate?: string | null; district?: string | null; town?: string | null;
    propertyType?: string | null; areaValue?: string | null; areaUnit?: string;
    desiredStart?: string | null; deadline?: string | null; budget?: string | null; budgetCurrency?: string | null;
    preferredContact?: string; internalNotes?: string | null; assignedTo?: string | null;
    projectId?: string | null; submittedAt: string; customerId?: string | null;
  };
  events: ReqEvent[];
  attachments: Array<{ id: string; originalName: string; sizeBytes: number }>;
  category: { nameEn: string; nameAr: string } | null;
  siteVisits: SiteVisit[];
}

const NEXT: Record<string, string[]> = {
  submitted: ['under_review', 'cancelled'],
  under_review: ['needs_info', 'site_visit', 'estimating', 'cancelled'],
  needs_info: ['under_review', 'estimating', 'cancelled', 'expired'],
  site_visit: ['estimating', 'needs_info', 'cancelled'],
  estimating: ['quotation_prepared', 'needs_info', 'cancelled'],
  quotation_prepared: ['quotation_sent', 'estimating', 'cancelled'],
  quotation_sent: ['accepted', 'declined', 'expired', 'estimating'],
  accepted: ['contracted', 'declined', 'cancelled'],
  declined: ['under_review'],
  expired: ['under_review'],
  contracted: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export default function RequestDetail() {
  const { id } = useParams();
  const { t } = useTranslation();
  const [locale] = useLocale();
  const { can, user } = useAuth();
  const toast = useToast();
  const { requestCategories } = usePublicData();
  const { data, loading, error, reload } = useApi<ReqDetail>(`/api/requests/${id}`);
  const { data: usersData } = useApi<{ items: Array<{ id: string; fullName: string; role: string }> }>(can('users.manage') ? '/api/users' : '', []);

  const [newStatus, setNewStatus] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [custEn, setCustEn] = useState('');
  const [custAr, setCustAr] = useState('');
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [convertOpen, setConvertOpen] = useState(false);
  const [visitOpen, setVisitOpen] = useState(false);

  if (loading) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;
  const r = data.request;
  const allowed = NEXT[r.status] ?? [];
  const canManage = can('requests.manage');

  const changeStatus = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!newStatus) return;
    setBusy(true); setActionErr(null);
    try {
      await api(`/api/requests/${r.id}/status`, {
        method: 'POST',
        body: { status: newStatus, internalNote: internalNote || null, customerMessageEn: custEn || null, customerMessageAr: custAr || null, notifyCustomer },
      });
      toast(t('common.savedOk'), 'success');
      setNewStatus(''); setInternalNote(''); setCustEn(''); setCustAr('');
      reload();
    } catch (err) { setActionErr((err as ApiError).message); } finally { setBusy(false); }
  };

  const details: Array<[string, React.ReactNode]> = [
    [t('track.reference'), <span className="ltr-span">{r.reference}</span>],
    [t('requestsM.customer'), <span>{r.contactName}{r.company && <span className="muted"> · {r.company}</span>}</span>],
    [t('personnelM.phone'), <span className="ltr-span" dir="ltr">{r.phone}</span>],
    ...(r.email ? [[t('auth.email'), <span dir="ltr">{r.email}</span>]] as Array<[string, React.ReactNode]> : []),
    [t('requestsM.category'), data.category ? (locale === 'ar' ? data.category.nameAr : data.category.nameEn) : '—'],
    [t('requestsM.property'), r.propertyType ? t(`request.${r.propertyType === 'other' ? 'otherProp' : r.propertyType}`) : '—'],
    ...(r.areaValue ? [[t('requestsM.area'), <span className="ltr-span">{r.areaValue} {r.areaUnit}</span>]] as Array<[string, React.ReactNode]> : []),
    [t('personnelM.governorate'), [r.governorate, r.district, r.town].filter(Boolean).join(' — ') || '—'],
    ...(r.desiredStart ? [[t('requestsM.desiredStart'), fmtDate(r.desiredStart, locale)]] as Array<[string, React.ReactNode]> : []),
    ...(r.deadline ? [[t('requestsM.deadline'), fmtDate(r.deadline, locale)]] as Array<[string, React.ReactNode]> : []),
    ...(r.budget ? [[t('requestsM.budget'), <Money amount={r.budget} currency={r.budgetCurrency ?? 'USD'} locale={locale} />]] as Array<[string, React.ReactNode]> : []),
    [t('requestsM.contactPref'), t(`request.${r.preferredContact === 'whatsapp' ? 'whatsappC' : r.preferredContact === 'email' ? 'emailC' : 'phoneC'}`)],
    [t('applicationsM.submitted'), fmtDateTime(r.submittedAt, locale)],
    ...(r.projectId ? [[t('app.projectsList'), <Link to={`/app/projects/${r.projectId}`}>→</Link>]] as Array<[string, React.ReactNode]> : []),
  ];

  void requestCategories; void usersData; void user;

  return (
    <div>
      <Breadcrumbs items={[{ label: t('requestsM.title'), to: '/app/requests' }, { label: r.reference }]} />
      <div className="row-between">
        <h1>{r.contactName} <StatusBadge status={r.status} label={t(`requestsM.statuses.${r.status}`)} /></h1>
        <div className="row no-print">
          {canManage && ['accepted', 'quotation_sent'].includes(r.status) && !r.projectId && (
            <Button variant="gold" size="sm" onClick={() => setConvertOpen(true)}>{t('requestsM.convert')}</Button>
          )}
          {canManage && <Button variant="outline" size="sm" onClick={() => setVisitOpen(true)}>{t('requestsM.scheduleVisit')}</Button>}
        </div>
      </div>
      {['submitted', 'under_review'].includes(r.status) && (
        <div className="alert alert-info">{t('requestsM.noQuotePromise')}</div>
      )}

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div>
          <div className="card">
            <div className="card-title">{t('personnelM.details')}</div>
            <div className="detail-grid">
              {details.map(([k, v], i) => <div className="detail-item" key={i}><div className="k">{k}</div><div className="v">{v}</div></div>)}
            </div>
            <div style={{ marginTop: '0.8rem' }}>
              <div className="k small muted" style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: 'var(--slate-500)' }}>{t('request.description')}</div>
              <p className="small" style={{ whiteSpace: 'pre-line' }}>{r.description}</p>
            </div>
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
            <div className="card-title">{t('requestsM.siteVisits')}</div>
            {data.siteVisits.length === 0 && <span className="muted small">{t('common.noResults')}</span>}
            {data.siteVisits.map((v) => (
              <div key={v.id} className="row-between" style={{ padding: '0.35rem 0', borderBottom: '1px solid var(--slate-100)' }}>
                <span className="small">{fmtDateTime(v.scheduledAt, locale)}{v.location ? ` — ${v.location}` : ''}</span>
                <StatusBadge status={v.status === 'done' ? 'done' : v.status === 'cancelled' ? 'cancelled' : 'pending'} label={v.status} />
              </div>
            ))}
          </div>

          <div className="card" style={{ marginTop: '1rem' }}>
            <div className="card-title">{t('requestsM.events')}</div>
            <ul className="timeline">
              {data.events.map((ev) => (
                <li key={ev.id}>
                  <b>{ev.toStatus ? t(`requestsM.statuses.${ev.toStatus}`, { defaultValue: ev.toStatus }) : ev.eventType}</b>
                  {ev.visibility === 'customer' && <span className="badge badge-blue" style={{ marginInlineStart: '0.4rem' }}>{t('requestsM.customer')}</span>}
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

        {canManage && (
          <div>
            <div className="card">
              <div className="card-title">{t('requestsM.changeStatus')}</div>
              {allowed.length === 0 ? <p className="muted small">—</p> : (
                <form onSubmit={(e) => void changeStatus(e)}>
                  <Field label={t('common.status')} htmlFor="rst" required>
                    <Select id="rst" value={newStatus} onChange={(e) => setNewStatus(e.target.value)} required>
                      <option value="">—</option>
                      {allowed.map((s) => <option key={s} value={s}>{t(`requestsM.statuses.${s}`)}</option>)}
                    </Select>
                  </Field>
                  <Field label={t('requestsM.internalNotes')} htmlFor="rin">
                    <TextArea id="rin" value={internalNote} onChange={(e) => setInternalNote(e.target.value)} />
                  </Field>
                  <Field label={t('requestsM.customerMessage') + ' (EN)'} htmlFor="rcen">
                    <TextArea id="rcen" value={custEn} onChange={(e) => setCustEn(e.target.value)} />
                  </Field>
                  <Field label={t('requestsM.customerMessage') + ' (AR)'} htmlFor="rcar">
                    <TextArea id="rcar" dir="rtl" value={custAr} onChange={(e) => setCustAr(e.target.value)} />
                  </Field>
                  <label className="checkbox-row small" style={{ marginBottom: '0.8rem' }}>
                    <input type="checkbox" checked={notifyCustomer} onChange={(e) => setNotifyCustomer(e.target.checked)} />
                    {t('requestsM.notify')}
                  </label>
                  {actionErr && <div className="alert alert-error">{actionErr}</div>}
                  <Button type="submit" busy={busy} disabled={!newStatus}>{t('common.confirm')}</Button>
                </form>
              )}
              {r.internalNotes && (
                <p className="small muted" style={{ marginTop: '0.9rem', whiteSpace: 'pre-line' }}>
                  <b>{t('requestsM.internalNotes')}:</b><br />{r.internalNotes}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {convertOpen && <ConvertModal requestId={r.id} defaultName={data.category ? (locale === 'ar' ? data.category.nameAr : data.category.nameEn) + ' — ' + r.contactName : r.contactName} onClose={() => setConvertOpen(false)} onDone={() => { setConvertOpen(false); reload(); }} />}
      {visitOpen && <VisitModal requestId={r.id} onClose={() => setVisitOpen(false)} onDone={() => { setVisitOpen(false); reload(); }} />}
    </div>
  );
}

function ConvertModal({ requestId, defaultName, onClose, onDone }: { requestId: string; defaultName: string; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [name, setName] = useState(defaultName);
  const [startDate, setStartDate] = useState('');
  const [targetEndDate, setTargetEndDate] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title={t('requestsM.convertTitle')} onClose={onClose}>
      <p className="small muted">{t('requestsM.convertNote')}</p>
      <Field label={t('requestsM.projectName')} htmlFor="cpn" required>
        <TextInput id="cpn" required value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="grid-2">
        <Field label={t('requestsM.startDate')} htmlFor="cps">
          <TextInput id="cps" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label={t('requestsM.targetEnd')} htmlFor="cpe">
          <TextInput id="cpe" type="date" value={targetEndDate} onChange={(e) => setTargetEndDate(e.target.value)} />
        </Field>
        <Field label={t('requestsM.contractAmount')} htmlFor="cpa">
          <TextInput id="cpa" dir="ltr" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
        </Field>
        <Field label={t('common.currency')} htmlFor="cpc">
          <Select id="cpc" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="USD">USD</option><option value="LBP">LBP</option>
          </Select>
        </Field>
      </div>
      {err && <div className="alert alert-error">{err}</div>}
      <div className="modal-actions">
        <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
        <Button busy={busy} onClick={async () => {
          setBusy(true); setErr(null);
          try {
            const res = await api<{ projectNo: string; projectId: string }>(`/api/requests/${requestId}/convert`, {
              method: 'POST',
              body: {
                name, startDate: startDate || null, targetEndDate: targetEndDate || null,
                contractAmount: amount || null, contractCurrency: amount ? currency : null,
              },
            });
            toast(`${t('common.savedOk')} — ${res.projectNo}`, 'success');
            onDone();
          } catch (e) { setErr((e as ApiError).message); } finally { setBusy(false); }
        }}>{t('requestsM.convert')}</Button>
      </div>
    </Modal>
  );
}

function VisitModal({ requestId, onClose, onDone }: { requestId: string; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [when, setWhen] = useState('');
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={t('requestsM.scheduleVisit')} onClose={onClose}>
      <Field label={t('requestsM.visitTime')} htmlFor="vw" required>
        <TextInput id="vw" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required />
      </Field>
      <Field label={t('projectsM.location')} htmlFor="vl">
        <TextInput id="vl" value={location} onChange={(e) => setLocation(e.target.value)} />
      </Field>
      <div className="modal-actions">
        <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
        <Button busy={busy} disabled={!when} onClick={async () => {
          setBusy(true);
          try {
            await api(`/api/requests/${requestId}/site-visits`, { method: 'POST', body: { scheduledAt: new Date(when).toISOString(), location: location || null } });
            toast(t('common.savedOk'), 'success');
            onDone();
          } finally { setBusy(false); }
        }}>{t('common.save')}</Button>
      </div>
    </Modal>
  );
}
