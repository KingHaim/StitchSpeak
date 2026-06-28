import { describe, expect, it } from 'vitest';
import { isProductionReady } from '../src/services/readiness';

const healthy = {
  gemini: true,
  googleOAuth: true,
  lemonSqueezy: true,
  lemonSqueezyWebhook: true,
  credits: true,
  patterns: true,
};

describe('isProductionReady', () => {
  it('fails when checkout is not configured', () => {
    expect(isProductionReady({ ...healthy, lemonSqueezy: false })).toBe(false);
  });

  it('fails when payment confirmation cannot be verified', () => {
    expect(isProductionReady({ ...healthy, lemonSqueezyWebhook: false })).toBe(false);
  });

  it('passes only when every revenue dependency is healthy', () => {
    expect(isProductionReady(healthy)).toBe(true);
  });
});
