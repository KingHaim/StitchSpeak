import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stitchspeak-session-test-'));
process.env.DATA_DIR = dataDir;

let sessions: typeof import('../src/services/sessionStore');

beforeAll(async () => {
  sessions = await import('../src/services/sessionStore');
});

afterAll(() => fs.rmSync(dataDir, { recursive: true, force: true }));

describe('opaque authentication sessions', () => {
  it('stores only a token hash and revokes a single session', () => {
    const token = sessions.createSession({
      sub: 'google-user', email: 'maker@example.com', identityProvider: 'google', emailVerified: true,
    });
    expect(token).not.toContain('google-user');
    expect(sessions.verifySession(token)).toMatchObject({ sub: 'google-user', identityProvider: 'google' });
    sessions.revokeSession(token);
    expect(sessions.verifySession(token)).toBeNull();
  });

  it('revokes every active browser session for a deleted account', () => {
    const first = sessions.createSession({ sub: 'delete-user', identityProvider: 'google', emailVerified: true });
    const second = sessions.createSession({ sub: 'delete-user', identityProvider: 'google', emailVerified: true });
    sessions.revokeAllSessionsForSub('delete-user');
    expect(sessions.verifySession(first)).toBeNull();
    expect(sessions.verifySession(second)).toBeNull();
  });
});
