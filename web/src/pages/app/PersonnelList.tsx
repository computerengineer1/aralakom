import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../../lib/api';
import { useAuth, useLocale } from '../../lib/auth';
import {
  Button, DataTable, ErrorState, Field, Modal, Select, StatusBadge, TextInput,
  useApi, useToast, type Column,
} from '../../components/ui';
import { GOVERNORATES } from '../public/Apply';

export interface PersonRow {
  id: string; recordNo: string; personType: string; fullName: string; phone: string;
  governorate?: string | null; town?: string | null; employmentStatus: string;
  availability: string; experienceYears: number; rateAmount?: string | null;
  rateCurrency?: string | null; archivedAt?: string | null; createdAt: string;
}

interface ListRes { items: PersonRow[]; total: number; page: number; pageSize: number }
interface DupRow { aid: string; bid: string; aname: string; bname: string; aphone: string; bphone: string; aref: string; bref: string }

export default function PersonnelList() {
  const { t } = useTranslation();
  const [locale] = useLocale();
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [personType, setPersonType] = useState('');
  const [q, setQ] = useState('');
  const [gov, setGov] = useState('');
  const [empStatus, setEmpStatus] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('createdAt');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [selected, setSelected] = useState<PersonRow[]>([]);
  const [dupsOpen, setDupsOpen] = useState(false);
  const pageSize = 20;

  const query = `/api/personnel?page=${page}&pageSize=${pageSize}&sort=${sort}&dir=${dir}`
    + `&personType=${personType}&q=${encodeURIComponent(q)}&governorate=${encodeURIComponent(gov)}`
    + `&employmentStatus=${empStatus}&categoryId=${categoryId}&archived=${archived}`;
  const { data, loading, error, reload } = useApi<ListRes>(query, [query]);
  const { data: publicData } = useApi<{ tradeCategories: Array<{ id: string; nameEn: string; nameAr: string }>; engineeringCategories: Array<{ id: string; nameEn: string; nameAr: string }> }>('/api/settings/public', []);
  const categories = [...(publicData?.tradeCategories ?? []), ...(publicData?.engineeringCategories ?? [])];

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const canSeeRate = rows[0] ? 'rateAmount' in rows[0] : false;

  const onSort = (key: string): void => {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc');
    else { setSort(key); setDir('asc'); }
    setPage(1);
  };

  const toggleSelect = (row: PersonRow): void => {
    setSelected((s) => (s.some((x) => x.id === row.id) ? s.filter((x) => x.id !== row.id) : [...s, row]));
  };

  const columns: Array<Column<PersonRow>> = [
    ...(can('personnel.merge') ? [{
      key: 'sel', header: '', render: (r: PersonRow) => (
        <input type="checkbox" aria-label={r.fullName} checked={selected.some((x) => x.id === r.id)}
          onClick={(e) => e.stopPropagation()} onChange={() => toggleSelect(r)} />
      ),
    } as Column<PersonRow>] : []),
    { key: 'recordNo', header: t('personnelM.recordNo'), render: (r) => <span className="ltr-span">{r.recordNo}</span> },
    { key: 'name', header: t('personnelM.name'), sortable: true, render: (r) => <b>{r.fullName}</b> },
    { key: 'type', header: t('personnelM.type'), render: (r) => t(`personnelM.personType.${r.personType}`) },
    { key: 'phone', header: t('personnelM.phone'), render: (r) => <span className="ltr-span" dir="ltr">{r.phone}</span> },
    { key: 'governorate', header: t('personnelM.governorate'), render: (r) => r.governorate ?? '—' },
    { key: 'experience', header: t('personnelM.experience'), sortable: true, render: (r) => t('personnelM.years', { n: r.experienceYears }) },
    { key: 'employmentStatus', header: t('personnelM.empStatus'), render: (r) => <StatusBadge status={r.employmentStatus} label={t(`personnelM.emp.${r.employmentStatus}`)} /> },
    { key: 'availability', header: t('personnelM.availability'), render: (r) => <StatusBadge status={r.availability} label={t(`personnelM.avail.${r.availability}`)} /> },
    ...(canSeeRate ? [{
      key: 'rate', header: t('personnelM.rate'), num: true,
      render: (r: PersonRow) => (r.rateAmount ? <span className="ltr-span mono-num">{r.rateAmount} {r.rateCurrency}</span> : '—'),
    } as Column<PersonRow>] : []),
  ];

  return (
    <div>
      <div className="row-between">
        <h1>{t('personnelM.title')}</h1>
        <div className="row no-print">
          {can('personnel.merge') && (
            <Button variant="outline" size="sm" onClick={() => setDupsOpen(true)}>{t('personnelM.duplicates')}</Button>
          )}
          {can('personnel.merge') && selected.length >= 2 && (
            <MergeModal selected={selected} onClose={() => setSelected([])} onDone={() => { setSelected([]); reload(); }} />
          )}
          {can('personnel.export') && (
            <Button variant="outline" size="sm" onClick={() => { window.open('/api/personnel/export.csv', '_blank', 'noopener'); toast(t('common.exportCsv'), 'info'); }}>
              {t('common.exportCsv')}
            </Button>
          )}
          {can('personnel.write') && <Button size="sm" onClick={() => navigate('/app/personnel/new')}>+ {t('personnelM.addNew')}</Button>}
        </div>
      </div>
      {!canSeeRate && <p className="small muted">{t('personnelM.sensitiveHidden')}</p>}

      <div className="toolbar">
        <TextInput className="search" placeholder={t('common.search') + '…'} value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label={t('common.search')} />
        <Select value={personType} onChange={(e) => { setPersonType(e.target.value); setPage(1); }} aria-label={t('personnelM.type')}>
          <option value="">{t('personnelM.type')}: {t('common.all')}</option>
          {['worker', 'technician', 'engineer', 'other'].map((pt) => <option key={pt} value={pt}>{t(`personnelM.personType.${pt}`)}</option>)}
        </Select>
        <Select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }} aria-label={t('personnelM.category')}>
          <option value="">{t('personnelM.category')}: {t('common.all')}</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{locale === 'ar' ? c.nameAr : c.nameEn}</option>)}
        </Select>
        <Select value={gov} onChange={(e) => { setGov(e.target.value); setPage(1); }} aria-label={t('personnelM.governorate')}>
          <option value="">{t('personnelM.governorate')}: {t('common.all')}</option>
          {GOVERNORATES.map((g) => <option key={g} value={g}>{g}</option>)}
        </Select>
        <Select value={empStatus} onChange={(e) => { setEmpStatus(e.target.value); setPage(1); }} aria-label={t('personnelM.empStatus')}>
          <option value="">{t('personnelM.empStatus')}: {t('common.all')}</option>
          {['candidate', 'active', 'on_leave', 'suspended', 'terminated', 'retired'].map((s) => <option key={s} value={s}>{t(`personnelM.emp.${s}`)}</option>)}
        </Select>
        <label className="checkbox-row small" style={{ gap: '0.35rem' }}>
          <input type="checkbox" checked={archived} onChange={(e) => { setArchived(e.target.checked); setPage(1); }} />
          {t('personnelM.showArchived')}
        </label>
      </div>

      {error && <ErrorState error={error} onRetry={reload} />}
      <DataTable
        columns={columns} rows={rows} page={page} pageSize={pageSize} total={total}
        onPage={setPage} sort={sort} dir={dir} onSort={onSort} loading={loading}
        emptyText={t('common.noResults')}
        onRowClick={(r) => navigate(`/app/personnel/${r.id}`)}
      />

      {dupsOpen && <DuplicatesModal onClose={() => setDupsOpen(false)} onChanged={reload} />}
    </div>
  );
}

