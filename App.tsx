
import React, { useState } from 'react';
import { DashboardLayout } from './components/DashboardLayout';
import { DashboardPage } from './components/pages/DashboardPage';
import { GlossaryPage } from './components/pages/GlossaryPage';
import { HistoryPage } from './components/pages/HistoryPage';
import { PortfolioPage } from './components/pages/PortfolioPage';
import { ComingSoonPage } from './components/pages/ComingSoonPage';
import type { PageId } from './types';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<PageId>('dashboard');

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <DashboardPage />;
      case 'glossary':
        return <GlossaryPage />;
      case 'history':
        return <HistoryPage />;
      case 'portfolio':
        return <PortfolioPage />;
      default:
        return <ComingSoonPage pageId={currentPage} />;
    }
  };

  return (
    <DashboardLayout activePage={currentPage} onNavigate={setCurrentPage}>
      {renderPage()}
    </DashboardLayout>
  );
};

export default App;
