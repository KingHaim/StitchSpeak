import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import type { PageId } from '../types';
import { useCredits } from '../contexts/CreditContext';

interface DashboardLayoutProps {
  children: React.ReactNode;
  activePage: PageId;
  onNavigate: (page: PageId) => void;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, activePage, onNavigate }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { checkoutReturnPending, dismissCheckoutReturn } = useCredits();

  const isTranslate = activePage === 'dashboard';

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activePage={activePage}
        onNavigate={onNavigate}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar
          onMenuToggle={() => setSidebarOpen((prev) => !prev)}
          activePage={activePage}
        />
        <main
          className={
            isTranslate
              ? 'flex-1 overflow-y-auto bg-background px-4 sm:px-8 lg:px-12 py-8 lg:py-12 pb-28 sm:pb-32'
              : 'flex-1 overflow-y-auto bg-background px-4 sm:px-6 lg:px-8 py-6 lg:py-8 pb-10 sm:pb-14'
          }
        >
          {checkoutReturnPending && (
            <div
              className="mx-auto mb-6 flex max-w-5xl items-start justify-between gap-4 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-on-surface"
              role="status"
            >
              <div>
                <p className="font-semibold">Checkout completed</p>
                <p className="text-on-surface-variant">
                  We’re confirming your payment and refreshing your credit balance. This can take a few seconds.
                </p>
              </div>
              <button
                type="button"
                onClick={dismissCheckoutReturn}
                className="shrink-0 font-semibold text-primary hover:underline"
              >
                Dismiss
              </button>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
};
