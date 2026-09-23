// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../contexts/auth-context';
import { PricePreview } from './PricePreview';
import type { PdfMetrics, PriceEstimate } from '../types';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const metrics: PdfMetrics = {
  pages: 4,
  characters: 1200,
  estimatedInputTokens: 400,
  estimatedOutputTokens: 400,
  fileSizeKB: 80,
};

const estimate: PriceEstimate = {
  translationCost: 3.5,
  chatPackageCost: 0,
  totalCost: 3.5,
  breakdown: {
    inputTokens: 400,
    outputTokens: 400,
    rawCost: 3,
    margin: 0.5,
    pageSurcharge: 0,
  },
};

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

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

async function renderPreview(
  auth: AuthContextValue,
  props: Partial<ComponentProps<typeof PricePreview>> = {},
) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <AuthContext.Provider value={auth}>
        <PricePreview metrics={metrics} estimate={estimate} {...props} />
      </AuthContext.Provider>,
    );
  });
}

function buyButton(): HTMLButtonElement | undefined {
  return Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
    button.textContent?.includes('Buy credits'),
  );
}

describe('PricePreview insufficient credits CTA', () => {
  it('shows Buy credits and calls the handler when balance is below the estimate', async () => {
    const onBuyCredits = vi.fn();
    await renderPreview(signedIn, { creditBalance: 1.2, onBuyCredits });

    expect(container?.textContent).toContain('You have 1.2 credits. Add credits before starting this translation.');
    const button = buyButton();
    expect(button).toBeDefined();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onBuyCredits).toHaveBeenCalledTimes(1);
  });

  it('shows Buy credits when the displayed balance is 0.0', async () => {
    const onBuyCredits = vi.fn();
    await renderPreview(signedIn, { creditBalance: 0, onBuyCredits });

    expect(container?.textContent).toContain('You have 0.0 credits.');
    expect(buyButton()).toBeDefined();
  });

  it('does not show Buy credits when the balance covers the estimate', async () => {
    await renderPreview(signedIn, { creditBalance: 8, onBuyCredits: vi.fn() });

    expect(container?.textContent).not.toContain('Add credits before starting this translation.');
    expect(buyButton()).toBeUndefined();
  });

  it('does not show the balance warning or Buy credits for guests', async () => {
    await renderPreview(guest, { creditBalance: 0, onBuyCredits: vi.fn() });

    expect(container?.textContent).not.toContain('Add credits before starting this translation.');
    expect(buyButton()).toBeUndefined();
  });
});
