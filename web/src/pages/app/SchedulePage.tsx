import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../../lib/api';
import { useLocale } from '../../lib/auth';
import {
  Button, DataTable, ErrorState, Field, Modal, Select, Spinner, StatusBadge, Tabs,
  TextInput, useApi, useToast, fmtDate, type Column,
} from '../../components/ui';

interface AssignmentRow { id: string; personnelId: string; projectId: string; workDate: string; shift: string; personName: string | null; projectNo: string | null; projectName: string | null; notes?: string | null }
interface AttendanceRow { id: string; personnelId: string; workDate: string; status: string; regularHours: string; overtimeHours: string; approvalStatus: string; personName: string | null; projectNo: string | null; projectId: string | null }

export default function SchedulePage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('assignments');
  return (
    <div>
      <h1>{t('scheduleM.title')}</h1>
      <Tabs tabs={[
        { key: 'assignments', label: t('scheduleM.assignments') },
        { key: 'attendance', label: t('scheduleM.attendance') },
      ]} active={tab} onChange={setTab} />
      {tab === 'assignments' ? <Assignments /> : <Attendance />}
    </div>
  );
}

function Assignments() {
  const { t } = useTranslation();
  const [locale] = useLocale();
  const toast = useToast();
  const [from, setFrom] = useState(() => new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10));
  const [projectId, setProjectId] = useState('');
  const query = `/api/scheduling/assignments?from=${from}&to=${to}&projectId=${projectId}`;
  const { data, loading, error, reload } = useApi<{ items: AssignmentRow[] }>(query, [query]);
  const { data: projects } = useApi<{ items: Array<{ id: string; projectNo: string; name: string }> }>('/api/projects?pageSize=100', []);
  const [addOpen, setAddOpen] = useState(false);

  const columns: Array<Column<AssignmentRow>> = [
    { key: 'workDate', header: t('scheduleM.workDate'), render: (r) => fmtDate(r.workDate, locale) },
    { key: 'person', header: t('scheduleM.person'), render: (r) => r.personName ?? '—' },
    { key: 'project', header: t('scheduleM.project'), render: (r) => <span><span className="ltr-span">{r.projectNo}</span> {r.projectName}</span> },
    { key: 'shift', header: t('scheduleM.shift'), render: (r) => t(`scheduleM.shifts.${r.shift}`) },
    {
      key: 'actions', header: t('common.actions'),
      render: (r) => (
        <Button size="sm" variant="ghost" onClick={async () => {
          try { await api(`/api/scheduling/assignments/${r.id}`, { method: 'DELETE' }); toast(t('common.deletedOk'), 'success'); reload(); }
          catch (e) { toast((e as ApiError).message, 'error'); }
        }}>{t('common.delete')}</Button>
      ),
    },
  ];

  return (
    <div>
      <div className="toolbar">
        <Field label={t('common.from')} htmlFor="sfrom">
          <TextInput id="sfrom" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label={t('common.to')} htmlFor="sto">
          <TextInput id="sto" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label={t('scheduleM.project')} htmlFor="sproj">
          <Select id="sproj" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">{t('common.all')}</option>
            {(projects?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.projectNo} — {p.name}</option>)}
          </Select>
        </Field>
        <span className="spacer" />
        <Button size="sm" onClick={() => setAddOpen(true)}>+ {t('scheduleM.newAssignment')}</Button>
      </div>
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data ? <Spinner /> : (
        <DataTable columns={columns} rows={data?.items ?? []} page={1} pageSize={500}
          total={data?.items.length ?? 0} onPage={() => undefined} emptyText={t('common.noResults')} />
      )}
      {addOpen && <AssignmentModal projects={projects?.items ?? []} onClose={() => setAddOpen(false)} onDone={() => { setAddOpen(false); reload(); }} />}
    </div>
  );
}

