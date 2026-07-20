
import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { useAuth } from './contexts/auth-context';
import { DashboardLayout } from './components/DashboardLayout';
import { LandingPage } from './components/pages/LandingPage';
import { BetaCampaignPage } from './components/pages/BetaCampaignPage';
import { AccountActionPage } from './components/pages/AccountActionPage';
import type { PageId } from './types';
import { pageFromPath, pathForPage } from './services/navigation';

const DashboardPage = lazy(() =>
  import('./components/pages/DashboardPage').then((module) => ({
    default: module.DashboardPage,
  })),
);
const GlossaryPage = lazy(() =>
  import('./components/pages/GlossaryPage').then((module) => ({
    default: module.GlossaryPage,
  })),
);
const HistoryPage = lazy(() =>
  import('./components/pages/HistoryPage').then((module) => ({
    default: module.HistoryPage,
  })),
);
const SettingsPage = lazy(() =>
  import('./components/pages/SettingsPage').then((module) => ({
    default: module.SettingsPage,
  })),
);
const TechEditPage = lazy(() =>
  import('./components/pages/TechEditPage').then((module) => ({
    default: module.TechEditPage,
  })),
);
const AdminPage = lazy(() =>
  import('./components/pages/AdminPage').then((module) => ({ default: module.AdminPage })),
);

const App: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const currentPage = pageFromPath(pathname);

  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || pathname !== '/') return;
    const nextPath = pathForPage('dashboard');
    window.history.replaceState({}, '', nextPath);
    setPathname(nextPath);
  }, [isAuthenticated, pathname]);

  const navigate = useCallback((page: PageId) => {
    const nextPath = pathForPage(page);
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
    setPathname(nextPath);
  }, []);

  const isBetaCampaign =
    pathname === '/beta' ||
    new URLSearchParams(window.location.search).get('campaign') === 'beta';

  if (pathname === '/verify-email') return <AccountActionPage mode="verify" />;
  if (pathname === '/reset-password') return <AccountActionPage mode="reset" />;
  if (pathname === '/accept-invite') return <AccountActionPage mode="invite" />;

  // The campaign is a public destination and must not disappear for people
  // who already have a StitchSpeak session.
  if (isBetaCampaign) {
    return <BetaCampaignPage />;
  }

  if (pathname === '/admin' && isAuthenticated) {
    return <Suspense fallback={<div className="min-h-screen bg-background" />}><AdminPage /></Suspense>;
  }

  if (!isAuthenticated) {
    return <LandingPage />;
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <DashboardPage />;
      case 'glossary':
        return <GlossaryPage />;
      case 'history':
        return <HistoryPage onNavigateToTranslate={() => navigate('dashboard')} />;
      case 'techedit':
        return <TechEditPage />;
      case 'settings':
        return <SettingsPage />;
    }
  };

  return (
    <DashboardLayout activePage={currentPage} onNavigate={navigate}>
      <Suspense
        fallback={
          <div className="flex min-h-[50vh] items-center justify-center text-sm text-on-surface-variant">
            Loading...
          </div>
        }
      >
        {renderPage()}
      </Suspense>
    </DashboardLayout>
  );
};

export default App;
