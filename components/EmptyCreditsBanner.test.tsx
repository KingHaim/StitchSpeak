// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isDisplayedBalanceEmpty } from '../utils/creditsDisplay';
import { EmptyCreditsBanner } from './EmptyCreditsBanner';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

describe('isDisplayedBalanceEmpty', () => {
  it('treats exact 0 and 0.0-rounded values as empty', () => {
    expect(isDisplayedBalanceEmpty(0)).toBe(true);
    expect(isDisplayedBalanceEmpty(0.04)).toBe(true);
    expect(isDisplayedBalanceEmpty(0.05)).toBe(false);
    expect(isDisplayedBalanceEmpty(1)).toBe(false);
  });
});

describe('EmptyCreditsBanner', () => {
  it('renders the idle-dashboard copy and calls Buy credits', async () => {
    const onBuyCredits = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<EmptyCreditsBanner onBuyCredits={onBuyCredits} />);
    });

    expect(container.textContent).toContain("You're out of credits");
    const button = Array.from(container.querySelectorAll('button')).find((item) =>
      item.textContent?.includes('Buy credits'),
    );
    expect(button).toBeDefined();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onBuyCredits).toHaveBeenCalledTimes(1);
  });
});
