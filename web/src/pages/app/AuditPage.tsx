import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../../lib/auth';
import { DataTable, Select, TextInput, fmtDateTime, useApi, type Column } from '../../components/ui';

interface AuditRow {
  id: number; action: string; actorEmail: string | null; entityType: string | null;
  entityId: string | null; summary: Record<string, unknown>; ip: string | null; createdAt: string;
}

export default function AuditPage() {
  const { t } = useTranslation();
  const [locale] = useLocale();
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 30;
  const query = `/api/audit?page=${page}&pageSize=${pageSize}&action=${encodeURIComponent(action)}&entityType=${encodeURIComponent(entityType)}`;
  const { data, loading } = useApi<{ items: AuditRow[]; total: number }>(query, [query]);

  const columns: Array<Column<AuditRow>> = [
    { key: 'createdAt', header: t('auditM.when'), render: (r) => <span className="small ltr-span">{fmtDateTime(r.createdAt, locale)}</span> },
    { key: 'action', header: t('auditM.action'), render: (r) => <code className="small">{r.action}</code> },
    { key: 'actor', header: t('auditM.actor'), render: (r) => <span className="small">{r.actorEmail ?? '—'}</span> },
    { key: 'entity', header: t('auditM.entity'), render: (r) => <span className="small">{r.entityType ? `${r.entityType}:${(r.entityId ?? '').slice(0, 8)}` : '—'}</span> },
    { key: 'summary', header: t('auditM.summary'), render: (r) => <span className="small muted">{JSON.stringify(r.summary).slice(0, 90)}</span> },
  ];

  return (
    <div>
      <h1>{t('auditM.title')}</h1>
      <div className="alert alert-info">{t('auditM.note')}</div>
      <div className="toolbar">
        <TextInput className="search" placeholder={t('auditM.action') + '…'} value={action}
          onChange={(e) => { setAction(e.target.value); setPage(1); }} aria-label={t('auditM.action')} />
        <Select value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }} aria-label={t('auditM.entity')}>
          <option value="">{t('auditM.entity')}: {t('common.all')}</option>
          {['user', 'personnel', 'application', 'request', 'project', 'quotation', 'invoice', 'receipt', 'settings', 'file', 'expense'].map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </Select>
      </div>
      <DataTable columns={columns} rows={data?.items ?? []} page={page} pageSize={pageSize}
        total={data?.total ?? 0} onPage={setPage} loading={loading} emptyText={t('common.noResults')} />
    </div>
  );
}
