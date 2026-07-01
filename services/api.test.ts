// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { getToken, SS_TOKEN_KEY } from './api';

describe('getToken', () => {
  beforeEach(() => localStorage.clear());

  it('uses the current Google ID token when the legacy token is absent', () => {
    localStorage.setItem('stitchspeak_google_id_token', 'google-id-token');
    expect(getToken()).toBe('google-id-token');
  });

  it('keeps legacy sessions compatible', () => {
    localStorage.setItem(SS_TOKEN_KEY, 'legacy-token');
    expect(getToken()).toBe('legacy-token');
  });
});
