import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../../lib/api';
import { useAuth, useLocale } from '../../lib/auth';
import {
  Breadcrumbs, Button, ErrorState, Field, Money, Select, Spinner, StatusBadge, TextArea,
  TextInput, useApi, useToast, fmtDate,
} from '../../components/ui';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Item { kind: string; description: string; qty: string; unit: string; unitPrice: string; lineTotal?: string }

const TRANSITIONS: Record<string, Array<{ to: string; labelKey: string; variant?: 'gold' | 'danger' | 'outline' }>> = {
  draft: [{ to: 'pending_approval', labelKey: 'financeM.actions.submitApproval' }, { to: 'cancelled', labelKey: 'financeM.actions.cancelQ', variant: 'danger' }],
  pending_approval: [{ to: 'approved', labelKey: 'financeM.actions.approve', variant: 'gold' }, { to: 'draft', labelKey: 'financeM.actions.backToDraft', variant: 'outline' }],
  approved: [{ to: 'sent', labelKey: 'financeM.actions.send' }, { to: 'cancelled', labelKey: 'financeM.actions.cancelQ', variant: 'danger' }],
  sent: [{ to: 'accepted', labelKey: 'financeM.actions.accepted', variant: 'gold' }, { to: 'declined', labelKey: 'financeM.actions.declined', variant: 'danger' }, { to: 'expired', labelKey: 'financeM.actions.expired', variant: 'outline' }],
};

