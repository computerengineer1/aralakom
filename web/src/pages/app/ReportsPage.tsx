import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../../lib/auth';
import { useAuth } from '../../lib/auth';
import { Bars, Button, ErrorState, Field, Select, Spinner, TextInput, useApi } from '../../components/ui';

/* eslint-disable @typescript-eslint/no-explicit-any */

const REPORTS: Array<{ key: string; labelKey: string; perm: string; money?: boolean; range?: boolean }> = [
  { key: 'personnel-by-category', labelKey: 'reportsM.personnelByCategory', perm: 'personnel.read' },
  { key: 'personnel-by-location', labelKey: 'reportsM.personnelByLocation', perm: 'personnel.read' },
  { key: 'recruitment-funnel', labelKey: 'reportsM.recruitmentFunnel', perm: 'applications.read' },
  { key: 'requests-by-status', labelKey: 'reportsM.requestsByStatus', perm: 'requests.read' },
  { key: 'project-progress', labelKey: 'reportsM.projectProgress', perm: 'finance.reports' },
  { key: 'project-costs', labelKey: 'reportsM.projectCosts', perm: 'finance.reports', money: true },
  { key: 'invoices-outstanding', labelKey: 'reportsM.invoicesOutstanding', perm: 'finance.reports' },
  { key: 'attendance-hours', labelKey: 'reportsM.attendanceHours', perm: 'schedule.read', range: true },
  { key: 'revenue-profit', labelKey: 'reportsM.revenueProfit', perm: 'finance.reports', money: true, range: true },
];

export default function ReportsPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const visible = REPORTS.filter((r) => can(r.perm) || can('*'));
  const [selected, setSelected] = useState(visible[0]?.key ?? '');
  const [currency, setCurrency] = useState('USD');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [runParams, setRunParams] = useState<{ key: string; q: string } | null>(null);

  const meta = REPORTS.find((r) => r.key === (runParams?.key ?? selected));
  const query = runParams ? `/api/reports/${runParams.key}?${runParams.q}` : '';
  const { data, loading, error, reload } = useApi<any>(query, [query]);

  const run = (): void => {
    const params = new URLSearchParams();
    if (meta?.money) params.set('currency', currency);
    if (meta?.range) {
      if (from) params.set('from', from);
      if (to) params.set('to', to);
    }
    setRunParams({ key: selected, q: params.toString() });
  };

  return (
    <div>
      <h1>{t('reportsM.title')}</h1>
      <div className="toolbar">
        <Select value={selected} onChange={(e) => { setSelected(e.target.value); setRunParams(null); }} aria-label={t('reportsM.title')}>
          {visible.map((r) => <option key={r.key} value={r.key}>{t(r.labelKey)}</option>)}
        </Select>
        {meta?.money && (
          <Select value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label={t('reportsM.currencyFilter')}>
            <option value="USD">USD</option>
            <option value="LBP">LBP</option>
          </Select>
        )}
        {meta?.range && (
          <>
            <Field label={t('common.from')} htmlFor="rfrom"><TextInput id="rfrom" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label={t('common.to')} htmlFor="rto"><TextInput id="rto" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          </>
        )}
        <Button onClick={run}>{t('reportsM.runReport')}</Button>
      </div>
      {meta?.money && <p className="small muted">{t('reportsM.moneyDisclaimer')}</p>}

      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && <Spinner />}
      {data && !loading && <ReportView reportKey={runParams?.key ?? ''} data={data} />}
    </div>
  );
}

