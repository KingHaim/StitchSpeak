import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'beta-applications.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS beta_applications (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    source_language TEXT NOT NULL,
    target_language TEXT NOT NULL,
    pattern_type TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    personal_use_confirmed INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL
  )
`);

const insertApplication = db.prepare(`
  INSERT INTO beta_applications (
    id, name, email, source_language, target_language, pattern_type,
    note, personal_use_confirmed, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

export type BetaApplication = {
  name: string;
  email: string;
  sourceLanguage: string;
  targetLanguage: string;
  patternType: string;
  note: string;
  personalUseConfirmed: boolean;
};

export function createBetaApplication(input: BetaApplication): {
  id: string;
  created: boolean;
} {
  const id = crypto.randomUUID();
  try {
    insertApplication.run(
      id,
      input.name,
      input.email.toLowerCase(),
      input.sourceLanguage,
      input.targetLanguage,
      input.patternType,
      input.note,
      input.personalUseConfirmed ? 1 : 0,
      new Date().toISOString(),
    );
    return { id, created: true };
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      return { id: '', created: false };
    }
    throw error;
  }
}
