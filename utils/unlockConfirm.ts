/** Exact confirm copy: quoted cost and the balance after the charge. */
export function formatUnlockConfirm(cost: number, balance: number): string {
  return `Unlock full translation for ${cost.toFixed(1)} credits? Balance ${balance.toFixed(1)} → ${(balance - cost).toFixed(1)}`;
}
