import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../../lib/api';
import { useLocale } from '../../lib/auth';
import {
  Button, ConfirmDialog, DataTable, Field, Modal, Money, Select, Spinner, StatusBadge, TextArea, TextInput,
  useApi, useToast, fmtDate, type Column,
} from '../../components/ui';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface InvRow {
  id: string; invoiceNo: string; status: string; currency: string; total: string;
  paidTotal: string; issueDate: string; dueDate: string | null; customerName: string | null;
  customerId: string;
}

export default function InvoicesPage() {
  const { t } = useTranslation();
  const [locale] = useLocale();
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const query = `/api/finance/invoices?page=${page}&pageSize=${pageSize}&status=${status}`;
  const { data, loading, reload } = useApi<{ items: InvRow[]; total: number }>(query, [query]);
  const [createOpen, setCreateOpen] = useState(false);
  const [payFor, setPayFor] = useState<InvRow | null>(null);
  const [detailFor, setDetailFor] = useState<string | null>(null);
  const [voidFor, setVoidFor] = useState<string | null>(null);

  const transition = async (id: string, to: 'sent' | 'cancelled'): Promise<void> => {
    try {
      await api(`/api/finance/invoices/${id}/transition`, { method: 'POST', body: { to } });
      toast(t('common.savedOk'), 'success');
      reload();
    } catch (e) { toast((e as ApiError).message, 'error'); }
  };

  const columns: Array<Column<InvRow>> = [
    { key: 'invoiceNo', header: t('financeM.invoiceNo'), render: (r) => <button type="button" className="btn btn-ghost btn-sm ltr-span" onClick={() => setDetailFor(r.id)}>{r.invoiceNo}</button> },
    { key: 'customer', header: t('requestsM.customer'), render: (r) => r.customerName ?? '—' },
    { key: 'status', header: t('common.status'), render: (r) => <StatusBadge status={r.status} label={t(`financeM.invStatuses.${r.status}`)} /> },
    { key: 'issueDate', header: t('financeM.issueDate'), render: (r) => fmtDate(r.issueDate, locale) },
    { key: 'total', header: t('common.total'), num: true, render: (r) => <Money amount={r.total} currency={r.currency} locale={locale} /> },
    { key: 'paid', header: t('financeM.paidTotal'), num: true, render: (r) => <Money amount={r.paidTotal} currency={r.currency} locale={locale} /> },
    { key: 'balance', header: t('financeM.balance'), num: true, render: (r) => <Money amount={String(Number(r.total) - Number(r.paidTotal))} currency={r.currency} locale={locale} /> },
    {
      key: 'actions', header: t('common.actions'),
      render: (r) => (
        <div className="row" style={{ gap: '0.3rem' }}>
          {r.status === 'draft' && <Button size="sm" variant="outline" onClick={() => void transition(r.id, 'sent')}>{t('financeM.markSent')}</Button>}
          {['sent', 'partial'].includes(r.status) && <Button size="sm" onClick={() => setPayFor(r)}>{t('financeM.recordPayment')}</Button>}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="row-between">
        <h1>{t('financeM.invoicesTitle')}</h1>
        <Button size="sm" onClick={() => setCreateOpen(true)}>+ {t('financeM.newInvoice')}</Button>
      </div>
      <div className="toolbar">
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label={t('common.status')}>
          <option value="">{t('common.status')}: {t('common.all')}</option>
          {['draft', 'sent', 'partial', 'paid', 'cancelled'].map((s) => <option key={s} value={s}>{t(`financeM.invStatuses.${s}`)}</option>)}
        </Select>
      </div>
      <DataTable columns={columns} rows={data?.items ?? []} page={page} pageSize={pageSize}
        total={data?.total ?? 0} onPage={setPage} loading={loading} emptyText={t('common.noResults')} />

      {createOpen && <CreateInvoiceModal onClose={() => setCreateOpen(false)} onDone={() => { setCreateOpen(false); reload(); }} />}
      {payFor && <PayModal invoice={payFor} onClose={() => setPayFor(null)} onDone={() => { setPayFor(null); reload(); }} />}
      {detailFor && <InvoiceDetailModal id={detailFor} onClose={() => setDetailFor(null)} onVoid={(receiptId) => setVoidFor(receiptId)} />}
      {voidFor && (
        <ConfirmDialog title={t('financeM.voidReceipt')} message={t('financeM.confirmVoid')} confirmLabel={t('financeM.voidReceipt')} danger
          onClose={() => setVoidFor(null)}
          onConfirm={async () => { await api(`/api/finance/receipts/${voidFor}/void`, { method: 'POST' }); toast(t('common.savedOk'), 'success'); setDetailFor(null); reload(); }} />
      )}
    </div>
  );
}

function CreateInvoiceModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { data: customers } = useApi<{ items: any[] }>('/api/customers?pageSize=100', []);
  const [customerId, setCustomerId] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [taxPct, setTaxPct] = useState('0');
  const [items, setItems] = useState([{ description: '', qty: '1', unit: 'unit', unitPrice: '0' }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title={t('financeM.newInvoice')} onClose={onClose} wide>
      <div className="grid-2">
        <Field label={t('requestsM.customer')} htmlFor="ic" required>
          <Select id="ic" value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
            <option value="">—</option>
            {(customers?.items ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label={t('common.currency')} htmlFor="icur">
          <Select id="icur" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="USD">USD</option><option value="LBP">LBP</option>
          </Select>
        </Field>
        <Field label={t('financeM.issueDate')} htmlFor="iid" required>
          <TextInput id="iid" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required />
        </Field>
        <Field label={t('financeM.dueDate')} htmlFor="idd">
          <TextInput id="idd" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label={t('financeM.taxPct')} htmlFor="itax">
          <TextInput id="itax" dir="ltr" inputMode="decimal" value={taxPct} onChange={(e) => setTaxPct(e.target.value.replace(/[^\d.]/g, ''))} />
        </Field>
      </div>
      <div className="card-title" style={{ marginTop: '0.6rem' }}>
        {t('financeM.invoiceItems')}
        <Button size="sm" variant="outline" onClick={() => setItems((its) => [...its, { description: '', qty: '1', unit: 'unit', unitPrice: '0' }])}>+</Button>
      </div>
      {items.map((it, i) => (
        <div className="row" key={i} style={{ marginBottom: '0.5rem' }}>
          <TextInput style={{ flex: 2 }} placeholder={t('financeM.description')} value={it.description}
            onChange={(e) => setItems((its) => its.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
          <TextInput style={{ width: 80 }} dir="ltr" placeholder={t('financeM.qty')} value={it.qty}
            onChange={(e) => setItems((its) => its.map((x, j) => j === i ? { ...x, qty: e.target.value.replace(/[^\d.]/g, '') } : x))} />
          <TextInput style={{ width: 80 }} placeholder={t('financeM.unit')} value={it.unit}
            onChange={(e) => setItems((its) => its.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))} />
          <TextInput style={{ width: 110 }} dir="ltr" placeholder={t('financeM.unitPrice')} value={it.unitPrice}
            onChange={(e) => setItems((its) => its.map((x, j) => j === i ? { ...x, unitPrice: e.target.value.replace(/[^\d.]/g, '') } : x))} />
          {items.length > 1 && <Button size="sm" variant="ghost" onClick={() => setItems((its) => its.filter((_, j) => j !== i))}>✕</Button>}
        </div>
      ))}
      {err && <div className="alert alert-error">{err}</div>}
      <div className="modal-actions">
        <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
        <Button busy={busy} disabled={!customerId || items.some((it) => !it.description.trim())} onClick={async () => {
          setBusy(true); setErr(null);
          try {
            await api('/api/finance/invoices', {
              method: 'POST',
              body: {
                customerId, currency, issueDate, dueDate: dueDate || null, taxPct: Number(taxPct) || 0,
                items: items.map((it) => ({ description: it.description, qty: Number(it.qty) || 1, unit: it.unit, unitPrice: it.unitPrice })),
              },
            });
            toast(t('common.savedOk'), 'success');
            onDone();
          } catch (e) { setErr((e as ApiError).message); } finally { setBusy(false); }
        }}>{t('common.create')}</Button>
      </div>
    </Modal>
  );
}

function PayModal({ invoice, onClose, onDone }: { invoice: InvRow; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [locale] = useLocale();
  const toast = useToast();
  const remaining = Number(invoice.total) - Number(invoice.paidTotal);
  const [amount, setAmount] = useState(remaining.toFixed(2));
  const [method, setMethod] = useState('cash');
  const [externalRef, setExternalRef] = useState('');
  const [receivedOn, setReceivedOn] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title={t('financeM.recordPayment')} onClose={onClose}>
      <p className="small muted">
        {invoice.invoiceNo} · {t('financeM.balance')}: <Money amount={remaining.toFixed(2)} currency={invoice.currency} locale={locale} />
      </p>
      <div className="grid-2">
        <Field label={t('common.amount')} htmlFor="pa" required>
          <TextInput id="pa" dir="ltr" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
        </Field>
        <Field label={t('financeM.receivedOn')} htmlFor="pd" required>
          <TextInput id="pd" type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} required />
        </Field>
        <Field label={t('scheduleM.method.cash')} htmlFor="pm">
          <Select id="pm" value={method} onChange={(e) => setMethod(e.target.value)}>
            {['cash', 'transfer', 'check', 'card'].map((m) => <option key={m} value={m}>{t(`scheduleM.method.${m}`, { defaultValue: m })}</option>)}
          </Select>
        </Field>
        <Field label={t('financeM.externalRef')} htmlFor="pr">
          <TextInput id="pr" dir="ltr" value={externalRef} onChange={(e) => setExternalRef(e.target.value)} />
        </Field>
      </div>
      <Field label={t('common.notes')} htmlFor="pn">
        <TextArea id="pn" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {err && <div className="alert alert-error">{err}</div>}
      <div className="modal-actions">
        <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
        <Button busy={busy} disabled={!amount || Number(amount) <= 0} onClick={async () => {
          setBusy(true); setErr(null);
          try {
            await api('/api/finance/receipts', {
              method: 'POST',
              body: {
                invoiceId: invoice.id, customerId: invoice.customerId, amount,
                currency: invoice.currency, method, externalRef: externalRef || null,
                receivedOn, notes: notes || null,
              },
            });
            toast(t('common.savedOk'), 'success');
            onDone();
          } catch (e) {
            const e2 = e as ApiError;
            setErr(e2.code === 'DUPLICATE_PAYMENT' ? t('financeM.duplicatePaymentBlocked')
              : e2.code === 'OVERPAYMENT' ? t('financeM.overpaymentBlocked')
              : e2.code === 'CURRENCY_MISMATCH' ? t('financeM.currencyMismatch')
              : e2.code === 'RECENT_AUTH_REQUIRED' ? t('adminM.recentAuth')
              : e2.message);
          } finally { setBusy(false); }
        }}>{t('common.save')}</Button>
      </div>
    </Modal>
  );
}

function InvoiceDetailModal({ id, onClose, onVoid }: { id: string; onClose: () => void; onVoid: (receiptId: string) => void }) {
  const { t } = useTranslation();
  const [locale] = useLocale();
  const { data, loading } = useApi<any>(`/api/finance/invoices/${id}`);
  return (
    <Modal title={t('financeM.invoiceNo')} onClose={onClose} wide>
      {loading && <Spinner />}
      {data && (
        <>
          <div className="row-between">
            <b className="ltr-span">{data.invoice.invoiceNo}</b>
            <StatusBadge status={data.invoice.status} label={t(`financeM.invStatuses.${data.invoice.status}`)} />
          </div>
          <p className="small muted">{fmtDate(data.invoice.issueDate, locale)} · <Money amount={data.invoice.total} currency={data.invoice.currency} locale={locale} /></p>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>{t('financeM.description')}</th><th className="num">{t('financeM.qty')}</th><th className="num">{t('financeM.unitPrice')}</th><th className="num">{t('financeM.lineTotal')}</th></tr></thead>
              <tbody>
                {data.items.map((it: any) => (
                  <tr key={it.id}>
                    <td>{it.description}</td>
                    <td className="num">{Number(it.qty)}</td>
                    <td className="num mono-num">{it.unitPrice}</td>
                    <td className="num mono-num">{it.lineTotal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 style={{ marginTop: '1rem', fontSize: '0.95rem' }}>{t('dash.accReceipts')}</h3>
          {data.payments.map((p: any) => (
            <div key={p.id} className="row-between" style={{ padding: '0.35rem 0', borderBottom: '1px solid var(--slate-100)' }}>
              <span className="small">
                <span className="ltr-span">{p.receiptNo}</span> · {fmtDate(p.receivedOn, locale)} · {t(`scheduleM.method.${p.method}`, { defaultValue: p.method })}
                {p.externalRef && <span className="muted ltr-span" dir="ltr"> · {p.externalRef}</span>}
              </span>
              <span className="row" style={{ gap: '0.4rem' }}>
                <Money amount={p.amount} currency={p.currency} locale={locale} />
                {!p.voidedAt && <Button size="sm" variant="ghost" onClick={() => onVoid(p.id)}>{t('financeM.voidReceipt')}</Button>}
              </span>
            </div>
          ))}
          {data.payments.length === 0 && <span className="muted small">{t('common.noResults')}</span>}
        </>
      )}
    </Modal>
  );
}
