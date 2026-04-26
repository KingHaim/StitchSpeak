import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'patterns.db');
const SOURCES_DIR = path.join(DATA_DIR, 'sources');

/**
 * Hard cap for the size of a stored original-source file. Patterns are
 * generally PDF/DOCX in the single-digit-MB range; refuse anything bigger
 * so a runaway upload can't fill the volume.
 */
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

/** Thumbnails are tiny page-1 JPEGs; refuse anything bigger than 512 KB. */
const MAX_THUMB_BYTES = 512 * 1024;

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
if (!fs.existsSync(SOURCES_DIR)) {
  fs.mkdirSync(SOURCES_DIR, { recursive: true });
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

/** Older dev DBs may predate a column; missing columns make SELECT fail with 500s. */
function ensurePatternsColumns(): void {
  const rows = db.prepare(`PRAGMA table_info(patterns)`).all() as { name: string }[];
  if (rows.length === 0) return;

  const have = new Set(rows.map((r) => r.name));
  const add = (col: string, ddl: string) => {
    if (!have.has(col)) {
      db.exec(ddl);
      have.add(col);
    }
  };

  add('file_type', 'ALTER TABLE patterns ADD COLUMN file_type TEXT');
  add('source_language', 'ALTER TABLE patterns ADD COLUMN source_language TEXT');
  add('pdf_metrics', 'ALTER TABLE patterns ADD COLUMN pdf_metrics TEXT');
  add('cost', 'ALTER TABLE patterns ADD COLUMN cost REAL NOT NULL DEFAULT 0');
  add('source_mime', 'ALTER TABLE patterns ADD COLUMN source_mime TEXT');
  add('source_size', 'ALTER TABLE patterns ADD COLUMN source_size INTEGER');
  add('source_ext', 'ALTER TABLE patterns ADD COLUMN source_ext TEXT');
  add('thumb_size', 'ALTER TABLE patterns ADD COLUMN thumb_size INTEGER');
}

ensurePatternsColumns();

export interface PatternRow {
  id: string;
  timestamp: number;
  fileName: string;
  fileType: string | null;
  sourceLanguage: string | null;
  targetLanguage: string;
  pdfMetrics: unknown | null;
  cost: number;
  hasSource: boolean;
  sourceMime: string | null;
  sourceSize: number | null;
  sourceExt: string | null;
  hasThumbnail: boolean;
  thumbSize: number | null;
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
  source_mime: string | null;
  source_size: number | null;
  source_ext: string | null;
  thumb_size: number | null;
  html?: string;
}

const stmts = {
  list: db.prepare<[string]>(`
    SELECT id, timestamp, file_name, file_type, source_language, target_language,
           pdf_metrics, cost, source_mime, source_size, source_ext, thumb_size
    FROM patterns
    WHERE sub = ?
    ORDER BY timestamp DESC
  `),
  getOne: db.prepare<[string, string]>(`
    SELECT id, timestamp, file_name, file_type, source_language, target_language,
           pdf_metrics, cost, source_mime, source_size, source_ext, thumb_size, html
    FROM patterns
    WHERE sub = ? AND id = ?
  `),
  getSourceMeta: db.prepare<[string, string]>(`
    SELECT source_mime, source_size, source_ext
    FROM patterns
    WHERE sub = ? AND id = ?
  `),
  setSourceMeta: db.prepare<[string | null, number | null, string | null, string, string]>(`
    UPDATE patterns
    SET source_mime = ?, source_size = ?, source_ext = ?
    WHERE sub = ? AND id = ?
  `),
  setThumbSize: db.prepare<[number | null, string, string]>(`
    UPDATE patterns SET thumb_size = ? WHERE sub = ? AND id = ?
  `),
  exists: db.prepare<[string, string]>(`
    SELECT 1 FROM patterns WHERE sub = ? AND id = ? LIMIT 1
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
    hasSource: row.source_size != null && row.source_size > 0,
    sourceMime: row.source_mime,
    sourceSize: row.source_size,
    sourceExt: row.source_ext,
    hasThumbnail: row.thumb_size != null && row.thumb_size > 0,
    thumbSize: row.thumb_size,
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
    hasSource: false,
    sourceMime: null,
    sourceSize: null,
    sourceExt: null,
    hasThumbnail: false,
    thumbSize: null,
  };
});

export function savePattern(sub: string, input: SavePatternInput): PatternRowWithHtml {
  return saveTx(sub, input);
}

function sanitizeExtension(value: string | null | undefined): string {
  if (!value) return '';
  const trimmed = value.trim().replace(/^\.+/, '');
  if (!/^[A-Za-z0-9]{1,8}$/.test(trimmed)) return '';
  return `.${trimmed.toLowerCase()}`;
}

function deriveSourceExt(originalName: string | undefined, mime: string | undefined): string {
  const fromName = originalName ? originalName.match(/\.([A-Za-z0-9]{1,8})$/)?.[1] : undefined;
  if (fromName) return sanitizeExtension(fromName);
  if (mime === 'application/pdf') return '.pdf';
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return '.docx';
  }
  if (mime === 'application/msword') return '.doc';
  return '';
}

function sourceFilePath(id: string, ext: string | null): string {
  const safeId = id.replace(/[^A-Za-z0-9_-]/g, '');
  return path.join(SOURCES_DIR, `${safeId}${sanitizeExtension(ext ?? '')}`);
}

function thumbFilePath(id: string): string {
  const safeId = id.replace(/[^A-Za-z0-9_-]/g, '');
  return path.join(SOURCES_DIR, `${safeId}.thumb.jpg`);
}

function safeUnlinkSource(id: string, ext: string | null): void {
  try {
    const target = sourceFilePath(id, ext);
    if (fs.existsSync(target)) fs.unlinkSync(target);
  } catch (err) {
    console.warn(`[patternStore] could not unlink source for ${id}:`, err);
  }
}

function safeUnlinkThumb(id: string): void {
  try {
    const target = thumbFilePath(id);
    if (fs.existsSync(target)) fs.unlinkSync(target);
  } catch (err) {
    console.warn(`[patternStore] could not unlink thumb for ${id}:`, err);
  }
}

export interface AttachSourceInput {
  data: Buffer;
  mime?: string | null;
  originalName?: string | null;
}

export interface AttachSourceResult {
  size: number;
  mime: string | null;
  ext: string | null;
}

/**
 * Persist an original source file alongside an existing pattern row. Replaces
 * any prior source already on disk for that pattern. Returns the metadata that
 * was stored (and `null` if the pattern doesn't belong to this user).
 */
export function attachSource(
  sub: string,
  id: string,
  input: AttachSourceInput,
): AttachSourceResult | null {
  const existing = stmts.getSourceMeta.get(sub, id) as
    | { source_ext: string | null }
    | undefined;
  if (!existing) return null;

  if (input.data.byteLength > MAX_SOURCE_BYTES) {
    throw new Error(
      `Source file is too large (${input.data.byteLength} bytes; max ${MAX_SOURCE_BYTES}).`,
    );
  }

  if (existing.source_ext) {
    safeUnlinkSource(id, existing.source_ext);
  }

  const ext = deriveSourceExt(input.originalName ?? undefined, input.mime ?? undefined);
  const target = sourceFilePath(id, ext);
  fs.writeFileSync(target, input.data);

  const mime = input.mime ?? null;
  stmts.setSourceMeta.run(mime, input.data.byteLength, ext || null, sub, id);

  return { size: input.data.byteLength, mime, ext: ext || null };
}

/**
 * Persist a tiny page-1 JPEG thumbnail next to the source file. The frontend
 * generates this with PDF.js while saving so the My Patterns gallery can show
 * the actual cover instead of a generic placeholder.
 */
export function attachThumbnail(
  sub: string,
  id: string,
  data: Buffer,
): { size: number } | null {
  const exists = stmts.exists.get(sub, id);
  if (!exists) return null;

  if (data.byteLength > MAX_THUMB_BYTES) {
    throw new Error(
      `Thumbnail is too large (${data.byteLength} bytes; max ${MAX_THUMB_BYTES}).`,
    );
  }

  const target = thumbFilePath(id);
  fs.writeFileSync(target, data);
  stmts.setThumbSize.run(data.byteLength, sub, id);
  return { size: data.byteLength };
}

export interface PatternThumbnail {
  data: Buffer;
  size: number;
}

export function getThumbnailFile(sub: string, id: string): PatternThumbnail | null {
  const row = stmts.getOne.get(sub, id) as RawRow | undefined;
  if (!row) return null;
  if (!row.thumb_size || row.thumb_size <= 0) return null;
  const target = thumbFilePath(id);
  if (!fs.existsSync(target)) return null;
  const data = fs.readFileSync(target);
  return { data, size: data.byteLength };
}

export interface PatternSource {
  data: Buffer;
  mime: string | null;
  ext: string | null;
  size: number;
  fileName: string;
}

export function getSourceFile(sub: string, id: string): PatternSource | null {
  const row = stmts.getOne.get(sub, id) as RawRow | undefined;
  if (!row) return null;
  if (!row.source_size || row.source_size <= 0) return null;
  const ext = row.source_ext ?? '';
  const target = sourceFilePath(id, ext);
  if (!fs.existsSync(target)) return null;
  const data = fs.readFileSync(target);
  return {
    data,
    mime: row.source_mime,
    ext: ext || null,
    size: data.byteLength,
    fileName: row.file_name,
  };
}

export function deletePattern(sub: string, id: string): boolean {
  const meta = stmts.getSourceMeta.get(sub, id) as
    | { source_ext: string | null }
    | undefined;
  const result = stmts.deleteOne.run(sub, id);
  if (result.changes > 0) {
    if (meta?.source_ext) safeUnlinkSource(id, meta.source_ext);
    safeUnlinkThumb(id);
  }
  return result.changes > 0;
}

export function deleteAllPatterns(sub: string): number {
  const rows = stmts.list.all(sub) as RawRow[];
  const result = stmts.deleteAllForUser.run(sub);
  for (const row of rows) {
    if (row.source_ext) safeUnlinkSource(row.id, row.source_ext);
    safeUnlinkThumb(row.id);
  }
  return result.changes;
}