function ReportView({ reportKey, data }: { reportKey: string; data: any }) {
  const { t } = useTranslation();
  const [locale] = useLocale();

  const catLabel = (r: any): string => locale === 'ar' ? (r.name_ar ?? r.name_en ?? '—') : (r.name_en ?? '—');

  switch (reportKey) {
    case 'personnel-by-category':
      return <div className="card"><Bars data={(data.items as any[]).map((r) => ({ label: `${catLabel(r)} · ${r.person_type}`, value: r.n }))} /></div>;
    case 'personnel-by-location':
      return <div className="card"><Bars data={(data.items as any[]).map((r) => ({ label: r.governorate ?? '—', value: r.n }))} /></div>;
    case 'recruitment-funnel':
      return <div className="card"><Bars gold data={(data.items as any[]).map((r) => ({ label: t(`applicationsM.statuses.${r.status}`, { defaultValue: r.status }), value: r.n }))} /></div>;
    case 'requests-by-status':
      return (
        <div className="grid-2" style={{ alignItems: 'start' }}>
          <div className="card">
            <div className="card-title">{t('common.status')}</div>
            <Bars data={(data.byStatus as any[]).map((r) => ({ label: t(`requestsM.statuses.${r.status}`, { defaultValue: r.status }), value: r.n }))} />
          </div>
          <div className="card">
            <div className="card-title">{t('requestsM.category')}</div>
            <Bars gold data={(data.byCategory as any[]).map((r) => ({ label: `${catLabel(r)} · ${r.status}`, value: r.n }))} />
          </div>
        </div>
      );
    case 'project-progress':
      return (
        <div className="card">
          {(data.items as any[]).map((p) => {
            const pct = p.milestones_total ? Math.round((p.milestones_done / p.milestones_total) * 100) : 0;
            return (
              <div key={p.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--slate-100)' }}>
                <div className="row-between">
                  <b><span className="ltr-span small">{p.project_no}</span> {p.name}</b>
                  <span className="small muted">{p.milestones_done}/{p.milestones_total} · {p.overdue_milestones > 0 ? <span style={{ color: 'var(--red-700)' }}>{p.overdue_milestones} {t('projectsM.overdue')}</span> : '✓'}</span>
                </div>
                <div className="progress" style={{ marginTop: 4 }}><div style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })}
        </div>
      );
    case 'project-costs':
      return (
        <div className="card">
          <p className="small muted">{t('reportsM.currencyFilter')}: {data.currency}</p>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>{t('projectsM.projectNo')}</th><th>{t('projectsM.name')}</th><th className="num">{t('projectsM.contract')}</th><th className="num">{t('projectsM.budget')}</th><th className="num">{t('projectsM.actualCosts')} ({data.currency})</th></tr></thead>
              <tbody>
                {(data.items as any[]).map((p) => (
                  <tr key={p.id}>
                    <td className="ltr-span">{p.project_no}</td>
                    <td>{p.name}</td>
                    <td className="num mono-num">{p.contract_amount ? `${Number(p.contract_amount).toLocaleString()} ${p.contract_currency}` : '—'}</td>
                    <td className="num mono-num">{p.budget_amount ? `${Number(p.budget_amount).toLocaleString()} ${p.budget_currency}` : '—'}</td>
                    <td className="num mono-num">{Number(p.actual_cost).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    case 'invoices-outstanding':
      return (
        <div className="card">
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>{t('financeM.invoiceNo')}</th><th>{t('requestsM.customer')}</th><th>{t('financeM.dueDate')}</th><th>{t('common.status')}</th><th className="num">{t('financeM.balance')}</th></tr></thead>
              <tbody>
                {(data.items as any[]).map((r, i) => (
                  <tr key={i}>
                    <td className="ltr-span">{r.invoice_no}</td>
                    <td>{r.customer}</td>
                    <td>{r.due_date ?? '—'}</td>
                    <td>{t(`financeM.invStatuses.${r.status}`, { defaultValue: r.status })}</td>
                    <td className="num mono-num ltr-span">{Number(r.outstanding).toLocaleString()} {r.currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    case 'attendance-hours':
      return (
        <div className="card">
          <p className="small muted">{data.from} → {data.to}</p>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>{t('scheduleM.person')}</th><th className="num">{t('scheduleM.regularHours')}</th><th className="num">{t('scheduleM.overtimeHours')}</th><th className="num">✓</th><th className="num">✗</th></tr></thead>
              <tbody>
                {(data.items as any[]).map((r, i) => (
                  <tr key={i}>
                    <td>{r.full_name} <span className="muted small ltr-span">{r.record_no}</span></td>
                    <td className="num">{Number(r.regular_hours)}</td>
                    <td className="num">{Number(r.overtime_hours)}</td>
                    <td className="num">{r.days_present}</td>
                    <td className="num">{r.days_absent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    case 'revenue-profit':
      return (
        <div>
          <div className="stat-grid">
            <div className="stat"><div className="stat-value mono-num ltr-span">{Number(data.invoiced).toLocaleString()}</div><div className="stat-label">{t('financeM.invoicesTitle')} ({data.currency})</div></div>
            <div className="stat"><div className="stat-value mono-num ltr-span">{Number(data.collected).toLocaleString()}</div><div className="stat-label">{t('dash.accReceipts')} ({data.currency})</div></div>
            <div className="stat"><div className="stat-value mono-num ltr-span">{Number(data.expenses).toLocaleString()}</div><div className="stat-label">{t('app.expenses')} ({data.currency})</div></div>
            <div className="stat stat-accent"><div className="stat-value mono-num ltr-span">{Number(data.estimatedGrossProfit).toLocaleString()}</div>
              <div className="stat-label">{t('reportsM.revenueProfit')} {data.estimatedMarginPct !== null && `(${data.estimatedMarginPct}%)`}</div></div>
          </div>
          <p className="small muted" style={{ marginTop: '0.7rem' }}>{t('reportsM.profitDisclaimer')}</p>
          <p className="small muted">{data.disclaimer}</p>
        </div>
      );
    default:
      return <pre className="card small">{JSON.stringify(data, null, 2)}</pre>;
  }
}
