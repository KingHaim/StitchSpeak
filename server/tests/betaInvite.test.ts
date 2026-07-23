import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stitchspeak-beta-invite-test-'));
process.env.DATA_DIR = dataDir;
process.env.AUTH_SESSION_SECRET = 'test-session-secret-with-enough-entropy';
process.env.NODE_ENV = 'test';

let auth: typeof import('../src/services/emailAuth');
let invite: typeof import('../src/services/betaInvite');
let credits: typeof import('../src/services/creditStore');
let betaStore: typeof import('../src/services/betaApplicationStore');
let adminStore: typeof import('../src/services/adminStore');

beforeAll(async () => {
  auth = await import('../src/services/emailAuth');
  invite = await import('../src/services/betaInvite');
  credits = await import('../src/services/creditStore');
  betaStore = await import('../src/services/betaApplicationStore');
  adminStore = await import('../src/services/adminStore');
});

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('beta invite flow', () => {
  it('creates an invited account, grants 50 credits once, and accepts a password', async () => {
    const first = await invite.inviteBetaUser({
      email: 'beta-designer@example.com',
      name: 'Beta Designer',
      actorEmail: 'admin@example.com',
    });
    expect(first.creditsGranted).toBe(true);
    expect(first.balance).toBe(50);
    expect(first.alreadyActive).toBe(false);
    expect(first.developmentInviteUrl).toContain('/accept-invite?token=');
    expect(await auth.authenticateEmailAccount('beta-designer@example.com', 'anything-long')).toBeNull();

    const token = new URL(first.developmentInviteUrl!).searchParams.get('token');
    expect(token).toBeTruthy();
    const accepted = await auth.acceptInvite(token!, 'correct-horse-battery');
    expect(accepted?.emailVerified).toBe(true);
    expect(await auth.authenticateEmailAccount('beta-designer@example.com', 'correct-horse-battery')).not.toBeNull();

    const second = await invite.inviteBetaUser({
      email: 'beta-designer@example.com',
      actorEmail: 'admin@example.com',
    });
    expect(second.creditsGranted).toBe(false);
    expect(second.balance).toBe(50);
    expect(second.alreadyActive).toBe(true);
    expect(credits.getBalance(first.account.sub)).toBe(50);
  });

  it('marks applications approved when inviting by email', async () => {
    betaStore.createBetaApplication({
      name: 'Applicant',
      email: 'applicant@example.com',
      instagramHandle: '@applicant',
      audienceSize: '',
      contentFocus: '',
      patternRightsConfirmed: false,
      patternToTranslate: '',
      targetLanguageMarket: '',
      salesChannels: '',
      promotionPlan: '',
      testingInterest: '',
      promotionConfirmed: true,
      utmSource: '',
      utmMedium: '',
      utmCampaign: '',
      utmContent: '',
      utmTerm: '',
      landingPage: '',
      referrer: '',
    });

    await invite.inviteBetaUser({
      email: 'applicant@example.com',
      name: 'Applicant',
      actorEmail: 'admin@example.com',
    });

    expect(betaStore.hasActiveBetaAccess('applicant@example.com')).toBe(true);
    const apps = betaStore.listBetaApplications('approved');
    expect(apps.some((app) => app.email === 'applicant@example.com')).toBe(true);
  });
});

describe('admin member sorting', () => {
  it('sorts members by balance, email, revenue, and joined date', async () => {
    const Database = (await import('better-sqlite3')).default;
    // adminStore ATTACHes patterns.db; ensure the tables the member query expects exist.
    const patternsDb = new Database(path.join(dataDir, 'patterns.db'));
    patternsDb.exec(`
      CREATE TABLE IF NOT EXISTS patterns (
        id TEXT PRIMARY KEY, sub TEXT NOT NULL, timestamp INTEGER, file_name TEXT,
        file_type TEXT, source_language TEXT, target_language TEXT, cost REAL DEFAULT 0,
        source_size INTEGER, thumb_size INTEGER
      );
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY, sub TEXT NOT NULL, created_at INTEGER
      );
    `);
    patternsDb.close();

    adminStore.adjustMemberCredits('sort-low', 10, 'seed', 'admin@example.com', 'low@example.com');
    // Ensure a later joinedAt for the high-balance member.
    await new Promise((resolve) => setTimeout(resolve, 5));
    adminStore.adjustMemberCredits('sort-high', 80, 'seed', 'admin@example.com', 'high@example.com');

    const byBalanceAsc = adminStore.listAdminMembers({ sort: 'balance', dir: 'asc' });
    const lowIndex = byBalanceAsc.findIndex((m) => m.sub === 'sort-low');
    const highIndex = byBalanceAsc.findIndex((m) => m.sub === 'sort-high');
    expect(lowIndex).toBeGreaterThanOrEqual(0);
    expect(highIndex).toBeGreaterThanOrEqual(0);
    expect(lowIndex).toBeLessThan(highIndex);

    const byBalanceDesc = adminStore.listAdminMembers({ sort: 'balance', dir: 'desc' });
    expect(byBalanceDesc.findIndex((m) => m.sub === 'sort-high')).toBeLessThan(
      byBalanceDesc.findIndex((m) => m.sub === 'sort-low'),
    );

    const byEmailAsc = adminStore.listAdminMembers({ sort: 'email', dir: 'asc' });
    expect(byEmailAsc.findIndex((m) => m.sub === 'sort-high')).toBeLessThan(
      byEmailAsc.findIndex((m) => m.sub === 'sort-low'),
    );

    const byJoinedAsc = adminStore.listAdminMembers({ sort: 'joinedAt', dir: 'asc' });
    expect(byJoinedAsc.findIndex((m) => m.sub === 'sort-low')).toBeLessThan(
      byJoinedAsc.findIndex((m) => m.sub === 'sort-high'),
    );

    const high = adminStore.listAdminMembers({ query: 'high@example.com' })[0];
    expect(high?.joinedAt).toBeTruthy();
    expect(high?.revenueCents).toBe(0);
  });
});

describe('approved beta no longer bypasses credits', () => {
  it('keeps betaAccess as a badge flag without implying free usage', () => {
    expect(betaStore.hasActiveBetaAccess('beta-designer@example.com')).toBe(true);
    // Billing routes no longer call hasActiveBetaAccess for cost=0; balances remain authoritative.
    expect(credits.getBalance(
      auth.findEmailAccountByEmail('beta-designer@example.com')!.sub,
    )).toBe(50);
  });
});
