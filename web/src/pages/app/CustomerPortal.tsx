import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth, useLocale } from '../../lib/auth';
import { useApi, ErrorState, Spinner, StatusBadge, fmtDate } from '../../components/ui';
import { IconFileText, IconFolder, IconPlus, IconSearch } from '../../components/Icons';

interface CustomerData {
  kind: 'customer';
  requests: Array<{ id: string; reference: string; status: string; submittedAt: string }>;
  projects: Array<{ id: string; projectNo: string; name: string; status: string; targetEndDate: string | null }>;
}

export default function CustomerPortal() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [locale] = useLocale();
  const { data, loading, error, reload } = useApi<CustomerData>('/api/dashboard');

  if (loading) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!user) return null;

  const requests = data?.requests ?? [];
  const projects = data?.projects ?? [];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div className="row-between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ marginBottom: '0.25rem' }}>{t('nav.portal')}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {t('app.welcome', { name: user.fullName })}
          </p>
        </div>
        <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
          <Link to="/request-quote" className="btn btn-primary btn-sm">
            <IconPlus size={16} /> {t('nav.requestQuote')}
          </Link>
          <Link to="/track?type=request" className="btn btn-outline btn-sm">
            <IconSearch size={16} /> {t('track.title')}
          </Link>
        </div>
      </div>

      <div className="grid-2" style={{ gap: '1.5rem', alignItems: 'start' }}>
        {/* Customer Requests */}
        <div className="card">
          <div className="row-between" style={{ marginBottom: '1rem' }}>
            <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <IconFileText size={18} /> {t('dash.myRequests')}
            </div>
            <span className="badge badge-neutral">{requests.length}</span>
          </div>

          {requests.length === 0 ? (
            <div className="empty-state" style={{ padding: '2rem 1rem', textAlign: 'center' }}>
              <p className="muted small">{t('common.noResults')}</p>
              <Link to="/request-quote" className="btn btn-outline btn-sm" style={{ marginTop: '0.5rem' }}>
                {t('nav.requestQuote')}
              </Link>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>{t('track.reference')}</th>
                    <th>{t('common.status')}</th>
                    <th>{t('common.date')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id}>
                      <td className="ltr-span"><b>{r.reference}</b></td>
                      <td>
                        <StatusBadge
                          status={r.status}
                          label={t(`requestsM.statuses.${r.status}`, { defaultValue: r.status })}
                        />
                      </td>
                      <td className="small muted">{fmtDate(r.submittedAt, locale)}</td>
                      <td>
                        <Link
                          to={`/track?type=request&reference=${encodeURIComponent(r.reference)}`}
                          className="btn btn-ghost btn-sm"
                        >
                          {t('track.trackBtn')}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Customer Projects */}
        <div className="card">
          <div className="row-between" style={{ marginBottom: '1rem' }}>
            <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <IconFolder size={18} /> {t('dash.myProjects')}
            </div>
            <span className="badge badge-neutral">{projects.length}</span>
          </div>

          {projects.length === 0 ? (
            <div className="empty-state" style={{ padding: '2rem 1rem', textAlign: 'center' }}>
              <p className="muted small">{t('common.noResults')}</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>{t('projectsM.projectNo')}</th>
                    <th>{t('projectsM.name')}</th>
                    <th>{t('common.status')}</th>
                    <th>{t('projectsM.targetEnd')}</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr key={p.id}>
                      <td className="ltr-span"><b>{p.projectNo}</b></td>
                      <td>{p.name}</td>
                      <td>
                        <StatusBadge
                          status={p.status}
                          label={t(`projectsM.statuses.${p.status}`, { defaultValue: p.status })}
                        />
                      </td>
                      <td className="small muted">
                        {p.targetEndDate ? fmtDate(p.targetEndDate, locale) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
