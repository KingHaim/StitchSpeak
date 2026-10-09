// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../../contexts/auth-context';
import { CreditContext, type CreditContextValue } from '../../contexts/credit-context';
import { DashboardPage } from './DashboardPage';

vi.mock('../../services/historyService', () => ({
  saveTranslation: vi.fn(),
  loadHistory: vi.fn().mockResolvedValue({ records: [] }),
  loadPatternSource: vi.fn(),
}));

vi.mock('../../services/openPatternHint', () => ({
  onOpenPatternHintChange: () => () => undefined,
  takeOpenPatternHint: () => null,
}));

vi.mock('../../services/addTranslationHint', () => ({
  clearAddTranslationHint: vi.fn(),
  onAddTranslationHintChange: () => () => undefined,
  readAddTranslationHint: () => null,
  takePendingSourceFile: () => null,
}));

vi.mock('../../services/analytics', () => ({
  analyticsBucket: () => '<=1',
  analyticsErrorCode: () => 'unknown',
  analyticsFileType: () => 'pdf',
  captureEvent: vi.fn(),
  claimFirstExport: () => false,
  claimFirstPattern: () => false,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const signedIn: AuthContextValue = {
  user: { sub: 'email:test@example.com', email: 'test@example.com', name: 'Test Maker' },
  idToken: 'cookie-session',
  isAuthenticated: true,
  googleIdentityReady: false,
  signInWithGoogleCredential: vi.fn(),
  signInWithEmail: vi.fn(),
  signOut: vi.fn(),
};

const guest: AuthContextValue = {
  ...signedIn,
  user: null,
  idToken: null,
  isAuthenticated: false,
};

function credits(balance: number): CreditContextValue {
  return {
    balance,
    betaAccess: false,
    freePreviewAvailable: false,
    isLoading: false,
    applyBalance: vi.fn(),
    refreshBalance: vi.fn(),
    startCheckout: vi.fn(),
    checkoutReturnStatus: null,
    retryCheckoutReconciliation: vi.fn(),
    dismissCheckoutReturn: vi.fn(),
  };
}

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  vi.clearAllMocks();
});

async function renderDashboard(auth: AuthContextValue, balance: number) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <AuthContext.Provider value={auth}>
        <CreditContext.Provider value={credits(balance)}>
          <DashboardPage />
        </CreditContext.Provider>
      </AuthContext.Provider>,
    );
  });
}

describe('DashboardPage empty-balance banner', () => {
  it('shows a Buy credits banner when the signed-in balance is 0', async () => {
    await renderDashboard(signedIn, 0);

    const banner = container?.querySelector('[data-testid="empty-credits-banner"]');
    expect(banner?.textContent).toContain("You're out of credits");
    const button = Array.from(banner?.querySelectorAll('button') ?? []).find((item) =>
      item.textContent?.includes('Buy credits'),
    );
    expect(button).toBeDefined();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const dialog = container?.querySelector('[role="dialog"][aria-labelledby="buy-credits-dialog-title"]');
    expect(dialog?.textContent).toContain('Buy Credits');
  });

  it('hides the empty-balance banner when credits remain', async () => {
    await renderDashboard(signedIn, 12);

    expect(container?.querySelector('[data-testid="empty-credits-banner"]')).toBeNull();
    expect(container?.textContent).not.toContain("You're out of credits");
  });

  it('does not show the empty-balance banner to guests', async () => {
    await renderDashboard(guest, 0);

    expect(container?.querySelector('[data-testid="empty-credits-banner"]')).toBeNull();
  });
});
