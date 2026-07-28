import { describe, expect, it } from 'vitest';
import { isProductionReady } from '../src/services/readiness';

const healthy = {
  gemini: true,
  openai: true,
  googleOAuth: true,
  lemonSqueezy: true,
  lemonSqueezyWebhook: true,
  credits: true,
  patterns: true,
  authSession: true,
  authEmail: true,
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

  it('fails when account recovery cannot send email', () => {
    expect(isProductionReady({ ...healthy, authEmail: false })).toBe(false);
  });

  it('fails when tech editing cannot reach OpenAI', () => {
    expect(isProductionReady({ ...healthy, openai: false })).toBe(false);
  });
});
