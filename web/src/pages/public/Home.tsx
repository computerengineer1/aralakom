import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../../lib/auth';
import { usePublicData, usePortfolio } from '../../lib/publicData';
import { PageContainer } from '../../layouts/PublicLayout';
import { SERVICE_ICONS, IconBuilding, IconCheck, IconPhone, IconMail, IconPin } from '../../components/Icons';

export default function Home() {
  const { t } = useTranslation();
  const [locale] = useLocale();
  const { company, services } = usePublicData();
  const portfolio = usePortfolio();

  const about = locale === 'ar' ? company?.aboutAr : company?.aboutEn;

  return (
    <>
      <section className="hero">
        <div className="hero-inner">
          <h1>{t('home.heroTitle')}</h1>
          <p className="tagline">{company ? (locale === 'ar' ? company.taglineAr : company.taglineEn) : t('home.heroSubtitle')}</p>
          <div className="cta-row">
            <Link to="/request-quote" className="btn btn-gold">{t('home.ctaRequest')}</Link>
            <Link to="/apply" className="btn btn-outline" style={{ color: '#fff', borderColor: 'rgba(255,255,255,.5)' }}>{t('home.ctaApply')}</Link>
          </div>
        </div>
      </section>

      <div className="statband" aria-label="Company statistics">
        <div className="statband-inner">
          <div><div className="n">+15</div><div className="l">{t('home.statsYears')}</div></div>
          <div><div className="n">+300</div><div className="l">{t('home.statsProjects')}</div></div>
          <div><div className="n">+80</div><div className="l">{t('home.statsCrew')}</div></div>
          <div><div className="n">+200</div><div className="l">{t('home.statsClients')}</div></div>
        </div>
      </div>

      <PageContainer>
        <section className="section">
          <div className="section-head">
            <div className="kicker">{t('home.servicesKicker')}</div>
            <h2>{t('home.servicesTitle')}</h2>
            <p>{t('home.servicesSubtitle')}</p>
          </div>
          <div className="svc-grid">
            {services.slice(0, 6).map((s) => {
              const Icon = SERVICE_ICONS[s.iconKey] ?? IconBuilding;
              return (
                <div className="svc-card" key={s.id}>
                  <span className="icon" aria-hidden><Icon size={22} /></span>
                  <h3>{locale === 'ar' ? s.titleAr : s.titleEn}</h3>
                  <p>{locale === 'ar' ? s.summaryAr : s.summaryEn}</p>
                </div>
              );
            })}
          </div>
          <div style={{ textAlign: 'center', marginTop: '1.4rem' }}>
            <Link to="/services" className="btn btn-outline">{t('home.viewAll')}</Link>
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <div className="kicker">{t('home.projectsKicker')}</div>
            <h2>{t('home.projectsTitle')}</h2>
            <p>{t('home.projectsSubtitle')}</p>
          </div>
          <div className="portfolio-grid">
            {portfolio.slice(0, 3).map((p) => (
              <div className="portfolio-card" key={p.id}>
                <div className="cover" aria-hidden>
                  {p.coverFileId
                    ? <img src={`/api/files/public/${p.coverFileId}`} alt="" loading="lazy" />
                    : <IconBuilding size={40} />}
                </div>
                <div className="body">
                  <h3>{locale === 'ar' ? p.titleAr : p.titleEn}</h3>
                  <div className="portfolio-meta">
                    {p.category && <span>{p.category}</span>}
                    {p.location && <span><IconPin size={12} /> {p.location}</span>}
                    {p.completedYear && <span>{p.completedYear}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: '1.4rem' }}>
            <Link to="/projects" className="btn btn-outline">{t('home.viewAll')}</Link>
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>{t('home.whyTitle')}</h2>
          </div>
          <div className="svc-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {[
              [t('home.why1t'), t('home.why1d')],
              [t('home.why2t'), t('home.why2d')],
              [t('home.why3t'), t('home.why3d')],
            ].map(([title, desc], i) => (
              <div className="card" key={i}>
                <span style={{ color: 'var(--gold-500)' }} aria-hidden><IconCheck size={22} /></span>
                <h3 style={{ margin: '0.4rem 0' }}>{title}</h3>
                <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {about && (
          <section className="section">
            <div className="section-head"><h2>{t('home.introTitle')}</h2></div>
            <div className="card" style={{ maxWidth: 820, margin: '0 auto', whiteSpace: 'pre-line' }}>
              {about}
            </div>
          </section>
        )}

        <section className="section">
          <div className="cta-banner">
            <div>
              <h2>{t('home.ctaBannerTitle')}</h2>
              <p>{t('home.ctaBannerText')}</p>
            </div>
            <div className="row">
              <Link to="/request-quote" className="btn btn-primary">{t('nav.requestQuote')}</Link>
              {company?.phone && (
                <a href={`tel:${company.phone.replace(/\s/g, '')}`} className="btn btn-outline" style={{ borderColor: 'var(--navy-900)', color: 'var(--navy-900)' }}>
                  <IconPhone size={16} /> <span className="ltr-span" dir="ltr">{company.phone}</span>
                </a>
              )}
            </div>
          </div>
        </section>
      </PageContainer>
      <ContactStrip />
    </>
  );
}

export function ContactStrip() {
  const { t } = useTranslation();
  const [locale] = useLocale();
  const { company } = usePublicData();
  if (!company) return null;
  return (
    <div style={{ background: 'var(--slate-100)', borderTop: '1px solid var(--border)' }}>
      <div className="container" style={{ display: 'flex', gap: '1.6rem', flexWrap: 'wrap', padding: '1rem 1.2rem', fontSize: '0.88rem', color: 'var(--slate-700)' }}>
        <span><IconPhone size={14} /> <span className="ltr-span" dir="ltr">{company.phone}</span></span>
        <span><IconMail size={14} /> <span dir="ltr">{company.email}</span></span>
        <span><IconPin size={14} /> {locale === 'ar' ? company.addressAr : company.addressEn}</span>
        <span style={{ marginInlineStart: 'auto' }}>{t('footer.workingHours')}: {locale === 'ar' ? company.workingHoursAr : company.workingHoursEn}</span>
      </div>
    </div>
  );
}
