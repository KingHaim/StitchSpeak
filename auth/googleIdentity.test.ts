// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Google Identity initialization', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('initializes GIS exactly once while keeping the active callback current', async () => {
    const initialize = vi.fn();
    window.google = {
      accounts: {
        id: {
          initialize,
          renderButton: vi.fn(),
          prompt: vi.fn(),
          disableAutoSelect: vi.fn(),
        },
      },
    };

    const { initializeGoogleIdentity } = await import('./googleIdentity');
    const firstCallback = vi.fn();
    const secondCallback = vi.fn();

    expect(initializeGoogleIdentity('client-id', firstCallback)).toBe(true);
    expect(initializeGoogleIdentity('client-id', secondCallback)).toBe(true);
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: 'client-id',
        itp_support: true,
        use_fedcm_for_prompt: true,
        use_fedcm_for_button: true,
      }),
    );
    const config = initialize.mock.calls[0][0];
    config.callback({ credential: 'token' });
    expect(firstCallback).not.toHaveBeenCalled();
    expect(secondCallback).toHaveBeenCalledWith({ credential: 'token' });
  });
});
