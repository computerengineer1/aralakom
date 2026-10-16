import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DataTable, Select, StatusBadge, TextInput, useApi, fmtDate, type Column } from '../../components/ui';
import { GOVERNORATES } from '../public/Apply';

interface AppRow {
  id: string; reference: string; fullName: string; phone: string; personType: string;
  status: string; experienceYears: number; submittedAt: string; governorate: string | null;
}
interface ListRes { items: AppRow[]; total: number; page: number; pageSize: number }

export default function ApplicationsList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [personType, setPersonType] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const query = `/api/applications?page=${page}&pageSize=${pageSize}&q=${encodeURIComponent(q)}&status=${status}&personType=${personType}`;
  const { data, loading, reload } = useApi<ListRes>(query, [query]);
  void GOVERNORATES;

  const columns: Array<Column<AppRow>> = [
    { key: 'reference', header: t('track.reference'), render: (r) => <span className="ltr-span">{r.reference}</span> },
    { key: 'name', header: t('applicationsM.applicant'), render: (r) => <b>{r.fullName}</b> },
    { key: 'phone', header: t('personnelM.phone'), render: (r) => <span className="ltr-span" dir="ltr">{r.phone}</span> },
    { key: 'type', header: t('personnelM.type'), render: (r) => t(`personnelM.personType.${r.personType}`) },
    { key: 'exp', header: t('personnelM.experience'), render: (r) => t('personnelM.years', { n: r.experienceYears }) },
    { key: 'status', header: t('common.status'), render: (r) => <StatusBadge status={r.status} label={t(`applicationsM.statuses.${r.status}`)} /> },
    { key: 'submittedAt', header: t('applicationsM.submitted'), render: (r) => fmtDate(r.submittedAt, 'en') },
  ];

  return (
    <div>
      <h1>{t('applicationsM.title')}</h1>
      <div className="toolbar">
        <TextInput className="search" placeholder={t('common.search') + '…'} value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label={t('common.search')} />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label={t('common.status')}>
          <option value="">{t('common.status')}: {t('common.all')}</option>
          {['submitted', 'under_review', 'shortlisted', 'interview', 'approved', 'rejected', 'hired'].map((s) => (
            <option key={s} value={s}>{t(`applicationsM.statuses.${s}`)}</option>
          ))}
        </Select>
        <Select value={personType} onChange={(e) => { setPersonType(e.target.value); setPage(1); }} aria-label={t('personnelM.type')}>
          <option value="">{t('personnelM.type')}: {t('common.all')}</option>
          {['worker', 'technician', 'engineer', 'other'].map((pt) => <option key={pt} value={pt}>{t(`personnelM.personType.${pt}`)}</option>)}
        </Select>
      </div>
      <DataTable
        columns={columns} rows={data?.items ?? []} page={page} pageSize={pageSize}
        total={data?.total ?? 0} onPage={setPage} loading={loading}
        emptyText={t('common.noResults')}
        onRowClick={(r) => navigate(`/app/applications/${r.id}`)}
      />
      {loading === false && !data && <button type="button" className="btn btn-outline" onClick={reload}>{t('common.retry')}</button>}
      <span style={{ display: 'none' }}><Link to="/app/applications">.</Link></span>
    </div>
  );
}
