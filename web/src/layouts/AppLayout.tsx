import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth, useLocale } from '../lib/auth';
import { api } from '../lib/api';
import { Spinner } from '../components/ui';
import { usePublicData } from '../lib/publicData';
import {
  IconDashboard, IconUsers, IconInbox, IconFileText, IconFolder, IconCalendar,
  IconMoney, IconContract, IconInvoice, IconChart, IconSettings, IconAudit,
  IconBell, IconLogout, IconMenu, IconX, IconHardHat, IconTools,
} from '../components/Icons';

interface NavItem { to: string; labelKey: string; icon: typeof IconDashboard; perm?: string; roles?: string[]; section?: string }

export function AppLayout() {
  const { t } = useTranslation();
  const [locale, setLoc] = useLocale();
  const { user, loading, logout, can } = useAuth();
  const { company } = usePublicData();
  const [menuOpen, setMenuOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!user) return;
    api<{ items: Array<{ readAt: string | null }> }>('/api/notifications')
      .then((d) => setUnread(d.items.filter((n) => !n.readAt).length))
      .catch(() => undefined);
  }, [user, location.pathname]);

  if (loading) return <Spinner label={t('common.loading')} />;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return (
      <div className="loading-page">
        <p>{t('errors.e401')}</p>
        <Link className="btn btn-primary" to={`/login?next=${next}`}>{t('auth.signIn')}</Link>
      </div>
    );
  }
  if (user.role === 'customer') {
    return <CustomerShell />;
  }
  if (user.mfaEnabled && !user.mfaVerified) {
    navigate('/login', { state: { mfaPending: true } });
    return <Spinner />;
  }

  const nav: NavItem[] = [
    { to: '/app', labelKey: 'app.dashboard', icon: IconDashboard },
    { to: '/app/personnel', labelKey: 'app.personnel', icon: IconUsers, perm: 'personnel.read', section: 'app.sectionPeople' },
    { to: '/app/applications', labelKey: 'app.applications', icon: IconInbox, perm: 'applications.read', section: 'app.sectionPeople' },
    { to: '/app/requests', labelKey: 'app.requests', icon: IconFileText, perm: 'requests.read', section: 'app.sectionWork' },
    { to: '/app/projects', labelKey: 'app.projectsList', icon: IconFolder, section: 'app.sectionWork' },
    { to: '/app/schedule', labelKey: 'app.schedule', icon: IconCalendar, perm: 'schedule.read', section: 'app.sectionWork' },
    { to: '/app/payments', labelKey: 'app.workerPayments', icon: IconMoney, perm: 'payments.workers', section: 'app.sectionFinance' },
    { to: '/app/quotations', labelKey: 'app.quotations', icon: IconContract, perm: 'quotes.read', section: 'app.sectionFinance' },
    { to: '/app/invoices', labelKey: 'app.invoices', icon: IconInvoice, perm: 'invoices.read', section: 'app.sectionFinance' },
    { to: '/app/reports', labelKey: 'app.reports', icon: IconChart, section: 'app.sectionFinance' },
    { to: '/app/users', labelKey: 'app.users', icon: IconUsers, perm: 'users.manage', section: 'app.sectionAdmin' },
    { to: '/app/settings', labelKey: 'app.settings', icon: IconSettings, perm: 'settings.read', section: 'app.sectionAdmin' },
    { to: '/app/audit', labelKey: 'app.audit', icon: IconAudit, perm: 'audit.read', section: 'app.sectionAdmin' },
  ];

  const visible = nav.filter((n) => !n.perm || can(n.perm));
  const grouped: Array<{ section?: string; items: NavItem[] }> = [];
  for (const item of visible) {
    const last = grouped[grouped.length - 1];
    if (last && last.section === item.section) last.items.push(item);
    else grouped.push({ section: item.section, items: [item] });
  }

  const companyName = locale === 'ar' ? company?.nameAr : company?.nameEn;

  const doLogout = async (): Promise<void> => {
    await logout();
    navigate('/');
  };

  const sidebar = (
    <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
      <Link to="/" className="side-logo">
        <span className="logo-mark" aria-hidden><IconHardHat size={18} /></span>
        <span style={{ fontSize: '0.88rem', lineHeight: 1.2 }}>{companyName ?? t('common.appName')}</span>
      </Link>
      <nav className="side-nav" aria-label="Main">
        {grouped.map((g, gi) => (
          <div key={gi}>
            {g.section && <div className="nav-sec">{t(g.section)}</div>}
            {g.items.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === '/app'} className={({ isActive }) => (isActive ? 'active' : '')}>
                <n.icon size={17} /> {t(n.labelKey)}
              </NavLink>
            ))}
          </div>
        ))}
        {(user.role === 'worker' || user.role === 'engineer') && (
          <NavLink to="/app/my-work" className={({ isActive }) => (isActive ? 'active' : '')}>
            <IconTools size={17} /> {t('app.myWork')}
          </NavLink>
        )}
      </nav>
      <div className="side-foot">
        <div className="row" style={{ gap: '0.4rem' }}>
          <button type="button" className="lang-switch" style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }} onClick={() => setLoc(locale === 'ar' ? 'en' : 'ar')}>
            {t('common.langName')}
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="app-shell">
      {menuOpen && <div className="side-backdrop" onClick={() => setMenuOpen(false)} role="presentation" />}
      {sidebar}
      <div className="app-main">
        <header className="app-topbar">
          <button type="button" className="btn btn-ghost btn-sm menu-btn" onClick={() => setMenuOpen((o) => !o)} aria-label="Menu" aria-expanded={menuOpen}>
            {menuOpen ? <IconX size={18} /> : <IconMenu size={18} />}
          </button>
          <span className="page-title">{t('app.welcome', { name: user.fullName.split(' ')[0] })}</span>
          <span className="spacer" />
          <Link to="/app/notifications" className="btn btn-ghost btn-sm notif-dot" aria-label={t('app.notifications')}>
            <IconBell size={18} />
            {unread > 0 && <span className="dot" aria-hidden />}
          </Link>
          <Link to="/app/profile" className="btn btn-ghost btn-sm" aria-label={t('app.profile')}>
            <span className="avatar" aria-hidden>{user.fullName.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>
          </Link>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void doLogout()} aria-label={t('auth.logout')}>
            <IconLogout size={18} />
          </button>
        </header>
        <div className="app-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

/** Minimal shell for customer accounts (own requests/projects only). */
function CustomerShell() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [locale, setLoc] = useLocale();
  return (
    <div className="app-shell">
      <div className="app-main">
        <header className="app-topbar">
          <span className="page-title">{t('nav.portal')}</span>
          <span className="spacer" />
          <Link to="/request-quote" className="btn btn-primary btn-sm" style={{ marginInlineEnd: '0.5rem' }}>
            + {t('nav.requestQuote')}
          </Link>
          <button
            type="button"
            className="lang-switch"
            style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', marginInlineEnd: '0.5rem' }}
            onClick={() => setLoc(locale === 'ar' ? 'en' : 'ar')}
          >
            {t('common.langName')}
          </button>
          <span className="muted small" style={{ marginInlineEnd: '0.5rem' }}>{user?.fullName}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { await logout(); navigate('/'); }}>
            <IconLogout size={18} /> {t('auth.logout')}
          </button>
        </header>
        <div className="app-content">
          <Outlet context={{ locale }} />
        </div>
      </div>
    </div>
  );
}
