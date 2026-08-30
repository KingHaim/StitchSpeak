import { createContext, useContext } from 'react';

export type CheckoutReturnStatus = 'confirming' | 'confirmed' | 'delayed' | null;

export type CreditContextValue = {
  balance: number;
  betaAccess: boolean;
  isLoading: boolean;
  applyBalance: (balance: number) => void;
  refreshBalance: () => Promise<void>;
  startCheckout: (
    packId: string,
    analytics?: { flowId?: string; placement?: string },
  ) => Promise<void>;
  checkoutReturnStatus: CheckoutReturnStatus;
  retryCheckoutReconciliation: () => Promise<void>;
  dismissCheckoutReturn: () => void;
};

export const CreditContext = createContext<CreditContextValue | null>(null);

export function useCredits(): CreditContextValue {
  const ctx = useContext(CreditContext);
  if (!ctx) throw new Error('useCredits must be used within CreditProvider');
  return ctx;
}
