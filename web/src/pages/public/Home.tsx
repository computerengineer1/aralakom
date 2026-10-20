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
      {/* ================= HERO SECTION ================= */}
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-logo-box" style={{ marginBottom: '1.2rem', animation: 'fadeInDown 0.6s ease' }}>
            <img
              src="/logo.png"
              alt="AraLakom Construction & Contracting"
              style={{
                height: 115,
                width: 'auto',
                objectFit: 'contain',
                borderRadius: '12px',
                filter: 'drop-shadow(0 6px 20px rgba(185, 138, 46, 0.45))',
                background: 'rgba(14, 34, 55, 0.6)',
                padding: '8px',
                border: '1px solid rgba(185, 138, 46, 0.35)',
              }}
            />
          </div>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 900, letterSpacing: '-0.01em', marginBottom: '0.6rem' }}>
            {locale === 'ar' ? 'شركة أراكم للمقاولات والتشطيبات' : 'AraLakom Construction & Contracting'}
          </h1>
          <p className="tagline" style={{ maxWidth: 760, margin: '0 auto 1.6rem', fontSize: '1.15rem', color: '#eef1f5', lineHeight: 1.6 }}>
            {company ? (locale === 'ar' ? company.taglineAr : company.taglineEn) : t('home.heroSubtitle')}
          </p>
          <div className="cta-row" style={{ display: 'flex', gap: '0.8rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/request-quote" className="btn btn-gold" style={{ padding: '0.75rem 1.8rem', fontSize: '1.05rem', boxShadow: '0 4px 15px rgba(185,138,46,0.4)' }}>
              {t('home.ctaRequest')}
            </Link>
            <Link to="/services" className="btn btn-outline" style={{ color: '#fff', borderColor: 'rgba(255,255,255,.6)', padding: '0.75rem 1.6rem' }}>
              {t('nav.services')}
            </Link>
            <a href="https://wa.me/96170078473" target="_blank" rel="noopener noreferrer" className="btn btn-outline" style={{ color: '#4ade80', borderColor: '#4ade80', padding: '0.75rem 1.4rem' }}>
              <IconPhone size={16} /> WhatsApp: +961 70 078 473
            </a>
          </div>
        </div>
      </section>

      {/* ================= STATS BAND ================= */}
      <div className="statband" aria-label="Company statistics">
        <div className="statband-inner">
          <div><div className="n">+15</div><div className="l">{t('home.statsYears')}</div></div>
          <div><div className="n">+300</div><div className="l">{t('home.statsProjects')}</div></div>
          <div><div className="n">+80</div><div className="l">{t('home.statsCrew')}</div></div>
          <div><div className="n">100%</div><div className="l">{locale === 'ar' ? 'ضمان الجودة والإتقان' : 'Quality Guaranteed'}</div></div>
        </div>
      </div>

      <PageContainer>
        {/* ================= SERVICES PREVIEW ================= */}
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
          <div style={{ textAlign: 'center', marginTop: '1.6rem' }}>
            <Link to="/services" className="btn btn-outline">{t('home.viewAll')}</Link>
          </div>
        </section>

        {/* ================= LEADERSHIP & MANAGEMENT TEAM ================= */}
        <section className="section team-section" style={{ margin: '3.5rem 0' }}>
          <div className="section-head">
            <div className="kicker">{locale === 'ar' ? 'فريق العمل والقيادة' : 'Executive Leadership'}</div>
            <h2>{locale === 'ar' ? 'مجلس الإدارة وفريق القيادة لشركة أراكم' : 'AraLakom Leadership & Management Team'}</h2>
            <p>
              {locale === 'ar'
                ? 'فريق متكامل يقود مشاريع البناء والتشطيب في لبنان بأعلى معايير الإتقان، الشفافية، والالتزام بالمواعيد والمواصفات.'
                : 'Dedicated executives ensuring every construction and turnkey finishing project meets our gold standard of craftsmanship.'}
            </p>
          </div>

          {/* Owner & CIO Card */}
          <div
            className="card owner-card"
            style={{
              background: 'linear-gradient(135deg, var(--navy-900) 0%, var(--navy-800) 100%)',
              color: '#fff',
              borderRadius: 'var(--radius)',
              padding: '2.2rem',
              marginBottom: '2rem',
              border: '1px solid rgba(185, 138, 46, 0.45)',
              boxShadow: 'var(--shadow-lg)',
              display: 'flex',
              alignItems: 'center',
              gap: '1.6rem',
              flexWrap: 'wrap',
            }}
          >
            <div
              style={{
                width: 84,
                height: 84,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--gold-400), var(--gold-600))',
                color: 'var(--navy-900)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2rem',
                fontWeight: 900,
                flexShrink: 0,
                boxShadow: '0 4px 18px rgba(185, 138, 46, 0.45)',
              }}
            >
              AR
            </div>
            <div style={{ flex: 1, minWidth: 280 }}>
              <div
                style={{
                  display: 'inline-block',
                  background: 'var(--gold-500)',
                  color: '#fff',
                  padding: '0.25rem 0.8rem',
                  borderRadius: '4px',
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  marginBottom: '0.4rem',
                }}
              >
                {locale === 'ar' ? 'المالك والرئيس التنفيذي (Owner & CEO)' : 'Owner & CEO'}
              </div>
              <h3 style={{ margin: '0 0 0.4rem', color: '#fff', fontSize: '1.5rem' }}>
                Anwar Rahil (أنور رحيل)
              </h3>
              <p style={{ margin: 0, color: '#c7cfda', fontSize: '0.94rem', lineHeight: 1.6 }}>
                {locale === 'ar'
                  ? 'يقود شركة أراكم للمقاولات برؤية ريادية تجمع بين حِرفية البناء اللبنانية العريقة والإدارة الهندسية الرقمية الحديثة لضمان رضا كل عميل ودقة تنفيذ كل مرحلة.'
                  : 'Leading AraLakom with a strategic vision that blends genuine Lebanese craftsmanship with state-of-the-art engineering and transparent management.'}
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', minWidth: 210 }}>
              <a href="tel:+96170078473" className="btn btn-gold btn-sm" style={{ color: '#fff' }}>
                <IconPhone size={14} /> <span className="ltr-span" dir="ltr">+961 70 078 473</span>
              </a>
              <a href="tel:+3118504563" className="btn btn-gold btn-sm" style={{ color: '#fff' }}>
                <IconPhone size={14} /> <span className="ltr-span" dir="ltr">+31 18504563</span>
              </a>
              <a href="https://wa.me/96170078473" target="_blank" rel="noreferrer noopener" className="btn btn-outline btn-sm" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}>
                <span style={{ color: '#25D366' }}>💬</span> <span className="ltr-span" dir="ltr">WhatsApp</span>
              </a>
              <a href="mailto:aralakom@hotmail.com" className="btn btn-outline btn-sm" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}>
                <IconMail size={14} /> <span dir="ltr">aralakom@hotmail.com</span>
              </a>
            </div>
          </div>

          {/* Managers Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.2rem' }}>
            {[
              { name: 'Boshra Rahil (بشرى رحيل)', roleAr: 'مساعدة الرئيس التنفيذي (CEO Helper)', roleEn: 'CEO Helper', initial: 'BR' },
              { name: 'Samer Rahil (سامر رحيل)', roleAr: 'مدير الشؤون المالية والدعم', roleEn: 'Finance & Support Manager', initial: 'SR' },
              { name: 'Aren Rahil (آرين رحيل)', roleAr: 'مدير العمليات وإدارة المشاريع', roleEn: 'Operations & Projects Manager', initial: 'AR' },
              { name: 'Mahmoud Rahil (محمود رحيل)', roleAr: 'مدير التنسيق الفني والهندسي', roleEn: 'Technical & Engineering Manager', initial: 'MR' },
              { name: 'Rawan Rahil (روان رحيل)', roleAr: 'مديرة العلاقات والتطوير الإداري', roleEn: 'Relations & Administration Manager', initial: 'RR' },
              { name: 'Ashraf Rahil (أشرف رحيل)', roleAr: 'مدير الخدمات الميدانية واللوجستيات', roleEn: 'Field Logistics Manager', initial: 'AR' },
              { name: 'Nader Rahil (نادر رحيل)', roleAr: 'مدير الجودة والمتابعة الميدانية', roleEn: 'Quality Assurance Manager', initial: 'NR' },
            ].map((m, idx) => (
              <div
                className="card manager-card"
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '1.1rem 1.2rem',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--slate-200)',
                  boxShadow: 'var(--shadow-sm)',
                  transition: 'all 0.25s ease',
                }}
              >
                <div
                  style={{
                    width: 50,
                    height: 50,
                    borderRadius: '50%',
                    background: 'var(--navy-800)',
                    color: 'var(--gold-400)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '1rem',
                    flexShrink: 0,
                    border: '2px solid rgba(185, 138, 46, 0.3)',
                  }}
                >
                  {m.initial}
                </div>
                <div>
                  <h4 style={{ margin: '0 0 0.2rem', fontSize: '1rem', color: 'var(--navy-900)' }}>{m.name}</h4>
                  <div style={{ fontSize: '0.82rem', color: 'var(--gold-600)', fontWeight: 700 }}>
                    {locale === 'ar' ? m.roleAr : m.roleEn}
                  </div>
                  <div className="muted small">{locale === 'ar' ? 'إدارة شركة أراكم' : 'AraLakom Management'}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ================= PORTFOLIO PREVIEW ================= */}
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

        {/* ================= WHY CHOOSE US ================= */}
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

        {/* ================= ABOUT SUMMARY ================= */}
        {about && (
          <section className="section">
            <div className="section-head"><h2>{t('home.introTitle')}</h2></div>
            <div className="card" style={{ maxWidth: 820, margin: '0 auto', whiteSpace: 'pre-line', lineHeight: 1.7 }}>
              {about}
            </div>
          </section>
        )}

        {/* ================= CTA BANNER ================= */}
        <section className="section">
          <div className="cta-banner">
            <div>
              <h2>{t('home.ctaBannerTitle')}</h2>
              <p>{t('home.ctaBannerText')}</p>
            </div>
            <div className="row" style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
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
      <div className="container" style={{ display: 'flex', gap: '1.6rem', flexWrap: 'wrap', padding: '1rem 1.2rem', fontSize: '0.88rem', color: 'var(--slate-700)', alignItems: 'center' }}>
        <span><IconPhone size={14} /> <span className="ltr-span" dir="ltr">{company.phone}</span></span>
        <span><IconMail size={14} /> <span dir="ltr">{company.email}</span></span>
        <span><IconPin size={14} /> {locale === 'ar' ? company.addressAr : company.addressEn}</span>
        <span style={{ marginInlineStart: 'auto' }}>{t('footer.workingHours')}: {locale === 'ar' ? company.workingHoursAr : company.workingHoursEn}</span>
      </div>
    </div>
  );
}
