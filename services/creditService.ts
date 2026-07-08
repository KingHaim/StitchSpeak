import type { CreditPackage } from '../types';

function getApiUrl(): string {
  return '';
}

async function apiFetch(
  path: string,
  idToken: string,
  method = 'GET',
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {};
  // Modern sessions are HttpOnly cookies. `cookie-session` is only a React
  // state marker and must never be sent as though it were a bearer credential.
  if (idToken !== 'cookie-session') headers.Authorization = `Bearer ${idToken}`;
  const init: RequestInit = { method, headers, credentials: 'include' };

  if (body) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(`${getApiUrl()}/api/credits${path}`, init);
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(
      typeof data.error === 'string' ? data.error : `Credits API error ${res.status}`,
    ) as Error & { status?: number; balance?: number };
    err.status = res.status;
    if (typeof data.balance === 'number') err.balance = data.balance;
    throw err;
  }
  return data;
}

export async function getCreditState(idToken: string): Promise<{ balance: number; betaAccess: boolean }> {
  const data = await apiFetch('', idToken);
  return { balance: typeof data.balance === 'number' ? data.balance : 0, betaAccess: data.betaAccess === true };
}

export interface CreditPackagesResponse {
  packages: CreditPackage[];
  paymentsEnabled: boolean;
}

export async function getPackages(idToken: string): Promise<CreditPackagesResponse> {
  const data = await apiFetch('/packages', idToken);
  return {
    packages: Array.isArray(data.packages) ? (data.packages as CreditPackage[]) : [],
    paymentsEnabled: data.paymentsEnabled === true,
  };
}

/**
 * Start a Lemon Squeezy checkout for a credit pack and return the hosted
 * checkout URL. Credits are only granted by the server's webhook once Lemon
 * Squeezy confirms payment — the client can no longer mutate its own balance.
 */
export async function createCheckoutSession(idToken: string, packId: string): Promise<string> {
  const data = await apiFetch('/checkout', idToken, 'POST', { packId });
  if (typeof data.url !== 'string') {
    throw new Error('Checkout could not be started. Please try again.');
  }
  return data.url;
}
