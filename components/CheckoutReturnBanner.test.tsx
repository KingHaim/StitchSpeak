// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CheckoutReturnBanner } from './CheckoutReturnBanner';
import { WEBSITE_COPY } from '../utils/websiteLocalization';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

async function renderBanner(
  status: 'confirming' | 'confirmed' | 'delayed',
  locale?: 'en' | 'es',
) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const onRetry = vi.fn();
  const onDismiss = vi.fn();
  await act(async () => {
    root?.render(
      <CheckoutReturnBanner status={status} locale={locale} onRetry={onRetry} onDismiss={onDismiss} />,
    );
  });
  return { onRetry, onDismiss };
}

describe('CheckoutReturnBanner', () => {
  it('shows the payment-received copy while credits are still landing', async () => {
    await renderBanner('confirming');
    expect(container?.textContent).toContain(WEBSITE_COPY.en.checkoutReturn.confirmingTitle);
    expect(container?.textContent).not.toMatch(/\bAI\b/);
    expect(container?.textContent).not.toContain('support@stitchspeak.com');
  });

  it('after a long wait, tells the buyer credits are being added by hand and how to reach support', async () => {
    const { onRetry } = await renderBanner('delayed');
    expect(container?.textContent).toContain(WEBSITE_COPY.en.checkoutReturn.delayedBody);
    const support = container?.querySelector('a[href="mailto:support@stitchspeak.com"]');
    expect(support?.textContent).toBe('support@stitchspeak.com');
    expect(container?.textContent).not.toMatch(/\bAI\b/);

    const retry = Array.from(container?.querySelectorAll('button') ?? []).find((button) => (
      button.textContent === 'Retry'
    ));
    await act(async () => {
      retry?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('uses Spanish strings when the website locale is es', async () => {
    await renderBanner('delayed', 'es');
    expect(container?.textContent).toContain(WEBSITE_COPY.es.checkoutReturn.delayedBody);
    expect(container?.querySelector('a[href="mailto:support@stitchspeak.com"]')).not.toBeNull();
    expect(container?.textContent).not.toMatch(/\bAI\b/);
  });
});