export default function QuotationDetail({ isNew }: { isNew?: boolean }) {
  const { id } = useParams();
  const { t } = useTranslation();
  const [locale] = useLocale();
  const { can } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload } = useApi<any>(isNew ? null : `/api/finance/quotations/${id}`);
  const { data: customers } = useApi<{ items: any[] }>('/api/customers?pageSize=100', []);

  const [customerId, setCustomerId] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [title, setTitle] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [discountPct, setDiscountPct] = useState('0');
  const [taxPct, setTaxPct] = useState('0');
  const [scope, setScope] = useState('');
  const [terms, setTerms] = useState('');
  const [assumptions, setAssumptions] = useState('');
  const [exclusions, setExclusions] = useState('');
  const [items, setItems] = useState<Item[]>([{ kind: 'labor', description: '', qty: '1', unit: 'unit', unitPrice: '0' }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (data?.quotation && !isNew) {
      const q = data.quotation;
      setCustomerId(q.customerId); setCurrency(q.currency); setTitle(q.title ?? '');
      setValidUntil(q.validUntil ?? ''); setDiscountPct(String(Number(q.discountPct))); setTaxPct(String(Number(q.taxPct)));
      setScope(q.scopeOfWork ?? ''); setTerms(q.paymentTerms ?? '');
      setAssumptions(q.assumptions ?? ''); setExclusions(q.exclusions ?? '');
      setItems((data.items ?? []).map((it: any) => ({ kind: it.kind, description: it.description, qty: String(Number(it.qty)), unit: it.unit, unitPrice: it.unitPrice, lineTotal: it.lineTotal })));
    }
     
  }, [data?.quotation?.id]);

  const editable = isNew || data?.quotation?.status === 'draft';

  const lineTotalOf = (it: Item): number => (Number(it.qty) || 0) * (Number(it.unitPrice) || 0);
  const subtotal = items.reduce((a, it) => a + lineTotalOf(it), 0);
  const discountAmount = subtotal * (Number(discountPct) || 0) / 100;
  const taxable = subtotal - discountAmount;
  const taxAmount = taxable * (Number(taxPct) || 0) / 100;
  const total = taxable + taxAmount;
  const fmt = (n: number): string => n.toLocaleString(locale === 'ar' ? 'ar-LB' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const save = async (stay = true): Promise<void> => {
    setBusy(true); setErr(null);
    const payload = {
      customerId, currency, title: title || null, validUntil: validUntil || null,
      discountPct: Number(discountPct) || 0, taxPct: Number(taxPct) || 0,
      scopeOfWork: scope || null, paymentTerms: terms || null,
      assumptions: assumptions || null, exclusions: exclusions || null,
      items: items.map((it) => ({ kind: it.kind, description: it.description, qty: Number(it.qty) || 1, unit: it.unit || 'unit', unitPrice: it.unitPrice })),
    };
    try {
      if (isNew) {
        const created = await api<any>('/api/finance/quotations', { method: 'POST', body: payload });
        toast(t('common.savedOk'), 'success');
        navigate(`/app/quotations/${created.id}`, { replace: true });
      } else {
        await api(`/api/finance/quotations/${id}`, { method: 'PUT', body: { ...payload, customerId: undefined } });
        toast(t('common.savedOk'), 'success');
        if (stay) reload();
      }
    } catch (e) {
      const e2 = e as ApiError;
      setErr(e2.code === 'VALIDATION_ERROR' ? `${t('errors.validation')}: ${e2.details?.map((d) => d.path).join(', ') ?? ''}` : e2.message);
    } finally { setBusy(false); }
  };

  const transition = async (to: string): Promise<void> => {
    setBusy(true); setErr(null);
    try {
      await api(`/api/finance/quotations/${id}/transition`, { method: 'POST', body: { to } });
      toast(t('common.savedOk'), 'success');
      reload();
    } catch (e) {
      const e2 = e as ApiError;
      setErr(e2.code === 'RECENT_AUTH_REQUIRED' ? t('adminM.recentAuth') : e2.code === 'APPROVAL_CONFLICT' || e2.code === 'STATE_CONFLICT' ? t('errors.e409') : e2.message);
    } finally { setBusy(false); }
  };

  if (!isNew) {
    if (loading) return <Spinner />;
    if (error) return <ErrorState error={error} onRetry={reload} />;
    if (!data) return null;
  }

  const q = data?.quotation;

  return (
    <div>
      <Breadcrumbs items={[{ label: t('financeM.quotesTitle'), to: '/app/quotations' }, { label: q ? `${q.quoteNo} v${q.version}` : t('financeM.newQuote') }]} />
      <div className="row-between">
        <h1>
          {q ? <><span className="ltr-span muted">{q.quoteNo}</span> v{q.version} <StatusBadge status={q.status} label={t(`financeM.statuses.${q.status}`)} /></> : t('financeM.newQuote')}
        </h1>
        <div className="row no-print">
          {q && q.status !== 'draft' && can('quotes.read') && (
            <>
              <a className="btn btn-outline btn-sm" href={`/api/finance/quotations/${q.id}/pdf?locale=en`} target="_blank" rel="noreferrer">PDF (EN)</a>
              <a className="btn btn-outline btn-sm" href={`/api/finance/quotations/${q.id}/pdf?locale=ar`} target="_blank" rel="noreferrer">PDF (AR)</a>
            </>
          )}
          {q && ['sent', 'declined', 'expired', 'approved'].includes(q.status) && can('quotes.write') && (
            <Button size="sm" variant="outline" onClick={async () => {
              const copy = await api<any>(`/api/finance/quotations/${q.id}/new-version`, { method: 'POST' });
              navigate(`/app/quotations/${copy.id}`);
            }}>{t('financeM.actions.newVersion')}</Button>
          )}
        </div>
      </div>

      {err && <div className="alert alert-error" role="alert">{err}</div>}
      {!editable && q && <div className="alert alert-info">{t('financeM.onlyDraftEditable')}</div>}

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-title">{t('personnelM.details')}</div>
          <div className="grid-2">
            <Field label={t('requestsM.customer')} htmlFor="qc" required>
              <Select id="qc" value={customerId} disabled={!editable} onChange={(e) => setCustomerId(e.target.value)} required>
                <option value="">—</option>
                {(customers?.items ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ''}</option>)}
              </Select>
            </Field>
            <Field label={t('common.currency')} htmlFor="qcur">
              <Select id="qcur" value={currency} disabled={!editable} onChange={(e) => setCurrency(e.target.value)}>
                <option value="USD">USD</option><option value="LBP">LBP</option>
              </Select>
            </Field>
            <Field label={t('financeM.validUntil')} htmlFor="qv">
              <TextInput id="qv" type="date" disabled={!editable} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </Field>
            <Field label={t('financeM.discountPct')} htmlFor="qd">
              <TextInput id="qd" dir="ltr" inputMode="decimal" disabled={!editable} value={discountPct} onChange={(e) => setDiscountPct(e.target.value.replace(/[^\d.]/g, ''))} />
            </Field>
            <Field label={t('financeM.taxPct')} htmlFor="qt">
              <TextInput id="qt" dir="ltr" inputMode="decimal" disabled={!editable} value={taxPct} onChange={(e) => setTaxPct(e.target.value.replace(/[^\d.]/g, ''))} />
            </Field>
          </div>
          <Field label={t('projectsM.name')} htmlFor="qti">
            <TextInput id="qti" disabled={!editable} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label={t('financeM.scope')} htmlFor="qs">
            <TextArea id="qs" disabled={!editable} value={scope} onChange={(e) => setScope(e.target.value)} />
          </Field>
          <div className="grid-2">
            <Field label={t('financeM.paymentTerms')} htmlFor="qpt"><TextArea id="qpt" disabled={!editable} value={terms} onChange={(e) => setTerms(e.target.value)} /></Field>
            <Field label={t('financeM.assumptions')} htmlFor="qa"><TextArea id="qa" disabled={!editable} value={assumptions} onChange={(e) => setAssumptions(e.target.value)} /></Field>
          </div>
          <Field label={t('financeM.exclusions')} htmlFor="qe"><TextArea id="qe" disabled={!editable} value={exclusions} onChange={(e) => setExclusions(e.target.value)} /></Field>
        </div>

        <div>
          <div className="card">
            <div className="card-title">
              {t('financeM.items')}
              {editable && (
                <Button size="sm" variant="outline" onClick={() => setItems((its) => [...its, { kind: 'material', description: '', qty: '1', unit: 'unit', unitPrice: '0' }])}>
                  + {t('financeM.addItem')}
                </Button>
              )}
            </div>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>{t('financeM.items')}</th><th>{t('financeM.description')}</th>
                    <th className="num">{t('financeM.qty')}</th><th>{t('financeM.unit')}</th>
                    <th className="num">{t('financeM.unitPrice')}</th><th className="num">{t('financeM.lineTotal')}</th>
                    {editable && <th />}
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i}>
                      <td>
                        <Select value={it.kind} disabled={!editable} aria-label={t('financeM.items')}
                          onChange={(e) => setItems((its) => its.map((x, j) => j === i ? { ...x, kind: e.target.value } : x))}>
                          {['labor', 'material', 'equipment', 'other'].map((k) => <option key={k} value={k}>{t(`financeM.itemKind.${k}`)}</option>)}
                        </Select>
                      </td>
                      <td><TextInput value={it.description} disabled={!editable} aria-label={t('financeM.description')}
                        onChange={(e) => setItems((its) => its.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} /></td>
                      <td><TextInput className="num" style={{ width: 76, textAlign: 'end' }} dir="ltr" inputMode="decimal" value={it.qty} disabled={!editable} aria-label={t('financeM.qty')}
                        onChange={(e) => setItems((its) => its.map((x, j) => j === i ? { ...x, qty: e.target.value.replace(/[^\d.]/g, '') } : x))} /></td>
                      <td><TextInput style={{ width: 70 }} value={it.unit} disabled={!editable} aria-label={t('financeM.unit')}
                        onChange={(e) => setItems((its) => its.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))} /></td>
                      <td><TextInput style={{ width: 100, textAlign: 'end' }} dir="ltr" inputMode="decimal" value={it.unitPrice} disabled={!editable} aria-label={t('financeM.unitPrice')}
                        onChange={(e) => setItems((its) => its.map((x, j) => j === i ? { ...x, unitPrice: e.target.value.replace(/[^\d.]/g, '') } : x))} /></td>
                      <td className="num mono-num">{fmt(lineTotalOf(it))}</td>
                      {editable && <td><Button size="sm" variant="ghost" aria-label={t('common.delete')} onClick={() => setItems((its) => its.filter((_, j) => j !== i))}>✕</Button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: '0.9rem', maxWidth: 340, marginInlineStart: 'auto' }}>
              <div className="row-between small"><span>{t('financeM.subtotal')}</span><b className="mono-num">{fmt(subtotal)}</b></div>
              {Number(discountPct) > 0 && <div className="row-between small"><span>{t('financeM.discount')} ({discountPct}%)</span><b className="mono-num">−{fmt(discountAmount)}</b></div>}
              {Number(taxPct) > 0 && <div className="row-between small"><span>{t('financeM.tax')} ({taxPct}%)</span><b className="mono-num">{fmt(taxAmount)}</b></div>}
              <div className="row-between" style={{ borderTop: '2px solid var(--navy-800)', marginTop: '0.4rem', paddingTop: '0.4rem' }}>
                <b>{t('financeM.grandTotal')}</b>
                <b style={{ fontSize: '1.1rem' }}><Money amount={total.toFixed(2)} currency={currency} locale={locale} /></b>
              </div>
            </div>
            {editable && (
              <div style={{ marginTop: '1rem' }}>
                <Button busy={busy} disabled={!customerId || items.some((it) => !it.description.trim())} onClick={() => void save()}>{t('common.save')}</Button>
              </div>
            )}
          </div>

          {q && !isNew && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <div className="card-title">{t('common.actions')}</div>
              {q.status === 'pending_approval' && <p className="small muted">{t('financeM.approvalNote')}</p>}
              <div className="row">
                {(TRANSITIONS[q.status] ?? []).map((tr) => can(tr.to === 'approved' ? 'quotes.approve' : 'quotes.write') && (
                  <Button key={tr.to} size="sm" variant={tr.variant ?? 'primary'} busy={busy} onClick={() => void transition(tr.to)}>
                    {t(tr.labelKey)}
                  </Button>
                ))}
                {q.requestId && <Link className="btn btn-outline btn-sm" to={`/app/requests/${q.requestId}`}>{t('requestsM.title')} →</Link>}
              </div>
            </div>
          )}
          {q && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <p className="small muted">{fmtDate(q.createdAt, locale)} · {t('financeM.legalNote')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
