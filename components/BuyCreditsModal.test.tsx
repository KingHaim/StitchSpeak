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

  it('keeps checkout disabled until the legal checkbox is accepted', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onPurchase = vi.fn();

    await act(async () => {
      root.render(
        <BuyCreditsModal
          isOpen
          onClose={vi.fn()}
          onPurchase={onPurchase}
          initialSelectedIndex={0}
        />,
      );
    });

    expect(container.textContent).toContain(
      'Payment is processed by Lemon Squeezy, the merchant of record for this purchase.',
    );
    expect(container.textContent).toContain('StitchSpeak does not store your card details.');

    const terms = container.querySelector('a[href="https://stitchspeak.com/terms.html"]');
    const privacy = container.querySelector('a[href="https://stitchspeak.com/privacy.html"]');
    expect(terms).not.toBeNull();
    expect(privacy).not.toBeNull();

    const submit = container.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    expect(submit?.disabled).toBe(true);
    expect(checkbox?.checked).toBe(false);

    await act(async () => {
      submit?.form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(onPurchase).not.toHaveBeenCalled();

    await act(async () => {
      checkbox?.click();
    });

    const enabledSubmit = container.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    expect(enabledSubmit?.disabled).toBe(false);

    await act(async () => root.unmount());
  });
});
