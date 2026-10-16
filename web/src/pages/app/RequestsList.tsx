import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../../lib/auth';
import { DataTable, Select, StatusBadge, TextInput, useApi, fmtDate, type Column } from '../../components/ui';
import { usePublicData } from '../../lib/publicData';

interface ReqRow {
  id: string; reference: string; contactName: string; phone: string; status: string;
  categoryId: string | null; submittedAt: string; company: string | null;
}
interface ListRes { items: ReqRow[]; total: number; page: number; pageSize: number }

export default function RequestsList() {
  const { t } = useTranslation();
  const [locale] = useLocale();
  const navigate = useNavigate();
  const { requestCategories } = usePublicData();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const query = `/api/requests?page=${page}&pageSize=${pageSize}&q=${encodeURIComponent(q)}&status=${status}`;
  const { data, loading } = useApi<ListRes>(query, [query]);

  const columns: Array<Column<ReqRow>> = [
    { key: 'reference', header: t('track.reference'), render: (r) => <span className="ltr-span">{r.reference}</span> },
    { key: 'contact', header: t('requestsM.customer'), render: (r) => <span><b>{r.contactName}</b>{r.company && <span className="muted small"> · {r.company}</span>}</span> },
    { key: 'phone', header: t('personnelM.phone'), render: (r) => <span className="ltr-span" dir="ltr">{r.phone}</span> },
    {
      key: 'category', header: t('requestsM.category'),
      render: (r) => { const c = requestCategories.find((x) => x.id === r.categoryId); return c ? (locale === 'ar' ? c.nameAr : c.nameEn) : '—'; },
    },
    { key: 'status', header: t('common.status'), render: (r) => <StatusBadge status={r.status} label={t(`requestsM.statuses.${r.status}`)} /> },
    { key: 'submittedAt', header: t('applicationsM.submitted'), render: (r) => fmtDate(r.submittedAt, locale) },
  ];

  return (
    <div>
      <h1>{t('requestsM.title')}</h1>
      <div className="toolbar">
        <TextInput className="search" placeholder={t('common.search') + '…'} value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label={t('common.search')} />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label={t('common.status')}>
          <option value="">{t('common.status')}: {t('common.all')}</option>
          {['submitted', 'under_review', 'needs_info', 'site_visit', 'estimating', 'quotation_prepared', 'quotation_sent', 'accepted', 'declined', 'expired', 'contracted', 'in_progress', 'completed', 'cancelled'].map((s) => (
            <option key={s} value={s}>{t(`requestsM.statuses.${s}`)}</option>
          ))}
        </Select>
      </div>
      <DataTable
        columns={columns} rows={data?.items ?? []} page={page} pageSize={pageSize}
        total={data?.total ?? 0} onPage={setPage} loading={loading}
        emptyText={t('common.noResults')}
        onRowClick={(r) => navigate(`/app/requests/${r.id}`)}
      />
    </div>
  );
}
