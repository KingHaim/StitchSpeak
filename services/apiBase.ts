export const COOKIE_SESSION_AUTH_MARKER = 'cookie-session';

/**
 * Hosts where `/api/*` is proxied to the backend on the same origin
 * (Vercel rewrites in vercel.json). Same-origin is required for the HttpOnly
 * session cookie: calling Railway directly makes it a third-party cookie,
 * which Safari silently drops — auth then fails with "Missing authentication
 * session" even though login appeared to succeed.
 */
function hasSameOriginApiProxy(hostname: string): boolean {
  return (
    hostname === 'stitchspeak.com' ||
    hostname === 'www.stitchspeak.com' ||
    hostname.endsWith('.vercel.app')
  );
}

/**
 * Resolve the API origin used by the browser.
 * - Vite dev: always '' — fetches hit same-origin `/api/*` and the dev proxy
 *   forwards them (rewriting the session cookie) to VITE_API_URL.
 * - Production on a host with an `/api` rewrite (Vercel): '' for the same
 *   first-party-cookie reason.
 * - Anywhere else (e.g. GitHub Pages): fall back to the configured origin.
 */
export function resolveApiUrl(
  viteApiUrl: string | undefined,
  isDev: boolean,
  hostname: string,
): string {
  if (isDev || hasSameOriginApiProxy(hostname)) return '';
  return (viteApiUrl || '').replace(/\/+$/, '');
}

export function getApiUrl(): string {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  return resolveApiUrl(import.meta.env.VITE_API_URL, import.meta.env.DEV, hostname);
}

export function apiUrl(path: string): string {
  const normalizedPath = path === '/' ? '' : path.startsWith('/') ? path : `/${path}`;
  return `${getApiUrl()}/api${normalizedPath}`;
}

export function authHeaders(idToken: string | null): Record<string, string> {
  if (!idToken || idToken === COOKIE_SESSION_AUTH_MARKER) return {};
  return { Authorization: `Bearer ${idToken}` };
}
