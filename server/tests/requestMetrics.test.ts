import { describe, expect, it } from 'vitest';
import { requestGroup, RollingRequestMetrics } from '../src/services/requestMetrics';

describe('rolling request metrics', () => {
  it('groups routes without exposing resource identifiers', () => {
    expect(requestGroup('/api/translate')).toBe('translation');
    expect(requestGroup('/api/auth/login')).toBe('auth');
    expect(requestGroup('/api/credits/checkout')).toBe('payments');
    expect(requestGroup('/api/patterns/private-pattern-id')).toBe('api');
  });

  it('calculates RED metrics over the rolling window', () => {
    const metrics = new RollingRequestMetrics();
    for (let i = 0; i < 20; i += 1) metrics.record('api', i === 0 ? 500 : 200, 100 + i, 1_000);
    const snapshot = metrics.snapshot(2_000);
    expect(snapshot.groups.api).toMatchObject({ requests: 20, failures: 1, failureRate: 0.05 });
    expect(snapshot.groups.api.p95DurationMs).toBe(118);
    expect(snapshot.ok).toBe(false);
  });

  it('drops expired observations and avoids alerting on tiny samples', () => {
    const metrics = new RollingRequestMetrics();
    metrics.record('api', 500, 10_000, 1_000);
    expect(metrics.snapshot(2_000).ok).toBe(true);
    expect(metrics.snapshot(20 * 60 * 1000).groups.api.requests).toBe(0);
  });
});
