// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const posthog = vi.hoisted(() => ({
  init: vi.fn(),
  register: vi.fn(),
  capture: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('posthog-js', () => ({ default: posthog }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test');
  sessionStorage.clear();
  localStorage.clear();
  document.documentElement.lang = 'en';
  window.history.replaceState({}, '', '/?utm_source=instagram&utm_campaign=beta_launch');
});

describe('analytics funnel contract', () => {
  it('owns SPA pageviews and attaches safe common funnel properties', async () => {
    const analytics = await import('./analytics');
    analytics.initAnalytics();
    analytics.capturePageView('/translate');

    expect(posthog.init).toHaveBeenCalledWith(
      'phc_test',
      expect.objectContaining({ capture_pageview: false }),
    );
    expect(posthog.register).toHaveBeenCalledWith(expect.objectContaining({
      schema_version: 2,
      first_touch_utm_source: 'instagram',
      first_touch_utm_campaign: 'beta_launch',
    }));
    expect(posthog.capture).toHaveBeenCalledWith('page_viewed', expect.objectContaining({
      schema_version: 2,
      auth_state: 'anonymous',
      route: '/',
      path: '/translate',
    }));
  });

  it('changes auth state after identification without exposing raw error messages', async () => {
    const analytics = await import('./analytics');
    analytics.initAnalytics();
    analytics.identifyUser({ sub: 'user-1', email: 'designer@example.com' });
    analytics.captureEvent('signup_completed', { method: 'google' });

    expect(posthog.capture).toHaveBeenCalledWith('signup_completed', expect.objectContaining({
      auth_state: 'authenticated',
      method: 'google',
    }));
    expect(analytics.analyticsErrorCode(Object.assign(new Error('private pattern text'), { status: 402 }))).toBe('http_402');
  });

  it('buckets values without sending precise document measurements', async () => {
    const { analyticsBucket } = await import('./analytics');
    expect(analyticsBucket(7.2, [1, 5, 10, 25], ' MB')).toBe('<=10 MB');
    expect(analyticsBucket(60, [1, 5, 10, 25], ' credits')).toBe('>25 credits');
  });
});
