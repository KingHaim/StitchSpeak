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

  -- One row per finding the user acted on (tick = applied, cross = dismissed).
  -- This doubles as the learning signal for future tech edits.
  CREATE TABLE IF NOT EXISTS tech_edit_feedback (
    sub         TEXT NOT NULL,
    report_id   TEXT NOT NULL,
    finding_idx INTEGER NOT NULL,
    category    TEXT NOT NULL,
    severity    TEXT NOT NULL,
    verified    INTEGER NOT NULL DEFAULT 0,
    title       TEXT NOT NULL,
    resolution  TEXT NOT NULL,
    timestamp   INTEGER NOT NULL,
    PRIMARY KEY (sub, report_id, finding_idx)
  );
  CREATE INDEX IF NOT EXISTS idx_tech_edit_feedback_sub ON tech_edit_feedback(sub, timestamp DESC);
`);

// Migration: per-report resolution map (finding index -> 'applied' | 'dismissed').
const hasResolutionsColumn = (db.pragma('table_info(tech_edits)') as Array<{ name: string }>).some(
  (col) => col.name === 'resolutions',
);
if (!hasResolutionsColumn) {
  db.exec(`ALTER TABLE tech_edits ADD COLUMN resolutions TEXT NOT NULL DEFAULT '{}'`);
}

const MAX_RECORDS_PER_USER = 50;
const MAX_REPORT_BYTES = 2 * 1024 * 1024;

const stmts = {
  list: db.prepare<[string]>(`
    SELECT id, timestamp, file_name, pages, cost
    FROM tech_edits WHERE sub = ? ORDER BY timestamp DESC
  `),
  getOne: db.prepare<[string, string]>(`
    SELECT id, timestamp, file_name, pages, cost, report, resolutions
    FROM tech_edits WHERE sub = ? AND id = ?
  `),
  updateResolutions: db.prepare<[string, string, string]>(`
    UPDATE tech_edits SET resolutions = ? WHERE sub = ? AND id = ?
  `),
  upsertFeedback: db.prepare<[string, string, number, string, string, number, string, string, number]>(`
    INSERT INTO tech_edit_feedback (sub, report_id, finding_idx, category, severity, verified, title, resolution, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(sub, report_id, finding_idx)
    DO UPDATE SET resolution = excluded.resolution, timestamp = excluded.timestamp
  `),
  deleteFeedback: db.prepare<[string, string, number]>(`
    DELETE FROM tech_edit_feedback WHERE sub = ? AND report_id = ? AND finding_idx = ?
  `),
  deleteFeedbackForReport: db.prepare<[string, string]>(`
    DELETE FROM tech_edit_feedback WHERE sub = ? AND report_id = ?
  `),
  deleteFeedbackForUser: db.prepare<[string]>('DELETE FROM tech_edit_feedback WHERE sub = ?'),
  feedbackStats: db.prepare<[string]>(`
    SELECT category, resolution, COUNT(*) AS count
    FROM tech_edit_feedback WHERE sub = ?
    GROUP BY category, resolution
  `),
  recentDismissedTitles: db.prepare<[string, string]>(`
    SELECT title FROM tech_edit_feedback
    WHERE sub = ? AND resolution = 'dismissed' AND category = ?
    ORDER BY timestamp DESC LIMIT 3
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

export type TechEditResolution = 'applied' | 'dismissed';
export type TechEditResolutionMap = Record<string, TechEditResolution>;

export interface TechEditRecordWithReport extends TechEditRecord {
  report: TechEditReport;
  resolutions: TechEditResolutionMap;
}

interface RawRow {
  id: string;
  timestamp: number;
  file_name: string;
  pages: number;
  cost: number;
  report?: string;
  resolutions?: string;
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

function parseResolutions(raw: string | undefined): TechEditResolutionMap {
  try {
    const parsed = JSON.parse(raw || '{}') as Record<string, unknown>;
    const map: TechEditResolutionMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value === 'applied' || value === 'dismissed') map[key] = value;
    }
    return map;
  } catch {
    return {};
  }
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
  return { ...rowToRecord(row), report, resolutions: parseResolutions(row.resolutions) };
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
  stmts.deleteFeedbackForReport.run(sub, id);
  return stmts.deleteOne.run(sub, id).changes > 0;
}

export function deleteAllTechEdits(sub: string): number {
  stmts.deleteFeedbackForUser.run(sub);
  return stmts.deleteAllForUser.run(sub).changes;
}

// --- Finding resolutions & learning signal ---

const setResolutionTx = db.transaction(
  (
    sub: string,
    id: string,
    findingIdx: number,
    resolution: TechEditResolution | null,
  ): TechEditResolutionMap | null => {
    const record = getTechEdit(sub, id);
    if (!record) return null;
    const finding = record.report.findings[findingIdx];
    if (!finding) return null;

    const resolutions = { ...record.resolutions };
    if (resolution === null) {
      delete resolutions[String(findingIdx)];
      stmts.deleteFeedback.run(sub, id, findingIdx);
    } else {
      resolutions[String(findingIdx)] = resolution;
      stmts.upsertFeedback.run(
        sub,
        id,
        findingIdx,
        finding.category,
        finding.severity,
        finding.verified ? 1 : 0,
        finding.title.slice(0, 200),
        resolution,
        Date.now(),
      );
    }
    stmts.updateResolutions.run(JSON.stringify(resolutions), sub, id);
    return resolutions;
  },
);

/**
 * Record the user's decision on one finding (or clear it with null).
 * Returns the updated resolution map, or null when the report/finding
 * doesn't exist for this user.
 */
export function setTechEditResolution(
  sub: string,
  id: string,
  findingIdx: number,
  resolution: TechEditResolution | null,
): TechEditResolutionMap | null {
  return setResolutionTx(sub, id, findingIdx, resolution);
}

export interface FeedbackCategoryStats {
  category: string;
  applied: number;
  dismissed: number;
  /** Recent dismissed finding titles, most recent first (only when dismissals dominate). */
  dismissedExamples: string[];
}

/**
 * Aggregate this user's apply/dismiss history per category — the learning
 * signal fed into the editorial prompt of future tech edits.
 */
export function getTechEditFeedbackStats(sub: string): FeedbackCategoryStats[] {
  const rows = stmts.feedbackStats.all(sub) as Array<{
    category: string;
    resolution: string;
    count: number;
  }>;
  const byCategory = new Map<string, FeedbackCategoryStats>();
  for (const row of rows) {
    let entry = byCategory.get(row.category);
    if (!entry) {
      entry = { category: row.category, applied: 0, dismissed: 0, dismissedExamples: [] };
      byCategory.set(row.category, entry);
    }
    if (row.resolution === 'applied') entry.applied = row.count;
    else if (row.resolution === 'dismissed') entry.dismissed = row.count;
  }
  for (const entry of byCategory.values()) {
    if (entry.dismissed > 0) {
      entry.dismissedExamples = (stmts.recentDismissedTitles.all(sub, entry.category) as Array<{ title: string }>).map(
        (r) => r.title,
      );
    }
  }
  return [...byCategory.values()];
}
