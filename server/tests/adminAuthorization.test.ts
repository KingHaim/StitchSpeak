import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stitchspeak-admin-auth-test-'));
process.env.DATA_DIR = dataDir;

let isAdminIdentity: typeof import('../src/middleware/admin').isAdminIdentity;

const originalAdminEmails = process.env.ADMIN_EMAILS;

beforeAll(async () => {
  ({ isAdminIdentity } = await import('../src/middleware/admin'));
});

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

afterEach(() => {
  if (originalAdminEmails === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = originalAdminEmails;
});

describe('administrator identity authorization', () => {
  it('rejects an unverified local account that claims an allow-listed email', () => {
    process.env.ADMIN_EMAILS = 'owner@example.com';

    expect(isAdminIdentity({
      userEmail: 'owner@example.com',
      identityProvider: 'email',
      emailVerified: false,
    })).toBe(false);
  });

  it('accepts only a verified Google identity on the allow-list', () => {
    process.env.ADMIN_EMAILS = 'owner@example.com';

    expect(isAdminIdentity({
      userEmail: 'OWNER@example.com',
      identityProvider: 'google',
      emailVerified: true,
    })).toBe(true);
    expect(isAdminIdentity({
      userEmail: 'owner@example.com',
      identityProvider: 'google',
      emailVerified: false,
    })).toBe(false);
  });

  it('rejects a verified Google identity that is not allow-listed', () => {
    process.env.ADMIN_EMAILS = 'owner@example.com';

    expect(isAdminIdentity({
      userEmail: 'other@example.com',
      identityProvider: 'google',
      emailVerified: true,
    })).toBe(false);
  });
});
