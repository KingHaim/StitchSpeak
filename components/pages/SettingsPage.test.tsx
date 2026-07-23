// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../../contexts/auth-context';
import { CreditContext, type CreditContextValue } from '../../contexts/credit-context';
import { SettingsPage } from './SettingsPage';

const creditServiceMocks = vi.hoisted(() => ({
  getBillingOrders: vi.fn(),
  getBillingReceiptUrl: vi.fn((orderId: string) => `/api/credits/orders/${orderId}/receipt`),
}));

vi.mock('../../services/creditService', () => creditServiceMocks);

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  vi.clearAllMocks();
});

describe('SettingsPage billing', () => {
  it('opens the signed-in user’s invoice history without leaving settings', async () => {
    creditServiceMocks.getBillingOrders.mockResolvedValue({
      orders: [
        {
          orderId: 'order-20',
          creditsGranted: 20,
          amountPaidCents: 2_000,
          refundedAmountCents: 0,
          createdAt: Date.UTC(2026, 0, 15, 12),
        },
      ],
    });
    const auth: AuthContextValue = {
      user: { sub: 'email:test@example.com', email: 'test@example.com', name: 'Test Maker' },
      idToken: 'cookie-session',
      isAuthenticated: true,
      googleIdentityReady: false,
      signInWithGoogleCredential: vi.fn(),
      signInWithEmail: vi.fn(),
      signOut: vi.fn(),
    };
    const credits: CreditContextValue = {
      balance: 20,
      betaAccess: false,
      isLoading: false,
      applyBalance: vi.fn(),
      refreshBalance: vi.fn(),
      startCheckout: vi.fn(),
      checkoutReturnStatus: null,
      retryCheckoutReconciliation: vi.fn(),
      dismissCheckoutReturn: vi.fn(),
    };

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <AuthContext.Provider value={auth}>
          <CreditContext.Provider value={credits}>
            <SettingsPage />
          </CreditContext.Provider>
        </AuthContext.Provider>,
      );
    });

    const invoicesButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Invoices'),
    );

    expect(container.textContent).toContain('Billing');
    expect(invoicesButton).toBeDefined();

    await act(async () => {
      invoicesButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(creditServiceMocks.getBillingOrders).toHaveBeenCalledWith('cookie-session');
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('20 credits');
    expect(dialog?.textContent).toContain('€20.00');
    const invoiceLink = dialog?.querySelector('a[aria-label^="Open invoice"]');
    expect(invoiceLink?.getAttribute('href')).toBe(
      '/api/credits/orders/order-20/receipt',
    );
    expect(invoiceLink?.getAttribute('target')).toBe('_blank');
  });
});
