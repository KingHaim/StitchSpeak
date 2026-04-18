import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import {
  getBalance as fetchBalance,
  addCredits as apiAdd,
  createCreditsCheckout as apiCreateCheckout,
  deductCredits as apiDeduct,
} from '../services/creditService';

const LEGACY_CREDIT_PREFIX = 'ss_credits_';

type CreditContextValue = {
  balance: number;
  isLoading: boolean;
  addCredits: (amount: number) => Promise<void>;
  startCheckout: (pack: { credits: number; price: number }) => Promise<void>;
  deductCredits: (amount: number) => Promise<boolean>;
  refreshBalance: () => Promise<void>;
};

const CreditContext = createContext<CreditContextValue | null>(null);

export const CreditProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, idToken, isAuthenticated } = useAuth();
  const [balance, setBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const migrationAttempted = useRef(false);

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
      migrationAttempted.current = false;
      return;
    }

    const init = async () => {
      setIsLoading(true);
      try {
        await refreshBalance();
        await migrateLegacyCredits();
      } finally {
        setIsLoading(false);
      }
    };

    async function migrateLegacyCredits() {
      if (migrationAttempted.current) return;
      migrationAttempted.current = true;

      const email = user?.email;
      if (!email || !idToken) return;

      const key = LEGACY_CREDIT_PREFIX + email.toLowerCase();
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(key);
      } catch {
        return;
      }
      if (!raw) return;

      const amount = parseFloat(raw);
      if (!Number.isFinite(amount) || amount <= 0) {
        try { localStorage.removeItem(key); } catch { /* ignore */ }
        return;
      }

      try {
        const newBalance = await apiAdd(idToken, amount);
        setBalance(newBalance);
        localStorage.removeItem(key);
        console.log(`[CreditContext] Migrated ${amount} legacy credits for ${email}`);
      } catch (err) {
        console.error('[CreditContext] Legacy credit migration failed:', err);
      }
    }

    init();
  }, [isAuthenticated, idToken, user, refreshBalance]);

  const addCredits = useCallback(
    async (amount: number) => {
      if (!idToken) return;
      const newBalance = await apiAdd(idToken, amount);
      setBalance(newBalance);
    },
    [idToken],
  );

  const startCheckout = useCallback(
    async (pack: { credits: number; price: number }) => {
      if (!idToken) {
        throw new Error('Please sign in to buy credits.');
      }
      const checkoutUrl = await apiCreateCheckout(idToken, pack);
      window.location.href = checkoutUrl;
    },
    [idToken],
  );

  const deductCredits = useCallback(
    async (amount: number): Promise<boolean> => {
      if (!idToken) return false;
      const { ok, balance: newBalance } = await apiDeduct(idToken, amount);
      setBalance(newBalance);
      return ok;
    },
    [idToken],
  );

  const value = useMemo<CreditContextValue>(
    () => ({ balance, isLoading, addCredits, startCheckout, deductCredits, refreshBalance }),
    [balance, isLoading, addCredits, startCheckout, deductCredits, refreshBalance],
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
