import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../../lib/api';
import { useAuth, useLocale } from '../../lib/auth';
import {
  Breadcrumbs, Button, ConfirmDialog, DataTable, ErrorState, Field, Modal, Money, Progress,
  Select, Spinner, StatusBadge, Tabs, TextArea, TextInput, useApi, useToast, fmtDate, fmtDateTime, type Column,
} from '../../components/ui';
import { GOVERNORATES } from '../public/Apply';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface ProjectData {
  project: any;
  milestones: any[];
  tasks: any[];
  issues: any[];
  progress: { milestonePct: number; taskPct: number; done: number; total: number; doneTasks: number; totalTasks: number };
  customer: any;
  team: any[];
}

export default function ProjectDetail() {
  const { id } = useParams();
  const { t } = useTranslation();
  const [locale] = useLocale();
  const { can, user } = useAuth();
  const [tab, setTab] = useState('overview');
  const { data, loading, error, reload } = useApi<ProjectData>(`/api/projects/${id}`);

  if (loading) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;
  const p = data.project;
  const canWrite = can('projects.write');

  const tabs = [
    { key: 'overview', label: t('projectsM.tabs.overview') },
    { key: 'milestones', label: `${t('projectsM.tabs.milestones')} (${data.milestones.length})` },
    { key: 'tasks', label: `${t('projectsM.tabs.tasks')} (${data.tasks.filter((x) => x.status !== 'done').length})` },
    { key: 'team', label: t('projectsM.tabs.team') },
    { key: 'issues', label: `${t('projectsM.tabs.issues')} (${data.issues.length})` },
    { key: 'notes', label: t('projectsM.tabs.notes') },
    { key: 'checklist', label: t('projectsM.tabs.checklist') },
    ...(can('expenses.read') ? [{ key: 'expenses', label: t('projectsM.tabs.expenses') }] : []),
    ...(can('expenses.read') || can('finance.reports') ? [{ key: 'financials', label: t('projectsM.tabs.financials') }] : []),
    { key: 'files', label: t('projectsM.tabs.files') },
  ];

  return (
    <div>
      <Breadcrumbs items={[{ label: t('projectsM.title'), to: '/app/projects' }, { label: p.projectNo }]} />
      <div className="row-between">
        <h1>
          <span className="ltr-span muted" style={{ fontSize: '0.9rem' }}>{p.projectNo}</span> {p.name}{' '}
          <StatusBadge status={p.status} label={t(`projectsM.statuses.${p.status}`)} />
          {p.archivedAt && <StatusBadge status="cancelled" label={t('personnelM.archived')} />}
        </h1>
        <div className="row no-print">
          {canWrite && <EditProjectButton project={p} onSaved={reload} />}
          {canWrite && !p.archivedAt && <ArchiveButton projectId={p.id} onDone={reload} />}
        </div>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'overview' && <Overview data={data} locale={locale} t={t} />}
      {tab === 'milestones' && <MilestonesTab data={data} canWrite={canWrite} reload={reload} />}
      {tab === 'tasks' && <TasksTab data={data} canWrite={canWrite} reload={reload} canEditStatus={Boolean(user)} />}
      {tab === 'team' && <TeamTab data={data} projectId={p.id} canWrite={canWrite} reload={reload} />}
      {tab === 'issues' && <IssuesTab data={data} projectId={p.id} canWrite={canWrite} reload={reload} />}
      {tab === 'notes' && <NotesTab projectId={p.id} />}
      {tab === 'checklist' && <ChecklistTab projectId={p.id} canWrite={canWrite} />}
      {tab === 'expenses' && <ExpensesTab projectId={p.id} />}
      {tab === 'financials' && <FinancialsTab projectId={p.id} locale={locale} />}
      {tab === 'files' && <FilesTab projectId={p.id} canWrite={canWrite} />}
    </div>
  );
}

