export function getApiUrl(): string {
  return (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
}

export function apiUrl(path: string): string {
  const normalizedPath = path === '/' ? '' : path.startsWith('/') ? path : `/${path}`;
  return `${getApiUrl()}/api${normalizedPath}`;
}
