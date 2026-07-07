// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { getToken, SS_TOKEN_KEY } from './api';

describe('getToken', () => {
  beforeEach(() => localStorage.clear());

  it('never reads a Google credential from localStorage', () => {
    localStorage.setItem('stitchspeak_google_id_token', 'google-id-token');
    expect(getToken()).toBeNull();
  });

  it('never sends a legacy bearer token from localStorage', () => {
    localStorage.setItem(SS_TOKEN_KEY, 'legacy-token');
    expect(getToken()).toBeNull();
  });
});
