import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'patterns.db');

const MAX_RECORDS_PER_USER = 100;
// Patterns embed images as base64 data URLs, so a single HTML payload often
// runs to several MB. The previous 1 MB cap silently truncated saved files
// mid-image, leaving the rest of the document blank when re-opened. SQLite
// happily handles an order of magnitude more per row.
const MAX_HTML_BYTES = 16 * 1024 * 1024; // 16 MB

/**
 * Truncate at the last "safe" boundary so we never cut a tag in half. We rewind
 * to the last `>` we can find (or to the last whitespace as a last resort) and
 * append a placeholder so it's obvious to anyone reading the file what happened.
 */
function safeTruncateHtml(html: string, max: number): string {
  if (html.length <= max) return html;
  const slice = html.slice(0, max);
  const lastClose = slice.lastIndexOf('>');
  const cutoff = lastClose > 0 ? lastClose + 1 : slice.lastIndexOf(' ');
  const safe = cutoff > 0 ? slice.slice(0, cutoff) : slice;
  return `${safe}\n<!-- StitchSpeak: pattern HTML was truncated at ${max} bytes -->`;
}

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS patterns (
    id              TEXT PRIMARY KEY,
    sub             TEXT NOT NULL,
    timestamp       INTEGER NOT NULL,
    file_name       TEXT NOT NULL,
    file_type       TEXT,
    source_language TEXT,
    target_language TEXT NOT NULL,
    pdf_metrics     TEXT,
    cost            REAL NOT NULL DEFAULT 0,
    html            TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_patterns_sub_ts ON patterns(sub, timestamp DESC);
`);

export interface PatternRow {
  id: string;
  timestamp: number;
  fileName: string;
  fileType: string | null;
  sourceLanguage: string | null;
  targetLanguage: string;
  pdfMetrics: unknown | null;
  cost: number;
}

export interface PatternRowWithHtml extends PatternRow {
  html: string;
}

interface RawRow {
  id: string;
  timestamp: number;
  file_name: string;
  file_type: string | null;
  source_language: string | null;
  target_language: string;
  pdf_metrics: string | null;
  cost: number;
  html?: string;
}

const stmts = {
  list: db.prepare<[string]>(`
    SELECT id, timestamp, file_name, file_type, source_language, target_language, pdf_metrics, cost
    FROM patterns
    WHERE sub = ?
    ORDER BY timestamp DESC
  `),
  getOne: db.prepare<[string, string]>(`
    SELECT id, timestamp, file_name, file_type, source_language, target_language, pdf_metrics, cost, html
    FROM patterns
    WHERE sub = ? AND id = ?
  `),
  insert: db.prepare<
    [string, string, number, string, string | null, string | null, string, string | null, number, string]
  >(`
    INSERT INTO patterns (
      id, sub, timestamp, file_name, file_type, source_language, target_language, pdf_metrics, cost, html
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  countForUser: db.prepare<[string]>('SELECT COUNT(*) as count FROM patterns WHERE sub = ?'),
  evictOldest: db.prepare<[string, number]>(`
    DELETE FROM patterns
    WHERE id IN (
      SELECT id FROM patterns
      WHERE sub = ?
      ORDER BY timestamp ASC
      LIMIT ?
    )
  `),
  deleteOne: db.prepare<[string, string]>('DELETE FROM patterns WHERE sub = ? AND id = ?'),
  deleteAllForUser: db.prepare<[string]>('DELETE FROM patterns WHERE sub = ?'),
} as const;

function parseMetrics(raw: string | null): unknown | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function rowToPattern(row: RawRow): PatternRow {
  return {
    id: row.id,
    timestamp: row.timestamp,
    fileName: row.file_name,
    fileType: row.file_type,
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    pdfMetrics: parseMetrics(row.pdf_metrics),
    cost: row.cost,
  };
}

function rowToPatternWithHtml(row: RawRow): PatternRowWithHtml {
  return {
    ...rowToPattern(row),
    html: row.html ?? '',
  };
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function listPatterns(sub: string): PatternRow[] {
  const rows = stmts.list.all(sub) as RawRow[];
  return rows.map(rowToPattern);
}

export function getPattern(sub: string, id: string): PatternRowWithHtml | null {
  const row = stmts.getOne.get(sub, id) as RawRow | undefined;
  if (!row) return null;
  return rowToPatternWithHtml(row);
}

export interface SavePatternInput {
  fileName: string;
  fileType?: string | null;
  sourceLanguage?: string | null;
  targetLanguage: string;
  pdfMetrics?: unknown | null;
  cost?: number;
  html: string;
}

const saveTx = db.transaction((sub: string, input: SavePatternInput): PatternRowWithHtml => {
  const id = generateId();
  const timestamp = Date.now();

  if (input.html.length > MAX_HTML_BYTES) {
    console.warn(
      `[patternStore] HTML payload (${input.html.length} bytes) exceeds limit ` +
        `(${MAX_HTML_BYTES} bytes); truncating at a safe tag boundary.`,
    );
  }
  const html = safeTruncateHtml(input.html, MAX_HTML_BYTES);

  const metricsJson = input.pdfMetrics == null ? null : JSON.stringify(input.pdfMetrics);

  stmts.insert.run(
    id,
    sub,
    timestamp,
    input.fileName,
    input.fileType ?? null,
    input.sourceLanguage ?? null,
    input.targetLanguage,
    metricsJson,
    typeof input.cost === 'number' ? input.cost : 0,
    html,
  );

  const countRow = stmts.countForUser.get(sub) as { count: number };
  if (countRow.count > MAX_RECORDS_PER_USER) {
    stmts.evictOldest.run(sub, countRow.count - MAX_RECORDS_PER_USER);
  }

  return {
    id,
    timestamp,
    fileName: input.fileName,
    fileType: input.fileType ?? null,
    sourceLanguage: input.sourceLanguage ?? null,
    targetLanguage: input.targetLanguage,
    pdfMetrics: input.pdfMetrics ?? null,
    cost: typeof input.cost === 'number' ? input.cost : 0,
    html,
  };
});

export function savePattern(sub: string, input: SavePatternInput): PatternRowWithHtml {
  return saveTx(sub, input);
}

export function deletePattern(sub: string, id: string): boolean {
  const result = stmts.deleteOne.run(sub, id);
  return result.changes > 0;
}

export function deleteAllPatterns(sub: string): number {
  const result = stmts.deleteAllForUser.run(sub);
  return result.changes;
}
