export const COOKIE_SESSION_AUTH_MARKER = 'cookie-session';

/**
 * Resolve the API origin used by the browser.
 * In Vite dev we always return '' so fetches hit same-origin `/api/*` and the
 * session cookie stays first-party (Vite proxies to VITE_API_URL).
 */
export function resolveApiUrl(viteApiUrl: string | undefined, isDev: boolean): string {
  if (isDev) return '';
  return (viteApiUrl || '').replace(/\/+$/, '');
}

export function getApiUrl(): string {
  return resolveApiUrl(import.meta.env.VITE_API_URL, import.meta.env.DEV);
}

export function apiUrl(path: string): string {
  const normalizedPath = path === '/' ? '' : path.startsWith('/') ? path : `/${path}`;
  return `${getApiUrl()}/api${normalizedPath}`;
}

export function authHeaders(idToken: string | null): Record<string, string> {
  if (!idToken || idToken === COOKIE_SESSION_AUTH_MARKER) return {};
  return { Authorization: `Bearer ${idToken}` };
}
