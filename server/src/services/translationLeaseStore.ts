import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'credits.db'));
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.exec(`
  CREATE TABLE IF NOT EXISTS translation_leases (
    sub TEXT PRIMARY KEY,
    lease_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_translation_leases_expiry ON translation_leases(expires_at)
`);

const LEASE_TTL_MS = 7 * 60 * 1000;

export function acquireTranslationLease(sub: string, now = Date.now()): string | null {
  return db.transaction(() => {
    db.prepare('DELETE FROM translation_leases WHERE expires_at <= ?').run(now);
    const leaseId = crypto.randomUUID();
    const result = db.prepare(
      'INSERT OR IGNORE INTO translation_leases(sub,lease_id,expires_at,created_at) VALUES(?,?,?,?)',
    ).run(sub, leaseId, now + LEASE_TTL_MS, now);
    return result.changes === 1 ? leaseId : null;
  })();
}

export function renewTranslationLease(sub: string, leaseId: string, now = Date.now()): boolean {
  return db.prepare('UPDATE translation_leases SET expires_at = ? WHERE sub = ? AND lease_id = ?')
    .run(now + LEASE_TTL_MS, sub, leaseId).changes === 1;
}

export function releaseTranslationLease(sub: string, leaseId: string): void {
  db.prepare('DELETE FROM translation_leases WHERE sub = ? AND lease_id = ?').run(sub, leaseId);
}

export function cleanupExpiredTranslationLeases(now = Date.now()): number {
  return db.prepare('DELETE FROM translation_leases WHERE expires_at <= ?').run(now).changes;
}
