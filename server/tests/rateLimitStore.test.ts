import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stitchspeak-rate-limit-test-'));
process.env.DATA_DIR = dataDir;

let store: typeof import('../src/services/rateLimitStore');

beforeAll(async () => {
  store = await import('../src/services/rateLimitStore');
});

afterAll(() => fs.rmSync(dataDir, { recursive: true, force: true }));

describe('persistent rate-limit store', () => {
  it('increments a bucket atomically and resets it after the window', () => {
    expect(store.incrementRateLimit('login:192.0.2.1', 1_000, 10_000)).toEqual({ count: 1, resetAt: 11_000 });
    expect(store.incrementRateLimit('login:192.0.2.1', 1_000, 10_500)).toEqual({ count: 2, resetAt: 11_000 });
    expect(store.incrementRateLimit('login:192.0.2.1', 1_000, 11_000)).toEqual({ count: 1, resetAt: 12_000 });
  });

  it('removes expired buckets without deleting active ones', () => {
    store.incrementRateLimit('recovery:expired', 100, 1_000);
    store.incrementRateLimit('recovery:active', 1_000, 1_000);
    expect(store.cleanupExpiredRateLimits(1_500)).toBe(1);
    expect(store.incrementRateLimit('recovery:active', 1_000, 1_500).count).toBe(2);
  });
});
