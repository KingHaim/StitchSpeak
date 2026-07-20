import { apiUrl } from './apiBase';

export const SS_TOKEN_KEY = 'ss_token';

export function getDeviceFingerprint(): string | null {
  try {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    const scr = typeof screen !== 'undefined' ? screen : null;
    if (!nav) return null;
    const parts = [
      nav.language || '',
      String(nav.hardwareConcurrency || ''),
      scr ? `${scr.width}x${scr.height}x${scr.colorDepth}` : '',
      Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      String(nav.maxTouchPoints || 0),
      nav.platform || '',
    ];
    const raw = parts.join('|');
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(36);
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  return null;
}

export async function apiCall<T = unknown>(
  endpoint: string,
  method = 'GET',
  body: Record<string, unknown> | null = null,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const options: RequestInit = { method, headers, credentials: 'include' };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(apiUrl(endpoint), options);
  let data: Record<string, unknown> = {};
  try {
    const text = await response.text();
    if (text) data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Server returned an invalid response (${response.status})`);
  }

  if (!response.ok) {
    const err = new Error(
      typeof data.error === 'string' ? data.error : `API error ${response.status}`,
    ) as Error & {
      status?: number;
      code?: string;
      cost?: number;
      balance?: number;
    };
    err.status = response.status;
    if (typeof data.code === 'string') err.code = data.code;
    if (typeof data.cost === 'number') err.cost = data.cost;
    if (typeof data.balance === 'number') err.balance = data.balance;
    throw err;
  }
  return data as T;
}

export async function register(
  email: string,
  password: string,
  name?: string,
): Promise<{ token?: string; user?: unknown; verificationRequired?: boolean; developmentVerificationUrl?: string }> {
  const data = await apiCall<{ token?: string; user?: unknown; verificationRequired?: boolean; developmentVerificationUrl?: string }>(
    '/auth/register',
    'POST',
    {
      email,
      password,
      name,
      deviceFingerprint: getDeviceFingerprint(),
    },
  );
  return data;
}

export async function verifyEmail(token: string): Promise<{ user: unknown }> {
  return apiCall<{ user: unknown }>('/auth/verify-email', 'POST', { token });
}

export async function requestPasswordReset(email: string): Promise<{ ok: boolean; developmentResetUrl?: string }> {
  return apiCall('/auth/password-reset/request', 'POST', { email });
}

export async function resendVerification(email: string, password: string): Promise<{ ok: boolean; developmentVerificationUrl?: string }> {
  return apiCall('/auth/verification/resend', 'POST', { email, password });
}

export async function confirmPasswordReset(token: string, password: string): Promise<{ ok: boolean }> {
  return apiCall('/auth/password-reset/confirm', 'POST', { token, password });
}

export async function acceptInvite(token: string, password: string): Promise<{ user: unknown }> {
  return apiCall<{ user: unknown }>('/auth/accept-invite', 'POST', { token, password });
}

export async function login(
  email: string,
  password: string,
): Promise<{ token?: string; user?: unknown }> {
  const data = await apiCall<{ token?: string; user?: unknown }>(
    '/auth/login',
    'POST',
    {
      email,
      password,
      deviceFingerprint: getDeviceFingerprint(),
    },
  );
  return data;
}

export async function googleLogin(
  payload: string | Record<string, unknown>,
): Promise<{ token?: string; user?: unknown }> {
  const body: Record<string, unknown> =
    typeof payload === 'string' ? { credential: payload } : { ...payload };
  body.deviceFingerprint = getDeviceFingerprint();
  const data = await apiCall<{ token?: string; user?: unknown }>(
    '/auth/google',
    'POST',
    body,
  );
  return data;
}

export async function getMe(): Promise<{ user: unknown }> {
  return apiCall<{ user: unknown }>('/auth/session', 'GET', null);
}

export async function updateMyName(name: string): Promise<{ user: unknown }> {
  return apiCall<{ user: unknown }>('/auth/me/name', 'PUT', { name });
}

export async function logout(): Promise<void> {
  await apiCall('/auth/logout', 'POST', null);
}
