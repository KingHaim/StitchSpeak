// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BuyCreditsModal } from './BuyCreditsModal';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
});

describe('BuyCreditsModal currency disclosure', () => {
  it('identifies EUR and explains that payment providers may convert the price', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <BuyCreditsModal
          isOpen
          onClose={vi.fn()}
          onPurchase={vi.fn()}
          initialSelectedIndex={0}
        />,
      );
    });

    expect(container.textContent).toContain('€7.00 EUR');
    expect(container.textContent).toContain('PayPal or your bank will apply its exchange rate');
    expect(container.textContent).toContain('Continue to checkout — €7.00 EUR');

    await act(async () => root.unmount());
  });
});
