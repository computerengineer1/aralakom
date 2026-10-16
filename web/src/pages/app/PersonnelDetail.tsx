import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../../lib/api';
import { useAuth, useLocale } from '../../lib/auth';
import {
  Button, ConfirmDialog, ErrorState, Field, Modal, Select, Spinner, StatusBadge,
  TextArea, TextInput, useApi, useToast, fmtDateTime,
} from '../../components/ui';
import { Breadcrumbs } from '../../components/ui';
import { GOVERNORATES } from '../public/Apply';

interface PersonDetail {
  person: Record<string, unknown> & {
    id: string; recordNo: string; fullName: string; personType: string; phone: string;
    altPhone?: string | null; email?: string | null; governorate?: string | null;
    district?: string | null; town?: string | null; address?: string | null;
    categoryId?: string | null; secondarySkills?: string | null; experienceYears: number;
    qualifications?: string | null; languages?: string | null; employmentStatus: string;
    availability: string; payModel?: string; rateAmount?: string | null; rateCurrency?: string | null;
    hireDate?: string | null; emergencyContactName?: string | null; emergencyContactPhone?: string | null;
    notes?: string | null; archivedAt?: string | null;
  };
  category: { id: string; nameEn: string; nameAr: string } | null;
  team: Array<{ projectId: string; roleInProject: string | null }>;
}

interface HistoryRow { id: number; action: string; field: string | null; oldValue: string | null; newValue: string | null; actorName: string | null; createdAt: string }

