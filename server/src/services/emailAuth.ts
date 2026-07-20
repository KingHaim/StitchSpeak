import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'auth.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS email_accounts (
    sub TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT,
    password_hash TEXT NOT NULL,
    email_verified INTEGER NOT NULL DEFAULT 0,
    session_version INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS email_auth_tokens (
    token_hash TEXT PRIMARY KEY,
    sub TEXT NOT NULL,
    purpose TEXT NOT NULL CHECK (purpose IN ('verify', 'reset', 'invite')),
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_email_auth_tokens_sub ON email_auth_tokens(sub, purpose)
`);

const accountColumns = new Set(
  (db.prepare('PRAGMA table_info(email_accounts)').all() as Array<{ name: string }>).map((row) => row.name),
);
// Accounts created before verification existed are grandfathered in. New
// inserts explicitly set email_verified=0.
if (!accountColumns.has('email_verified')) {
  db.exec('ALTER TABLE email_accounts ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1');
}
if (!accountColumns.has('session_version')) {
  db.exec('ALTER TABLE email_accounts ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0');
}

// Older DBs only allowed verify|reset; recreate so invite tokens are valid.
const tokenTableSql = (
  db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'email_auth_tokens'`).get() as
    | { sql: string }
    | undefined
)?.sql ?? '';
if (tokenTableSql && !tokenTableSql.includes("'invite'")) {
  db.exec(`
    CREATE TABLE email_auth_tokens_new (
      token_hash TEXT PRIMARY KEY,
      sub TEXT NOT NULL,
      purpose TEXT NOT NULL CHECK (purpose IN ('verify', 'reset', 'invite')),
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    INSERT INTO email_auth_tokens_new (token_hash, sub, purpose, expires_at, created_at)
      SELECT token_hash, sub, purpose, expires_at, created_at FROM email_auth_tokens;
    DROP TABLE email_auth_tokens;
    ALTER TABLE email_auth_tokens_new RENAME TO email_auth_tokens;
    CREATE INDEX IF NOT EXISTS idx_email_auth_tokens_sub ON email_auth_tokens(sub, purpose);
  `);
}

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const SCRYPT_KEY_LENGTH = 64;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
type AuthTokenPurpose = 'verify' | 'reset' | 'invite';

export interface EmailAccount {
  sub: string;
  email: string;
  name?: string;
  emailVerified: boolean;
  sessionVersion: number;
}

function sessionSecret(): string {
  const configured = process.env.AUTH_SESSION_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SESSION_SECRET is required in production.');
  }
  return 'stitchspeak-local-development-secret-change-me';
}

function encode(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function hashPassword(password: string, salt = crypto.randomBytes(16)): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT_KEY_LENGTH, (err, key) => {
      if (err) reject(err);
      else resolve(`scrypt:${encode(salt)}:${encode(key)}`);
    });
  });
}

async function passwordMatches(password: string, stored: string): Promise<boolean> {
  const [algorithm, salt, expected] = stored.split(':');
  if (algorithm !== 'scrypt' || !salt || !expected) return false;
  const actual = await hashPassword(password, Buffer.from(salt, 'base64url'));
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(stored));
}

function publicAccount(row: Record<string, unknown>): EmailAccount {
  return {
    sub: String(row.sub),
    email: String(row.email),
    ...(row.name ? { name: String(row.name) } : {}),
    emailVerified: Number(row.email_verified) === 1,
    sessionVersion: Number(row.session_version) || 0,
  };
}

