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
    // #region agent log
    fetch('http://127.0.0.1:7482/ingest/185ff8c9-bcd0-4e81-ae0d-16eb4a306fdb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9b47bb'},body:JSON.stringify({sessionId:'9b47bb',runId:'buy-credits-initial',hypothesisId:'H3',location:'services/creditService.ts:23',message:'Credits API request starting',data:{path,method,url:`${getApiUrl()}/api/credits${path}`,hasBody:Boolean(body),amount:typeof body?.amount === 'number' ? body.amount : null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    res = await fetch(`${getApiUrl()}/api/credits${path}`, init);
  } catch {
    // #region agent log
    fetch('http://127.0.0.1:7482/ingest/185ff8c9-bcd0-4e81-ae0d-16eb4a306fdb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9b47bb'},body:JSON.stringify({sessionId:'9b47bb',runId:'buy-credits-initial',hypothesisId:'H4',location:'services/creditService.ts:25',message:'Credits API fetch threw before response',data:{path,method,url:`${getApiUrl()}/api/credits${path}`},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    throw new Error('Could not reach the server. Check your connection and try again.');
  }

  const data = await res.json().catch(() => ({}));

  // #region agent log
  fetch('http://127.0.0.1:7482/ingest/185ff8c9-bcd0-4e81-ae0d-16eb4a306fdb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9b47bb'},body:JSON.stringify({sessionId:'9b47bb',runId:'buy-credits-initial',hypothesisId:'H3',location:'services/creditService.ts:31',message:'Credits API response received',data:{path,method,status:res.status,ok:res.ok,error:typeof data.error === 'string' ? data.error : null,hasBalance:typeof data.balance === 'number'},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

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
