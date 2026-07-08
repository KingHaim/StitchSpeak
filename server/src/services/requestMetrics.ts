const WINDOW_MS = 15 * 60 * 1000;
const MAX_EVENTS = 5_000;

export type RequestGroup = 'translation' | 'auth' | 'payments' | 'api';

interface RequestEvent {
  group: RequestGroup;
  status: number;
  durationMs: number;
  timestamp: number;
}

export interface RequestMetricSummary {
  requests: number;
  failures: number;
  failureRate: number;
  p95DurationMs: number;
  maxDurationMs: number;
}

const emptySummary = (): RequestMetricSummary => ({
  requests: 0, failures: 0, failureRate: 0, p95DurationMs: 0, maxDurationMs: 0,
});

export function requestGroup(pathname: string): RequestGroup {
  if (pathname.startsWith('/api/translate')) return 'translation';
  if (pathname.startsWith('/api/auth')) return 'auth';
  if (pathname.startsWith('/api/credits') || pathname.startsWith('/api/lemon-squeezy')) return 'payments';
  return 'api';
}

export class RollingRequestMetrics {
  private events: RequestEvent[] = [];

  record(group: RequestGroup, status: number, durationMs: number, timestamp = Date.now()): void {
    this.events.push({ group, status, durationMs, timestamp });
    this.prune(timestamp);
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
  }

  snapshot(now = Date.now()): {
    windowMinutes: number;
    ok: boolean;
    groups: Record<RequestGroup, RequestMetricSummary>;
  } {
    this.prune(now);
    const groups: Record<RequestGroup, RequestMetricSummary> = {
      translation: emptySummary(), auth: emptySummary(), payments: emptySummary(), api: emptySummary(),
    };
    for (const group of Object.keys(groups) as RequestGroup[]) {
      const matching = this.events.filter((event) => event.group === group);
      if (matching.length === 0) continue;
      const durations = matching.map((event) => event.durationMs).sort((a, b) => a - b);
      const failures = matching.filter((event) => event.status >= 500).length;
      groups[group] = {
        requests: matching.length,
        failures,
        failureRate: Math.round((failures / matching.length) * 10_000) / 10_000,
        p95DurationMs: durations[Math.max(0, Math.ceil(durations.length * 0.95) - 1)],
        maxDurationMs: durations[durations.length - 1],
      };
    }

    const standardGroups = [groups.api, groups.auth, groups.payments];
    const standardUnhealthy = standardGroups.some(
      (metric) => metric.requests >= 20 && (metric.failureRate >= 0.05 || metric.p95DurationMs >= 3_000),
    );
    const translationUnhealthy = groups.translation.requests >= 5 && groups.translation.failureRate >= 0.2;
    return { windowMinutes: WINDOW_MS / 60_000, ok: !standardUnhealthy && !translationUnhealthy, groups };
  }

  private prune(now: number): void {
    const cutoff = now - WINDOW_MS;
    const firstCurrent = this.events.findIndex((event) => event.timestamp >= cutoff);
    if (firstCurrent === -1) this.events = [];
    else if (firstCurrent > 0) this.events.splice(0, firstCurrent);
  }
}

export const requestMetrics = new RollingRequestMetrics();
