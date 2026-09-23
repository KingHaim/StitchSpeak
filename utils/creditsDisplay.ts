/** True when the balance chip would display `0.0`. */
export function isDisplayedBalanceEmpty(balance: number): boolean {
  return Number(balance.toFixed(1)) === 0;
}
