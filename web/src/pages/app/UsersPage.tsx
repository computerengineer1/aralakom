import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import {
  Button, ConfirmDialog, DataTable, Field, Modal, Select, StatusBadge, TextInput,
  useApi, useToast, fmtDate, type Column,
} from '../../components/ui';

 

interface UserRow {
  id: string; email: string; fullName: string; role: string; status: string;
  mfaEnabled: boolean; lastLoginAt: string | null; createdAt: string; personnelId: string | null;
}

export default function UsersPage() {
  const { t } = useTranslation();
  const { user: me } = useAuth();
  const toast = useToast();
  const { data, loading, reload } = useApi<{ items: UserRow[] }>('/api/users');
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteFor, setDeleteFor] = useState<UserRow | null>(null);

  const act = async (id: string, patch: Record<string, unknown>): Promise<void> => {
    try {
      await api(`/api/users/${id}`, { method: 'PATCH', body: patch });
      toast(t('common.savedOk'), 'success');
      reload();
    } catch (e) {
      const err = e as ApiError;
      toast(err.code === 'OWNER_ONLY' ? t('adminM.ownerOnlyActions') : err.message, 'error');
    }
  };

  const columns: Array<Column<UserRow>> = [
    { key: 'name', header: t('personnelM.name'), render: (r) => <span><b>{r.fullName}</b><div className="small muted" dir="ltr">{r.email}</div></span> },
    {
      key: 'role', header: t('adminM.role'),
      render: (r) => (
        <Select value={r.role} disabled={r.role === 'owner' && me?.role !== 'owner'} aria-label={t('adminM.role')}
          onChange={(e) => void act(r.id, { role: e.target.value })}>
          {['owner', 'admin', 'hr', 'pm', 'accountant', 'engineer', 'worker'].map((role) => (
            <option key={role} value={role}>{t(`adminM.roles.${role}`)}</option>
          ))}
        </Select>
      ),
    },
    { key: 'status', header: t('common.status'), render: (r) => <StatusBadge status={r.status} label={t(`adminM.accountStatus.${r.status}`)} /> },
    { key: 'mfa', header: t('adminM.mfaEnabled'), render: (r) => r.mfaEnabled ? '✓' : '—' },
    { key: 'lastLogin', header: t('auditM.when'), render: (r) => fmtDate(r.lastLoginAt, 'en') },
    {
      key: 'actions', header: t('common.actions'),
      render: (r) => (
        <div className="row" style={{ gap: '0.3rem' }}>
          {r.id !== me?.id && (r.status === 'active'
            ? <Button size="sm" variant="outline" onClick={() => void act(r.id, { status: 'suspended' })}>{t('adminM.suspend')}</Button>
            : <Button size="sm" onClick={() => void act(r.id, { status: 'active' })}>{t('adminM.activate')}</Button>)}
          <Button size="sm" variant="ghost" onClick={async () => {
            try { await api(`/api/users/${r.id}/send-reset`, { method: 'POST' }); toast(t('common.savedOk'), 'success'); }
            catch (e) { toast((e as ApiError).message, 'error'); }
          }}>{t('adminM.sendReset')}</Button>
          {me?.role === 'owner' && r.role !== 'owner' && (
            <Button size="sm" variant="danger" onClick={() => setDeleteFor(r)}>{t('common.delete')}</Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="row-between">
        <h1>{t('adminM.usersTitle')}</h1>
        <Button size="sm" onClick={() => setCreateOpen(true)}>+ {t('adminM.newUser')}</Button>
      </div>
      <DataTable columns={columns} rows={data?.items ?? []} page={1} pageSize={200}
        total={data?.items.length ?? 0} onPage={() => undefined} loading={loading} emptyText={t('common.noResults')} />
      {createOpen && <CreateUserModal onClose={() => setCreateOpen(false)} onDone={() => { setCreateOpen(false); reload(); }} />}
      {deleteFor && (
        <ConfirmDialog title={t('adminM.deleteUser')} message={t('adminM.confirmDelete')} confirmLabel={t('common.delete')} danger
          onClose={() => setDeleteFor(null)}
          onConfirm={async () => { await api(`/api/users/${deleteFor.id}`, { method: 'DELETE' }); toast(t('common.deletedOk'), 'success'); reload(); }} />
      )}
    </div>
  );
}

function CreateUserModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const { user: me } = useAuth();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('pm');
  const [locale, setLocalePref] = useState('ar');
  const [tempPw, setTempPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const canGrantPrivileged = me?.role === 'owner';
  const roles = ['owner', 'admin', 'hr', 'pm', 'accountant', 'engineer', 'worker'].filter((r) => canGrantPrivileged || !['owner', 'admin'].includes(r));
  return (
    <Modal title={t('adminM.newUser')} onClose={onClose}>
      <Field label={t('auth.email')} htmlFor="ue" required>
        <TextInput id="ue" type="email" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label={t('personnelM.name')} htmlFor="un" required>
        <TextInput id="un" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </Field>
      <div className="grid-2">
        <Field label={t('adminM.role')} htmlFor="ur">
          <Select id="ur" value={roles.includes(role) ? role : roles[0]} onChange={(e) => setRole(e.target.value)}>
            {roles.map((r) => <option key={r} value={r}>{t(`adminM.roles.${r}`)}</option>)}
          </Select>
        </Field>
        <Field label={t('profileM.localePref')} htmlFor="ul">
          <Select id="ul" value={locale} onChange={(e) => setLocalePref(e.target.value)}>
            <option value="ar">العربية</option><option value="en">English</option>
          </Select>
        </Field>
      </div>
      <Field label={t('adminM.temporaryPassword')} htmlFor="up" hint={t('adminM.tempPwHint')}>
        <TextInput id="up" type="password" dir="ltr" value={tempPw} onChange={(e) => setTempPw(e.target.value)} autoComplete="new-password" />
      </Field>
      {err && <div className="alert alert-error">{err}</div>}
      <div className="modal-actions">
        <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
        <Button busy={busy} disabled={!email || fullName.trim().length < 2} onClick={async () => {
          setBusy(true); setErr(null);
          try {
            await api('/api/users', { method: 'POST', body: { email: email.trim(), fullName: fullName.trim(), role, locale, temporaryPassword: tempPw || undefined } });
            onDone();
          } catch (e) {
            const e2 = e as ApiError;
            setErr(e2.code === 'EMAIL_TAKEN' ? e2.message : e2.code === 'WEAK_PASSWORD' ? `${t('auth.pwPolicy')}` : e2.message);
          } finally { setBusy(false); }
        }}>{t('common.create')}</Button>
      </div>
    </Modal>
  );
}
