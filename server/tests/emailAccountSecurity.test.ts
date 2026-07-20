import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stitchspeak-email-security-test-'));
process.env.DATA_DIR = dataDir;
process.env.AUTH_SESSION_SECRET = 'test-session-secret-with-enough-entropy';

let auth: typeof import('../src/services/emailAuth');

beforeAll(async () => {
  auth = await import('../src/services/emailAuth');
});

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('email account security', () => {
  it('requires a single-use verification token before sessions are accepted', async () => {
    const account = await auth.createEmailAccount('maker@example.com', 'correct-horse-battery');
    expect(account.emailVerified).toBe(false);

    const unverifiedSession = auth.signEmailSession(account);
    expect(auth.verifyEmailSession(unverifiedSession)).toBeNull();

    const token = auth.issueVerificationToken(account);
    const verified = auth.verifyEmailToken(token);
    expect(verified?.emailVerified).toBe(true);
    expect(auth.verifyEmailToken(token)).toBeNull();

    const session = auth.signEmailSession(verified!);
    expect(auth.verifyEmailSession(session)?.email).toBe('maker@example.com');
  });

  it('revokes existing sessions after a password reset', async () => {
    const account = await auth.authenticateEmailAccount('maker@example.com', 'correct-horse-battery');
    expect(account).not.toBeNull();
    const oldSession = auth.signEmailSession(account!);

    const reset = auth.issuePasswordResetToken('maker@example.com');
    expect(reset).not.toBeNull();
    expect(await auth.resetPasswordWithToken(reset!.token, 'a-brand-new-password')).toBe(true);
    expect(await auth.resetPasswordWithToken(reset!.token, 'another-password')).toBe(false);
    expect(auth.verifyEmailSession(oldSession)).toBeNull();
    expect(await auth.authenticateEmailAccount('maker@example.com', 'correct-horse-battery')).toBeNull();
    expect(await auth.authenticateEmailAccount('maker@example.com', 'a-brand-new-password')).not.toBeNull();
  });

  it('removes credentials, tokens, and active sessions when an account is deleted', async () => {
    const account = await auth.createEmailAccount('delete-me@example.com', 'correct-horse-battery');
    const verified = auth.verifyEmailToken(auth.issueVerificationToken(account));
    const session = auth.signEmailSession(verified!);
    auth.issuePasswordResetToken(account.email);

    expect(auth.deleteEmailAccount(account.sub)).toBe(true);
    expect(auth.deleteEmailAccount(account.sub)).toBe(false);
    expect(auth.verifyEmailSession(session)).toBeNull();
    expect(await auth.authenticateEmailAccount(account.email, 'correct-horse-battery')).toBeNull();
  });

  it('supports invite tokens that set a password and verify the account', async () => {
    const invited = auth.createInvitedEmailAccount('invitee@example.com', 'Invitee');
    expect(auth.emailAccountNeedsPassword('invitee@example.com')).toBe(true);
    expect(await auth.authenticateEmailAccount('invitee@example.com', 'anything-long-enough')).toBeNull();

    const token = auth.issueInviteToken(invited);
    const accepted = await auth.acceptInvite(token, 'invite-password-ok');
    expect(accepted?.emailVerified).toBe(true);
    expect(auth.emailAccountNeedsPassword('invitee@example.com')).toBe(false);
    expect(await auth.authenticateEmailAccount('invitee@example.com', 'invite-password-ok')).not.toBeNull();
    expect(await auth.acceptInvite(token, 'another-password')).toBeNull();
  });
});
