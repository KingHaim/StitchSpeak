import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stitchspeak-member-join-test-'));
process.env.DATA_DIR = dataDir;
process.env.AUTH_SESSION_SECRET = 'test-session-secret-with-enough-entropy';
process.env.NODE_ENV = 'test';
process.env.ADMIN_EMAILS = 'owner@example.com';
process.env.RESEND_API_KEY = 're_test_key';
process.env.AUTH_EMAIL_FROM = 'StitchSpeak <hello@example.com>';
process.env.APP_URL = 'https://app.example.com';

let memberJoin: typeof import('../src/services/memberJoinedEmail');

beforeAll(async () => {
  memberJoin = await import('../src/services/memberJoinedEmail');
});

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('member join notifications', () => {
  it('claims a sub only once and sends a single admin email', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'email_1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const first = await memberJoin.notifyNewMember({
      sub: 'user-1',
      email: 'new@example.com',
      name: 'New Maker',
      source: 'email_verify',
    });
    const second = await memberJoin.notifyNewMember({
      sub: 'user-1',
      email: 'new@example.com',
      name: 'New Maker',
      source: 'google',
    });

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.to).toEqual(['owner@example.com']);
    expect(body.subject).toContain('new@example.com');
    expect(body.html).toContain('Email signup (verified)');
    expect(body.html).toContain('https://app.example.com/admin');

    vi.unstubAllGlobals();
  });

  it('exposes configuration helper when recipients and Resend are set', () => {
    expect(memberJoin.isMemberJoinEmailConfigured()).toBe(true);
  });

  it('skips email for Google users who already have a credits footprint', async () => {
    const Database = (await import('better-sqlite3')).default;
    const creditsDb = new Database(path.join(dataDir, 'credits.db'));
    creditsDb.exec(`
      CREATE TABLE IF NOT EXISTS credits (
        sub TEXT PRIMARY KEY,
        balance REAL NOT NULL DEFAULT 0,
        email TEXT,
        updated_at INTEGER NOT NULL
      )
    `);
    creditsDb.prepare('INSERT INTO credits(sub,balance,email,updated_at) VALUES(?,?,?,?)')
      .run('legacy-google', 5, 'legacy@example.com', Date.now());
    creditsDb.close();

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'email_2' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const notified = await memberJoin.notifyNewMember({
      sub: 'legacy-google',
      email: 'legacy@example.com',
      source: 'google',
    });

    expect(notified).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    // Second call still no-ops via claim dedupe.
    expect(await memberJoin.notifyNewMember({
      sub: 'legacy-google',
      email: 'legacy@example.com',
      source: 'google',
    })).toBe(false);

    vi.unstubAllGlobals();
  });
});
