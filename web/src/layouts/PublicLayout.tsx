import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLocale, useAuth } from '../lib/auth';
import { usePublicData } from '../lib/publicData';
import { IconMenu, IconX, IconHardHat } from '../components/Icons';

export function PublicLayout() {
  const { t } = useTranslation();
  const [locale, setLoc] = useLocale();
  const { company } = usePublicData();
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  const name = locale === 'ar' ? company?.nameAr ?? t('common.appName') : company?.nameEn ?? t('common.appName');
  const initials = (locale === 'ar' ? company?.nameAr : company?.nameEn)?.split(' ').slice(0, 2).map((w) => w[0]).join('') ?? 'LC';

  const links = [
    { to: '/', label: t('nav.home') },
    { to: '/services', label: t('nav.services') },
    { to: '/projects', label: t('nav.projects') },
    { to: '/about', label: t('nav.about') },
    { to: '/contact', label: t('nav.contact') },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <a className="skip-link" href="#main">{locale === 'ar' ? 'تخطَّ إلى المحتوى' : 'Skip to content'}</a>
      <header className="pub-header">
        <div className="pub-header-inner">
          <Link to="/" className="pub-logo" onClick={() => setMenuOpen(false)}>
            <span className="logo-mark" aria-hidden>{company?.logoFileId ? <IconHardHat size={22} /> : initials}</span>
            <span>{name}</span>
          </Link>
          <button
            type="button" className="lang-switch" style={{ marginInlineStart: 'auto' }}
            onClick={() => setLoc(locale === 'ar' ? 'en' : 'ar')}
            aria-label={locale === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
          >
            {t('common.langName')}
          </button>
          <button type="button" className="lang-switch menu-btn" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen} aria-label="Menu">
            {menuOpen ? <IconX size={17} /> : <IconMenu size={17} />}
          </button>
          <nav className="pub-nav" id="main-nav" style={menuOpen ? undefined : undefined}>
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')} onClick={() => setMenuOpen(false)}>
                {l.label}
              </NavLink>
            ))}
            <NavLink to="/request-quote" className="btn btn-gold btn-sm" style={{ color: '#fff', marginInlineStart: '0.4rem' }} onClick={() => setMenuOpen(false)}>
              {t('nav.requestQuote')}
            </NavLink>
            <NavLink to="/apply" className="btn btn-outline btn-sm" style={{ color: '#fff', borderColor: 'rgba(255,255,255,.4)' }} onClick={() => setMenuOpen(false)}>
              {t('nav.apply')}
            </NavLink>
            {user ? (
              <NavLink to="/app" className="btn btn-outline btn-sm" style={{ color: 'var(--gold-400)', borderColor: 'var(--gold-400)' }}>{t('nav.portal')}</NavLink>
            ) : (
              <NavLink to="/login" style={{ color: '#c9d4e0' }}>{t('nav.login')}</NavLink>
            )}
          </nav>
        </div>
        <style>{`@media (max-width: 900px) {
          .pub-nav { display: ${menuOpen ? 'flex' : 'none'}; position: absolute; top: 100%; inset-inline: 0; background: var(--navy-900); flex-direction: column; padding: 0.8rem 1.2rem; align-items: stretch; box-shadow: var(--shadow-lg); }
          .pub-nav a { padding: 0.7rem 0.4rem; }
        }`}</style>
      </header>
      <div className="gold-strip" aria-hidden />
      <main className="pub-main" id="main" key={location.pathname}>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

function Footer() {
  const { t } = useTranslation();
  const [locale] = useLocale();
  const { company } = usePublicData();
  const year = new Date().getFullYear();
  return (
    <footer className="pub-footer">
      <div className="pub-footer-inner">
        <div>
          <h4>{locale === 'ar' ? company?.nameAr : company?.nameEn}</h4>
          <p style={{ fontSize: '0.88rem', maxWidth: 380 }}>{t('footer.builtFor')}</p>
          <p style={{ fontSize: '0.85rem' }}>
            {company?.phone && <span className="ltr-span" dir="ltr">{company.phone}</span>}
            {company?.email && <> · <a href={`mailto:${company.email}`} style={{ display: 'inline' }}><span dir="ltr">{company.email}</span></a></>}
          </p>
        </div>
        <div>
          <h4>{t('footer.quickLinks')}</h4>
          <Link to="/services">{t('nav.services')}</Link>
          <Link to="/projects">{t('nav.projects')}</Link>
          <Link to="/apply">{t('nav.apply')}</Link>
          <Link to="/request-quote">{t('nav.requestQuote')}</Link>
          <Link to="/track">{t('nav.track')}</Link>
        </div>
        <div>
          <h4>{t('footer.legal')}</h4>
          <Link to="/privacy">{t('footer.privacy')}</Link>
          <Link to="/terms">{t('footer.terms')}</Link>
          <Link to="/login">{t('nav.login')}</Link>
          <h4 style={{ marginTop: '1rem' }}>{t('footer.workingHours')}</h4>
          <span style={{ fontSize: '0.85rem' }}>{locale === 'ar' ? company?.workingHoursAr : company?.workingHoursEn}</span>
        </div>
        <div className="copy">© {year} {locale === 'ar' ? company?.nameAr : company?.nameEn}. {t('footer.rights')}</div>
      </div>
    </footer>
  );
}

export function PageContainer({ children }: { children: ReactNode }) {
  return <div className="container page-pad">{children}</div>;
}
