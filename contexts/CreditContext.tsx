import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import {
  getBalance as fetchBalance,
  addCredits as apiAdd,
  deductCredits as apiDeduct,
} from '../services/creditService';

const LEGACY_CREDIT_PREFIX = 'ss_credits_';

type CreditContextValue = {
  balance: number;
  isLoading: boolean;
  addCredits: (amount: number) => Promise<void>;
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
      // #region agent log
      fetch('http://127.0.0.1:7482/ingest/185ff8c9-bcd0-4e81-ae0d-16eb4a306fdb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9b47bb'},body:JSON.stringify({sessionId:'9b47bb',runId:'buy-credits-initial',hypothesisId:'H2',location:'contexts/CreditContext.tsx:94',message:'CreditContext.addCredits called',data:{amount,hasIdToken:Boolean(idToken),isAuthenticated},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (!idToken) return;
      try {
        const newBalance = await apiAdd(idToken, amount);
        setBalance(newBalance);
      } catch (err) {
        // #region agent log
        fetch('http://127.0.0.1:7482/ingest/185ff8c9-bcd0-4e81-ae0d-16eb4a306fdb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9b47bb'},body:JSON.stringify({sessionId:'9b47bb',runId:'buy-credits-initial',hypothesisId:'H3',location:'contexts/CreditContext.tsx:101',message:'CreditContext.addCredits failed',data:{amount,error:err instanceof Error ? err.message : 'unknown'},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        throw err;
      }
    },
    [idToken, isAuthenticated],
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
    () => ({ balance, isLoading, addCredits, deductCredits, refreshBalance }),
    [balance, isLoading, addCredits, deductCredits, refreshBalance],
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
