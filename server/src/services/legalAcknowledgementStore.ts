import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'auth.db'));
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.exec(`
  CREATE TABLE IF NOT EXISTS legal_acknowledgements (
    sub TEXT NOT NULL,
    notice_version TEXT NOT NULL,
    accepted_at INTEGER NOT NULL,
    PRIMARY KEY(sub, notice_version)
  )
`);

export const AI_NOTICE_VERSION = 'ai-processing-2026-07-08';

export function recordAiProcessingAcknowledgement(sub: string): void {
  db.prepare(`
    INSERT INTO legal_acknowledgements(sub, notice_version, accepted_at)
    VALUES(?, ?, ?)
    ON CONFLICT(sub, notice_version) DO UPDATE SET accepted_at = excluded.accepted_at
  `).run(sub, AI_NOTICE_VERSION, Date.now());
}

export function listLegalAcknowledgements(sub: string): Array<{ noticeVersion: string; acceptedAt: number }> {
  return (db.prepare('SELECT notice_version, accepted_at FROM legal_acknowledgements WHERE sub = ? ORDER BY accepted_at')
    .all(sub) as Array<{ notice_version: string; accepted_at: number }>).map((row) => ({
      noticeVersion: row.notice_version,
      acceptedAt: row.accepted_at,
    }));
}

export function deleteLegalAcknowledgements(sub: string): void {
  db.prepare('DELETE FROM legal_acknowledgements WHERE sub = ?').run(sub);
}
