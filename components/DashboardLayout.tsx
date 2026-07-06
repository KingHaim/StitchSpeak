import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { MobileBottomNav } from './MobileBottomNav';
import type { PageId } from '../types';
import { useCredits } from '../contexts/CreditContext';

interface DashboardLayoutProps {
  children: React.ReactNode;
  activePage: PageId;
  onNavigate: (page: PageId) => void;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, activePage, onNavigate }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { checkoutReturnStatus, dismissCheckoutReturn, retryCheckoutReconciliation } = useCredits();

  const isTranslate = activePage === 'dashboard';

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activePage={activePage}
        onNavigate={onNavigate}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar
          activePage={activePage}
        />
        <main
          className={
            isTranslate
              ? 'flex-1 overflow-y-auto overscroll-contain bg-background px-4 sm:px-8 lg:px-12 py-5 sm:py-8 lg:py-12 pb-28 sm:pb-32'
              : 'flex-1 overflow-y-auto overscroll-contain bg-background px-4 sm:px-6 lg:px-8 py-5 sm:py-6 lg:py-8 pb-28 sm:pb-28 lg:pb-14'
          }
        >
          {checkoutReturnStatus && (
            <div
              className="mx-auto mb-6 flex max-w-5xl items-start justify-between gap-4 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-on-surface"
              role="status"
            >
              <div>
                <p className="font-semibold">
                  {checkoutReturnStatus === 'confirming' && 'Confirming your payment'}
                  {checkoutReturnStatus === 'confirmed' && 'Credits added'}
                  {checkoutReturnStatus === 'delayed' && 'Payment confirmation is taking longer'}
                </p>
                <p className="text-on-surface-variant">
                  {checkoutReturnStatus === 'confirming' && 'We’re refreshing your balance. This usually takes a few seconds.'}
                  {checkoutReturnStatus === 'confirmed' && 'Your payment was confirmed and your balance is up to date.'}
                  {checkoutReturnStatus === 'delayed' && 'Your payment may still be processing. Retry now or check again in a few minutes.'}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row">
                {checkoutReturnStatus === 'delayed' && (
                  <button type="button" onClick={() => void retryCheckoutReconciliation()} className="font-semibold text-primary hover:underline">Retry</button>
                )}
                <button type="button" onClick={dismissCheckoutReturn} className="font-semibold text-primary hover:underline">Dismiss</button>
              </div>
            </div>
          )}
          {children}
        </main>
      </div>
      <MobileBottomNav activePage={activePage} onNavigate={onNavigate} />
    </div>
  );
};
