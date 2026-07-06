export const CHECKOUT_EXPECTATION_KEY = 'ss_checkout_expectation';

export interface CheckoutExpectation {
  packId: string;
  baselineBalance: number;
  credits: number;
  startedAt: number;
}

export function expectedCheckoutBalance(expectation: CheckoutExpectation): number {
  return Math.round((expectation.baselineBalance + expectation.credits) * 100) / 100;
}

export function isCheckoutBalanceConfirmed(
  currentBalance: number,
  expectation: CheckoutExpectation | null,
): boolean {
  return Boolean(
    expectation &&
      Number.isFinite(currentBalance) &&
      currentBalance >= expectedCheckoutBalance(expectation) - 0.001,
  );
}

export function readCheckoutExpectation(): CheckoutExpectation | null {
  try {
    const raw = sessionStorage.getItem(CHECKOUT_EXPECTATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CheckoutExpectation>;
    if (
      typeof parsed.packId !== 'string' ||
      typeof parsed.baselineBalance !== 'number' ||
      typeof parsed.credits !== 'number' ||
      typeof parsed.startedAt !== 'number'
    ) return null;
    return parsed as CheckoutExpectation;
  } catch {
    return null;
  }
}

export function writeCheckoutExpectation(expectation: CheckoutExpectation): void {
  try {
    sessionStorage.setItem(CHECKOUT_EXPECTATION_KEY, JSON.stringify(expectation));
  } catch {
    // Checkout remains usable when storage is unavailable; reconciliation will
    // fall back to a delayed/manual status instead of claiming confirmation.
  }
}

export function clearCheckoutExpectation(): void {
  try {
    sessionStorage.removeItem(CHECKOUT_EXPECTATION_KEY);
  } catch {
    /* ignore unavailable storage */
  }
}
