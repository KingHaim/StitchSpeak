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
  CREATE TABLE IF NOT EXISTS rate_limit_buckets (
    key_hash TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    reset_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_expiry ON rate_limit_buckets(reset_at)
`);

export interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const keyHash = (key: string) => crypto.createHash('sha256').update(key).digest('hex');

const incrementTransaction = db.transaction((key: string, windowMs: number, now: number): RateLimitBucket => {
  const hashed = keyHash(key);
  const existing = db.prepare('SELECT count, reset_at FROM rate_limit_buckets WHERE key_hash = ?')
    .get(hashed) as { count: number; reset_at: number } | undefined;

  if (!existing || existing.reset_at <= now) {
    const resetAt = now + windowMs;
    db.prepare(`
      INSERT INTO rate_limit_buckets(key_hash, count, reset_at) VALUES(?, 1, ?)
      ON CONFLICT(key_hash) DO UPDATE SET count = 1, reset_at = excluded.reset_at
    `).run(hashed, resetAt);
    return { count: 1, resetAt };
  }

  const count = existing.count + 1;
  db.prepare('UPDATE rate_limit_buckets SET count = ? WHERE key_hash = ?').run(count, hashed);
  return { count, resetAt: existing.reset_at };
});

export function incrementRateLimit(key: string, windowMs: number, now = Date.now()): RateLimitBucket {
  return incrementTransaction(key, windowMs, now);
}

export function cleanupExpiredRateLimits(now = Date.now()): number {
  return db.prepare('DELETE FROM rate_limit_buckets WHERE reset_at <= ?').run(now).changes;
}
