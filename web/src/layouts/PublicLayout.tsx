import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLocale, useAuth } from '../lib/auth';
import { usePublicData } from '../lib/publicData';
import { IconMenu, IconX } from '../components/Icons';

export function PublicLayout() {
  const { t } = useTranslation();
  const [locale, setLoc] = useLocale();
  const { company } = usePublicData();
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const name = locale === 'ar' ? company?.nameAr ?? t('common.appName') : company?.nameEn ?? t('common.appName');

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
            <img
              src="/logo.png"
              alt="AraLakom"
              className="pub-logo-img"
              style={{
                height: 44,
                width: 'auto',
                objectFit: 'contain',
                borderRadius: '6px',
                filter: 'drop-shadow(0 2px 8px rgba(185, 138, 46, 0.4))',
              }}
            />
            <span style={{ fontWeight: 800, fontSize: '1.15rem', color: '#fff', letterSpacing: '0.02em' }}>
              {name}
            </span>
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

      {/* Floating WhatsApp Quick Action Button */}
      <a
        href="https://wa.me/96170078473"
        target="_blank"
        rel="noopener noreferrer"
        className="floating-wa-btn"
        aria-label="WhatsApp AraLakom"
        title={locale === 'ar' ? 'تواصل عبر واتساب: +961 70 078 473' : 'Chat on WhatsApp: +961 70 078 473'}
      >
        <svg viewBox="0 0 24 24" width="28" height="28" fill="#ffffff">
          <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2m.01 1.67c2.2 0 4.26.86 5.82 2.42a8.23 8.23 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24m4.52 11.66c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.02-1.25-.75-.67-1.26-1.5-1.4-1.76-.15-.25-.02-.39.11-.51.11-.11.25-.29.38-.44.13-.14.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.35-.77-1.85-.2-.49-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.13.17 1.77 2.71 4.3 3.8.6.26 1.07.42 1.44.54.61.19 1.16.17 1.6.1.49-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.15-1.18-.06-.1-.23-.17-.48-.29" />
        </svg>
      </a>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.8rem' }}>
            <img src="/logo.png" alt="AraLakom" style={{ height: 42, borderRadius: '6px' }} />
            <h4 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--gold-400)' }}>
              {locale === 'ar' ? 'أراكم للمقاولات والتشطيبات' : 'AraLakom Construction'}
            </h4>
          </div>
          <p style={{ fontSize: '0.88rem', maxWidth: 380, lineHeight: 1.6, color: '#c7cfda' }}>
            {locale === 'ar'
              ? 'نبني بثقة واحترافية في جميع المناطق اللبنانية. إدارة متكاملة للمشاريع والتشطيبات بإشراف نخبة من المهندسين والفنيين.'
              : 'Elite construction and turnkey finishing services across Lebanon with Swiss-precision craftsmanship and dedicated leadership.'}
          </p>
          <div style={{ marginTop: '0.6rem', fontSize: '0.88rem' }}>
            <div style={{ marginBottom: '0.3rem' }}>
              <strong style={{ color: 'var(--gold-400)' }}>{locale === 'ar' ? 'المالك والرئيس التنفيذي (Owner & CEO):' : 'Owner & CEO:'}</strong> Anwar Rahil (أنور رحيل)
            </div>
            <div style={{ fontSize: '0.82rem', color: '#a3aebb' }}>
              <a href="tel:+96170078473" style={{ color: '#c7cfda' }}><span className="ltr-span" dir="ltr">+961 70 078 473</span></a> · <a href="tel:+3118504563" style={{ color: '#c7cfda' }}><span className="ltr-span" dir="ltr">+31 18504563</span></a> · <a href="mailto:aralakom@hotmail.com" style={{ color: '#fff' }}><span dir="ltr">aralakom@hotmail.com</span></a>
            </div>
          </div>
        </div>

        <div>
          <h4>{t('footer.quickLinks')}</h4>
          <Link to="/services">{t('nav.services')}</Link>
          <Link to="/projects">{t('nav.projects')}</Link>
          <Link to="/about">{t('nav.about')}</Link>
          <Link to="/apply">{t('nav.apply')}</Link>
          <Link to="/request-quote">{t('nav.requestQuote')}</Link>
          <Link to="/track">{t('nav.track')}</Link>
        </div>

        <div>
          <h4>{t('footer.legal')}</h4>
          <Link to="/privacy">{t('footer.privacy')}</Link>
          <Link to="/terms">{t('footer.terms')}</Link>
          <Link to="/login">{t('nav.login')}</Link>
          <Link to="/portal" style={{ opacity: 0.75, fontSize: '0.8rem', color: 'var(--gold-400)' }}>
            🔒 {locale === 'ar' ? 'بوابة الإدارة والتحكم' : 'Staff Portal'}
          </Link>
          <h4 style={{ marginTop: '1.2rem' }}>{t('footer.workingHours')}</h4>
          <span style={{ fontSize: '0.85rem', color: '#c7cfda' }}>
            {locale === 'ar' ? company?.workingHoursAr : company?.workingHoursEn}
          </span>
        </div>

        <div className="copy">
          © {year} AraLakom Construction & Contracting (أراكم للمقاولات والتشطيبات). {t('footer.rights')}
        </div>
      </div>
    </footer>
  );
}

export function PageContainer({ children }: { children: ReactNode }) {
  return <div className="container page-pad">{children}</div>;
}
