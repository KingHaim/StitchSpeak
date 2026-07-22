/**
 * Seed a verified email/password account for local development.
 *
 * Usage (from server/):
 *   npm run seed:local-user
 *
 * Default credentials (override with env):
 *   LOCAL_DEV_EMAIL=local@stitchspeak.test
 *   LOCAL_DEV_PASSWORD=LocalDev123!
 *   LOCAL_DEV_NAME=Local Tester
 *   LOCAL_DEV_CREDITS=100
 */
import {
  createEmailAccount,
  deleteEmailAccount,
  findEmailAccountByEmail,
  issueVerificationToken,
  verifyEmailToken,
} from '../services/emailAuth.js';
import { addCredits, getBalance } from '../services/creditStore.js';
import { hasActiveBetaAccess, markBetaInvite } from '../services/betaApplicationStore.js';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed a local user in production.');
  process.exit(1);
}

const email = (process.env.LOCAL_DEV_EMAIL ?? 'local@stitchspeak.test').trim().toLowerCase();
const password = process.env.LOCAL_DEV_PASSWORD ?? 'LocalDev123!';
const name = process.env.LOCAL_DEV_NAME ?? 'Local Tester';
const credits = Number(process.env.LOCAL_DEV_CREDITS ?? '100');

if (password.length < 10) {
  console.error('LOCAL_DEV_PASSWORD must be at least 10 characters.');
  process.exit(1);
}

const existing = findEmailAccountByEmail(email);
if (existing) {
  deleteEmailAccount(existing.sub);
  console.log(`Removed existing account for ${email}`);
}

const account = await createEmailAccount(email, password, name);
const verified = verifyEmailToken(issueVerificationToken(account));
if (!verified?.emailVerified) {
  console.error('Failed to mark the local account as verified.');
  process.exit(1);
}

// Unlock tech edit, grading, and other invite-only beta gates.
markBetaInvite(verified.email, verified.sub, true);

if (Number.isFinite(credits) && credits > 0) {
  addCredits(verified.sub, credits, verified.email, {
    kind: 'local_seed',
    reference: 'seed:local-user',
  });
}

console.log(`
Local test account ready.

  Email:       ${email}
  Password:    ${password}
  Name:        ${name}
  Credits:     ${getBalance(verified.sub)}
  Beta access: ${hasActiveBetaAccess(email) ? 'yes' : 'no'}

Sign in on the app with email/password (not Google).
`);