function Overview({ data, locale, t }: { data: ProjectData; locale: string; t: (k: string, o?: any) => string }) {
  const p = data.project;
  const rows: Array<[string, ReactNode]> = [
    [t('projectsM.customerLbl'), data.customer ? data.customer.name : '—'],
    [t('projectsM.manager'), p.managerId ? '✓' : '—'],
    [t('projectsM.start'), fmtDate(p.startDate, locale)],
    [t('projectsM.targetEnd'), fmtDate(p.targetEndDate, locale)],
    [t('projectsM.actualEnd'), fmtDate(p.actualEndDate, locale)],
    [t('projectsM.priority'), <StatusBadge status={p.priority} label={t(`projectsM.priorities.${p.priority}`)} />],
    [t('projectsM.contract'), p.contractAmount ? <Money amount={p.contractAmount} currency={p.contractCurrency} locale={locale} /> : '—'],
    [t('projectsM.budget'), p.budgetAmount ? <Money amount={p.budgetAmount} currency={p.budgetCurrency} locale={locale} /> : '—'],
    [t('personnelM.governorate'), [p.governorate, p.district, p.town].filter(Boolean).join(' — ') || '—'],
  ];
  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <div className="card">
        <div className="card-title">{t('projectsM.tabs.overview')}</div>
        <div className="detail-grid">
          {rows.map(([k, v], i) => <div className="detail-item" key={i}><div className="k">{k}</div><div className="v">{v}</div></div>)}
        </div>
        {p.description && <p className="small" style={{ marginTop: '0.8rem', whiteSpace: 'pre-line' }}>{p.description}</p>}
        {p.scope && <p className="small muted" style={{ whiteSpace: 'pre-line' }}><b>{t('projectsM.scope')}:</b> {p.scope}</p>}
      </div>
      <div className="card">
        <div className="card-title">{t('projectsM.progress')}</div>
        <Progress pct={data.progress.milestonePct}
          label={t('projectsM.milestonesDone', { done: data.progress.done, total: data.progress.total })} />
        <div style={{ marginTop: '0.9rem' }}>
          <Progress pct={data.progress.taskPct}
            label={t('projectsM.tasksDone', { done: data.progress.doneTasks, total: data.progress.totalTasks })} />
        </div>
        <p className="small muted" style={{ marginTop: '0.9rem' }}>
          {t('projectsM.tabs.issues')}: {data.issues.length} · {t('projectsM.tabs.team')}: {data.team.length}
        </p>
      </div>
    </div>
  );
}

