import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getBalance } from '../services/creditService';
import { SearchIcon, BellIcon, MenuIcon } from './icons/NavIcons';
import { BuyCreditsModal } from './BuyCreditsModal';
import { addCredits } from '../services/creditService';
import type { CreditPackage } from '../types';

interface TopBarProps {
  onMenuToggle: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onMenuToggle }) => {
  const { user, isAuthenticated, signOut } = useAuth();
  const [showBuyCredits, setShowBuyCredits] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [balance, setBalance] = useState(() =>
    isAuthenticated && user?.email ? getBalance(user.email) : 0
  );

  const displayName = isAuthenticated && user?.name
    ? user.name.split(' ')[0]
    : null;

  const handlePurchase = (pack: CreditPackage) => {
    if (!user?.email) return;
    addCredits(user.email, pack.credits);
    setBalance(getBalance(user.email));
    setShowBuyCredits(false);
  };

  return (
    <>
      <div className="bg-white/60 backdrop-blur-sm border-b border-brand-200 px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onMenuToggle}
              className="lg:hidden p-2 rounded-xl text-brand-500 hover:bg-brand-100 transition-colors"
            >
              <MenuIcon className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-brand-800 truncate">
                Welcome back{displayName ? `, ${displayName}` : ''}!
              </h1>
              <p className="text-sm text-brand-400">What are we stitching today?</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center bg-brand-50 border border-brand-200 rounded-xl px-3 py-2 w-64">
              <SearchIcon className="w-4 h-4 text-brand-400 shrink-0" />
              <input
                type="text"
                placeholder="Search patterns..."
                className="ml-2 bg-transparent text-sm text-brand-800 placeholder-brand-400 outline-none w-full"
                disabled
              />
            </div>

            {isAuthenticated && (
              <button
                onClick={() => setShowBuyCredits(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-100 text-brand-700 rounded-lg text-sm font-semibold hover:bg-brand-200 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
                </svg>
                {balance.toFixed(1)}
              </button>
            )}

            <button className="relative p-2 rounded-xl text-brand-400 hover:bg-brand-100 transition-colors">
              <BellIcon className="w-5 h-5" />
            </button>

            {isAuthenticated && user?.picture ? (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(prev => !prev)}
                  className="h-9 w-9 rounded-full border-2 border-brand-200 overflow-hidden hover:border-brand-400 transition-colors"
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
              <div className="h-9 w-9 rounded-full bg-brand-200 flex items-center justify-center">
                <span className="text-sm font-semibold text-brand-600">
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
