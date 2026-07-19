// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiUrl, getApiUrl } from './apiBase';
import { getCreditState } from './creditService';
import { listPatterns } from './patternsService';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('apiBase', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('uses same-origin API routes by default', () => {
    vi.stubEnv('VITE_API_URL', '');

    expect(getApiUrl()).toBe('');
    expect(apiUrl('/patterns')).toBe('/api/patterns');
    expect(apiUrl('/')).toBe('/api');
  });

  it('uses VITE_API_URL when the frontend is hosted separately from the API', () => {
    vi.stubEnv('VITE_API_URL', 'https://stitchspeak-production.up.railway.app/');

    expect(getApiUrl()).toBe('https://stitchspeak-production.up.railway.app');
    expect(apiUrl('/patterns')).toBe('https://stitchspeak-production.up.railway.app/api/patterns');
  });

  it('does not add trailing slashes to root collection endpoints', async () => {
    vi.stubEnv('VITE_API_URL', '');
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    fetchMock.mockResolvedValueOnce(jsonResponse({ patterns: [] }));
    await listPatterns('cookie-session');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/patterns');

    fetchMock.mockResolvedValueOnce(jsonResponse({ balance: 24, betaAccess: false }));
    await getCreditState('cookie-session');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/credits');
  });
});
