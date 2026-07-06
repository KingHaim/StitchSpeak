import { describe, expect, it } from 'vitest';
import { expectedCheckoutBalance, isCheckoutBalanceConfirmed } from './checkoutReconciliation';

const expectation = {
  packId: 'credits_10',
  baselineBalance: 3.5,
  credits: 10,
  startedAt: 1,
};

describe('checkout reconciliation', () => {
  it('waits until the purchased credits appear in the balance', () => {
    expect(expectedCheckoutBalance(expectation)).toBe(13.5);
    expect(isCheckoutBalanceConfirmed(3.5, expectation)).toBe(false);
    expect(isCheckoutBalanceConfirmed(13.49, expectation)).toBe(false);
    expect(isCheckoutBalanceConfirmed(13.5, expectation)).toBe(true);
  });

  it('does not claim confirmation without checkout metadata', () => {
    expect(isCheckoutBalanceConfirmed(100, null)).toBe(false);
  });
});
