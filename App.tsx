
import React, { Suspense, lazy, useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import { DashboardLayout } from './components/DashboardLayout';
import { LandingPage } from './components/pages/LandingPage';
import type { PageId } from './types';

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

const App: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [currentPage, setCurrentPage] = useState<PageId>('dashboard');

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
        return <HistoryPage onNavigateToTranslate={() => setCurrentPage('dashboard')} />;
    }
  };

  return (
    <DashboardLayout activePage={currentPage} onNavigate={setCurrentPage}>
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
