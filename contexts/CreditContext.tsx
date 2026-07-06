import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import {
  getCreditState,
  createCheckoutSession,
} from '../services/creditService';

type CreditContextValue = {
  balance: number;
  betaAccess: boolean;
  isLoading: boolean;
  /** Set the balance directly from a server response (e.g. after a translation). */
  applyBalance: (balance: number) => void;
  refreshBalance: () => Promise<void>;
  /** Redirect to hosted checkout for a credit pack. */
  startCheckout: (packId: string) => Promise<void>;
  checkoutReturnPending: boolean;
  dismissCheckoutReturn: () => void;
};

const CreditContext = createContext<CreditContextValue | null>(null);

export const CreditProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { idToken, isAuthenticated } = useAuth();
  const [balance, setBalance] = useState(0);
  const [betaAccess, setBetaAccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [checkoutReturnPending, setCheckoutReturnPending] = useState(false);

  const refreshBalance = useCallback(async () => {
    if (!isAuthenticated || !idToken) {
      setBalance(0);
      setBetaAccess(false);
      return;
    }
    try {
      const state = await getCreditState(idToken);
      setBalance(state.balance);
      setBetaAccess(state.betaAccess);
    } catch (err) {
      console.error('[CreditContext] Failed to fetch balance:', err);
    }
  }, [isAuthenticated, idToken]);

  useEffect(() => {
    if (!isAuthenticated || !idToken) {
      setBalance(0);
      setBetaAccess(false);
      return;
    }
    let cancelled = false;
    const init = async () => {
      setIsLoading(true);
      try {
        await refreshBalance();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void init();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, idToken, refreshBalance]);

  useEffect(() => {
    if (!isAuthenticated || !idToken) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('checkout') !== 'success') return;

    setCheckoutReturnPending(true);
    url.searchParams.delete('checkout');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);

    // Webhooks can arrive just after Lemon Squeezy redirects the browser.
    // Reconcile repeatedly so the user does not have to refresh manually.
    void refreshBalance();
    const interval = window.setInterval(() => void refreshBalance(), 2_000);
    const timeout = window.setTimeout(() => window.clearInterval(interval), 20_000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [isAuthenticated, idToken, refreshBalance]);

  const applyBalance = useCallback((next: number) => {
    if (typeof next === 'number' && Number.isFinite(next)) setBalance(next);
  }, []);

  const dismissCheckoutReturn = useCallback(() => setCheckoutReturnPending(false), []);

  const startCheckout = useCallback(
    async (packId: string) => {
      if (!idToken) throw new Error('You must be signed in to buy credits.');
      const url = await createCheckoutSession(idToken, packId);
      window.location.assign(url);
    },
    [idToken],
  );

  const value = useMemo<CreditContextValue>(
    () => ({
      balance,
      betaAccess,
      isLoading,
      applyBalance,
      refreshBalance,
      startCheckout,
      checkoutReturnPending,
      dismissCheckoutReturn,
    }),
    [
      balance,
      betaAccess,
      isLoading,
      applyBalance,
      refreshBalance,
      startCheckout,
      checkoutReturnPending,
      dismissCheckoutReturn,
    ],
  );

  return (
    <CreditContext.Provider value={value}>{children}</CreditContext.Provider>
  );
};

export function useCredits(): CreditContextValue {
  const ctx = useContext(CreditContext);
  if (!ctx) {
    throw new Error('useCredits must be used within CreditProvider');
  }
  return ctx;
}
