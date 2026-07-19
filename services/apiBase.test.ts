// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiUrl, authHeaders, getApiUrl, resolveApiUrl } from './apiBase';
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

  it('keeps Vite dev on same-origin even when VITE_API_URL points at a remote API', () => {
    expect(
      resolveApiUrl('https://stitchspeak-production.up.railway.app/', true),
    ).toBe('');
  });

  it('uses VITE_API_URL in production builds when the frontend is hosted separately from the API', () => {
    expect(
      resolveApiUrl('https://stitchspeak-production.up.railway.app/', false),
    ).toBe('https://stitchspeak-production.up.railway.app');
  });

  it('does not add trailing slashes to root collection endpoints', async () => {
    vi.stubEnv('VITE_API_URL', '');
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    fetchMock.mockResolvedValueOnce(jsonResponse({ patterns: [] }));
    await listPatterns('cookie-session');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/patterns');
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).not.toHaveProperty('Authorization');

    fetchMock.mockResolvedValueOnce(jsonResponse({ balance: 24, betaAccess: false }));
    await getCreditState('cookie-session');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/credits');
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).headers).not.toHaveProperty('Authorization');
  });

  it('does not send the cookie-session marker as a bearer token', () => {
    expect(authHeaders('cookie-session')).toEqual({});
    expect(authHeaders(null)).toEqual({});
    expect(authHeaders('real-token')).toEqual({ Authorization: 'Bearer real-token' });
  });
});
