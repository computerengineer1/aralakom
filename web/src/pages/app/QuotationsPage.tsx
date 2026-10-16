import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../../lib/auth';
import { DataTable, Money, Select, StatusBadge, TextInput, useApi, fmtDate, type Column } from '../../components/ui';

interface QuoteRow {
  id: string; quoteNo: string; version: number; status: string; currency: string;
  total: string; validUntil: string | null; createdAt: string; customerName: string | null;
}
interface ListRes { items: QuoteRow[]; total: number; page: number; pageSize: number }

export default function QuotationsPage() {
  const { t } = useTranslation();
  const [locale] = useLocale();
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const query = `/api/finance/quotations?page=${page}&pageSize=${pageSize}&status=${status}&q=${encodeURIComponent(q)}`;
  const { data, loading } = useApi<ListRes>(query, [query]);

  const columns: Array<Column<QuoteRow>> = [
    { key: 'quoteNo', header: t('financeM.quoteNo'), render: (r) => <span className="ltr-span">{r.quoteNo}</span> },
    { key: 'customer', header: t('requestsM.customer'), render: (r) => r.customerName ?? '—' },
    { key: 'version', header: t('financeM.version'), render: (r) => `v${r.version}` },
    { key: 'status', header: t('common.status'), render: (r) => <StatusBadge status={r.status} label={t(`financeM.statuses.${r.status}`)} /> },
    { key: 'total', header: t('common.total'), num: true, render: (r) => <Money amount={r.total} currency={r.currency} locale={locale} /> },
    { key: 'validUntil', header: t('financeM.validUntil'), render: (r) => fmtDate(r.validUntil, locale) },
  ];

  return (
    <div>
      <div className="row-between">
        <h1>{t('financeM.quotesTitle')}</h1>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate('/app/quotations/new')}>+ {t('financeM.newQuote')}</button>
      </div>
      <div className="toolbar">
        <TextInput className="search" placeholder={t('common.search') + '…'} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label={t('common.search')} />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label={t('common.status')}>
          <option value="">{t('common.status')}: {t('common.all')}</option>
          {['draft', 'pending_approval', 'approved', 'sent', 'accepted', 'declined', 'expired', 'cancelled'].map((s) => (
            <option key={s} value={s}>{t(`financeM.statuses.${s}`)}</option>
          ))}
        </Select>
      </div>
      <DataTable columns={columns} rows={data?.items ?? []} page={page} pageSize={pageSize}
        total={data?.total ?? 0} onPage={setPage} loading={loading} emptyText={t('common.noResults')}
        onRowClick={(r) => navigate(`/app/quotations/${r.id}`)} />
    </div>
  );
}
