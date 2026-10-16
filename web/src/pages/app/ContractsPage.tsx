import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../../lib/api';
import { useLocale } from '../../lib/auth';
import {
  Button, DataTable, Field, Modal, Money, Select, Spinner, StatusBadge, TextArea, TextInput,
  useApi, useToast, fmtDate, type Column,
} from '../../components/ui';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface ContractRow {
  id: string; contractNo: string; status: string; amount: string; currency: string;
  customerId: string; projectId: string | null; startDate: string | null; endDate: string | null; createdAt: string;
}

export default function ContractsPage() {
  const { t } = useTranslation();
  const [locale] = useLocale();
  const { data, loading } = useApi<{ items: ContractRow[]; total: number }>('/api/finance/contracts?pageSize=100');
  const { data: customers } = useApi<{ items: any[] }>('/api/customers?pageSize=100', []);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const custName = (id: string): string => customers?.items.find((c: any) => c.id === id)?.name ?? '—';

  const columns: Array<Column<ContractRow>> = [
    { key: 'contractNo', header: t('financeM.contractNo'), render: (r) => <button type="button" className="btn btn-ghost btn-sm ltr-span" onClick={() => setDetail(r.id)}>{r.contractNo}</button> },
    { key: 'customer', header: t('requestsM.customer'), render: (r) => custName(r.customerId) },
    { key: 'status', header: t('common.status'), render: (r) => <StatusBadge status={r.status === 'active' ? 'active' : r.status === 'draft' ? 'draft' : r.status} label={t(`financeM.coStatus.${r.status}`, { defaultValue: r.status })} /> },
    { key: 'amount', header: t('common.amount'), num: true, render: (r) => <Money amount={r.amount} currency={r.currency} locale={locale} /> },
    { key: 'dates', header: t('projectsM.start'), render: (r) => `${fmtDate(r.startDate, locale)} → ${fmtDate(r.endDate, locale)}` },
    { key: 'project', header: t('app.projectsList'), render: (r) => r.projectId ? <Link to={`/app/projects/${r.projectId}`}>→</Link> : '—' },
  ];

  return (
    <div>
      <div className="row-between">
        <h1>{t('financeM.contractsTitle')}</h1>
        <Button size="sm" onClick={() => setCreateOpen(true)}>+ {t('financeM.newContract')}</Button>
      </div>
      <div className="alert alert-info">{t('financeM.legalNote')}</div>
      {loading && !data ? <Spinner /> : (
        <DataTable columns={columns} rows={data?.items ?? []} page={1} pageSize={100}
          total={data?.total ?? 0} onPage={() => undefined} emptyText={t('common.noResults')} />
      )}
      {createOpen && <CreateContractModal customers={customers?.items ?? []} onClose={() => setCreateOpen(false)} />}
      {detail && <ContractDetailModal id={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function CreateContractModal({ customers, onClose }: { customers: any[]; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { data: projects } = useApi<{ items: any[] }>('/api/projects?pageSize=100', []);
  const [customerId, setCustomerId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [scope, setScope] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title={t('financeM.newContract')} onClose={onClose} wide>
      <div className="grid-2">
        <Field label={t('requestsM.customer')} htmlFor="cc" required>
          <Select id="cc" value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
            <option value="">—</option>
            {customers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label={t('app.projectsList')} htmlFor="cpj">
          <Select id="cpj" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">—</option>
            {(projects?.items ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.projectNo} — {p.name}</option>)}
          </Select>
        </Field>
        <Field label={t('common.amount')} htmlFor="ca" required>
          <TextInput id="ca" dir="ltr" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
        </Field>
        <Field label={t('common.currency')} htmlFor="ccur">
          <Select id="ccur" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="USD">USD</option><option value="LBP">LBP</option>
          </Select>
        </Field>
        <Field label={t('projectsM.start')} htmlFor="cs">
          <TextInput id="cs" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label={t('projectsM.targetEnd')} htmlFor="ce">
          <TextInput id="ce" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
      </div>
      <Field label={t('projectsM.scope')} htmlFor="csc">
        <TextArea id="csc" value={scope} onChange={(e) => setScope(e.target.value)} />
      </Field>
      {err && <div className="alert alert-error">{err}</div>}
      <div className="modal-actions">
        <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
        <Button busy={busy} disabled={!customerId || !amount} onClick={async () => {
          setBusy(true); setErr(null);
          try {
            await api('/api/finance/contracts', {
              method: 'POST',
              body: {
                customerId, projectId: projectId || null, amount, currency,
                startDate: startDate || null, endDate: endDate || null, scope: scope || null,
              },
            });
            toast(t('common.savedOk'), 'success');
            onClose();
          } catch (e) { setErr((e as ApiError).message); } finally { setBusy(false); }
        }}>{t('common.create')}</Button>
      </div>
    </Modal>
  );
}

function ContractDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [locale] = useLocale();
  const toast = useToast();
  const { data, loading, reload } = useApi<any>(`/api/finance/contracts/${id}`);
  const [coOpen, setCoOpen] = useState(false);
  const [coTitle, setCoTitle] = useState('');
  const [coAmount, setCoAmount] = useState('');
  const [coDesc, setCoDesc] = useState('');

  if (loading || !data) return <Modal title={t('financeM.contractsTitle')} onClose={onClose}><Spinner /></Modal>;
  const c = data.contract;

  return (
    <Modal title={c.contractNo} onClose={onClose} wide>
      <div className="row-between">
        <StatusBadge status={c.status === 'active' ? 'active' : c.status} label={c.status} />
        <b><Money amount={c.amount} currency={c.currency} locale={locale} /></b>
      </div>
      <p className="small muted">{fmtDate(c.startDate, locale)} → {fmtDate(c.endDate, locale)}</p>
      {c.scope && <p className="small" style={{ whiteSpace: 'pre-line' }}>{c.scope}</p>}

      <div className="card-title" style={{ marginTop: '0.8rem' }}>{t('financeM.paymentSchedule')}</div>
      {data.paymentSchedule.map((p: any) => (
        <div key={p.id} className="row-between small" style={{ padding: '0.3rem 0', borderBottom: '1px solid var(--slate-100)' }}>
          <span>{p.label}</span>
          <span>{p.amount ? <Money amount={p.amount} currency={c.currency} locale={locale} /> : p.amountPct ? `${p.amountPct}%` : ''} <span className="muted">{fmtDate(p.dueDate, locale)}</span></span>
        </div>
      ))}
      {data.paymentSchedule.length === 0 && <span className="muted small">{t('common.noResults')}</span>}

      <div className="card-title" style={{ marginTop: '1rem' }}>
        {t('financeM.changeOrders')}
        <Button size="sm" variant="outline" onClick={() => setCoOpen((o) => !o)}>+ {t('financeM.newChangeOrder')}</Button>
      </div>
      {coOpen && (
        <div className="card" style={{ background: 'var(--slate-50)', marginBottom: '0.7rem' }}>
          <Field label={t('projectsM.name')} htmlFor="cot"><TextInput id="cot" value={coTitle} onChange={(e) => setCoTitle(e.target.value)} /></Field>
          <div className="grid-2">
            <Field label={t('common.amount')} htmlFor="coa"><TextInput id="coa" dir="ltr" value={coAmount} onChange={(e) => setCoAmount(e.target.value.replace(/[^\d.]/g, ''))} /></Field>
          </div>
          <Field label={t('projectsM.description')} htmlFor="cod"><TextArea id="cod" value={coDesc} onChange={(e) => setCoDesc(e.target.value)} /></Field>
          <Button size="sm" disabled={!coTitle || !coAmount} onClick={async () => {
            try {
              await api(`/api/finance/contracts/${id}/change-orders`, { method: 'POST', body: { title: coTitle, amount: coAmount, currency: c.currency, description: coDesc || null } });
              toast(t('common.savedOk'), 'success');
              setCoOpen(false); setCoTitle(''); setCoAmount(''); setCoDesc('');
              reload();
            } catch (e) { toast((e as ApiError).message, 'error'); }
          }}>{t('common.save')}</Button>
        </div>
      )}
      {data.changeOrders.map((co: any) => (
        <div key={co.id} className="row-between" style={{ padding: '0.35rem 0', borderBottom: '1px solid var(--slate-100)' }}>
          <span className="small">
            <span className="ltr-span">{co.coNo}</span> — {co.title} · <Money amount={co.amount} currency={co.currency} locale={locale} />
          </span>
          <span className="row" style={{ gap: '0.4rem' }}>
            <StatusBadge status={co.status === 'approved' ? 'approved' : co.status === 'proposed' ? 'pending_approval' : 'rejected'} label={t(`financeM.coStatus.${co.status}`)} />
            {co.status === 'proposed' && (
              <Button size="sm" onClick={async () => {
                try {
                  await api(`/api/finance/change-orders/${co.id}/approve`, { method: 'POST' });
                  toast(t('common.savedOk'), 'success'); reload();
                } catch (e) {
                  const err = e as ApiError;
                  toast(err.code === 'RECENT_AUTH_REQUIRED' ? t('adminM.recentAuth') : err.message, 'error');
                }
              }}>{t('financeM.approveCo')}</Button>
            )}
          </span>
        </div>
      ))}
    </Modal>
  );
}