export default function PersonnelDetail() {
  const { id } = useParams();
  const isNew = id === 'new';
  const { t } = useTranslation();
  const [locale] = useLocale();
  const { can } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const { data, loading, error, reload } = useApi<PersonDetail>(isNew ? null : `/api/personnel/${id}`);
  const { data: publicData } = useApi<{ tradeCategories: Array<{ id: string; nameEn: string; nameAr: string }>; engineeringCategories: Array<{ id: string; nameEn: string; nameAr: string }> }>('/api/settings/public', []);
  const categories = [...(publicData?.tradeCategories ?? []), ...(publicData?.engineeringCategories ?? [])];

  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  if (isNew) {
    return <PersonForm categories={categories} onSaved={(nid) => navigate(`/app/personnel/${nid}`)} />;
  }
  if (loading) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;
  const p = data.person;
  const canSensitive = 'rateAmount' in p;

  const rows: Array<[string, React.ReactNode]> = [
    [t('personnelM.recordNo'), <span className="ltr-span">{p.recordNo}</span>],
    [t('personnelM.type'), t(`personnelM.personType.${p.personType}`)],
    [t('personnelM.phone'), <span className="ltr-span" dir="ltr">{p.phone}</span>],
    ...(p.altPhone ? [[t('personnelM.altPhone'), <span className="ltr-span" dir="ltr">{p.altPhone}</span>]] as Array<[string, React.ReactNode]> : []),
    ...(p.email ? [[t('auth.email'), <span dir="ltr">{p.email}</span>]] as Array<[string, React.ReactNode]> : []),
    [t('personnelM.category'), data.category ? (locale === 'ar' ? data.category.nameAr : data.category.nameEn) : '—'],
    [t('personnelM.governorate'), [p.governorate, p.district, p.town].filter(Boolean).join(' — ') || '—'],
    ...(p.address ? [[t('personnelM.address'), p.address]] as Array<[string, React.ReactNode]> : []),
    [t('personnelM.experience'), t('personnelM.years', { n: p.experienceYears })],
    [t('personnelM.empStatus'), <StatusBadge status={p.employmentStatus} label={t(`personnelM.emp.${p.employmentStatus}`)} />],
    [t('personnelM.availability'), <StatusBadge status={p.availability} label={t(`personnelM.avail.${p.availability}`)} />],
    ...(canSensitive ? [
      [t('personnelM.payModel'), t(`personnelM.payModels.${p.payModel ?? 'unspecified'}`)],
      [t('personnelM.rate'), p.rateAmount ? <span className="ltr-span mono-num">{p.rateAmount} {p.rateCurrency}</span> : '—'],
    ] as Array<[string, React.ReactNode]> : []),
    ...(p.hireDate ? [[t('personnelM.hireDate'), p.hireDate]] as Array<[string, React.ReactNode]> : []),
    ...(canSensitive && p.emergencyContactName ? [
      [t('personnelM.emergencyName'), p.emergencyContactName],
      [t('personnelM.emergencyPhone'), <span className="ltr-span" dir="ltr">{p.emergencyContactPhone ?? ''}</span>],
    ] as Array<[string, React.ReactNode]> : []),
    ...(p.languages ? [[t('personnelM.languagesSpoken'), p.languages]] as Array<[string, React.ReactNode]> : []),
    ...(p.secondarySkills ? [[t('personnelM.secondarySkills'), p.secondarySkills]] as Array<[string, React.ReactNode]> : []),
    ...(p.qualifications ? [[t('personnelM.qualifications'), <span style={{ whiteSpace: 'pre-line' }}>{p.qualifications}</span>]] as Array<[string, React.ReactNode]> : []),
  ];

  return (
    <div>
      <Breadcrumbs items={[{ label: t('personnelM.title'), to: '/app/personnel' }, { label: p.fullName }]} />
      <div className="row-between">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {p.fullName}
          {p.archivedAt && <StatusBadge status="terminated" label={t('personnelM.archived')} />}
        </h1>
        <div className="row no-print">
          <Button variant="outline" size="sm" onClick={() => window.print()}>{t('personnelM.printProfile')}</Button>
          <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>{t('personnelM.history')}</Button>
          {can('personnel.write') && <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>{t('common.edit')}</Button>}
          {can('personnel.write') && !p.archivedAt && <Button size="sm" variant="danger" onClick={() => setArchiveOpen(true)}>{t('personnelM.archive')}</Button>}
          {can('personnel.write') && p.archivedAt && (
            <Button size="sm" onClick={async () => { await api(`/api/personnel/${p.id}/restore`, { method: 'POST' }); toast(t('common.savedOk'), 'success'); reload(); }}>
              {t('personnelM.restore')}
            </Button>
          )}
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-title">{t('personnelM.details')}</div>
          <div className="detail-grid">
            {rows.map(([k, v], i) => {
              const sensitive = [t('personnelM.rate'), t('personnelM.emergencyName'), t('personnelM.emergencyPhone'), t('personnelM.internalNotes')].includes(k as string);
              return (
                <div className={`detail-item ${sensitive ? 'no-print' : ''}`} key={i}><div className="k">{k}</div><div className="v">{v}</div></div>
              );
            })}
          </div>
          {!canSensitive && <p className="small muted" style={{ marginTop: '0.7rem' }}>{t('personnelM.sensitiveHidden')}</p>}
        </div>
        <div className="card">
          <div className="card-title">{t('personnelM.assignedTeams')}</div>
          {data.team.length === 0 && <span className="muted small">{t('common.noResults')}</span>}
          {data.team.map((tm, i) => (
            <div key={i} className="row-between" style={{ padding: '0.35rem 0', borderBottom: '1px solid var(--slate-100)' }}>
              <Link to={`/app/projects/${tm.projectId}`}>{tm.projectId.slice(0, 8)}…</Link>
              <span className="muted small">{tm.roleInProject ?? ''}</span>
            </div>
          ))}
          {p.notes && (
            <>
              <div className="card-title" style={{ marginTop: '1rem' }}>{t('personnelM.internalNotes')}</div>
              <p className="small" style={{ whiteSpace: 'pre-line' }}>{p.notes}</p>
            </>
          )}
        </div>
      </div>

      {editOpen && (
        <PersonForm categories={categories} person={p} onSaved={() => { setEditOpen(false); reload(); }} />
      )}
      {archiveOpen && (
        <ConfirmDialog
          title={t('personnelM.archive')} message={t('personnelM.confirmArchive')}
          confirmLabel={t('personnelM.archive')} danger
          onClose={() => setArchiveOpen(false)}
          onConfirm={async () => { await api(`/api/personnel/${p.id}/archive`, { method: 'POST' }); toast(t('common.savedOk'), 'success'); reload(); }}
        />
      )}
      {historyOpen && <HistoryModal personId={p.id} onClose={() => setHistoryOpen(false)} />}
    </div>
  );
}

