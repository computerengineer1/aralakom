import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../../lib/api';
import { useAuth, useLocale } from '../../lib/auth';
import {
  Button, DataTable, Field, StatusBadge, Tabs, TextInput, useApi, useToast, fmtDateTime, type Column,
} from '../../components/ui';

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function NotificationsPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [tab, setTab] = useState('mine');
  const tabs = [{ key: 'mine', label: t('notifM.title') }];
  if (can('notifications.manage')) tabs.push({ key: 'admin', label: t('notifM.delivery') });
  return (
    <div>
      <h1>{t('notifM.title')}</h1>
      {tabs.length > 1 && <Tabs tabs={tabs} active={tab} onChange={setTab} />}
      {tab === 'mine' ? <MyNotifications /> : <AdminNotifications />}
    </div>
  );
}

function MyNotifications() {
  const { t } = useTranslation();
  const [locale] = useLocale();
  const { data, reload } = useApi<{ items: any[] }>('/api/notifications');
  return (
    <div>
      <div className="row-between" style={{ marginBottom: '0.8rem' }}>
        <span className="muted small">{(data?.items ?? []).filter((n) => !n.readAt).length} {t('notifM.unread')}</span>
        <Button size="sm" variant="outline" onClick={async () => { await api('/api/notifications/read-all', { method: 'POST' }); reload(); }}>
          {t('notifM.markAllRead')}
        </Button>
      </div>
      {(data?.items ?? []).length === 0 && <p className="muted">{t('notifM.empty')}</p>}
      {(data?.items ?? []).map((n) => (
        <div key={n.id} className="card" style={{ marginBottom: '0.6rem', borderInlineStart: n.readAt ? undefined : '4px solid var(--gold-500)' }}>
          <div className="row-between">
            <b>{n.subject ?? t(`notifM.title`)}</b>
            <span className="small muted">{fmtDateTime(n.createdAt, locale)}</span>
          </div>
          {n.body && <p className="small" style={{ whiteSpace: 'pre-line', margin: '0.4rem 0 0' }}>{n.body}</p>}
          {!n.readAt && (
            <Button size="sm" variant="ghost" style={{ marginTop: '0.4rem' }}
              onClick={async () => { await api(`/api/notifications/${n.id}/read`, { method: 'POST' }); reload(); }}>
              ✓
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

function AdminNotifications() {
  const { t } = useTranslation();
  const [locale] = useLocale();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const query = `/api/notifications/admin?page=${page}&pageSize=30`;
  const { data, loading, reload } = useApi<{ items: any[]; total: number; smtpConfigured: boolean }>(query, [query]);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const columns: Array<Column<any>> = [
    { key: 'createdAt', header: t('auditM.when'), render: (r) => <span className="small ltr-span">{fmtDateTime(r.createdAt, locale)}</span> },
    { key: 'channel', header: t('notifM.channel'), render: (r) => r.channel },
    { key: 'template', header: t('auditM.action'), render: (r) => <code className="small">{r.templateKey}</code> },
    { key: 'to', header: t('auth.email'), render: (r) => <span className="small" dir="ltr">{r.toEmail ?? '—'}</span> },
    { key: 'status', header: t('common.status'), render: (r) => <StatusBadge status={r.status === 'sent' ? 'approved' : r.status === 'failed' ? 'rejected' : r.status === 'skipped' ? 'draft' : 'pending'} label={r.status} /> },
    { key: 'attempts', header: t('notifM.attempts'), render: (r) => r.attempts },
    { key: 'lastError', header: t('notifM.lastError'), render: (r) => <span className="small muted">{r.lastError ?? '—'}</span> },
  ];

  return (
    <div>
      {!data?.smtpConfigured && <div className="alert alert-warn">{t('notifM.smtpMissing')}</div>}
      <div className="row" style={{ marginBottom: '0.8rem' }}>
        <Button size="sm" variant="outline" onClick={async () => {
          const res = await api<{ ok: boolean; retried?: number; reason?: string }>('/api/notifications/admin/retry', { method: 'POST', body: {} });
          toast(res.ok ? `✓ ${res.retried}` : res.reason ?? 'error', res.ok ? 'success' : 'error');
          reload();
        }}>{t('notifM.retryFailed')}</Button>
        <Button size="sm" onClick={() => setBroadcastOpen((o) => !o)}>{t('notifM.broadcast')}</Button>
      </div>
      {broadcastOpen && (
        <div className="card" style={{ marginBottom: '0.8rem' }}>
          <Field label={t('notifM.broadcastSubject')} htmlFor="bs"><TextInput id="bs" value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
          <Field label={t('notifM.broadcastBody')} htmlFor="bm"><TextInput id="bm" value={message} onChange={(e) => setMessage(e.target.value)} /></Field>
          <Button disabled={subject.length < 3 || message.length < 3} onClick={async () => {
            try {
              await api('/api/notifications/admin/broadcast', { method: 'POST', body: { subject, message } });
              toast(t('common.savedOk'), 'success');
              setBroadcastOpen(false); setSubject(''); setMessage('');
              reload();
            } catch (e) { toast((e as ApiError).message, 'error'); }
          }}>{t('notifM.send')}</Button>
        </div>
      )}
      <DataTable columns={columns} rows={data?.items ?? []} page={page} pageSize={30}
        total={data?.total ?? 0} onPage={setPage} loading={loading} emptyText={t('common.noResults')} />
    </div>
  );
}
