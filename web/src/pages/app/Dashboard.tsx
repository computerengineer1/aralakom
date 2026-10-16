import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth, useLocale } from '../../lib/auth';
import { useApi, Bars, ErrorState, Money, Spinner, StatusBadge, fmtDate } from '../../components/ui';
import type { Me } from '../../lib/auth';

import CustomerPortal from './CustomerPortal';

interface Dash { kind: string; [k: string]: unknown }

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi<Dash>('/api/dashboard');
  if (user?.role === 'customer') return <CustomerPortal />;
  if (loading) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data || !user) return null;
  switch (data.kind) {
    case 'owner': return <OwnerDash d={data} />;
    case 'hr': return <HrDash d={data} />;
    case 'pm': return <PmDash d={data} />;
    case 'accountant': return <AccountantDash d={data} />;
    case 'customer': return <CustomerPortal />;
    default: return <WorkerDash d={data} me={user} />;
  }
}

function Stat({ value, label, sub, accent, to }: { value: React.ReactNode; label: string; sub?: string; accent?: boolean; to?: string }) {
  const inner = (
    <div className={`stat ${accent ? 'stat-accent' : ''}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
  return to ? <Link to={to} style={{ textDecoration: 'none' }}>{inner}</Link> : inner;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

function OwnerDash({ d }: { d: any }) {
  const { t } = useTranslation();
  const [locale] = useLocale();
  return (
    <div>
      <h1>{t('app.dashboard')}</h1>
      <div className="stat-grid">
        <Stat value={d.activePersonnel} label={t('dash.activePersonnel')} to="/app/personnel" />
        <Stat value={d.pendingApplications} label={t('dash.pendingApplications')} to="/app/applications" accent />
        <Stat value={d.newRequests} label={t('dash.newRequests')} to="/app/requests" />
        <Stat value={d.activeProjects} label={t('dash.activeProjects')} to="/app/projects" />
        <Stat value={d.overdueMilestones} label={t('dash.overdueMilestones')} accent={Number((d.overdueMilestones ?? 0)) > 0} />
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="card-title">{t('dash.outstanding')}</div>
        {(d.outstandingInvoices as any[]).map((r: any) => (
          <div className="row-between" key={r.currency} style={{ padding: '0.3rem 0' }}>
            <b>{r.currency}</b>
            <span><Money amount={r.outstanding} currency={r.currency} locale={locale} /> <span className="muted small">({r.n} {t('common.rows')})</span></span>
          </div>
        ))}
        {(d.outstandingInvoices as any[]).length === 0 && <span className="muted small">—</span>}
      </div>

      <div className="grid-2" style={{ marginTop: '1rem', alignItems: 'start' }}>
        <div className="card">
          <div className="card-title">{t('dash.upcoming')}</div>
          {(d.upcomingMilestones as any[]).map((m: any) => (
            <Link key={m.id} to={`/app/projects/${m.project_id}`} className="row-between" style={{ padding: '0.35rem 0', borderBottom: '1px solid var(--slate-100)', color: 'inherit' }}>
              <span>{m.title} <span className="muted small">({m.project_no})</span></span>
              <span className="small muted">{fmtDate(m.due_date, locale)}</span>
            </Link>
          ))}
          {(d.upcomingMilestones as any[]).length === 0 && <span className="muted small">{t('common.noResults')}</span>}
        </div>
        <div className="card">
          <div className="card-title">{t('dash.recentEvents')}</div>
          {(d.recentAudit as any[]).slice(0, 10).map((a: any, i: number) => (
            <div key={i} className="small" style={{ padding: '0.22rem 0', borderBottom: '1px solid var(--slate-100)' }}>
              <code>{a.action}</code> <span className="muted">{a.actorEmail ?? 'system'} · {fmtDate(a.createdAt, locale)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="card-title">{t('dash.budgetVsActual')}</div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>{t('projectsM.projectNo')}</th><th>{t('projectsM.name')}</th><th className="num">{t('projectsM.contract')}</th><th className="num">{t('dash.budgetVsActual')}</th></tr></thead>
            <tbody>
              {(d.budgetVsActual as any[]).map((p: any) => (
                <tr key={p.id}>
                  <td><Link to={`/app/projects/${p.id}`}>{p.project_no}</Link></td>
                  <td>{p.name}</td>
                  <td className="num">{p.contract_amount ? <Money amount={p.contract_amount} currency={p.contract_currency} locale={locale} /> : '—'}</td>
                  <td className="num">
                    {Object.entries((p.actual_by_currency ?? {}) as Record<string, string>).map(([cur, amt]) => (
                      <div key={cur}><Money amount={amt} currency={cur} locale={locale} /></div>
                    ))}
                    {Object.keys(p.actual_by_currency ?? {}).length === 0 && '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function HrDash({ d }: { d: any }) {
  const { t } = useTranslation();
  const [locale] = useLocale();
  const byStatus = (d.appsByStatus as any[]).map((r) => ({ label: t(`applicationsM.statuses.${r.status}`, { defaultValue: r.status }), value: r.n }));
  const byCat = (d.byCategory as any[]).map((r) => ({ label: locale === 'ar' ? r.name_ar ?? '—' : r.name_en ?? '—', value: r.n }));
  const byLoc = (d.byLocation as any[]).map((r) => ({ label: r.governorate ?? '—', value: r.n }));
  const byType = (d.personnelByType as any[]).map((r) => ({ label: t(`personnelM.personType.${r.person_type}`, { defaultValue: r.person_type }), value: r.n }));
  return (
    <div>
      <h1>{t('app.dashboard')}</h1>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card"><div className="card-title">{t('dash.hrPending')}</div><Bars data={byStatus} gold /></div>
        <div className="card"><div className="card-title">{t('dash.hrCategories')}</div><Bars data={byCat} /></div>
        <div className="card"><div className="card-title">{t('dash.hrLocations')}</div><Bars data={byLoc} /></div>
        <div className="card"><div className="card-title">{t('dash.personnelByType')}</div><Bars data={byType} /></div>
      </div>
    </div>
  );
}

function PmDash({ d }: { d: any }) {
  const { t } = useTranslation();
  const [locale] = useLocale();
  return (
    <div>
      <h1>{t('app.dashboard')}</h1>
      <div className="card">
        <div className="card-title">{t('dash.pmProjects')}</div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>{t('projectsM.projectNo')}</th><th>{t('projectsM.name')}</th><th>{t('common.status')}</th><th>{t('dash.progress')}</th><th className="num">{t('dash.openTasks')}</th><th>{t('projectsM.targetEnd')}</th></tr></thead>
            <tbody>
              {(d.myProjects as any[]).map((p: any) => {
                const pct = p.milestones_total ? Math.round((p.milestones_done / p.milestones_total) * 100) : 0;
                return (
                  <tr key={p.id}>
                    <td><Link to={`/app/projects/${p.id}`}>{p.project_no}</Link></td>
                    <td>{p.name}</td>
                    <td><StatusBadge status={p.status} label={t(`projectsM.statuses.${p.status}`)} /></td>
                    <td style={{ minWidth: 120 }}>{pct}%</td>
                    <td className="num">{p.open_tasks}</td>
                    <td>{fmtDate(p.target_end_date, locale)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="grid-2" style={{ marginTop: '1rem', alignItems: 'start' }}>
        <div className="card">
          <div className="card-title">{t('dash.pmDeadlines')}</div>
          {(d.deadlines as any[]).map((m: any) => (
            <Link key={m.id} to={`/app/projects/${m.project_id}`} className="row-between" style={{ padding: '0.35rem 0', borderBottom: '1px solid var(--slate-100)', color: 'inherit' }}>
              <span>{m.title} <span className="muted small">({m.project_no})</span></span>
              <StatusBadge status={m.status === 'pending' ? 'pending' : 'in_progress'} label={fmtDate(m.due_date, locale)} />
            </Link>
          ))}
          {(d.deadlines as any[]).length === 0 && <span className="muted small">{t('common.noResults')}</span>}
        </div>
        <div className="card">
          <div className="card-title">{t('dash.pmIssues')}</div>
          {(d.openIssues as any[]).map((i: any) => (
            <Link key={i.id} to={`/app/projects/${i.project_id}`} className="row-between" style={{ padding: '0.35rem 0', borderBottom: '1px solid var(--slate-100)', color: 'inherit' }}>
              <span>{i.title} <span className="muted small">({i.project_no})</span></span>
              <StatusBadge status={i.severity} label={t(`projectsM.severity.${i.severity}`)} />
            </Link>
          ))}
          {(d.openIssues as any[]).length === 0 && <span className="muted small">{t('common.noResults')}</span>}
        </div>
      </div>
      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="card-title">{t('dash.pmConflicts')}</div>
        {(d.conflicts as any[]).map((c: any, i: number) => (
          <div key={i} className="small" style={{ padding: '0.25rem 0' }}>⚠ {c.full_name} — {fmtDate(c.work_date, locale)}</div>
        ))}
        {(d.conflicts as any[]).length === 0 && <span className="muted small">{t('common.noResults')}</span>}
      </div>
    </div>
  );
}

function AccountantDash({ d }: { d: any }) {
  const { t } = useTranslation();
  const [locale] = useLocale();
  return (
    <div>
      <h1>{t('app.dashboard')}</h1>
      <div className="stat-grid">
        <Stat value={d.pendingQuotes} label={t('dash.accPendingQuotes')} to="/app/quotations" accent />
      </div>
      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="card-title">{t('dash.accInvoices')}</div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>{t('common.currency')}</th><th>{t('common.status')}</th><th className="num">#</th><th className="num">{t('common.total')}</th><th className="num">{t('financeM.balance')}</th></tr></thead>
            <tbody>
              {(d.invoicesSummary as any[]).map((r: any, i: number) => (
                <tr key={i}>
                  <td>{r.currency}</td>
                  <td><StatusBadge status={r.status} label={t(`financeM.invStatuses.${r.status}`, { defaultValue: r.status })} /></td>
                  <td className="num">{r.n}</td>
                  <td className="num"><Money amount={r.total} currency={r.currency} locale={locale} /></td>
                  <td className="num"><Money amount={r.outstanding} currency={r.currency} locale={locale} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="grid-2" style={{ marginTop: '1rem', alignItems: 'start' }}>
        <div className="card">
          <div className="card-title">{t('dash.accOverdue')}</div>
          {(d.overdueInvoices as any[]).map((i: any) => (
            <Link key={i.id} to="/app/invoices" className="row-between" style={{ padding: '0.35rem 0', borderBottom: '1px solid var(--slate-100)', color: 'inherit' }}>
              <span>{i.invoice_no} · {i.customer}</span>
              <span><Money amount={i.outstanding} currency={i.currency} locale={locale} /> <span className="muted small">{fmtDate(i.due_date, locale)}</span></span>
            </Link>
          ))}
          {(d.overdueInvoices as any[]).length === 0 && <span className="muted small">{t('common.noResults')}</span>}
        </div>
        <div className="card">
          <div className="card-title">{t('dash.accReceipts')}</div>
          {(d.recentReceipts as any[]).map((r: any) => (
            <div key={r.id} className="row-between" style={{ padding: '0.35rem 0', borderBottom: '1px solid var(--slate-100)' }}>
              <span className="small">{r.receiptNo} · {t(`scheduleM.method.${r.method}`, { defaultValue: r.method })}</span>
              <span><Money amount={r.amount} currency={r.currency} locale={locale} /> <span className="muted small">{fmtDate(r.receivedOn, locale)}</span></span>
            </div>
          ))}
        </div>
      </div>
      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="card-title">{t('dash.accExpenses')}</div>
        <Bars data={(d.expensesByCategory as any[]).map((r) => ({ label: `${t(`projectsM.expCategory.${r.category}`, { defaultValue: r.category })} (${r.currency})`, value: Math.round(Number(r.total)) }))} gold />
      </div>
    </div>
  );
}

function WorkerDash({ d, me }: { d: any; me: Me }) {
  const { t } = useTranslation();
  const [locale] = useLocale();
  return (
    <div>
      <h1>{t('app.dashboard')}</h1>
      {!d.profile && d.note && <div className="alert alert-info">{t('dash.noLink')}</div>}
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-title">{t('dash.myUpcoming')}</div>
          {(d.upcoming as any[]).map((a: any) => (
            <div key={a.id} className="row-between" style={{ padding: '0.4rem 0', borderBottom: '1px solid var(--slate-100)' }}>
              <span>{a.projectNo} — {a.projectName}</span>
              <span className="small">{fmtDate(a.workDate, locale)} · {t(`scheduleM.shifts.${a.shift}`)}</span>
            </div>
          ))}
          {(d.upcoming as any[]).length === 0 && <span className="muted small">{t('common.noResults')}</span>}
        </div>
        <div className="card">
          <div className="card-title">{t('dash.myAttendance')}</div>
          {(d.attendance as any[]).slice(0, 10).map((a: any, i: number) => (
            <div key={i} className="row-between" style={{ padding: '0.35rem 0', borderBottom: '1px solid var(--slate-100)' }}>
              <span className="small">{fmtDate(a.workDate, locale)}</span>
              <span className="row" style={{ gap: '0.4rem' }}>
                <StatusBadge status={a.status} label={t(`scheduleM.attStatus.${a.status}`)} />
                <span className="small muted">{a.regularHours}h {Number(a.overtimeHours) > 0 ? `+${a.overtimeHours}h OT` : ''}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
      <p style={{ marginTop: '1rem' }}><Link to="/app/my-work" className="btn btn-outline btn-sm">{t('myWorkM.title')}</Link></p>
      <p className="muted small">{t('app.welcome', { name: me.fullName })}</p>
    </div>
  );
}
