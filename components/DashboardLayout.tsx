import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import type { PageId } from '../types';

interface DashboardLayoutProps {
  children: React.ReactNode;
  activePage: PageId;
  onNavigate: (page: PageId) => void;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, activePage, onNavigate }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-brand-50">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activePage={activePage}
        onNavigate={onNavigate}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar onMenuToggle={() => setSidebarOpen(prev => !prev)} />
        <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
      </div>
    </div>
  );
};