function MilestonesTab({ data, canWrite, reload }: { data: ProjectData; canWrite: boolean; reload: () => void }) {
  const { t } = useTranslation();
  const [locale] = useLocale();
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [weight, setWeight] = useState('1');
  const today = new Date().toISOString().slice(0, 10);

  const setStatus = async (mid: string, status: string): Promise<void> => {
    try {
      await api(`/api/projects/${data.project.id}/milestones/${mid}`, { method: 'PATCH', body: { status } });
      reload();
    } catch (e) { toast((e as ApiError).message, 'error'); }
  };

  return (
    <div className="card">
      <div className="card-title">
        {t('projectsM.milestones')}
        {canWrite && <Button size="sm" onClick={() => setAddOpen(true)}>+ {t('projectsM.addMilestone')}</Button>}
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>{t('projectsM.milestoneTitle')}</th><th>{t('projectsM.dueDate')}</th><th>{t('projectsM.weight')}</th><th>{t('common.status')}</th><th>{t('common.actions')}</th></tr></thead>
          <tbody>
            {data.milestones.map((m) => {
              const overdue = m.status !== 'done' && m.dueDate && m.dueDate < today;
              return (
                <tr key={m.id}>
                  <td><b>{m.title}</b>{m.description && <div className="small muted">{m.description}</div>}</td>
                  <td style={overdue ? { color: 'var(--red-700)', fontWeight: 700 } : undefined}>
                    {fmtDate(m.dueDate, locale)}{overdue && ` · ${t('projectsM.overdue')}`}
                  </td>
                  <td className="num">{m.weight}</td>
                  <td><StatusBadge status={m.status} label={t(`projectsM.msStatus.${m.status}`)} /></td>
                  <td>
                    {canWrite && (m.status !== 'done'
                      ? <Button size="sm" variant="outline" onClick={() => void setStatus(m.id, 'done')}>{t('projectsM.markDone')}</Button>
                      : <Button size="sm" variant="ghost" onClick={() => void setStatus(m.id, 'in_progress')}>{t('projectsM.reopen')}</Button>)}
                  </td>
                </tr>
              );
            })}
            {data.milestones.length === 0 && <tr><td colSpan={5} className="muted small">{t('common.noResults')}</td></tr>}
          </tbody>
        </table>
      </div>

      {addOpen && (
        <Modal title={t('projectsM.addMilestone')} onClose={() => setAddOpen(false)}>
          <Field label={t('projectsM.milestoneTitle')} htmlFor="mst" required>
            <TextInput id="mst" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <div className="grid-2">
            <Field label={t('projectsM.dueDate')} htmlFor="msd">
              <TextInput id="msd" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
            <Field label={t('projectsM.weight')} htmlFor="msw">
              <TextInput id="msw" type="number" min={1} max={100} value={weight} onChange={(e) => setWeight(e.target.value)} />
            </Field>
          </div>
          <div className="modal-actions">
            <Button variant="outline" onClick={() => setAddOpen(false)}>{t('common.cancel')}</Button>
            <Button disabled={title.trim().length < 2} onClick={async () => {
              await api(`/api/projects/${data.project.id}/milestones`, {
                method: 'POST',
                body: { title: title.trim(), dueDate: dueDate || null, weight: Number(weight) || 1 },
              });
              toast(t('common.savedOk'), 'success');
              setAddOpen(false); setTitle(''); setDueDate(''); setWeight('1');
              reload();
            }}>{t('common.save')}</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function TasksTab({ data, canWrite, reload }: { data: ProjectData; canWrite: boolean; reload: () => void; canEditStatus: boolean }) {
  const { t } = useTranslation();
  const [locale] = useLocale();
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('normal');
  const today = new Date().toISOString().slice(0, 10);

  const setStatus = async (tid: string, status: string): Promise<void> => {
    try {
      await api(`/api/projects/${data.project.id}/tasks/${tid}`, { method: 'PATCH', body: { status } });
      reload();
    } catch (e) { toast((e as ApiError).message, 'error'); }
  };

  const columns: Array<Column<any>> = [
    { key: 'title', header: t('projectsM.tasks'), render: (r) => <span><b>{r.title}</b>{r.description && <div className="small muted">{r.description}</div>}</span> },
    { key: 'status', header: t('common.status'), render: (r) => <StatusBadge status={r.status} label={t(`projectsM.taskStatus.${r.status}`)} /> },
    { key: 'priority', header: t('projectsM.priority'), render: (r) => <StatusBadge status={r.priority} label={t(`projectsM.priorities.${r.priority}`)} /> },
    {
      key: 'dueDate', header: t('projectsM.dueDate'),
      render: (r) => {
        const overdue = r.status !== 'done' && r.dueDate && r.dueDate < today;
        return <span style={overdue ? { color: 'var(--red-700)', fontWeight: 700 } : undefined}>{fmtDate(r.dueDate, locale)}</span>;
      },
    },
    {
      key: 'actions', header: t('common.actions'),
      render: (r) => canWrite ? (
        <div className="row" style={{ gap: '0.3rem' }}>
          {r.status !== 'done' && <Button size="sm" variant="outline" onClick={() => void setStatus(r.id, 'done')}>✓</Button>}
          {r.status === 'todo' && <Button size="sm" variant="ghost" onClick={() => void setStatus(r.id, 'in_progress')}>▶</Button>}
          {r.status === 'done' && <Button size="sm" variant="ghost" onClick={() => void setStatus(r.id, 'todo')}>↺</Button>}
        </div>
      ) : null,
    },
  ];

  return (
    <div className="card">
      <div className="card-title">
        {t('projectsM.tasks')}
        {canWrite && <Button size="sm" onClick={() => setAddOpen(true)}>+ {t('projectsM.addTask')}</Button>}
      </div>
      <DataTable columns={columns} rows={data.tasks} page={1} pageSize={100} total={data.tasks.length}
        onPage={() => undefined} emptyText={t('common.noResults')} />
      {addOpen && (
        <Modal title={t('projectsM.addTask')} onClose={() => setAddOpen(false)}>
          <Field label={t('projectsM.tabs.tasks')} htmlFor="tt" required>
            <TextInput id="tt" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <div className="grid-2">
            <Field label={t('projectsM.dueDate')} htmlFor="td">
              <TextInput id="td" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
            <Field label={t('projectsM.priority')} htmlFor="tp">
              <Select id="tp" value={priority} onChange={(e) => setPriority(e.target.value)}>
                {['low', 'normal', 'high', 'urgent'].map((p2) => <option key={p2} value={p2}>{t(`projectsM.priorities.${p2}`)}</option>)}
              </Select>
            </Field>
          </div>
          <div className="modal-actions">
            <Button variant="outline" onClick={() => setAddOpen(false)}>{t('common.cancel')}</Button>
            <Button disabled={title.trim().length < 2} onClick={async () => {
              await api(`/api/projects/${data.project.id}/tasks`, {
                method: 'POST', body: { title: title.trim(), dueDate: dueDate || null, priority },
              });
              toast(t('common.savedOk'), 'success');
              setAddOpen(false); setTitle(''); setDueDate('');
              reload();
            }}>{t('common.save')}</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function TeamTab({ data, projectId, canWrite, reload }: { data: ProjectData; projectId: string; canWrite: boolean; reload: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [personnelId, setPersonnelId] = useState('');
  const [role, setRole] = useState('');
  const { data: people } = useApi<{ items: Array<{ id: string; fullName: string; recordNo: string }> }>(addOpen ? '/api/personnel?pageSize=100&employmentStatus=active' : '', [addOpen]);

  const remove = async (memberId: string): Promise<void> => {
    await api(`/api/projects/${projectId}/team/${memberId}`, { method: 'DELETE' });
    toast(t('common.deletedOk'), 'success');
    reload();
  };

  return (
    <div className="card">
      <div className="card-title">
        {t('projectsM.team')}
        {canWrite && <Button size="sm" onClick={() => setAddOpen(true)}>+ {t('projectsM.addMember')}</Button>}
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>{t('scheduleM.person')}</th><th>{t('projectsM.role')}</th><th>{t('common.actions')}</th></tr></thead>
          <tbody>
            {data.team.map((m) => (
              <tr key={m.id}>
                <td>
                  {m.personId ? <Link to={`/app/personnel/${m.personnelId}`}>{m.personName}</Link> : m.userName}
                  {m.personPhone && <span className="muted small ltr-span" dir="ltr"> · {m.personPhone}</span>}
                </td>
                <td>{m.roleInProject ?? '—'}</td>
                <td>{canWrite && <Button size="sm" variant="ghost" onClick={() => void remove(m.id)}>{t('projectsM.removeMember')}</Button>}</td>
              </tr>
            ))}
            {data.team.length === 0 && <tr><td colSpan={3} className="muted small">{t('common.noResults')}</td></tr>}
          </tbody>
        </table>
      </div>
      {addOpen && (
        <Modal title={t('projectsM.addMember')} onClose={() => setAddOpen(false)}>
          <Field label={t('scheduleM.person')} htmlFor="tmp" required>
            <Select id="tmp" value={personnelId} onChange={(e) => setPersonnelId(e.target.value)} required>
              <option value="">—</option>
              {(people?.items ?? []).map((pp) => <option key={pp.id} value={pp.id}>{pp.recordNo} — {pp.fullName}</option>)}
            </Select>
          </Field>
          <Field label={t('projectsM.role')} htmlFor="tmr">
            <TextInput id="tmr" value={role} onChange={(e) => setRole(e.target.value)} />
          </Field>
          <div className="modal-actions">
            <Button variant="outline" onClick={() => setAddOpen(false)}>{t('common.cancel')}</Button>
            <Button disabled={!personnelId} onClick={async () => {
              try {
                await api(`/api/projects/${projectId}/team`, { method: 'POST', body: { personnelId, roleInProject: role || null } });
                toast(t('common.savedOk'), 'success');
                setAddOpen(false); reload();
              } catch (e) { toast((e as ApiError).message, 'error'); }
            }}>{t('common.save')}</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function IssuesTab({ data, projectId, canWrite, reload }: { data: ProjectData; projectId: string; canWrite: boolean; reload: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('issue');
  const [severity, setSeverity] = useState('medium');
  const [desc, setDesc] = useState('');

  const closeIssue = async (iid: string, status: string): Promise<void> => {
    await api(`/api/projects/${projectId}/issues/${iid}`, { method: 'PATCH', body: { status } });
    reload();
  };

  return (
    <div className="card">
      <div className="card-title">
        {t('projectsM.issues')}
        {canWrite && <Button size="sm" onClick={() => setAddOpen(true)}>+ {t('projectsM.addIssue')}</Button>}
      </div>
      {data.issues.map((i) => (
        <div key={i.id} className="row-between" style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--slate-100)' }}>
          <span>
            <b>{i.title}</b> <StatusBadge status={i.severity} label={t(`projectsM.severity.${i.severity}`)} /> <StatusBadge status={i.kind === 'risk' ? 'pending' : 'open'} label={t(`projectsM.kind.${i.kind}`)} />
            {i.description && <div className="small muted">{i.description}</div>}
          </span>
          {canWrite && <Button size="sm" variant="outline" onClick={() => void closeIssue(i.id, 'closed')}>{t('projectsM.issueStatus.closed')}</Button>}
        </div>
      ))}
      {data.issues.length === 0 && <span className="muted small">{t('common.noResults')}</span>}
      {addOpen && (
        <Modal title={t('projectsM.addIssue')} onClose={() => setAddOpen(false)}>
          <Field label={t('projectsM.tabs.issues')} htmlFor="it" required>
            <TextInput id="it" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <div className="grid-2">
            <Field label={t('projectsM.kind.issue')} htmlFor="ik">
              <Select id="ik" value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="issue">{t('projectsM.kind.issue')}</option>
                <option value="risk">{t('projectsM.kind.risk')}</option>
              </Select>
            </Field>
            <Field label={t('projectsM.severity.medium')} htmlFor="is">
              <Select id="is" value={severity} onChange={(e) => setSeverity(e.target.value)}>
                {['low', 'medium', 'high', 'critical'].map((s) => <option key={s} value={s}>{t(`projectsM.severity.${s}`)}</option>)}
              </Select>
            </Field>
          </div>
          <Field label={t('projectsM.description')} htmlFor="id2">
            <TextArea id="id2" value={desc} onChange={(e) => setDesc(e.target.value)} />
          </Field>
          <div className="modal-actions">
            <Button variant="outline" onClick={() => setAddOpen(false)}>{t('common.cancel')}</Button>
            <Button disabled={title.trim().length < 2} onClick={async () => {
              await api(`/api/projects/${projectId}/issues`, { method: 'POST', body: { title: title.trim(), kind, severity, description: desc || null } });
              toast(t('common.savedOk'), 'success');
              setAddOpen(false); setTitle(''); setDesc('');
              reload();
            }}>{t('common.save')}</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function NotesTab({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const [locale] = useLocale();
  const { can } = useAuth();
  const { data, reload } = useApi<{ items: any[] }>(`/api/projects/${projectId}/notes`);
  const [body, setBody] = useState('');
  return (
    <div className="card">
      <div className="card-title">{t('projectsM.notesTab')}</div>
      {can('projects.write') && (
        <form style={{ marginBottom: '1rem' }} onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (!body.trim()) return;
          void api(`/api/projects/${projectId}/notes`, { method: 'POST', body: { body } }).then(() => { setBody(''); reload(); });
        }}>
          <TextArea value={body} onChange={(e) => setBody(e.target.value)} placeholder={t('projectsM.addNote') + '…'} />
          <div style={{ marginTop: '0.5rem' }}><Button type="submit" size="sm">{t('common.save')}</Button></div>
        </form>
      )}
      {(data?.items ?? []).map((n: any) => (
        <div key={n.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--slate-100)' }}>
          <div className="small muted">{fmtDateTime(n.createdAt, locale)}</div>
          <div style={{ whiteSpace: 'pre-line' }}>{n.body}</div>
        </div>
      ))}
      {(data?.items ?? []).length === 0 && <span className="muted small">{t('common.noResults')}</span>}
    </div>
  );
}

function ChecklistTab({ projectId, canWrite }: { projectId: string; canWrite: boolean }) {
  const { t } = useTranslation();
  const { data, reload } = useApi<{ items: any[] }>(`/api/projects/${projectId}/checklist`);
  const [item, setItem] = useState('');
  return (
    <div className="card">
      <div className="card-title">{t('projectsM.checklist')}</div>
      {canWrite && (
        <form className="row" style={{ marginBottom: '0.9rem' }} onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (!item.trim()) return;
          void api(`/api/projects/${projectId}/checklist`, { method: 'POST', body: { item } }).then(() => { setItem(''); reload(); });
        }}>
          <TextInput value={item} onChange={(e) => setItem(e.target.value)} placeholder={t('projectsM.addItem') + '…'} style={{ flex: 1 }} />
          <Button type="submit" size="sm">+</Button>
        </form>
      )}
      {(data?.items ?? []).map((c: any) => (
        <label key={c.id} className="checkbox-row" style={{ padding: '0.35rem 0', borderBottom: '1px solid var(--slate-100)' }}>
          <input type="checkbox" checked={c.done} disabled={!canWrite}
            onChange={async (e) => { await api(`/api/projects/${projectId}/checklist/${c.id}`, { method: 'PATCH', body: { done: e.target.checked } }); reload(); }} />
          <span style={c.done ? { textDecoration: 'line-through', color: 'var(--slate-500)' } : undefined}>{c.item}</span>
        </label>
      ))}
      {(data?.items ?? []).length === 0 && <span className="muted small">{t('common.noResults')}</span>}
    </div>
  );
}

function ExpensesTab({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const [locale] = useLocale();
  const { can } = useAuth();
  const toast = useToast();
  const { data, reload } = useApi<{ items: any[] }>(`/api/projects/${projectId}/expenses`);
  const [addOpen, setAddOpen] = useState(false);
  const [category, setCategory] = useState('materials');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));

  const columns: Array<Column<any>> = [
    { key: 'date', header: t('common.date'), render: (r) => fmtDate(r.expenseDate, locale) },
    { key: 'category', header: t('applicationsM.applicant'), render: (r) => t(`projectsM.expCategory.${r.category}`) },
    { key: 'description', header: t('projectsM.description'), render: (r) => r.description },
    { key: 'amount', header: t('common.amount'), num: true, render: (r) => <Money amount={r.amount} currency={r.currency} locale={locale} /> },
  ];

  return (
    <div className="card">
      <div className="card-title">
        {t('projectsM.expensesTab')}
        {can('expenses.write') && <Button size="sm" onClick={() => setAddOpen(true)}>+ {t('projectsM.addExpense')}</Button>}
      </div>
      <DataTable columns={columns} rows={data?.items ?? []} page={1} pageSize={500}
        total={data?.items.length ?? 0} onPage={() => undefined} emptyText={t('common.noResults')} />
      {addOpen && (
        <Modal title={t('projectsM.addExpense')} onClose={() => setAddOpen(false)}>
          <div className="grid-2">
            <Field label={t('projectsM.addExpense')} htmlFor="ec">
              <Select id="ec" value={category} onChange={(e) => setCategory(e.target.value)}>
                {['labor', 'materials', 'equipment', 'transportation', 'subcontractor', 'miscellaneous'].map((c) => (
                  <option key={c} value={c}>{t(`projectsM.expCategory.${c}`)}</option>
                ))}
              </Select>
            </Field>
            <Field label={t('common.date')} htmlFor="ed">
              <TextInput id="ed" type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
            </Field>
          </div>
          <Field label={t('projectsM.description')} htmlFor="eds" required>
            <TextInput id="eds" required value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <div className="grid-2">
            <Field label={t('common.amount')} htmlFor="ea" required>
              <TextInput id="ea" required dir="ltr" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
            </Field>
            <Field label={t('common.currency')} htmlFor="ecu">
              <Select id="ecu" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="USD">USD</option><option value="LBP">LBP</option>
              </Select>
            </Field>
          </div>
          <div className="modal-actions">
            <Button variant="outline" onClick={() => setAddOpen(false)}>{t('common.cancel')}</Button>
            <Button disabled={!description.trim() || !amount} onClick={async () => {
              try {
                await api(`/api/projects/${projectId}/expenses`, { method: 'POST', body: { category, description: description.trim(), amount, currency, expenseDate } });
                toast(t('common.savedOk'), 'success');
                setAddOpen(false); setDescription(''); setAmount('');
                reload();
              } catch (e) { toast((e as ApiError).message, 'error'); }
            }}>{t('common.save')}</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function FinancialsTab({ projectId, locale }: { projectId: string; locale: string }) {
  const { t } = useTranslation();
  const { data, loading } = useApi<any>(`/api/projects/${projectId}/financial-summary`);
  if (loading) return <Spinner />;
  if (!data) return null;
  const expenses: Array<{ currency: string; category: string; total: string }> = data.expenses as any;
  const invoices: Array<{ currency: string; invoiced: string; paid: string }> = data.invoices as any;
  const byCur = (currency: string): { exp: number; inv: string; paid: string } => {
    const exp = expenses.filter((e) => e.currency === currency).reduce((a, e) => a + Number(e.total), 0);
    const inv = invoices.find((i) => i.currency === currency);
    return { exp, inv: inv?.invoiced ?? '0', paid: inv?.paid ?? '0' };
  };
  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      {['USD', 'LBP'].map((cur) => {
        const { exp, inv, paid } = byCur(cur);
        if (exp === 0 && Number(inv) === 0) return null;
        return (
          <div className="card" key={cur}>
            <div className="card-title">{cur}</div>
            <div className="detail-grid">
              <div className="detail-item"><div className="k">{t('financeM.invoicesTitle')}</div><div className="v"><Money amount={inv} currency={cur} locale={locale} /></div></div>
              <div className="detail-item"><div className="k">{t('dash.accReceipts')}</div><div className="v"><Money amount={paid} currency={cur} locale={locale} /></div></div>
              <div className="detail-item"><div className="k">{t('projectsM.actualCosts')}</div><div className="v"><Money amount={String(exp)} currency={cur} locale={locale} /></div></div>
            </div>
            <div style={{ marginTop: '0.8rem' }}>
              {expenses.filter((e) => e.currency === cur).map((e, i) => (
                <div key={i} className="row-between small" style={{ padding: '0.25rem 0', borderBottom: '1px solid var(--slate-100)' }}>
                  <span>{t(`projectsM.expCategory.${e.category}`)}</span>
                  <Money amount={e.total} currency={cur} locale={locale} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <div className="card">
        <div className="card-title">{t('projectsM.contract')} / {t('projectsM.budget')}</div>
        <div className="detail-grid">
          <div className="detail-item"><div className="k">{t('projectsM.contract')}</div>
            <div className="v">{data.project?.contractAmount ? <Money amount={data.project.contractAmount} currency={data.project.contractCurrency} locale={locale} /> : '—'}</div></div>
          <div className="detail-item"><div className="k">{t('projectsM.budget')}</div>
            <div className="v">{data.project?.budgetAmount ? <Money amount={data.project.budgetAmount} currency={data.project.budgetCurrency} locale={locale} /> : '—'}</div></div>
        </div>
        <p className="small muted" style={{ marginTop: '0.7rem' }}>{t('projectsM.perCurrency')}</p>
      </div>
    </div>
  );
}

function FilesTab({ projectId, canWrite }: { projectId: string; canWrite: boolean }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { data, reload } = useApi<{ items: any[] }>(`/api/projects/${projectId}/files`);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="card">
      <div className="card-title">
        {t('projectsM.files')}
        {canWrite && (
          <span className="row">
            <input type="file" id="pfile" style={{ display: 'none' }}
              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.txt"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <label htmlFor="pfile" className="btn btn-outline btn-sm">{t('projectsM.uploadFile')}</label>
            {file && (
              <Button size="sm" busy={busy} onClick={async () => {
                setBusy(true);
                try {
                  const fd = new FormData();
                  fd.append('file', file);
                  await api(`/api/projects/${projectId}/files`, { method: 'POST', formData: fd });
                  toast(t('common.savedOk'), 'success');
                  setFile(null); reload();
                } catch (e) { toast((e as ApiError).message, 'error'); } finally { setBusy(false); }
              }}>{t('common.upload')}</Button>
            )}
          </span>
        )}
      </div>
      {(data?.items ?? []).map((f: any) => (
        <div key={f.id} className="row-between" style={{ padding: '0.35rem 0', borderBottom: '1px solid var(--slate-100)' }}>
          <span className="small">📎 {f.originalName} <span className="muted">({Math.round(f.sizeBytes / 1024)} KB)</span></span>
          <a className="btn btn-outline btn-sm" href={`/api/files/${f.id}/download`} target="_blank" rel="noreferrer">{t('common.download')}</a>
        </div>
      ))}
      {(data?.items ?? []).length === 0 && <span className="muted small">{t('common.noResults')}</span>}
    </div>
  );
}

function EditProjectButton({ project, onSaved }: { project: any; onSaved: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: project.name, description: project.description ?? '', scope: project.scope ?? '',
    status: project.status, priority: project.priority, startDate: project.startDate ?? '',
    targetEndDate: project.targetEndDate ?? '', actualEndDate: project.actualEndDate ?? '',
    contractAmount: project.contractAmount ?? '', contractCurrency: project.contractCurrency ?? 'USD',
    budgetAmount: project.budgetAmount ?? '', budgetCurrency: project.budgetCurrency ?? 'USD',
    governorate: project.governorate ?? '', town: project.town ?? '', warrantyNotes: project.warrantyNotes ?? '',
  });
  const set = (k: string, v: string): void => setForm((f) => ({ ...f, [k]: v }));
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>{t('common.edit')}</Button>
      {open && (
        <Modal title={t('projectsM.name')} onClose={() => setOpen(false)} wide>
          <div className="grid-2">
            <Field label={t('projectsM.name')} htmlFor="epn"><TextInput id="epn" value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label={t('common.status')} htmlFor="eps">
              <Select id="eps" value={form.status} onChange={(e) => set('status', e.target.value)}>
                {['planning', 'in_progress', 'on_hold', 'completed', 'cancelled'].map((s) => <option key={s} value={s}>{t(`projectsM.statuses.${s}`)}</option>)}
              </Select>
            </Field>
            <Field label={t('projectsM.start')} htmlFor="epst"><TextInput id="epst" type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
            <Field label={t('projectsM.targetEnd')} htmlFor="ept"><TextInput id="ept" type="date" value={form.targetEndDate} onChange={(e) => set('targetEndDate', e.target.value)} /></Field>
            <Field label={t('projectsM.actualEnd')} htmlFor="epa"><TextInput id="epa" type="date" value={form.actualEndDate} onChange={(e) => set('actualEndDate', e.target.value)} /></Field>
            <Field label={t('projectsM.priority')} htmlFor="epp">
              <Select id="epp" value={form.priority} onChange={(e) => set('priority', e.target.value)}>
                {['low', 'normal', 'high', 'urgent'].map((p) => <option key={p} value={p}>{t(`projectsM.priorities.${p}`)}</option>)}
              </Select>
            </Field>
            <Field label={t('projectsM.contract')} htmlFor="epca"><TextInput id="epca" dir="ltr" value={form.contractAmount} onChange={(e) => set('contractAmount', e.target.value.replace(/[^\d.]/g, ''))} /></Field>
            <Field label={t('common.currency')} htmlFor="epcc">
              <Select id="epcc" value={form.contractCurrency} onChange={(e) => set('contractCurrency', e.target.value)}>
                <option value="USD">USD</option><option value="LBP">LBP</option>
              </Select>
            </Field>
            <Field label={t('projectsM.budget')} htmlFor="epba"><TextInput id="epba" dir="ltr" value={form.budgetAmount} onChange={(e) => set('budgetAmount', e.target.value.replace(/[^\d.]/g, ''))} /></Field>
            <Field label={t('common.currency')} htmlFor="epbc">
              <Select id="epbc" value={form.budgetCurrency} onChange={(e) => set('budgetCurrency', e.target.value)}>
                <option value="USD">USD</option><option value="LBP">LBP</option>
              </Select>
            </Field>
            <Field label={t('personnelM.governorate')} htmlFor="epg">
              <Select id="epg" value={form.governorate} onChange={(e) => set('governorate', e.target.value)}>
                <option value="">—</option>
                {GOVERNORATES.map((g) => <option key={g} value={g}>{g}</option>)}
              </Select>
            </Field>
            <Field label={t('apply.town')} htmlFor="eptn"><TextInput id="eptn" value={form.town} onChange={(e) => set('town', e.target.value)} /></Field>
          </div>
          <Field label={t('projectsM.description')} htmlFor="epd"><TextArea id="epd" value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
          <Field label={t('projectsM.scope')} htmlFor="epsc"><TextArea id="epsc" value={form.scope} onChange={(e) => set('scope', e.target.value)} /></Field>
          <Field label={t('projectsM.warranty')} htmlFor="epw"><TextArea id="epw" value={form.warrantyNotes} onChange={(e) => set('warrantyNotes', e.target.value)} /></Field>
          <div className="modal-actions">
            <Button variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={async () => {
              try {
                await api(`/api/projects/${project.id}`, {
                  method: 'PATCH',
                  body: {
                    ...form,
                    startDate: form.startDate || null, targetEndDate: form.targetEndDate || null,
                    actualEndDate: form.actualEndDate || null,
                    contractAmount: form.contractAmount || null, contractCurrency: form.contractAmount ? form.contractCurrency : null,
                    budgetAmount: form.budgetAmount || null, budgetCurrency: form.budgetAmount ? form.budgetCurrency : null,
                    governorate: form.governorate || null, town: form.town || null,
                    description: form.description || null, scope: form.scope || null, warrantyNotes: form.warrantyNotes || null,
                  },
                });
                toast(t('common.savedOk'), 'success');
                setOpen(false); onSaved();
              } catch (e) { toast((e as ApiError).message, 'error'); }
            }}>{t('common.save')}</Button>
          </div>
        </Modal>
      )}
    </>
  );
}

function ArchiveButton({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const toast = useToast();
  return (
    <>
      <Button size="sm" variant="danger" onClick={() => setOpen(true)}>{t('projectsM.archive')}</Button>
      {open && (
        <ConfirmDialog title={t('projectsM.archive')} message={t('projectsM.confirmArchive')} confirmLabel={t('projectsM.archive')} danger
          onClose={() => setOpen(false)}
          onConfirm={async () => { await api(`/api/projects/${projectId}/archive`, { method: 'POST' }); toast(t('common.savedOk'), 'success'); onDone(); }} />
      )}
    </>
  );
}
