import { useTranslation } from 'react-i18next';
import { useLocale } from '../../lib/auth';
import { Money, Spinner, StatusBadge, fmtDate, useApi } from '../../components/ui';

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function MyWorkPage() {
  const { t } = useTranslation();
  const [locale] = useLocale();
  const { data, loading } = useApi<any>('/api/me/work');
  if (loading || !data) return <Spinner />;
  return (
    <div>
      <h1>{t('myWorkM.title')}</h1>
      {!data.profile && <div className="alert alert-info">{t('dash.noLink')}</div>}
      {data.profile && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="card-title">{t('myWorkM.profile')}</div>
          <div className="detail-grid">
            <div className="detail-item"><div className="k">{t('personnelM.recordNo')}</div><div className="v ltr-span">{data.profile.recordNo}</div></div>
            <div className="detail-item"><div className="k">{t('personnelM.name')}</div><div className="v">{data.profile.fullName}</div></div>
            <div className="detail-item"><div className="k">{t('personnelM.type')}</div><div className="v">{t(`personnelM.personType.${data.profile.personType}`)}</div></div>
            <div className="detail-item"><div className="k">{t('personnelM.empStatus')}</div><div className="v"><StatusBadge status={data.profile.employmentStatus} label={t(`personnelM.emp.${data.profile.employmentStatus}`)} /></div></div>
            <div className="detail-item"><div className="k">{t('personnelM.availability')}</div><div className="v"><StatusBadge status={data.profile.availability} label={t(`personnelM.avail.${data.profile.availability}`)} /></div></div>
          </div>
        </div>
      )}
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-title">{t('myWorkM.upcoming')}</div>
          {(data.upcoming ?? []).map((a: any) => (
            <div key={a.id} className="row-between" style={{ padding: '0.4rem 0', borderBottom: '1px solid var(--slate-100)' }}>
              <span><span className="ltr-span small">{a.projectNo}</span> {a.projectName}</span>
              <span className="small">{fmtDate(a.workDate, locale)} · {t(`scheduleM.shifts.${a.shift}`)}</span>
            </div>
          ))}
          {(data.upcoming ?? []).length === 0 && <span className="muted small">{t('common.noResults')}</span>}
        </div>
        <div className="card">
          <div className="card-title">{t('myWorkM.attendance')}</div>
          {(data.attendance ?? []).map((a: any, i: number) => (
            <div key={i} className="row-between" style={{ padding: '0.35rem 0', borderBottom: '1px solid var(--slate-100)' }}>
              <span className="small">{fmtDate(a.workDate, locale)}</span>
              <span className="row" style={{ gap: '0.4rem' }}>
                <StatusBadge status={a.status} label={t(`scheduleM.attStatus.${a.status}`)} />
                <span className="small muted ltr-span">{a.regularHours}h{Number(a.overtimeHours) > 0 ? ` +${a.overtimeHours}h` : ''}</span>
                <StatusBadge status={a.approvalStatus === 'approved' ? 'approved' : a.approvalStatus} label={t(`scheduleM.approval.${a.approvalStatus}`)} />
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="card-title">{t('myWorkM.payments')}</div>
        {(data.payments ?? []).map((p: any, i: number) => (
          <div key={i} className="row-between" style={{ padding: '0.35rem 0', borderBottom: '1px solid var(--slate-100)' }}>
            <span className="small">{t(`scheduleM.payType.${p.type}`)} · {fmtDate(p.paidOn, locale)}</span>
            <span className="row" style={{ gap: '0.4rem' }}>
              <Money amount={p.amount} currency={p.currency} locale={locale} />
              <StatusBadge status={p.status === 'approved' ? 'approved' : p.status} label={t(`scheduleM.approval.${p.status}`, { defaultValue: p.status })} />
            </span>
          </div>
        ))}
        {(data.payments ?? []).length === 0 && <span className="muted small">{t('common.noResults')}</span>}
      </div>
    </div>
  );
}
