
import React, { useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import { DashboardLayout } from './components/DashboardLayout';
import { DashboardPage } from './components/pages/DashboardPage';
import { GlossaryPage } from './components/pages/GlossaryPage';
import { HistoryPage } from './components/pages/HistoryPage';
import { LandingPage } from './components/pages/LandingPage';
import type { PageId } from './types';

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
      {renderPage()}
    </DashboardLayout>
  );
};

export default App;