function MergeModal({ selected, onClose, onDone }: { selected: PersonRow[]; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [target, setTarget] = useState(selected[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title={t('personnelM.mergeTitle')} onClose={onClose}>
      <p className="small muted">{t('personnelM.mergeExplain')}</p>
      <Field label={t('personnelM.mergeTarget')} htmlFor="mt">
        <Select id="mt" value={target} onChange={(e) => setTarget(e.target.value)}>
          {selected.map((r) => <option key={r.id} value={r.id}>{r.recordNo} — {r.fullName} ({r.phone})</option>)}
        </Select>
      </Field>
      {err && <div className="alert alert-error">{err}</div>}
      <div className="modal-actions">
        <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
        <Button busy={busy} onClick={async () => {
          setBusy(true); setErr(null);
          try {
            await api('/api/personnel/merge', { method: 'POST', body: { targetId: target, sourceIds: selected.map((r) => r.id).filter((id) => id !== target) } });
            toast(t('common.savedOk'), 'success');
            onDone();
          } catch (e) { setErr((e as ApiError).message); } finally { setBusy(false); }
        }}>{t('personnelM.mergeConfirm')}</Button>
      </div>
    </Modal>
  );
}

function DuplicatesModal({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { data, loading } = useApi<{ items: DupRow[] }>('/api/personnel/duplicates', []);
  const [busyPair, setBusyPair] = useState<string | null>(null);

  const merge = async (keepId: string, dropId: string): Promise<void> => {
    setBusyPair(keepId + dropId);
    try {
      await api('/api/personnel/merge', { method: 'POST', body: { targetId: keepId, sourceIds: [dropId] } });
      toast(t('common.savedOk'), 'success');
      onChanged();
      onClose();
    } catch (e) { toast((e as ApiError).message, 'error'); } finally { setBusyPair(null); }
  };

  return (
    <Modal title={t('personnelM.duplicates')} onClose={onClose} wide>
      {loading && <p className="muted">{t('common.loading')}</p>}
      {(data?.items ?? []).length === 0 && !loading && <p className="muted">{t('common.noResults')}</p>}
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>A</th><th>B</th><th>{t('common.actions')}</th></tr></thead>
          <tbody>
            {(data?.items ?? []).map((d) => (
              <tr key={d.aid + d.bid}>
                <td>
                  <span className="ltr-span small">{d.aref}</span><br />
                  <b>{d.aname}</b> <span className="muted small ltr-span" dir="ltr">{d.aphone}</span>
                </td>
                <td>
                  <span className="ltr-span small">{d.bref}</span><br />
                  <b>{d.bname}</b> <span className="muted small ltr-span" dir="ltr">{d.bphone}</span>
                </td>
                <td>
                  <div className="row">
                    <Button size="sm" variant="outline" busy={busyPair === d.aid + d.bid}
                      onClick={() => void merge(d.aid, d.bid)}>← A</Button>
                    <Button size="sm" variant="outline" busy={busyPair === d.aid + d.bid}
                      onClick={() => void merge(d.bid, d.aid)}>← B</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
