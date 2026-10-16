import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../../lib/api';
import { useAuth, useLocale } from '../../lib/auth';
import {
  Button, DataTable, Field, Modal, Select, StatusBadge, TextInput, TextArea,
  useApi, useToast, fmtDate, type Column,
} from '../../components/ui';

interface ProjectRow {
  id: string; projectNo: string; name: string; status: string; priority: string;
  targetEndDate: string | null; managerId: string | null; customerId: string | null;
  contractAmount: string | null; contractCurrency: string | null;
}
interface ListRes { items: ProjectRow[]; total: number; page: number; pageSize: number }

export default function ProjectsList() {
  const { t } = useTranslation();
  const [locale] = useLocale();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const pageSize = 20;
  const query = `/api/projects?page=${page}&pageSize=${pageSize}&q=${encodeURIComponent(q)}&status=${status}`;
  const { data, loading, reload } = useApi<ListRes>(query, [query]);
  const { data: alerts } = useApi<{ overdueMilestones: Array<{ id: string; title: string; due_date: string; project_id: string; project_no: string }> }>('/api/projects/alerts', []);

  const columns: Array<Column<ProjectRow>> = [
    { key: 'projectNo', header: t('projectsM.projectNo'), render: (r) => <span className="ltr-span">{r.projectNo}</span> },
    { key: 'name', header: t('projectsM.name'), render: (r) => <b>{r.name}</b> },
    { key: 'status', header: t('common.status'), render: (r) => <StatusBadge status={r.status} label={t(`projectsM.statuses.${r.status}`)} /> },
    { key: 'priority', header: t('projectsM.priority'), render: (r) => <StatusBadge status={r.priority} label={t(`projectsM.priorities.${r.priority}`)} /> },
    { key: 'contract', header: t('projectsM.contract'), num: true, render: (r) => r.contractAmount ? <span className="ltr-span mono-num">{Number(r.contractAmount).toLocaleString(locale === 'ar' ? 'ar-LB' : 'en-US')} {r.contractCurrency}</span> : '—' },
    { key: 'targetEndDate', header: t('projectsM.targetEnd'), render: (r) => fmtDate(r.targetEndDate, locale) },
  ];

  return (
    <div>
      <div className="row-between">
        <h1>{t('projectsM.title')}</h1>
        {can('projects.create') && <Button size="sm" onClick={() => setCreateOpen(true)}>+ {t('projectsM.newProject')}</Button>}
      </div>

      {(alerts?.overdueMilestones ?? []).length > 0 && (
        <div className="alert alert-warn">
          <b>{t('projectsM.alertsTitle')} — {t('projectsM.overdue')}:</b>
          <ul style={{ margin: '0.3rem 0 0', paddingInlineStart: '1.2rem' }}>
            {(alerts?.overdueMilestones ?? []).slice(0, 5).map((m) => (
              <li key={m.id} className="small">
                <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/app/projects/${m.project_id}`); }}>{m.project_no}</a> — {m.title} ({fmtDate(m.due_date, locale)})
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="toolbar">
        <TextInput className="search" placeholder={t('common.search') + '…'} value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label={t('common.search')} />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label={t('common.status')}>
          <option value="">{t('common.status')}: {t('common.all')}</option>
          {['planning', 'in_progress', 'on_hold', 'completed', 'cancelled'].map((s) => (
            <option key={s} value={s}>{t(`projectsM.statuses.${s}`)}</option>
          ))}
        </Select>
      </div>

      <DataTable columns={columns} rows={data?.items ?? []} page={page} pageSize={pageSize}
        total={data?.total ?? 0} onPage={setPage} loading={loading}
        emptyText={t('common.noResults')} onRowClick={(r) => navigate(`/app/projects/${r.id}`)} />

      {createOpen && <CreateProjectModal onClose={() => setCreateOpen(false)} onCreated={(id) => { setCreateOpen(false); reload(); navigate(`/app/projects/${id}`); }} />}
    </div>
  );
}

function CreateProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('normal');
  const [startDate, setStartDate] = useState('');
  const [targetEndDate, setTargetEndDate] = useState('');
  const [contractAmount, setContractAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { data: customers } = useApi<{ items: Array<{ id: string; name: string; company?: string | null }> }>('/api/customers?pageSize=100', []);
  const [customerId, setCustomerId] = useState('');

  return (
    <Modal title={t('projectsM.newProject')} onClose={onClose} wide>
      <Field label={t('projectsM.name')} htmlFor="npn" required>
        <TextInput id="npn" required value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={t('projectsM.customerLbl')} htmlFor="npc">
        <Select id="npc" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">—</option>
          {(customers?.items ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ''}</option>)}
        </Select>
      </Field>
      <Field label={t('projectsM.description')} htmlFor="npd">
        <TextArea id="npd" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="grid-2">
        <Field label={t('projectsM.priority')} htmlFor="npp">
          <Select id="npp" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {['low', 'normal', 'high', 'urgent'].map((p) => <option key={p} value={p}>{t(`projectsM.priorities.${p}`)}</option>)}
          </Select>
        </Field>
        <Field label={t('projectsM.start')} htmlFor="nps">
          <TextInput id="nps" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label={t('projectsM.targetEnd')} htmlFor="npe">
          <TextInput id="npe" type="date" value={targetEndDate} onChange={(e) => setTargetEndDate(e.target.value)} />
        </Field>
        <Field label={t('projectsM.contract')} htmlFor="npa">
          <TextInput id="npa" dir="ltr" inputMode="decimal" value={contractAmount} onChange={(e) => setContractAmount(e.target.value.replace(/[^\d.]/g, ''))} />
        </Field>
        <Field label={t('common.currency')} htmlFor="npcur">
          <Select id="npcur" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="USD">USD</option><option value="LBP">LBP</option>
          </Select>
        </Field>
      </div>
      {err && <div className="alert alert-error">{err}</div>}
      <div className="modal-actions">
        <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
        <Button busy={busy} disabled={name.trim().length < 2} onClick={async () => {
          setBusy(true); setErr(null);
          try {
            const p = await api<{ id: string }>('/api/projects', {
              method: 'POST',
              body: {
                name: name.trim(), description: description || null, priority,
                customerId: customerId || null,
                startDate: startDate || null, targetEndDate: targetEndDate || null,
                contractAmount: contractAmount || null, contractCurrency: contractAmount ? currency : null,
              },
            });
            toast(t('common.savedOk'), 'success');
            onCreated(p.id);
          } catch (e) { setErr((e as ApiError).message); } finally { setBusy(false); }
        }}>{t('common.create')}</Button>
      </div>
    </Modal>
  );
}
