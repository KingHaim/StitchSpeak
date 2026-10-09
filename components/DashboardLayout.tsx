import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { MobileBottomNav } from './MobileBottomNav';
import { TechEditJobChip } from './TechEditJobChip';
import type { PageId } from '../types';
import { useCredits } from '../contexts/credit-context';
import { useTechEditJob } from '../contexts/tech-edit-job-context';
import { CheckoutReturnBanner } from './CheckoutReturnBanner';

interface DashboardLayoutProps {
  children: React.ReactNode;
  activePage: PageId;
  onNavigate: (page: PageId) => void;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, activePage, onNavigate }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { checkoutReturnStatus, dismissCheckoutReturn, retryCheckoutReconciliation } = useCredits();
  const { job } = useTechEditJob();

  const isTranslate = activePage === 'dashboard';
  const showTechEditChip =
    activePage !== 'techedit' && !!job && (job.status === 'running' || job.status === 'complete');

  return (
    <div className="flex h-full overflow-hidden bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activePage={activePage}
        onNavigate={onNavigate}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar
          activePage={activePage}
          onNavigate={onNavigate}
        />
        <main
          className={
            isTranslate
              ? 'flex-1 overflow-y-auto overscroll-contain bg-background px-4 sm:px-8 lg:px-12 py-5 sm:py-8 lg:py-12 pb-28 sm:pb-32'
              : 'flex-1 overflow-y-auto overscroll-contain bg-background px-4 sm:px-6 lg:px-8 py-5 sm:py-6 lg:py-8 pb-28 sm:pb-28 lg:pb-14'
          }
        >
          {checkoutReturnStatus && (
            <CheckoutReturnBanner
              status={checkoutReturnStatus}
              onRetry={() => void retryCheckoutReconciliation()}
              onDismiss={dismissCheckoutReturn}
            />
          )}
          {children}
        </main>
      </div>
      {showTechEditChip && <TechEditJobChip onOpen={() => onNavigate('techedit')} />}
      <MobileBottomNav activePage={activePage} onNavigate={onNavigate} />
    </div>
  );
};
