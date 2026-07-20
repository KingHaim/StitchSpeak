import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { TechEditReport } from './techEditMath.js';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'techedits.db'));
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS tech_edits (
    id         TEXT PRIMARY KEY,
    sub        TEXT NOT NULL,
    timestamp  INTEGER NOT NULL,
    file_name  TEXT NOT NULL,
    pages      INTEGER NOT NULL DEFAULT 0,
    cost       REAL NOT NULL DEFAULT 0,
    report     TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_tech_edits_sub_ts ON tech_edits(sub, timestamp DESC);
`);

const MAX_RECORDS_PER_USER = 50;
const MAX_REPORT_BYTES = 2 * 1024 * 1024;

const stmts = {
  list: db.prepare<[string]>(`
    SELECT id, timestamp, file_name, pages, cost
    FROM tech_edits WHERE sub = ? ORDER BY timestamp DESC
  `),
  getOne: db.prepare<[string, string]>(`
    SELECT id, timestamp, file_name, pages, cost, report
    FROM tech_edits WHERE sub = ? AND id = ?
  `),
  insert: db.prepare<[string, string, number, string, number, number, string]>(`
    INSERT INTO tech_edits (id, sub, timestamp, file_name, pages, cost, report)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  countForUser: db.prepare<[string]>('SELECT COUNT(*) AS count FROM tech_edits WHERE sub = ?'),
  evictOldest: db.prepare<[string, number]>(`
    DELETE FROM tech_edits WHERE id IN (
      SELECT id FROM tech_edits WHERE sub = ? ORDER BY timestamp ASC LIMIT ?
    )
  `),
  deleteOne: db.prepare<[string, string]>('DELETE FROM tech_edits WHERE sub = ? AND id = ?'),
  deleteAllForUser: db.prepare<[string]>('DELETE FROM tech_edits WHERE sub = ?'),
} as const;

export interface TechEditRecord {
  id: string;
  timestamp: number;
  fileName: string;
  pages: number;
  cost: number;
}

export interface TechEditRecordWithReport extends TechEditRecord {
  report: TechEditReport;
}

interface RawRow {
  id: string;
  timestamp: number;
  file_name: string;
  pages: number;
  cost: number;
  report?: string;
}

function rowToRecord(row: RawRow): TechEditRecord {
  return {
    id: row.id,
    timestamp: row.timestamp,
    fileName: row.file_name,
    pages: row.pages,
    cost: row.cost,
  };
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function listTechEdits(sub: string): TechEditRecord[] {
  return (stmts.list.all(sub) as RawRow[]).map(rowToRecord);
}

export function getTechEdit(sub: string, id: string): TechEditRecordWithReport | null {
  const row = stmts.getOne.get(sub, id) as RawRow | undefined;
  if (!row) return null;
  let report: TechEditReport;
  try {
    report = JSON.parse(row.report ?? '') as TechEditReport;
  } catch {
    return null;
  }
  return { ...rowToRecord(row), report };
}

const saveTx = db.transaction(
  (sub: string, fileName: string, pages: number, cost: number, reportJson: string): TechEditRecord => {
    const id = generateId();
    const timestamp = Date.now();
    stmts.insert.run(id, sub, timestamp, fileName, pages, cost, reportJson);

    const countRow = stmts.countForUser.get(sub) as { count: number };
    if (countRow.count > MAX_RECORDS_PER_USER) {
      stmts.evictOldest.run(sub, countRow.count - MAX_RECORDS_PER_USER);
    }
    return { id, timestamp, fileName, pages, cost };
  },
);

export function saveTechEdit(
  sub: string,
  input: { fileName: string; pages: number; cost: number; report: TechEditReport },
): TechEditRecord {
  const reportJson = JSON.stringify(input.report);
  if (reportJson.length > MAX_REPORT_BYTES) {
    throw new Error('Tech edit report is too large to store.');
  }
  return saveTx(sub, input.fileName.slice(0, 255), input.pages, input.cost, reportJson);
}

export function deleteTechEdit(sub: string, id: string): boolean {
  return stmts.deleteOne.run(sub, id).changes > 0;
}

export function deleteAllTechEdits(sub: string): number {
  return stmts.deleteAllForUser.run(sub).changes;
}