function AssignmentModal({ projects, onClose, onDone }: { projects: Array<{ id: string; projectNo: string; name: string }>; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [personnelId, setPersonnelId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [workDate, setWorkDate] = useState(new Date().toISOString().slice(0, 10));
  const [shift, setShift] = useState('full_day');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { data: people } = useApi<{ items: Array<{ id: string; fullName: string; recordNo: string }> }>('/api/personnel?pageSize=100&employmentStatus=active', []);
  return (
    <Modal title={t('scheduleM.newAssignment')} onClose={onClose}>
      <Field label={t('scheduleM.person')} htmlFor="ap" required>
        <Select id="ap" value={personnelId} onChange={(e) => setPersonnelId(e.target.value)} required>
          <option value="">—</option>
          {(people?.items ?? []).map((pp) => <option key={pp.id} value={pp.id}>{pp.recordNo} — {pp.fullName}</option>)}
        </Select>
      </Field>
      <Field label={t('scheduleM.project')} htmlFor="aprj" required>
        <Select id="aprj" value={projectId} onChange={(e) => setProjectId(e.target.value)} required>
          <option value="">—</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.projectNo} — {p.name}</option>)}
        </Select>
      </Field>
      <div className="grid-2">
        <Field label={t('scheduleM.workDate')} htmlFor="apd" required>
          <TextInput id="apd" type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} required />
        </Field>
        <Field label={t('scheduleM.shift')} htmlFor="aps">
          <Select id="aps" value={shift} onChange={(e) => setShift(e.target.value)}>
            {['full_day', 'morning', 'afternoon', 'night'].map((s) => <option key={s} value={s}>{t(`scheduleM.shifts.${s}`)}</option>)}
          </Select>
        </Field>
      </div>
      {err && <div className="alert alert-error">{err}</div>}
      <div className="modal-actions">
        <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
        <Button busy={busy} disabled={!personnelId || !projectId} onClick={async () => {
          setBusy(true); setErr(null);
          try {
            await api('/api/scheduling/assignments', { method: 'POST', body: { personnelId, projectId, workDate, shift } });
            toast(t('common.savedOk'), 'success');
            onDone();
          } catch (e) {
            const e2 = e as ApiError;
            setErr(e2.code === 'SCHEDULING_CONFLICT' ? t('scheduleM.conflict') : e2.message);
          } finally { setBusy(false); }
        }}>{t('common.save')}</Button>
      </div>
    </Modal>
  );
}

