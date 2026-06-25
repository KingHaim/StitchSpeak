import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCredits } from '../contexts/CreditContext';
import { MenuIcon } from './icons/NavIcons';
import { BuyCreditsModal } from './BuyCreditsModal';
import type { CreditPackage, PageId } from '../types';

const PAGE_HEADER: Record<PageId, { kicker: string; title: string }> = {
  dashboard: { kicker: 'Translation Studio', title: 'Pattern Translator' },
  history: { kicker: 'My Patterns', title: 'Your Tactile Collection' },
  glossary: { kicker: 'Glossary', title: 'Knitting & Crochet Glossary' },
};

interface TopBarProps {
  onMenuToggle: () => void;
  activePage: PageId;
}

export const TopBar: React.FC<TopBarProps> = ({ onMenuToggle, activePage }) => {
  const { user, isAuthenticated, signOut } = useAuth();
  const { balance, startCheckout } = useCredits();
  const [showBuyCredits, setShowBuyCredits] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const displayName = isAuthenticated && user?.name
    ? user.name.split(' ')[0]
    : null;

  const handlePurchase = async (pack: CreditPackage) => {
    await startCheckout(pack.id);
  };

  const { kicker, title } = PAGE_HEADER[activePage];
  const showStudioActions = activePage === 'dashboard';

  return (
    <>
      <div className="bg-surface-container-low/70 glass-nav border-b border-outline-variant/25 px-4 sm:px-6 lg:px-10 py-4">
        <div className="flex justify-between gap-4 items-end sm:items-end">
          <div className="flex items-start gap-3 min-w-0">
            <button
              type="button"
              onClick={onMenuToggle}
              className="lg:hidden p-2 rounded-xl text-primary hover:bg-surface-container-high transition-colors shrink-0 mt-1"
            >
              <MenuIcon className="w-5 h-5" />
            </button>
            <div className="min-w-0 pt-0.5">
              <span className="text-primary font-medium tracking-widest text-xs uppercase mb-1 block">
                {kicker}
              </span>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-headline italic text-on-surface leading-tight">
                {title}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0 pb-0.5">
            {showStudioActions && (
              <>
                <button
                  type="button"
                  className="p-3 rounded-full bg-surface-container-high text-on-surface-variant hover:bg-surface-variant transition-colors disabled:opacity-40"
                  aria-label="Search"
                  disabled
                  title="Coming soon"
                >
                  <span className="material-symbols-outlined text-xl">search</span>
                </button>
                <button
                  type="button"
                  className="p-3 rounded-full bg-surface-container-high text-on-surface-variant hover:bg-surface-variant transition-colors disabled:opacity-40"
                  aria-label="Settings"
                  disabled
                  title="Coming soon"
                >
                  <span className="material-symbols-outlined text-xl">settings</span>
                </button>
              </>
            )}
            {isAuthenticated && (
              <button
                type="button"
                onClick={() => setShowBuyCredits(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/12 text-primary rounded-lg text-sm font-semibold hover:bg-primary/18 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
                </svg>
                {balance.toFixed(1)}
              </button>
            )}

            {isAuthenticated && user?.picture ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowUserMenu((prev) => !prev)}
                  className="h-9 w-9 rounded-full border-2 border-outline-variant/40 overflow-hidden hover:border-primary/50 transition-colors"
                >
                  <img
                    src={user.picture}
                    alt=""
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </button>
                {showUserMenu && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setShowUserMenu(false)} />
                    <div className="absolute right-0 top-12 z-30 w-56 bg-white rounded-xl shadow-lg border border-brand-200 py-2">
                      <div className="px-4 py-2 border-b border-brand-100">
                        <p className="text-sm font-semibold text-brand-800 truncate">{user.name ?? 'User'}</p>
                        {user.email && <p className="text-xs text-brand-400 truncate">{user.email}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => { setShowUserMenu(false); signOut(); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                        </svg>
                        Sign out
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="h-9 w-9 rounded-full bg-surface-container-high flex items-center justify-center">
                <span className="text-sm font-semibold text-primary">
                  {displayName ? displayName[0] : '?'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <BuyCreditsModal
        isOpen={showBuyCredits}
        onClose={() => setShowBuyCredits(false)}
        onPurchase={handlePurchase}
      />
    </>
  );
};
