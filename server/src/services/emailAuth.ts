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
    created_at INTEGER NOT NULL
  )
`);

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const SCRYPT_KEY_LENGTH = 64;

export interface EmailAccount {
  sub: string;
  email: string;
  name?: string;
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
  };
}

export async function createEmailAccount(email: string, password: string, name?: string): Promise<EmailAccount> {
  const normalizedEmail = email.trim().toLowerCase();
  const cleanName = name?.trim().slice(0, 80) || undefined;
  const passwordHash = await hashPassword(password);
  const sub = `email:${crypto.randomUUID()}`;
  try {
    db.prepare('INSERT INTO email_accounts(sub,email,name,password_hash,created_at) VALUES(?,?,?,?,?)')
      .run(sub, normalizedEmail, cleanName ?? null, passwordHash, Date.now());
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE')) throw new Error('EMAIL_EXISTS', { cause: err });
    throw err;
  }
  return { sub, email: normalizedEmail, ...(cleanName ? { name: cleanName } : {}) };
}

export async function authenticateEmailAccount(email: string, password: string): Promise<EmailAccount | null> {
  const row = db.prepare('SELECT * FROM email_accounts WHERE email = ?').get(email.trim().toLowerCase()) as Record<string, unknown> | undefined;
  if (!row || !(await passwordMatches(password, String(row.password_hash)))) return null;
  return publicAccount(row);
}

export function signEmailSession(account: EmailAccount): string {
  const header = encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = encode(JSON.stringify({
    iss: 'stitchspeak', sub: account.sub, email: account.email, name: account.name,
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
    return { sub: claims.sub, email: claims.email, ...(typeof claims.name === 'string' ? { name: claims.name } : {}) };
  } catch {
    return null;
  }
}
