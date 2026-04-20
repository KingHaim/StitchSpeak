import React, { useEffect, useState } from 'react';
import { CloseIcon } from './icons/CloseIcon';
import { BuyCreditsModal } from './BuyCreditsModal';
import { CreditsOverviewModal } from './CreditsOverviewModal';
import { useAuth } from '../contexts/AuthContext';
import { useCredits } from '../contexts/CreditContext';
import { loadHistory } from '../services/historyService';
import type { PageId, CreditPackage, TranslationRecord } from '../types';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activePage: PageId;
  onNavigate: (page: PageId) => void;
}

const navItems: { label: string; icon: string; pageId: PageId }[] = [
  { label: 'Translate', icon: 'translate', pageId: 'dashboard' },
  { label: 'My Patterns', icon: 'folder_open', pageId: 'history' },
  { label: 'Glossary', icon: 'grid_view', pageId: 'glossary' },
];

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, activePage, onNavigate }) => {
  const { isAuthenticated, idToken } = useAuth();
  const { balance, addCredits } = useCredits();
  const [showCreditsOverview, setShowCreditsOverview] = useState(false);
  const [showBuyCredits, setShowBuyCredits] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<TranslationRecord[]>([]);

  const handlePurchase = async (pack: CreditPackage) => {
    await addCredits(pack.credits);
    setShowBuyCredits(false);
  };

  const goToNewTranslation = () => {
    onNavigate('dashboard');
    onClose();
    window.setTimeout(() => {
      document.getElementById('new-translation')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  useEffect(() => {
    if (!showCreditsOverview) return;
    let cancelled = false;
    loadHistory(idToken)
      .then((records) => {
        if (!cancelled) setHistoryRecords(records);
      })
      .catch((err) => {
        console.error('Failed to load patterns for credits overview:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [showCreditsOverview, idToken]);

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-stone-900/30 backdrop-blur-sm z-30 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 z-40 h-full w-64 bg-stone-50 border-r border-stone-200/60
          flex flex-col py-8 gap-4 min-h-0 overflow-hidden transition-transform duration-300 ease-in-out
          lg:translate-x-0 lg:static lg:z-auto shadow-[4px_0_24px_-12px_rgba(29,28,23,0.08)] lg:shadow-none
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="px-6 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-0 min-w-0">
            <img src="/logo.png" alt="" className="h-10 w-10 shrink-0 object-contain" />
            <span className="font-headline text-xl font-bold text-on-surface dark:text-background truncate">
              StitchSpeak
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-on-surface-variant hover:bg-stone-100 transition-colors shrink-0"
            aria-label="Close menu"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col gap-1 pt-2">
          {navItems.map(({ label, icon, pageId }) => {
            const active = activePage === pageId;
            return (
              <button
                key={pageId}
                type="button"
                onClick={() => {
                  onNavigate(pageId);
                  onClose();
                }}
                className={`
                  flex items-center gap-3 px-6 py-3 mr-3 font-body text-sm font-medium text-left
                  duration-200 ease-in-out transition-[transform,background-color,color]
                  hover:translate-x-1
                  ${active
                    ? 'bg-[#82937A]/10 text-[#82937A] rounded-r-full'
                    : 'text-on-surface/70 hover:bg-stone-100'
                  }
                `}
              >
                <span
                  className="material-symbols-outlined text-[22px] shrink-0"
                  style={active ? { fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" } : undefined}
                  aria-hidden
                >
                  {icon}
                </span>
                {label}
              </button>
            );
          })}
        </nav>

        <div className="px-4 mt-auto shrink-0 flex flex-col gap-4">
          {isAuthenticated && (
            <button
              type="button"
              onClick={() => setShowCreditsOverview(true)}
              className="flex items-center gap-3 w-full px-3 py-2 rounded-xl hover:bg-stone-100/80 transition-colors text-left"
              aria-label="Open credits overview"
            >
              <div className="relative w-11 h-11 shrink-0">
                <svg className="w-11 h-11 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="2" className="text-stone-200" />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    className="text-primary"
                    strokeDasharray={`${Math.min(balance, 100)} 100`}
                    strokeLinecap="round"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-on-surface tabular-nums">
                  {balance % 1 === 0 ? balance : balance.toFixed(1)}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-on-surface">Credits</p>
                <p className="text-[11px] text-on-surface-variant">Tap to view usage</p>
              </div>
            </button>
          )}

          <button
            type="button"
            onClick={goToNewTranslation}
            className="w-full bg-primary text-on-primary py-3.5 rounded-xl font-medium flex items-center justify-center gap-2 shadow-lg shadow-primary/10 hover:bg-primary-container transition-colors"
          >
            <span className="material-symbols-outlined text-xl" aria-hidden>
              add
            </span>
            New translation
          </button>

          <div className="flex flex-col gap-1 border-t border-stone-200/50 pt-4">
            <button
              type="button"
              className="text-on-surface/70 hover:bg-stone-100 px-2 py-2 font-body text-xs font-medium flex items-center gap-3 rounded-lg transition-colors w-full text-left opacity-60 cursor-not-allowed"
              disabled
              title="Coming soon"
            >
              <span className="material-symbols-outlined text-lg" aria-hidden>
                contact_support
              </span>
              Support
            </button>
          </div>
        </div>
      </aside>

      <CreditsOverviewModal
        isOpen={showCreditsOverview}
        onClose={() => setShowCreditsOverview(false)}
        onTopUp={() => setShowBuyCredits(true)}
        balance={balance}
        records={historyRecords}
      />

      <BuyCreditsModal
        isOpen={showBuyCredits}
        onClose={() => setShowBuyCredits(false)}
        onPurchase={handlePurchase}
      />
    </>
  );
};
