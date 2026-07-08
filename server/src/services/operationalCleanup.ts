import { cleanupExpiredEmailAuthTokens } from './emailAuth.js';
import { cleanupExpiredSessions } from './sessionStore.js';
import { cleanupExpiredTranslationLeases } from './translationLeaseStore.js';
import { cleanupExpiredRateLimits } from './rateLimitStore.js';

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const HEALTH_MAX_AGE_MS = 12 * 60 * 60 * 1000;

interface CleanupResult {
  ranAt: string;
  sessions: number;
  emailTokens: number;
  translationLeases: number;
  rateLimits: number;
  total: number;
}

let lastResult: CleanupResult | null = null;
let lastError: string | null = null;
let running = false;

export function runOperationalCleanup(now = Date.now()): CleanupResult {
  const sessions = cleanupExpiredSessions(now);
  const emailTokens = cleanupExpiredEmailAuthTokens(now);
  const translationLeases = cleanupExpiredTranslationLeases(now);
  const rateLimits = cleanupExpiredRateLimits(now);
  lastResult = {
    ranAt: new Date(now).toISOString(),
    sessions,
    emailTokens,
    translationLeases,
    rateLimits,
    total: sessions + emailTokens + translationLeases + rateLimits,
  };
  lastError = null;
  return lastResult;
}

export function operationalCleanupHealth(now = Date.now()): {
  ok: boolean;
  running: boolean;
  lastResult: CleanupResult | null;
  lastError: string | null;
} {
  const fresh = lastResult ? now - Date.parse(lastResult.ranAt) <= HEALTH_MAX_AGE_MS : false;
  return { ok: fresh && !lastError, running, lastResult, lastError };
}

export function scheduleOperationalCleanup(): void {
  const run = () => {
    if (running) return;
    running = true;
    try {
      const result = runOperationalCleanup();
      if (result.total > 0) console.log(JSON.stringify({ event: 'operational_cleanup', ...result }));
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown cleanup failure';
      console.error('[cleanup] failed:', error);
    } finally {
      running = false;
    }
  };
  run();
  const interval = setInterval(run, CLEANUP_INTERVAL_MS);
  interval.unref();
}
