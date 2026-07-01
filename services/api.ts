/**
 * Backend API client (pattern copied from BeatingHeart `src/services/replicate.js`).
 * Point `VITE_API_URL` at your own API when you add one; until then these helpers are unused by the app.
 */
import { readStoredIdToken } from '../auth/sessionStorage';

const isLocalhost =
  typeof window !== 'undefined' &&
  ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

const API_BASE = isLocalhost
  ? '/api'
  : `${(import.meta.env.VITE_API_URL || '').replace(/\/$/, '')}/api`;

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
  if (typeof window === 'undefined') return null;
  // `SS_TOKEN_KEY` belonged to the retired email/password auth flow. Current
  // sessions are Google ID tokens, stored by AuthProvider.
  return localStorage.getItem(SS_TOKEN_KEY) || readStoredIdToken();
}

export async function apiCall<T = unknown>(
  endpoint: string,
  method = 'GET',
  body: Record<string, unknown> | null = null,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const options: RequestInit = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(`${API_BASE}${endpoint}`, options);
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
): Promise<{ token?: string; user?: unknown }> {
  const data = await apiCall<{ token?: string; user?: unknown }>(
    '/auth/register',
    'POST',
    {
      email,
      password,
      name,
      deviceFingerprint: getDeviceFingerprint(),
    },
  );
  if (data.token) localStorage.setItem(SS_TOKEN_KEY, data.token);
  return data;
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
  if (data.token) localStorage.setItem(SS_TOKEN_KEY, data.token);
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
  if (data.token) localStorage.setItem(SS_TOKEN_KEY, data.token);
  return data;
}

export async function getMe(): Promise<{ user: unknown }> {
  return apiCall<{ user: unknown }>('/auth/me', 'GET', null);
}

export async function updateMyName(name: string): Promise<{ user: unknown }> {
  return apiCall<{ user: unknown }>('/auth/me/name', 'PUT', { name });
}

export function logout(): void {
  try {
    localStorage.removeItem(SS_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}
