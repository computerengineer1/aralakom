import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PublicLayout } from './layouts/PublicLayout';
import { AppLayout } from './layouts/AppLayout';
import { Spinner } from './components/ui';
import Home from './pages/public/Home';
import NotFound from './pages/public/NotFound';

// Public pages (eager — first paint matters)
import { ServicesPage, PortfolioPage, AboutPage, ContactPage, PrivacyPage, TermsPage } from './pages/public/Public';
import { LoginPage, ForgotPasswordPage, ResetPasswordPage } from './pages/public/AuthPages';
import ApplyPage from './pages/public/Apply';
import RequestQuotePage from './pages/public/RequestQuote';
import TrackPage from './pages/public/Track';

// Internal app pages (lazy — split bundles)
const Dashboard = lazy(() => import('./pages/app/Dashboard'));
const PersonnelList = lazy(() => import('./pages/app/PersonnelList'));
const PersonnelDetail = lazy(() => import('./pages/app/PersonnelDetail'));
const ApplicationsList = lazy(() => import('./pages/app/ApplicationsList'));
const ApplicationDetail = lazy(() => import('./pages/app/ApplicationDetail'));
const RequestsList = lazy(() => import('./pages/app/RequestsList'));
const RequestDetail = lazy(() => import('./pages/app/RequestDetail'));
const ProjectsList = lazy(() => import('./pages/app/ProjectsList'));
const ProjectDetail = lazy(() => import('./pages/app/ProjectDetail'));
const SchedulePage = lazy(() => import('./pages/app/SchedulePage'));
const PaymentsPage = lazy(() => import('./pages/app/PaymentsPage'));
const QuotationsPage = lazy(() => import('./pages/app/QuotationsPage'));
const QuotationDetail = lazy(() => import('./pages/app/QuotationDetail'));
const InvoicesPage = lazy(() => import('./pages/app/InvoicesPage'));
const ContractsPage = lazy(() => import('./pages/app/ContractsPage'));
const ReportsPage = lazy(() => import('./pages/app/ReportsPage'));
const UsersPage = lazy(() => import('./pages/app/UsersPage'));
const SettingsPage = lazy(() => import('./pages/app/SettingsPage'));
const AuditPage = lazy(() => import('./pages/app/AuditPage'));
const NotificationsPage = lazy(() => import('./pages/app/NotificationsPage'));
const ProfilePage = lazy(() => import('./pages/app/ProfilePage'));
const MyWorkPage = lazy(() => import('./pages/app/MyWorkPage'));
const CustomerPortal = lazy(() => import('./pages/app/CustomerPortal'));

export default function App() {
  return (
    <Routes>
      {/* ---------- public website ---------- */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/services" element={<ServicesPage />} />
        <Route path="/projects" element={<PortfolioPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/apply" element={<ApplyPage />} />
        <Route path="/request-quote" element={<RequestQuotePage />} />
        <Route path="/track" element={<TrackPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      {/* ---------- internal application ---------- */}
      <Route path="/app" element={<AppLayout />}>
        <Route index element={<SuspenseWrap><Dashboard /></SuspenseWrap>} />
        <Route path="personnel" element={<SuspenseWrap><PersonnelList /></SuspenseWrap>} />
        <Route path="personnel/:id" element={<SuspenseWrap><PersonnelDetail /></SuspenseWrap>} />
        <Route path="applications" element={<SuspenseWrap><ApplicationsList /></SuspenseWrap>} />
        <Route path="applications/:id" element={<SuspenseWrap><ApplicationDetail /></SuspenseWrap>} />
        <Route path="requests" element={<SuspenseWrap><RequestsList /></SuspenseWrap>} />
        <Route path="requests/:id" element={<SuspenseWrap><RequestDetail /></SuspenseWrap>} />
        <Route path="projects" element={<SuspenseWrap><ProjectsList /></SuspenseWrap>} />
        <Route path="projects/:id" element={<SuspenseWrap><ProjectDetail /></SuspenseWrap>} />
        <Route path="schedule" element={<SuspenseWrap><SchedulePage /></SuspenseWrap>} />
        <Route path="payments" element={<SuspenseWrap><PaymentsPage /></SuspenseWrap>} />
        <Route path="quotations" element={<SuspenseWrap><QuotationsPage /></SuspenseWrap>} />
        <Route path="quotations/new" element={<SuspenseWrap><QuotationDetail isNew /></SuspenseWrap>} />
        <Route path="quotations/:id" element={<SuspenseWrap><QuotationDetail /></SuspenseWrap>} />
        <Route path="invoices" element={<SuspenseWrap><InvoicesPage /></SuspenseWrap>} />
        <Route path="contracts" element={<SuspenseWrap><ContractsPage /></SuspenseWrap>} />
        <Route path="reports" element={<SuspenseWrap><ReportsPage /></SuspenseWrap>} />
        <Route path="users" element={<SuspenseWrap><UsersPage /></SuspenseWrap>} />
        <Route path="settings" element={<SuspenseWrap><SettingsPage /></SuspenseWrap>} />
        <Route path="audit" element={<SuspenseWrap><AuditPage /></SuspenseWrap>} />
        <Route path="notifications" element={<SuspenseWrap><NotificationsPage /></SuspenseWrap>} />
        <Route path="profile" element={<SuspenseWrap><ProfilePage /></SuspenseWrap>} />
        <Route path="my-work" element={<SuspenseWrap><MyWorkPage /></SuspenseWrap>} />
        <Route path="customer" element={<SuspenseWrap><CustomerPortal /></SuspenseWrap>} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Route>
    </Routes>
  );
}

function SuspenseWrap({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<Spinner />}>{children}</Suspense>;
}
