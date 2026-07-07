import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stitchspeak-lease-test-'));
process.env.DATA_DIR = dataDir;

let leases: typeof import('../src/services/translationLeaseStore');

beforeAll(async () => {
  leases = await import('../src/services/translationLeaseStore');
});

afterAll(() => fs.rmSync(dataDir, { recursive: true, force: true }));

describe('translation concurrency lease', () => {
  it('allows only one active translation per user and releases it safely', () => {
    const first = leases.acquireTranslationLease('user-1');
    expect(first).toBeTruthy();
    expect(leases.acquireTranslationLease('user-1')).toBeNull();
    leases.releaseTranslationLease('user-1', 'wrong-lease');
    expect(leases.acquireTranslationLease('user-1')).toBeNull();
    leases.releaseTranslationLease('user-1', first!);
    expect(leases.acquireTranslationLease('user-1')).toBeTruthy();
  });

  it('recovers an abandoned lease after its expiry', () => {
    const start = 1_000;
    expect(leases.acquireTranslationLease('user-2', start)).toBeTruthy();
    expect(leases.acquireTranslationLease('user-2', start + 8 * 60 * 1000)).toBeTruthy();
  });

  it('renews only the current owner lease', () => {
    const lease = leases.acquireTranslationLease('user-3');
    expect(leases.renewTranslationLease('user-3', 'wrong')).toBe(false);
    expect(leases.renewTranslationLease('user-3', lease!)).toBe(true);
  });
});
