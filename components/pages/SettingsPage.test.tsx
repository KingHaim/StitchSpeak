// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../../contexts/auth-context';
import { CreditContext, type CreditContextValue } from '../../contexts/credit-context';
import { SettingsPage } from './SettingsPage';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

describe('SettingsPage billing', () => {
  it('shows a direct way to access invoices and receipts', async () => {
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

    const invoicesLink = Array.from(container.querySelectorAll('a')).find(
      (link) => link.textContent?.includes('Invoices'),
    );

    expect(container.textContent).toContain('Billing');
    expect(invoicesLink?.getAttribute('href')).toBe('https://app.lemonsqueezy.com/my-orders');
    expect(invoicesLink?.getAttribute('target')).toBe('_blank');
    expect(invoicesLink?.getAttribute('rel')).toContain('noopener');
  });
});
