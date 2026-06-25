import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import {
  getBalance as fetchBalance,
  createCheckoutSession,
} from '../services/creditService';

type CreditContextValue = {
  balance: number;
  isLoading: boolean;
  /** Set the balance directly from a server response (e.g. after a translation). */
  applyBalance: (balance: number) => void;
  refreshBalance: () => Promise<void>;
  /** Redirect to hosted checkout for a credit pack. */
  startCheckout: (packId: string) => Promise<void>;
};

const CreditContext = createContext<CreditContextValue | null>(null);

export const CreditProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { idToken, isAuthenticated } = useAuth();
  const [balance, setBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const refreshBalance = useCallback(async () => {
    if (!isAuthenticated || !idToken) {
      setBalance(0);
      return;
    }
    try {
      const bal = await fetchBalance(idToken);
      setBalance(bal);
    } catch (err) {
      console.error('[CreditContext] Failed to fetch balance:', err);
    }
  }, [isAuthenticated, idToken]);

  useEffect(() => {
    if (!isAuthenticated || !idToken) {
      setBalance(0);
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

  const applyBalance = useCallback((next: number) => {
    if (typeof next === 'number' && Number.isFinite(next)) setBalance(next);
  }, []);

  const startCheckout = useCallback(
    async (packId: string) => {
      if (!idToken) throw new Error('You must be signed in to buy credits.');
      const url = await createCheckoutSession(idToken, packId);
      window.location.assign(url);
    },
    [idToken],
  );

  const value = useMemo<CreditContextValue>(
    () => ({ balance, isLoading, applyBalance, refreshBalance, startCheckout }),
    [balance, isLoading, applyBalance, refreshBalance, startCheckout],
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
