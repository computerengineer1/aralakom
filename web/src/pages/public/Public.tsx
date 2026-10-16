import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useLocale } from '../../lib/auth';
import { usePublicData, usePortfolio } from '../../lib/publicData';
import { PageContainer } from '../../layouts/PublicLayout';
import { EmptyState } from '../../components/ui';
import { SERVICE_ICONS, IconBuilding, IconPhone, IconMail, IconPin, IconClock } from '../../components/Icons';

export function ServicesPage() {
  const { t } = useTranslation();
  const [locale] = useLocale();
  const { services } = usePublicData();
  return (
    <PageContainer>
      <div className="section-head" style={{ marginTop: '1rem' }}>
        <h1>{t('services.title')}</h1>
        <p>{t('services.subtitle')}</p>
      </div>
      {services.length === 0 ? <EmptyState title={t('services.empty')} /> : (
        <div className="svc-grid">
          {services.map((s) => {
            const Icon = SERVICE_ICONS[s.iconKey] ?? IconBuilding;
            return (
              <div className="svc-card" key={s.id}>
                <span className="icon" aria-hidden><Icon size={22} /></span>
                <h3>{locale === 'ar' ? s.titleAr : s.titleEn}</h3>
                <p>{locale === 'ar' ? s.summaryAr : s.summaryEn}</p>
                {(locale === 'ar' ? s.bodyAr : s.bodyEn) && (
                  <p className="small muted" style={{ whiteSpace: 'pre-line' }}>{locale === 'ar' ? s.bodyAr : s.bodyEn}</p>
                )}
                <Link to="/request-quote" className="btn btn-outline btn-sm" style={{ alignSelf: 'flex-start', marginTop: 'auto' }}>
                  {t('nav.requestQuote')}
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}

export function PortfolioPage() {
  const { t } = useTranslation();
  const [locale] = useLocale();
  const portfolio = usePortfolio();
  return (
    <PageContainer>
      <div className="section-head" style={{ marginTop: '1rem' }}>
        <h1>{t('projects.title')}</h1>
        <p>{t('projects.subtitle')}</p>
      </div>
      {portfolio.length === 0 ? <EmptyState title={t('projects.empty')} /> : (
        <div className="portfolio-grid">
          {portfolio.map((p) => (
            <div className="portfolio-card" key={p.id}>
              <div className="cover" aria-hidden>
                {p.coverFileId ? <img src={`/api/files/public/${p.coverFileId}`} alt="" loading="lazy" /> : <IconBuilding size={40} />}
              </div>
              <div className="body">
                <h3>{locale === 'ar' ? p.titleAr : p.titleEn}</h3>
                {(locale === 'ar' ? p.descriptionAr : p.descriptionEn) && (
                  <p className="small muted">{locale === 'ar' ? p.descriptionAr : p.descriptionEn}</p>
                )}
                <div className="portfolio-meta">
                  {p.category && <span>{p.category}</span>}
                  {p.location && <span><IconPin size={12} /> {p.location}</span>}
                  {p.completedYear && <span>{t('projects.completedYear')}: {p.completedYear}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}

export function AboutPage() {
  const { t } = useTranslation();
  const [locale] = useLocale();
  const { company } = usePublicData();
  return (
    <PageContainer>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <h1 style={{ textAlign: 'center', marginTop: '1rem' }}>{t('about.title')}</h1>
        <div className="card" style={{ whiteSpace: 'pre-line', marginBottom: '1.2rem' }}>
          {company ? (locale === 'ar' ? company.aboutAr : company.aboutEn) : ''}
        </div>
        <div className="card">
          <h2 style={{ fontSize: '1.1rem' }}>{t('about.missionTitle')}</h2>
          <p className="muted">{t('about.mission')}</p>
        </div>
      </div>
    </PageContainer>
  );
}

export function ContactPage() {
  const { t } = useTranslation();
  const [locale] = useLocale();
  const { company } = usePublicData();
  return (
    <PageContainer>
      <div className="section-head" style={{ marginTop: '1rem' }}>
        <h1>{t('contact.title')}</h1>
        <p>{t('contact.subtitle')}</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '1rem', maxWidth: 980, margin: '0 auto' }}>
        {company?.phone && (
          <a className="card" href={`tel:${company.phone.replace(/\s/g, '')}`} style={{ display: 'block' }}>
            <span style={{ color: 'var(--gold-500)' }}><IconPhone size={22} /></span>
            <h3 style={{ margin: '0.4rem 0 0.1rem', fontSize: '0.95rem' }}>{t('contact.phone')}</h3>
            <span className="ltr-span" dir="ltr">{company.phone}</span>
          </a>
        )}
        {company?.whatsapp && (
          <a className="card" href={`https://wa.me/${company.whatsapp.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer noopener" style={{ display: 'block' }}>
            <span style={{ color: 'var(--gold-500)' }}><IconPhone size={22} /></span>
            <h3 style={{ margin: '0.4rem 0 0.1rem', fontSize: '0.95rem' }}>{t('contact.whatsapp')}</h3>
            <span className="ltr-span" dir="ltr">{company.whatsapp}</span>
          </a>
        )}
        {company?.email && (
          <a className="card" href={`mailto:${company.email}`} style={{ display: 'block' }}>
            <span style={{ color: 'var(--gold-500)' }}><IconMail size={22} /></span>
            <h3 style={{ margin: '0.4rem 0 0.1rem', fontSize: '0.95rem' }}>{t('contact.email')}</h3>
            <span dir="ltr">{company.email}</span>
          </a>
        )}
        <div className="card">
          <span style={{ color: 'var(--gold-500)' }}><IconPin size={22} /></span>
          <h3 style={{ margin: '0.4rem 0 0.1rem', fontSize: '0.95rem' }}>{t('contact.address')}</h3>
          <span>{locale === 'ar' ? company?.addressAr : company?.addressEn}</span>
        </div>
        <div className="card">
          <span style={{ color: 'var(--gold-500)' }}><IconClock size={22} /></span>
          <h3 style={{ margin: '0.4rem 0 0.1rem', fontSize: '0.95rem' }}>{t('contact.hours')}</h3>
          <span>{locale === 'ar' ? company?.workingHoursAr : company?.workingHoursEn}</span>
        </div>
      </div>
      <div style={{ textAlign: 'center', margin: '1.6rem 0' }}>
        <Link to="/request-quote" className="btn btn-gold">{t('nav.requestQuote')}</Link>
      </div>
    </PageContainer>
  );
}

export function PrivacyPage() {
  const { t } = useTranslation();
  return (
    <PageContainer>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <h1 style={{ marginTop: '1rem' }}>{t('legal.privacyTitle')}</h1>
        <div className="card" style={{ whiteSpace: 'pre-line' }}>{t('legal.privacyBody')}</div>
      </div>
    </PageContainer>
  );
}

export function TermsPage() {
  const { t } = useTranslation();
  return (
    <PageContainer>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <h1 style={{ marginTop: '1rem' }}>{t('legal.termsTitle')}</h1>
        <div className="card" style={{ whiteSpace: 'pre-line' }}>{t('legal.termsBody')}</div>
      </div>
    </PageContainer>
  );
}
