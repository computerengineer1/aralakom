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
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginTop: '1rem', marginBottom: '2rem' }}>
          <img src="/logo.png" alt="AraLakom" style={{ height: 80, borderRadius: '8px', marginBottom: '0.8rem' }} />
          <h1 style={{ margin: '0 0 0.4rem', fontSize: '2rem' }}>
            {locale === 'ar' ? 'عن شركة أراكم للمقاولات والتشطيبات' : 'About AraLakom Construction & Contracting'}
          </h1>
          <p className="muted" style={{ maxWidth: 650, margin: '0 auto', fontSize: '1.05rem' }}>
            {company ? (locale === 'ar' ? company.taglineAr : company.taglineEn) : ''}
          </p>
        </div>

        <div className="card" style={{ whiteSpace: 'pre-line', marginBottom: '1.8rem', lineHeight: 1.8, fontSize: '1.02rem', padding: '1.8rem' }}>
          {company ? (locale === 'ar' ? company.aboutAr : company.aboutEn) : ''}
        </div>

        {/* Executive Board */}
        <div style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '1.4rem', marginBottom: '1rem', borderBottom: '2px solid var(--gold-500)', paddingBottom: '0.4rem', display: 'inline-block' }}>
            {locale === 'ar' ? 'مجلس الإدارة وفريق القيادة' : 'Executive Leadership & Management'}
          </h2>

          {/* Owner & CIO */}
          <div className="card" style={{
            background: 'linear-gradient(135deg, var(--navy-900), var(--navy-800))',
            color: '#fff',
            padding: '1.8rem',
            marginBottom: '1.2rem',
            border: '1px solid var(--gold-500)',
            display: 'flex',
            alignItems: 'center',
            gap: '1.4rem',
            flexWrap: 'wrap',
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--gold-400), var(--gold-600))',
              color: 'var(--navy-900)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.7rem', fontWeight: 900, flexShrink: 0,
            }}>
              AR
            </div>
            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={{ background: 'var(--gold-500)', color: '#fff', display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: 4, fontSize: '0.78rem', fontWeight: 800, marginBottom: '0.3rem' }}>
                {locale === 'ar' ? 'المالك والرئيس التنفيذي (Owner & CEO)' : 'Owner & CEO'}
              </div>
              <h3 style={{ margin: '0 0 0.3rem', color: '#fff', fontSize: '1.35rem' }}>Anwar Rahil (أنور رحيل)</h3>
              <p style={{ margin: 0, color: '#c7cfda', fontSize: '0.9rem' }}>
                {locale === 'ar'
                  ? 'قيادة وإشراف عام على كافة مشاريع التعاقد والبناء، وضمان جودة التنفيذ والالتزام بالعقود والمواصفات.'
                  : 'Overall executive leadership, strategic direction, and uncompromising project delivery.'}
              </p>
            </div>
          </div>

          {/* Managers List */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
            {[
              { name: 'Boshra Rahil (بشرى رحيل)', roleAr: 'مساعدة الرئيس التنفيذي (CEO Helper)', roleEn: 'CEO Helper', init: 'BR' },
              { name: 'Samer Rahil (سامر رحيل)', roleAr: 'مدير الشؤون المالية والدعم', roleEn: 'Finance & Support Manager', init: 'SR' },
              { name: 'Aren Rahil (آرين رحيل)', roleAr: 'مدير العمليات وإدارة المشاريع', roleEn: 'Operations & Projects Manager', init: 'AR' },
              { name: 'Mahmoud Rahil (محمود رحيل)', roleAr: 'مدير التنسيق الفني والهندسي', roleEn: 'Technical & Engineering Manager', init: 'MR' },
              { name: 'Rawan Rahil (روان رحيل)', roleAr: 'مديرة العلاقات والتطوير الإداري', roleEn: 'Relations & Administration Manager', init: 'RR' },
              { name: 'Ashraf Rahil (أشرف رحيل)', roleAr: 'مدير الخدمات الميدانية واللوجستيات', roleEn: 'Field Logistics Manager', init: 'AR' },
              { name: 'Nader Rahil (نادر رحيل)', roleAr: 'مدير الجودة والمتابعة الميدانية', roleEn: 'Quality Assurance Manager', init: 'NR' },
            ].map((m, idx) => (
              <div className="card" key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '1rem' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: 'var(--navy-800)', color: 'var(--gold-400)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: '0.9rem', flexShrink: 0,
                }}>
                  {m.init}
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.98rem' }}>{m.name}</h4>
                  <div style={{ fontSize: '0.82rem', color: 'var(--gold-600)', fontWeight: 700 }}>
                    {locale === 'ar' ? m.roleAr : m.roleEn}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '0.6rem' }}>{t('about.missionTitle')}</h2>
          <p className="muted" style={{ lineHeight: 1.7 }}>{t('about.mission')}</p>
        </div>

        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <Link to="/request-quote" className="btn btn-gold btn-lg">{t('nav.requestQuote')}</Link>
        </div>
      </div>
    </PageContainer>
  );
}

export function ContactPage() {
  const { t } = useTranslation();
  const [locale] = useLocale();
  const { company } = usePublicData();
  const email = company?.email || 'aralakom@hotmail.com';
  return (
    <PageContainer>
      <div className="section-head" style={{ marginTop: '1rem' }}>
        <h1>{t('contact.title')}</h1>
        <p>{t('contact.subtitle')}</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '1rem', maxWidth: 980, margin: '0 auto' }}>
        <a className="card" href="tel:+96170078473" style={{ display: 'block' }}>
          <span style={{ color: 'var(--gold-500)' }}><IconPhone size={22} /></span>
          <h3 style={{ margin: '0.4rem 0 0.1rem', fontSize: '0.95rem' }}>{locale === 'ar' ? 'هاتف (لبنان)' : 'Phone (Lebanon)'}</h3>
          <span className="ltr-span" dir="ltr">+961 70 078 473</span>
        </a>
        <a className="card" href="tel:+3118504563" style={{ display: 'block' }}>
          <span style={{ color: 'var(--gold-500)' }}><IconPhone size={22} /></span>
          <h3 style={{ margin: '0.4rem 0 0.1rem', fontSize: '0.95rem' }}>{locale === 'ar' ? 'هاتف (دولي / هولندا)' : 'Phone (International)'}</h3>
          <span className="ltr-span" dir="ltr">+31 18504563</span>
        </a>
        {company?.whatsapp && (
          <a className="card" href={`https://wa.me/${company.whatsapp.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer noopener" style={{ display: 'block' }}>
            <span style={{ color: 'var(--gold-500)' }}><IconPhone size={22} /></span>
            <h3 style={{ margin: '0.4rem 0 0.1rem', fontSize: '0.95rem' }}>{t('contact.whatsapp')}</h3>
            <span className="ltr-span" dir="ltr">{company.whatsapp}</span>
          </a>
        )}
        <a className="card" href={`mailto:${email}`} style={{ display: 'block' }}>
          <span style={{ color: 'var(--gold-500)' }}><IconMail size={22} /></span>
          <h3 style={{ margin: '0.4rem 0 0.1rem', fontSize: '0.95rem' }}>{t('contact.email')}</h3>
          <span dir="ltr">{email}</span>
        </a>
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