function HistoryModal({ personId, onClose }: { personId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [locale] = useLocale();
  const { data, loading } = useApi<{ items: HistoryRow[] }>(`/api/personnel/${personId}/history`, [personId]);
  return (
    <Modal title={t('personnelM.history')} onClose={onClose} wide>
      {loading && <Spinner />}
      {(data?.items ?? []).length === 0 && !loading && <p className="muted">{t('personnelM.noHistory')}</p>}
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>{t('auditM.when')}</th><th>{t('auditM.actor')}</th><th>{t('auditM.action')}</th><th>Field</th><th>Old → New</th></tr></thead>
          <tbody>
            {(data?.items ?? []).map((h) => (
              <tr key={h.id}>
                <td className="small">{fmtDateTime(h.createdAt, locale)}</td>
                <td className="small">{h.actorName ?? '—'}</td>
                <td><code className="small">{h.action}</code></td>
                <td className="small">{h.field ?? '—'}</td>
                <td className="small">{h.oldValue ?? '—'} → {h.newValue ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

interface PersonFormValues {
  personType: string; fullName: string; phone: string; altPhone: string; email: string;
  governorate: string; district: string; town: string; address: string;
  categoryId: string; secondarySkills: string; experienceYears: string;
  qualifications: string; languages: string; employmentStatus: string; availability: string;
  payModel: string; rateAmount: string; rateCurrency: string; hireDate: string;
  emergencyContactName: string; emergencyContactPhone: string; notes: string;
}

export function PersonForm({ person, categories, onSaved }: {
  person?: PersonDetail['person'];
  categories: Array<{ id: string; nameEn: string; nameAr: string }>;
  onSaved: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [locale] = useLocale();
  const { can } = useAuth();
  const toast = useToast();
  const isEdit = Boolean(person);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  const [v, setV] = useState<PersonFormValues>({
    personType: person?.personType ?? 'worker',
    fullName: person?.fullName ?? '',
    phone: person?.phone ?? '',
    altPhone: (person?.altPhone as string) ?? '',
    email: (person?.email as string) ?? '',
    governorate: (person?.governorate as string) ?? '',
    district: (person?.district as string) ?? '',
    town: (person?.town as string) ?? '',
    address: (person?.address as string) ?? '',
    categoryId: (person?.categoryId as string) ?? '',
    secondarySkills: (person?.secondarySkills as string) ?? '',
    experienceYears: String(person?.experienceYears ?? 0),
    qualifications: (person?.qualifications as string) ?? '',
    languages: (person?.languages as string) ?? '',
    employmentStatus: person?.employmentStatus ?? 'candidate',
    availability: person?.availability ?? 'available',
    payModel: (person?.payModel as string) ?? 'unspecified',
    rateAmount: (person?.rateAmount as string) ?? '',
    rateCurrency: (person?.rateCurrency as string) ?? 'USD',
    hireDate: (person?.hireDate as string) ?? '',
    emergencyContactName: (person?.emergencyContactName as string) ?? '',
    emergencyContactPhone: (person?.emergencyContactPhone as string) ?? '',
    notes: (person?.notes as string) ?? '',
  });
  const set = (k: keyof PersonFormValues, val: string): void => setV((s) => ({ ...s, [k]: val }));
  const canSensitive = can('personnel.sensitive');

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true); setErr(null);
    const payload: Record<string, unknown> = {
      personType: v.personType, fullName: v.fullName.trim(), phone: v.phone.trim(),
      altPhone: v.altPhone || null, email: v.email || null,
      governorate: v.governorate || null, district: v.district || null, town: v.town || null,
      address: v.address || null, categoryId: v.categoryId || null,
      secondarySkills: v.secondarySkills || null, experienceYears: Number(v.experienceYears) || 0,
      qualifications: v.qualifications || null, languages: v.languages || null,
      employmentStatus: v.employmentStatus, availability: v.availability,
      payModel: v.payModel, hireDate: v.hireDate || null, notes: v.notes || null,
    };
    if (canSensitive) {
      payload.rateAmount = v.rateAmount || null;
      payload.rateCurrency = v.rateAmount ? v.rateCurrency : null;
      payload.emergencyContactName = v.emergencyContactName || null;
      payload.emergencyContactPhone = v.emergencyContactPhone || null;
    }
    try {
      if (isEdit) {
        await api(`/api/personnel/${person!.id}`, { method: 'PATCH', body: payload });
        toast(t('common.savedOk'), 'success');
        onSaved(person!.id);
      } else {
        const created = await api<{ id: string }>('/api/personnel', { method: 'POST', body: payload });
        toast(t('common.savedOk'), 'success');
        onSaved(created.id);
      }
    } catch (e2) { setErr(e2 as ApiError); } finally { setBusy(false); }
  };

  const form = (
    <form onSubmit={(e) => void submit(e)} noValidate>
      {err && (
        <div className="alert alert-error" role="alert">
          {err.code === 'VALIDATION_ERROR' ? t('errors.validation') : err.message}
          {err.details?.map((d, i) => <div key={i} className="small">• {d.path}: {d.message}</div>)}
        </div>
      )}
      <div className="grid-2">
        <Field label={t('personnelM.name')} required error={v.fullName.trim().length < 2 ? t('common.required') : undefined}>
          <TextInput required value={v.fullName} onChange={(e) => set('fullName', e.target.value)} />
        </Field>
        <Field label={t('personnelM.phone')} required>
          <TextInput required dir="ltr" value={v.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" />
        </Field>
        <Field label={t('personnelM.type')}>
          <Select value={v.personType} onChange={(e) => set('personType', e.target.value)}>
            {['worker', 'technician', 'engineer', 'other'].map((pt) => <option key={pt} value={pt}>{t(`personnelM.personType.${pt}`)}</option>)}
          </Select>
        </Field>
        <Field label={t('personnelM.category')}>
          <Select value={v.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
            <option value="">—</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{locale === 'ar' ? c.nameAr : c.nameEn}</option>)}
          </Select>
        </Field>
        <Field label={t('auth.email')}>
          <TextInput type="email" dir="ltr" value={v.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label={t('personnelM.altPhone')}>
          <TextInput dir="ltr" value={v.altPhone} onChange={(e) => set('altPhone', e.target.value)} inputMode="tel" />
        </Field>
        <Field label={t('personnelM.governorate')}>
          <Select value={v.governorate} onChange={(e) => set('governorate', e.target.value)}>
            <option value="">—</option>
            {GOVERNORATES.map((g) => <option key={g} value={g}>{g}</option>)}
          </Select>
        </Field>
        <Field label={t('personnelM.experience')}>
          <TextInput type="number" min={0} max={70} value={v.experienceYears} onChange={(e) => set('experienceYears', e.target.value)} />
        </Field>
        <Field label={t('personnelM.empStatus')}>
          <Select value={v.employmentStatus} onChange={(e) => set('employmentStatus', e.target.value)}>
            {['candidate', 'active', 'on_leave', 'suspended', 'terminated', 'retired'].map((s) => <option key={s} value={s}>{t(`personnelM.emp.${s}`)}</option>)}
          </Select>
        </Field>
        <Field label={t('personnelM.availability')}>
          <Select value={v.availability} onChange={(e) => set('availability', e.target.value)}>
            {['available', 'busy', 'unavailable'].map((s) => <option key={s} value={s}>{t(`personnelM.avail.${s}`)}</option>)}
          </Select>
        </Field>
        <Field label={t('personnelM.hireDate')}>
          <TextInput type="date" value={v.hireDate} onChange={(e) => set('hireDate', e.target.value)} />
        </Field>
        <Field label={t('personnelM.payModel')}>
          <Select value={v.payModel} onChange={(e) => set('payModel', e.target.value)}>
            {['unspecified', 'hourly', 'day_rate', 'fixed_work', 'monthly'].map((s) => <option key={s} value={s}>{t(`personnelM.payModels.${s}`)}</option>)}
          </Select>
        </Field>
        {canSensitive && (
          <>
            <Field label={t('personnelM.rate')}>
              <TextInput inputMode="decimal" dir="ltr" value={v.rateAmount} onChange={(e) => set('rateAmount', e.target.value.replace(/[^\d.]/g, ''))} />
            </Field>
            <Field label={t('common.currency')}>
              <Select value={v.rateCurrency} onChange={(e) => set('rateCurrency', e.target.value)}>
                <option value="USD">USD</option><option value="LBP">LBP</option>
              </Select>
            </Field>
            <Field label={t('personnelM.emergencyName')}>
              <TextInput value={v.emergencyContactName} onChange={(e) => set('emergencyContactName', e.target.value)} />
            </Field>
            <Field label={t('personnelM.emergencyPhone')}>
              <TextInput dir="ltr" value={v.emergencyContactPhone} onChange={(e) => set('emergencyContactPhone', e.target.value)} />
            </Field>
          </>
        )}
      </div>
      <Field label={t('personnelM.secondarySkills')}>
        <TextInput value={v.secondarySkills} onChange={(e) => set('secondarySkills', e.target.value)} />
      </Field>
      <Field label={t('personnelM.qualifications')}>
        <TextArea value={v.qualifications} onChange={(e) => set('qualifications', e.target.value)} />
      </Field>
      <Field label={t('personnelM.internalNotes')}>
        <TextArea value={v.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
      <div className="modal-actions">
        <Button type="submit" busy={busy}>{t('common.save')}</Button>
      </div>
    </form>
  );

  if (isEdit) {
    return <Modal title={t('personnelM.editTitle')} onClose={() => onSaved(person!.id)} wide>{form}</Modal>;
  }
  return (
    <div>
      <Breadcrumbs items={[{ label: t('personnelM.title'), to: '/app/personnel' }, { label: t('personnelM.addTitle') }]} />
      <div className="card form-card"><h1 style={{ fontSize: '1.3rem' }}>{t('personnelM.addTitle')}</h1>{form}</div>
    </div>
  );
}
