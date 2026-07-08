import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCreditState } from './creditService';

afterEach(() => vi.unstubAllGlobals());

describe('credit service session authentication', () => {
  it('uses the HttpOnly cookie without sending the internal session marker as a bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ balance: 12.5, betaAccess: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getCreditState('cookie-session')).resolves.toEqual({ balance: 12.5, betaAccess: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/credits', expect.objectContaining({
      credentials: 'include',
      headers: {},
    }));
  });
});
