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

const RAIL_COLLAPSED_W = 'lg:w-20';
const RAIL_EXPANDED_W = 'lg:w-64';
const RAIL_CONTENT_TRANSITION = 'transition-[max-width,max-height,opacity,margin,padding] duration-200 ease-in-out';

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, activePage, onNavigate }) => {
  const { isAuthenticated, idToken } = useAuth();
  const { balance, startCheckout } = useCredits();
  const [showCreditsOverview, setShowCreditsOverview] = useState(false);
  const [showBuyCredits, setShowBuyCredits] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<TranslationRecord[]>([]);

  // On lg+, the rail is a 5rem strip showing icons only. Hover or keyboard
  // focus inside the aside expands it to the full 16rem layout.
  const [isHovered, setIsHovered] = useState(false);

  const handlePurchase = async (pack: CreditPackage) => {
    await startCheckout(pack.id);
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
      .then(({ records }) => {
        if (!cancelled) setHistoryRecords(records);
      })
      .catch((err) => {
        console.error('Failed to load patterns for credits overview:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [showCreditsOverview, idToken]);

  const balanceLabel = balance % 1 === 0 ? balance.toString() : balance.toFixed(1);
  const labelVisibilityClass = `truncate whitespace-nowrap lg:overflow-hidden ${RAIL_CONTENT_TRANSITION} ${
    isHovered
      ? 'lg:max-w-40 lg:opacity-100 lg:visible'
      : 'lg:max-w-0 lg:opacity-0 lg:invisible'
  } lg:group-focus-within:max-w-40 lg:group-focus-within:opacity-100 lg:group-focus-within:visible`;
  const detailVisibilityClass = `${RAIL_CONTENT_TRANSITION} lg:overflow-hidden ${
    isHovered
      ? 'lg:max-h-24 lg:opacity-100 lg:visible'
      : 'lg:max-h-0 lg:opacity-0 lg:invisible'
  } lg:group-focus-within:max-h-24 lg:group-focus-within:opacity-100 lg:group-focus-within:visible`;

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-inverse-surface/40 backdrop-blur-sm z-30 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Reserves layout space on lg+ so the fixed aside can overlay-expand
          on hover without pushing main content. */}
      <div className={`hidden lg:block shrink-0 ${RAIL_COLLAPSED_W}`} aria-hidden />

      <aside
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`
          group fixed top-0 left-0 z-40 h-full w-64 bg-surface-container-low border-r border-outline-variant/40
          flex flex-col py-8 gap-4 min-h-0 overflow-hidden
          transition-[width,transform,box-shadow] duration-300 ease-in-out
          shadow-[4px_0_24px_-12px_rgba(29,28,23,0.08)]
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
          lg:focus-within:w-64
          lg:focus-within:shadow-[8px_0_32px_-16px_rgba(29,28,23,0.18)]
          ${isHovered
            ? `${RAIL_EXPANDED_W} lg:shadow-[8px_0_32px_-16px_rgba(29,28,23,0.18)]`
            : `${RAIL_COLLAPSED_W} lg:shadow-none`
          }
        `}
      >
        <div
          className={`flex items-center justify-between gap-2 shrink-0 px-6 ${
            isHovered ? '' : 'lg:px-0 lg:justify-center'
          } lg:group-focus-within:px-6 lg:group-focus-within:justify-between`}
        >
          <div
            className={`flex items-center gap-0 min-w-0 ${isHovered ? '' : 'lg:justify-center'} lg:group-focus-within:justify-start`}
          >
            <img src="/logo.png" alt="" className="h-10 w-10 shrink-0 object-contain" />
            <span className={`font-headline text-xl font-bold text-on-surface ${labelVisibilityClass}`}>
              StitchSpeak
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors shrink-0"
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
                title={!isHovered ? label : undefined}
                aria-label={label}
                className={`
                  flex items-center gap-3 px-6 py-3 mr-3 font-body text-sm font-medium text-left
                  duration-200 ease-in-out transition-[transform,background-color,color,padding,margin,border-radius]
                  hover:translate-x-1
                  ${active
                    ? 'bg-primary/12 text-primary rounded-r-full'
                    : 'text-on-surface/75 hover:bg-surface-container-high'
                  }
                  ${!isHovered
                    ? `lg:px-3 lg:ml-3 lg:justify-center lg:hover:translate-x-0 ${
                        active ? 'lg:rounded-xl' : ''
                      }`
                    : ''
                  }
                  lg:group-focus-within:px-6 lg:group-focus-within:ml-0 lg:group-focus-within:justify-start
                  lg:group-focus-within:hover:translate-x-1
                  ${active ? 'lg:group-focus-within:rounded-r-full' : ''}
                `}
              >
                <span
                  className="material-symbols-outlined text-[22px] shrink-0"
                  style={active ? { fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" } : undefined}
                  aria-hidden
                >
                  {icon}
                </span>
                <span className={labelVisibilityClass}>
                  {label}
                </span>
              </button>
            );
          })}
        </nav>

        <div className={`mt-auto shrink-0 flex flex-col gap-4 px-4 ${isHovered ? '' : 'lg:px-2'} lg:group-focus-within:px-4`}>
          {isAuthenticated && (
            <button
              type="button"
              onClick={() => setShowCreditsOverview(true)}
              className={`flex items-center gap-3 w-full rounded-xl hover:bg-surface-container-high/80 transition-colors text-left px-3 py-2 ${
                isHovered ? '' : 'lg:px-1 lg:justify-center'
              } lg:group-focus-within:px-3 lg:group-focus-within:justify-start`}
              aria-label="Open credits overview"
              title={!isHovered ? `Credits: ${balanceLabel}` : undefined}
            >
              <div className="relative w-11 h-11 shrink-0">
                <svg className="w-11 h-11 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="2" className="text-outline-variant/50" />
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
                  {balanceLabel}
                </span>
              </div>
              <div className={`min-w-0 ${detailVisibilityClass}`}>
                <p className="text-xs font-semibold text-on-surface">Credits</p>
                <p className="text-[11px] text-on-surface-variant">Tap to view usage</p>
              </div>
            </button>
          )}

          <button
            type="button"
            onClick={goToNewTranslation}
            className={`w-full bg-primary text-on-primary py-3.5 rounded-xl font-medium flex items-center justify-center gap-2 shadow-lg shadow-primary/10 hover:bg-primary-container transition-colors ${
              isHovered ? '' : 'lg:py-3 lg:px-0'
            } lg:group-focus-within:px-4`}
            title={!isHovered ? 'New translation' : undefined}
            aria-label="New translation"
          >
            <span className="material-symbols-outlined text-xl" aria-hidden>
              add
            </span>
            <span className={labelVisibilityClass}>New translation</span>
          </button>

          <div className={`flex flex-col gap-1 border-t border-outline-variant/40 pt-4 ${detailVisibilityClass}`}>
            <button
              type="button"
              className="text-on-surface/70 hover:bg-surface-container-high px-2 py-2 font-body text-xs font-medium flex items-center gap-3 rounded-lg transition-colors w-full text-left opacity-60 cursor-not-allowed"
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
