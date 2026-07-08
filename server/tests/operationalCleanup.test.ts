import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stitchspeak-cleanup-test-'));
process.env.DATA_DIR = dataDir;
process.env.AUTH_SESSION_SECRET = 'cleanup-test-secret';

let sessions: typeof import('../src/services/sessionStore');
let emailAuth: typeof import('../src/services/emailAuth');
let leases: typeof import('../src/services/translationLeaseStore');
let cleanup: typeof import('../src/services/operationalCleanup');
let rateLimits: typeof import('../src/services/rateLimitStore');

beforeAll(async () => {
  sessions = await import('../src/services/sessionStore');
  emailAuth = await import('../src/services/emailAuth');
  leases = await import('../src/services/translationLeaseStore');
  cleanup = await import('../src/services/operationalCleanup');
  rateLimits = await import('../src/services/rateLimitStore');
});

afterAll(() => fs.rmSync(dataDir, { recursive: true, force: true }));

describe('expired operational data cleanup', () => {
  it('removes only expired sessions, auth tokens, and abandoned leases', async () => {
    const currentSession = sessions.createSession({
      sub: 'current-user', identityProvider: 'google', emailVerified: true,
    });
    const oldSession = sessions.createSession({
      sub: 'old-user', identityProvider: 'email', emailVerified: true,
    }, 1_000);
    const account = await emailAuth.createEmailAccount('cleanup@example.com', 'correct-horse-battery');
    emailAuth.issueVerificationToken(account);
    leases.acquireTranslationLease('old-user', 1_000);
    rateLimits.incrementRateLimit('login:192.0.2.1', 1_000, 1_000);
    const future = Date.now() + 25 * 60 * 60 * 1000;

    const result = cleanup.runOperationalCleanup(future);
    expect(result).toMatchObject({ sessions: 1, emailTokens: 1, translationLeases: 1, rateLimits: 1, total: 4 });
    expect(sessions.verifySession(oldSession)).toBeNull();
    expect(sessions.verifySession(currentSession)).not.toBeNull();
    expect(cleanup.operationalCleanupHealth(future).ok).toBe(true);
  });
});