export async function createEmailAccount(email: string, password: string, name?: string): Promise<EmailAccount> {
  const normalizedEmail = email.trim().toLowerCase();
  const cleanName = name?.trim().slice(0, 80) || undefined;
  const passwordHash = await hashPassword(password);
  const sub = `email:${crypto.randomUUID()}`;
  try {
    db.prepare('INSERT INTO email_accounts(sub,email,name,password_hash,email_verified,session_version,created_at) VALUES(?,?,?,?,0,0,?)')
      .run(sub, normalizedEmail, cleanName ?? null, passwordHash, Date.now());
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE')) throw new Error('EMAIL_EXISTS', { cause: err });
    throw err;
  }
  return { sub, email: normalizedEmail, ...(cleanName ? { name: cleanName } : {}), emailVerified: false, sessionVersion: 0 };
}

export function findEmailAccountByEmail(email: string): EmailAccount | null {
  const row = db.prepare('SELECT * FROM email_accounts WHERE email = ?').get(email.trim().toLowerCase()) as Record<string, unknown> | undefined;
  return row ? publicAccount(row) : null;
}

/** True when the account still needs to accept an invite (no usable password yet). */
export function emailAccountNeedsPassword(email: string): boolean {
  const row = db.prepare('SELECT password_hash FROM email_accounts WHERE email = ?')
    .get(email.trim().toLowerCase()) as { password_hash: string | null } | undefined;
  if (!row) return false;
  const hash = row.password_hash == null ? '' : String(row.password_hash);
  return hash.length === 0;
}

/**
 * Create an invited account with no password. The user sets one via the invite link.
 * Empty password_hash is intentional — login rejects it until acceptInvite runs.
 */
export function createInvitedEmailAccount(email: string, name?: string): EmailAccount {
  const normalizedEmail = email.trim().toLowerCase();
  const cleanName = name?.trim().slice(0, 80) || undefined;
  const sub = `email:${crypto.randomUUID()}`;
  try {
    db.prepare('INSERT INTO email_accounts(sub,email,name,password_hash,email_verified,session_version,created_at) VALUES(?,?,?,?,0,0,?)')
      .run(sub, normalizedEmail, cleanName ?? null, '', Date.now());
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE')) throw new Error('EMAIL_EXISTS', { cause: err });
    throw err;
  }
  return { sub, email: normalizedEmail, ...(cleanName ? { name: cleanName } : {}), emailVerified: false, sessionVersion: 0 };
}

export async function authenticateEmailAccount(email: string, password: string): Promise<EmailAccount | null> {
  const row = db.prepare('SELECT * FROM email_accounts WHERE email = ?').get(email.trim().toLowerCase()) as Record<string, unknown> | undefined;
  if (!row) return null;
  const stored = row.password_hash == null ? '' : String(row.password_hash);
  if (!stored || !(await passwordMatches(password, stored))) return null;
  return publicAccount(row);
}

export function signEmailSession(account: EmailAccount): string {
  const header = encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = encode(JSON.stringify({
    iss: 'stitchspeak', sub: account.sub, email: account.email, name: account.name,
    sv: account.sessionVersion,
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  }));
  const signature = crypto.createHmac('sha256', sessionSecret()).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

export function verifyEmailSession(token: string): EmailAccount | null {
  const [header, payload, signature] = token.split('.');
  if (!header || !payload || !signature) return null;
  const expected = crypto.createHmac('sha256', sessionSecret()).update(`${header}.${payload}`).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (claims.iss !== 'stitchspeak' || typeof claims.sub !== 'string' || typeof claims.email !== 'string' || Number(claims.exp) <= Date.now() / 1000) return null;
    const row = db.prepare('SELECT * FROM email_accounts WHERE sub = ?').get(claims.sub) as Record<string, unknown> | undefined;
    if (!row) return null;
    const account = publicAccount(row);
    if (!account.emailVerified || Number(claims.sv) !== account.sessionVersion) return null;
    return account;
  } catch {
    return null;
  }
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function issueToken(sub: string, purpose: AuthTokenPurpose, ttlMs: number): string {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM email_auth_tokens WHERE sub = ? AND purpose = ?').run(sub, purpose);
    db.prepare('INSERT INTO email_auth_tokens(token_hash,sub,purpose,expires_at,created_at) VALUES(?,?,?,?,?)')
      .run(hashToken(token), sub, purpose, now + ttlMs, now);
  });
  tx();
  return token;
}

