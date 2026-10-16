import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageContainer } from '../../layouts/PublicLayout';

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <PageContainer>
      <div className="empty-state" style={{ padding: '4rem 1rem' }}>
        <div style={{ fontSize: '4rem', fontWeight: 900, color: 'var(--slate-300)' }} aria-hidden>404</div>
        <h1>{t('notFound.title')}</h1>
        <p className="muted">{t('notFound.text')}</p>
        <Link to="/" className="btn btn-primary">{t('notFound.home')}</Link>
      </div>
    </PageContainer>
  );
}
