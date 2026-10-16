import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../../lib/api';
import { useLocale } from '../../lib/auth';
import {
  Button, DataTable, Field, Modal, Money, Select, StatusBadge, TextInput,
  useApi, useToast, fmtDate, type Column,
} from '../../components/ui';

interface PaymentRow {
  id: string; personnelId: string; type: string; amount: string; currency: string;
  paidOn: string; method: string; status: string; personName: string | null; notes?: string | null;
}

export default function PaymentsPage() {
  const { t } = useTranslation();
  const [locale] = useLocale();
  const toast = useToast();
  const [status, setStatus] = useState('');
  const query = `/api/scheduling/payments?status=${status}`;
  const { data, loading, reload } = useApi<{ items: PaymentRow[] }>(query, [query]);
  const [addOpen, setAddOpen] = useState(false);

  const approve = async (id: string): Promise<void> => {
    try {
      await api(`/api/scheduling/payments/${id}/approve`, { method: 'POST' });
      toast(t('common.savedOk'), 'success');
      reload();
    } catch (e) {
      const err = e as ApiError;
      toast(err.code === 'RECENT_AUTH_REQUIRED' ? t('adminM.recentAuth') : err.message, 'error');
    }
  };

  const columns: Array<Column<PaymentRow>> = [
    { key: 'paidOn', header: t('scheduleM.paidOn'), render: (r) => fmtDate(r.paidOn, locale) },
    { key: 'person', header: t('scheduleM.person'), render: (r) => r.personName ?? '—' },
    { key: 'type', header: t('financeM.description'), render: (r) => <StatusBadge status={r.type} label={t(`scheduleM.payType.${r.type}`)} /> },
    { key: 'amount', header: t('common.amount'), num: true, render: (r) => <Money amount={r.amount} currency={r.currency} locale={locale} /> },
    { key: 'method', header: t('financeM.receiptNo'), render: (r) => t(`scheduleM.method.${r.method}`) },
    { key: 'status', header: t('common.status'), render: (r) => <StatusBadge status={r.status === 'approved' ? 'approved' : r.status === 'submitted' ? 'pending_approval' : r.status} label={t(`scheduleM.approval.${r.status}`)} /> },
    {
      key: 'actions', header: t('common.actions'),
      render: (r) => r.status === 'submitted'
        ? <Button size="sm" onClick={() => void approve(r.id)}>{t('scheduleM.approvePayment')}</Button>
        : null,
    },
  ];

  return (
    <div>
      <div className="row-between">
        <h1>{t('scheduleM.paymentsTitle')}</h1>
        <Button size="sm" onClick={() => setAddOpen(true)}>+ {t('scheduleM.newPayment')}</Button>
      </div>
      <div className="alert alert-info">{t('scheduleM.payrollDisclaimer')}</div>
      <div className="toolbar">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('common.status')}>
          <option value="">{t('common.status')}: {t('common.all')}</option>
          {['draft', 'submitted', 'approved', 'rejected'].map((s) => <option key={s} value={s}>{t(`scheduleM.approval.${s}`)}</option>)}
        </Select>
      </div>
      <DataTable columns={columns} rows={data?.items ?? []} page={1} pageSize={500}
        total={data?.items.length ?? 0} onPage={() => undefined} loading={loading} emptyText={t('common.noResults')} />
      {addOpen && <PaymentModal onClose={() => setAddOpen(false)} onDone={() => { setAddOpen(false); reload(); }} />}
    </div>
  );
}

function PaymentModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [personnelId, setPersonnelId] = useState('');
  const [type, setType] = useState('payment');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { data: people } = useApi<{ items: Array<{ id: string; fullName: string; recordNo: string }> }>('/api/personnel?pageSize=100', []);
  return (
    <Modal title={t('scheduleM.newPayment')} onClose={onClose}>
      <Field label={t('scheduleM.person')} htmlFor="wp" required>
        <Select id="wp" value={personnelId} onChange={(e) => setPersonnelId(e.target.value)} required>
          <option value="">—</option>
          {(people?.items ?? []).map((pp) => <option key={pp.id} value={pp.id}>{pp.recordNo} — {pp.fullName}</option>)}
        </Select>
      </Field>
      <div className="grid-2">
        <Field label={t('scheduleM.payType.payment')} htmlFor="wpt">
          <Select id="wpt" value={type} onChange={(e) => setType(e.target.value)}>
            {['advance', 'payment', 'settlement'].map((s) => <option key={s} value={s}>{t(`scheduleM.payType.${s}`)}</option>)}
          </Select>
        </Field>
        <Field label={t('scheduleM.paidOn')} htmlFor="wpd" required>
          <TextInput id="wpd" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} required />
        </Field>
        <Field label={t('common.amount')} htmlFor="wpa" required>
          <TextInput id="wpa" dir="ltr" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
        </Field>
        <Field label={t('common.currency')} htmlFor="wpc">
          <Select id="wpc" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="USD">USD</option><option value="LBP">LBP</option>
          </Select>
        </Field>
        <Field label={t('scheduleM.method.cash')} htmlFor="wpm">
          <Select id="wpm" value={method} onChange={(e) => setMethod(e.target.value)}>
            {['cash', 'transfer', 'check'].map((s) => <option key={s} value={s}>{t(`scheduleM.method.${s}`)}</option>)}
          </Select>
        </Field>
      </div>
      <Field label={t('common.notes')} htmlFor="wpn">
        <TextInput id="wpn" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {err && <div className="alert alert-error">{err}</div>}
      <div className="modal-actions">
        <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
        <Button busy={busy} disabled={!personnelId || !amount} onClick={async () => {
          setBusy(true); setErr(null);
          try {
            await api('/api/scheduling/payments', {
              method: 'POST',
              body: { personnelId, type, amount, currency, paidOn, method, notes: notes || null, submitForApproval: true },
            });
            toast(t('common.savedOk'), 'success');
            onDone();
          } catch (e) { setErr((e as ApiError).message); } finally { setBusy(false); }
        }}>{t('common.save')}</Button>
      </div>
    </Modal>
  );
}