export function issueVerificationToken(account: EmailAccount): string {
  return issueToken(account.sub, 'verify', VERIFY_TTL_MS);
}

export function issueInviteToken(account: EmailAccount): string {
  return issueToken(account.sub, 'invite', INVITE_TTL_MS);
}

export function issuePasswordResetToken(email: string): { account: EmailAccount; token: string } | null {
  const row = db.prepare('SELECT * FROM email_accounts WHERE email = ?').get(email.trim().toLowerCase()) as Record<string, unknown> | undefined;
  if (!row) return null;
  const stored = row.password_hash == null ? '' : String(row.password_hash);
  // Invited accounts without a password use the invite flow, not password reset.
  if (!stored) return null;
  const account = publicAccount(row);
  return { account, token: issueToken(account.sub, 'reset', RESET_TTL_MS) };
}

function consumeToken(token: string, purpose: AuthTokenPurpose): { sub: string } | null {
  const row = db.prepare('SELECT sub, expires_at FROM email_auth_tokens WHERE token_hash = ? AND purpose = ?')
    .get(hashToken(token), purpose) as { sub: string; expires_at: number } | undefined;
  if (!row || row.expires_at <= Date.now()) {
    if (row) db.prepare('DELETE FROM email_auth_tokens WHERE token_hash = ?').run(hashToken(token));
    return null;
  }
  db.prepare('DELETE FROM email_auth_tokens WHERE token_hash = ?').run(hashToken(token));
  return { sub: row.sub };
}

export function verifyEmailToken(token: string): EmailAccount | null {
  const consumed = consumeToken(token, 'verify');
  if (!consumed) return null;
  db.prepare('UPDATE email_accounts SET email_verified = 1 WHERE sub = ?').run(consumed.sub);
  const row = db.prepare('SELECT * FROM email_accounts WHERE sub = ?').get(consumed.sub) as Record<string, unknown> | undefined;
  return row ? publicAccount(row) : null;
}

export async function resetPasswordWithToken(token: string, password: string): Promise<boolean> {
  const consumed = consumeToken(token, 'reset');
  if (!consumed) return false;
  const passwordHash = await hashPassword(password);
  const result = db.prepare('UPDATE email_accounts SET password_hash = ?, session_version = session_version + 1 WHERE sub = ?')
    .run(passwordHash, consumed.sub);
  db.prepare('DELETE FROM email_auth_tokens WHERE sub = ?').run(consumed.sub);
  return result.changes === 1;
}

export async function acceptInvite(token: string, password: string): Promise<EmailAccount | null> {
  const consumed = consumeToken(token, 'invite');
  if (!consumed) return null;
  const passwordHash = await hashPassword(password);
  const result = db.prepare(
    'UPDATE email_accounts SET password_hash = ?, email_verified = 1, session_version = session_version + 1 WHERE sub = ?',
  ).run(passwordHash, consumed.sub);
  if (result.changes !== 1) return null;
  db.prepare('DELETE FROM email_auth_tokens WHERE sub = ?').run(consumed.sub);
  const row = db.prepare('SELECT * FROM email_accounts WHERE sub = ?').get(consumed.sub) as Record<string, unknown> | undefined;
  return row ? publicAccount(row) : null;
}

export function deleteEmailAccount(sub: string): boolean {
  return db.transaction(() => {
    db.prepare('DELETE FROM email_auth_tokens WHERE sub = ?').run(sub);
    return db.prepare('DELETE FROM email_accounts WHERE sub = ?').run(sub).changes === 1;
  })();
}

export function cleanupExpiredEmailAuthTokens(now = Date.now()): number {
  return db.prepare('DELETE FROM email_auth_tokens WHERE expires_at <= ?').run(now).changes;
}
