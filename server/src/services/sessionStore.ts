import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'auth.db'));
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.exec(`
  CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash TEXT PRIMARY KEY,
    sub TEXT NOT NULL,
    user_json TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_auth_sessions_sub ON auth_sessions(sub);
  CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at)
`);

export interface SessionIdentity {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
  identityProvider: 'google' | 'email';
  emailVerified: boolean;
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export function createSession(identity: SessionIdentity, now = Date.now()): string {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO auth_sessions(token_hash,sub,user_json,expires_at,created_at) VALUES(?,?,?,?,?)')
    .run(hash(token), identity.sub, JSON.stringify(identity), now + SESSION_TTL_MS, now);
  db.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').run(now);
  return token;
}

export function cleanupExpiredSessions(now = Date.now()): number {
  return db.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').run(now).changes;
}

export function verifySession(token: string): SessionIdentity | null {
  const row = db.prepare('SELECT user_json, expires_at FROM auth_sessions WHERE token_hash = ?')
    .get(hash(token)) as { user_json: string; expires_at: number } | undefined;
  if (!row || row.expires_at <= Date.now()) {
    if (row) db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(hash(token));
    return null;
  }
  try { return JSON.parse(row.user_json) as SessionIdentity; } catch { return null; }
}

export function revokeSession(token: string): void {
  db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(hash(token));
}

export function revokeAllSessionsForSub(sub: string): void {
  db.prepare('DELETE FROM auth_sessions WHERE sub = ?').run(sub);
}
