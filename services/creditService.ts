function getApiUrl(): string {
  return import.meta.env.VITE_API_URL || '';
}

async function apiFetch(
  path: string,
  idToken: string,
  method = 'GET',
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${idToken}`,
  };
  const init: RequestInit = { method, headers };

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

export async function getBalance(idToken: string): Promise<number> {
  const data = await apiFetch('/', idToken);
  return typeof data.balance === 'number' ? data.balance : 0;
}

export async function addCredits(idToken: string, amount: number): Promise<number> {
  const data = await apiFetch('/add', idToken, 'POST', { amount });
  return typeof data.balance === 'number' ? data.balance : 0;
}

export async function deductCredits(
  idToken: string,
  amount: number,
): Promise<{ ok: boolean; balance: number }> {
  try {
    const data = await apiFetch('/deduct', idToken, 'POST', { amount });
    return { ok: true, balance: typeof data.balance === 'number' ? data.balance : 0 };
  } catch (err: unknown) {
    const apiErr = err as Error & { status?: number; balance?: number };
    if (apiErr.status === 402) {
      return { ok: false, balance: apiErr.balance ?? 0 };
    }
    throw err;
  }
}