function Attendance() {
  const { t } = useTranslation();
  const [locale] = useLocale();
  const toast = useToast();
  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [approvalStatus, setApprovalStatus] = useState('');
  const query = `/api/scheduling/attendance?from=${from}&to=${to}&approvalStatus=${approvalStatus}`;
  const { data, loading, reload } = useApi<{ items: AttendanceRow[] }>(query, [query]);
  const [addOpen, setAddOpen] = useState(false);

  const act = async (id: string, action: 'submit' | 'approve' | 'reject'): Promise<void> => {
    try {
      await api(`/api/scheduling/attendance/${id}/${action}`, { method: 'POST' });
      toast(t('common.savedOk'), 'success');
      reload();
    } catch (e) { toast((e as ApiError).message, 'error'); }
  };

  const columns: Array<Column<AttendanceRow>> = [
    { key: 'workDate', header: t('scheduleM.workDate'), render: (r) => fmtDate(r.workDate, locale) },
    { key: 'person', header: t('scheduleM.person'), render: (r) => <span>{r.personName ?? '—'}{r.projectNo && <span className="muted small"> · {r.projectNo}</span>}</span> },
    { key: 'status', header: t('common.status'), render: (r) => <StatusBadge status={r.status} label={t(`scheduleM.attStatus.${r.status}`)} /> },
    { key: 'hours', header: t('scheduleM.regularHours'), num: true, render: (r) => <span className="ltr-span">{r.regularHours}h{Number(r.overtimeHours) > 0 ? ` +${r.overtimeHours}h OT` : ''}</span> },
    { key: 'approval', header: t('financeM.statuses.approved'), render: (r) => <StatusBadge status={r.approvalStatus === 'approved' ? 'approved' : r.approvalStatus === 'rejected' ? 'rejected' : r.approvalStatus === 'submitted' ? 'pending_approval' : 'draft'} label={t(`scheduleM.approval.${r.approvalStatus}`)} /> },
    {
      key: 'actions', header: t('common.actions'),
      render: (r) => (
        <div className="row" style={{ gap: '0.3rem' }}>
          {r.approvalStatus === 'draft' && <Button size="sm" variant="outline" onClick={() => void act(r.id, 'submit')}>{t('scheduleM.submitForApproval')}</Button>}
          {r.approvalStatus === 'submitted' && <>
            <Button size="sm" onClick={() => void act(r.id, 'approve')}>{t('scheduleM.approve')}</Button>
            <Button size="sm" variant="danger" onClick={() => void act(r.id, 'reject')}>{t('scheduleM.reject')}</Button>
          </>}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="toolbar">
        <Field label={t('common.from')} htmlFor="afrom"><TextInput id="afrom" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label={t('common.to')} htmlFor="ato"><TextInput id="ato" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label={t('common.status')} htmlFor="ast">
          <Select id="ast" value={approvalStatus} onChange={(e) => setApprovalStatus(e.target.value)}>
            <option value="">{t('common.all')}</option>
            {['draft', 'submitted', 'approved', 'rejected'].map((s) => <option key={s} value={s}>{t(`scheduleM.approval.${s}`)}</option>)}
          </Select>
        </Field>
        <span className="spacer" />
        <Button size="sm" onClick={() => setAddOpen(true)}>+ {t('scheduleM.newAttendance')}</Button>
      </div>
      {loading && !data ? <Spinner /> : (
        <DataTable columns={columns} rows={data?.items ?? []} page={1} pageSize={500}
          total={data?.items.length ?? 0} onPage={() => undefined} emptyText={t('common.noResults')} />
      )}
      {addOpen && <AttendanceModal onClose={() => setAddOpen(false)} onDone={() => { setAddOpen(false); reload(); }} />}
    </div>
  );
}

function AttendanceModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [personnelId, setPersonnelId] = useState('');
  const [workDate, setWorkDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState('present');
  const [regularHours, setRegularHours] = useState('8');
  const [overtimeHours, setOvertimeHours] = useState('0');
  const [submit, setSubmit] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { data: people } = useApi<{ items: Array<{ id: string; fullName: string; recordNo: string }> }>('/api/personnel?pageSize=100&employmentStatus=active', []);
  const { data: projects } = useApi<{ items: Array<{ id: string; projectNo: string; name: string }> }>('/api/projects?pageSize=100&status=in_progress', []);
  const [projectId, setProjectId] = useState('');
  return (
    <Modal title={t('scheduleM.newAttendance')} onClose={onClose}>
      <div className="grid-2">
        <Field label={t('scheduleM.person')} htmlFor="atp" required>
          <Select id="atp" value={personnelId} onChange={(e) => setPersonnelId(e.target.value)} required>
            <option value="">—</option>
            {(people?.items ?? []).map((pp) => <option key={pp.id} value={pp.id}>{pp.recordNo} — {pp.fullName}</option>)}
          </Select>
        </Field>
        <Field label={t('scheduleM.project')} htmlFor="atprj">
          <Select id="atprj" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">—</option>
            {(projects?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.projectNo} — {p.name}</option>)}
          </Select>
        </Field>
        <Field label={t('scheduleM.workDate')} htmlFor="atd" required>
          <TextInput id="atd" type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} required />
        </Field>
        <Field label={t('common.status')} htmlFor="ats">
          <Select id="ats" value={status} onChange={(e) => setStatus(e.target.value)}>
            {['present', 'absent', 'late', 'leave', 'half_day'].map((s) => <option key={s} value={s}>{t(`scheduleM.attStatus.${s}`)}</option>)}
          </Select>
        </Field>
        <Field label={t('scheduleM.regularHours')} htmlFor="ath">
          <TextInput id="ath" type="number" min={0} max={24} step="0.5" value={regularHours} onChange={(e) => setRegularHours(e.target.value)} />
        </Field>
        <Field label={t('scheduleM.overtimeHours')} htmlFor="ato2">
          <TextInput id="ato2" type="number" min={0} max={12} step="0.5" value={overtimeHours} onChange={(e) => setOvertimeHours(e.target.value)} />
        </Field>
      </div>
      <label className="checkbox-row small">
        <input type="checkbox" checked={submit} onChange={(e) => setSubmit(e.target.checked)} />
        {t('scheduleM.submitForApproval')}
      </label>
      {err && <div className="alert alert-error">{err}</div>}
      <div className="modal-actions">
        <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
        <Button busy={busy} disabled={!personnelId} onClick={async () => {
          setBusy(true); setErr(null);
          try {
            await api('/api/scheduling/attendance', {
              method: 'POST',
              body: { personnelId, projectId: projectId || null, workDate, status, regularHours: Number(regularHours), overtimeHours: Number(overtimeHours), submit },
            });
            toast(t('common.savedOk'), 'success');
            onDone();
          } catch (e) {
            const e2 = e as ApiError;
            setErr(e2.code === 'DUPLICATE_RECORD' ? e2.message : e2.message);
          } finally { setBusy(false); }
        }}>{t('common.save')}</Button>
      </div>
    </Modal>
  );
}
