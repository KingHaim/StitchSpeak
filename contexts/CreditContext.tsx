import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from './auth-context';
import {
  getCreditState,
  createCheckoutSession,
} from '../services/creditService';
import { CREDIT_PACKAGES } from '../constants';
import {
  clearCheckoutExpectation,
  isCheckoutBalanceConfirmed,
  readCheckoutExpectation,
  writeCheckoutExpectation,
} from '../services/checkoutReconciliation';
import { CreditContext, type CheckoutReturnStatus, type CreditContextValue } from './credit-context';
import { analyticsErrorCode, captureEvent } from '../services/analytics';

export const CreditProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { idToken, isAuthenticated } = useAuth();
  const [balance, setBalance] = useState(0);
  const [betaAccess, setBetaAccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [checkoutReturnStatus, setCheckoutReturnStatus] = useState<CheckoutReturnStatus>(null);

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

    setCheckoutReturnStatus('confirming');
    url.searchParams.delete('checkout');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);

    // Webhooks can arrive just after Lemon Squeezy redirects the browser.
    // Reconcile repeatedly so the user does not have to refresh manually.
    const expectation = readCheckoutExpectation();
    let finished = false;
    const reconcile = async () => {
      try {
        const state = await getCreditState(idToken);
        setBalance(state.balance);
        setBetaAccess(state.betaAccess);
        if (!finished && isCheckoutBalanceConfirmed(state.balance, expectation)) {
          finished = true;
          setCheckoutReturnStatus('confirmed');
          if (expectation) {
            captureEvent('checkout_completed', {
              pack_id: expectation.packId,
              credits: expectation.credits,
              amount_eur: expectation.amountEur,
              reconciliation_ms: Math.max(0, Date.now() - expectation.startedAt),
              flow_id: expectation.analyticsFlowId,
            });
          }
          clearCheckoutExpectation();
        }
      } catch (err) {
        console.error('[CreditContext] Checkout reconciliation failed:', err);
      }
    };
    void reconcile();
    const interval = window.setInterval(() => {
      if (finished) window.clearInterval(interval);
      else void reconcile();
    }, 2_000);
    const timeout = window.setTimeout(() => {
      window.clearInterval(interval);
      if (!finished) {
        setCheckoutReturnStatus('delayed');
        captureEvent('checkout_delayed', {
          pack_id: expectation?.packId,
          elapsed_ms: expectation ? Math.max(0, Date.now() - expectation.startedAt) : undefined,
        });
      }
    }, 20_000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [isAuthenticated, idToken, refreshBalance]);

  const applyBalance = useCallback((next: number) => {
    if (typeof next === 'number' && Number.isFinite(next)) setBalance(next);
  }, []);

  const dismissCheckoutReturn = useCallback(() => {
    setCheckoutReturnStatus(null);
    clearCheckoutExpectation();
  }, []);

  const retryCheckoutReconciliation = useCallback(async () => {
    if (!idToken) return;
    setCheckoutReturnStatus('confirming');
    try {
      const state = await getCreditState(idToken);
      setBalance(state.balance);
      setBetaAccess(state.betaAccess);
      const expectation = readCheckoutExpectation();
      if (isCheckoutBalanceConfirmed(state.balance, expectation)) {
        setCheckoutReturnStatus('confirmed');
        if (expectation) {
          captureEvent('checkout_completed', {
            pack_id: expectation.packId,
            credits: expectation.credits,
            amount_eur: expectation.amountEur,
            reconciliation_ms: Math.max(0, Date.now() - expectation.startedAt),
            flow_id: expectation.analyticsFlowId,
          });
        }
        clearCheckoutExpectation();
      } else {
        setCheckoutReturnStatus('delayed');
      }
    } catch {
      setCheckoutReturnStatus('delayed');
    }
  }, [idToken]);

  const startCheckout = useCallback(
    async (packId: string, analytics?: { flowId?: string; placement?: string }) => {
      if (!idToken) throw new Error('You must be signed in to buy credits.');
      const pack = CREDIT_PACKAGES.find((item) => item.id === packId);
      if (pack) {
        writeCheckoutExpectation({
          packId,
          baselineBalance: balance,
          credits: pack.credits,
          amountEur: pack.price,
          analyticsFlowId: analytics?.flowId,
          analyticsPlacement: analytics?.placement,
          startedAt: Date.now(),
        });
      }
      try {
        const url = await createCheckoutSession(idToken, packId);
        captureEvent('checkout_started', {
          pack_id: packId,
          credits: pack?.credits,
          amount_eur: pack?.price,
          placement: analytics?.placement ?? 'buy_credits_modal',
          flow_id: analytics?.flowId,
        });
        window.location.assign(url);
      } catch (err) {
        captureEvent('checkout_failed', { pack_id: packId, error_code: analyticsErrorCode(err) });
        clearCheckoutExpectation();
        throw err;
      }
    },
    [idToken, balance],
  );

  const value = useMemo<CreditContextValue>(
    () => ({
      balance,
      betaAccess,
      isLoading,
      applyBalance,
      refreshBalance,
      startCheckout,
      checkoutReturnStatus,
      retryCheckoutReconciliation,
      dismissCheckoutReturn,
    }),
    [
      balance,
      betaAccess,
      isLoading,
      applyBalance,
      refreshBalance,
      startCheckout,
      checkoutReturnStatus,
      retryCheckoutReconciliation,
      dismissCheckoutReturn,
    ],
  );

  return (
    <CreditContext.Provider value={value}>{children}</CreditContext.Provider>
  );
};
