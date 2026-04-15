const STORAGE_PREFIX = 'ss_credits_';

function storageKey(email: string): string {
  return STORAGE_PREFIX + email.toLowerCase();
}

export function getBalance(email: string): number {
  try {
    const raw = localStorage.getItem(storageKey(email));
    if (!raw) return 0;
    const val = parseFloat(raw);
    return isNaN(val) ? 0 : Math.round(val * 100) / 100;
  } catch {
    return 0;
  }
}

export function addCredits(email: string, amount: number): void {
  const current = getBalance(email);
  const updated = Math.round((current + amount) * 100) / 100;
  try {
    localStorage.setItem(storageKey(email), String(updated));
  } catch { /* ignore */ }
}

export function deductCredits(email: string, amount: number): boolean {
  const current = getBalance(email);
  if (current < amount - 0.001) return false;
  const updated = Math.max(0, Math.round((current - amount) * 100) / 100);
  try {
    localStorage.setItem(storageKey(email), String(updated));
  } catch { /* ignore */ }
  return true;
}
