import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'credits.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

/**
 * US10 DB change (safe on existing data):
 * - translation_preview_grants: at most one free preview per account.
 * - translation_jobs: resumable partial jobs. CREATE IF NOT EXISTS only.
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS translation_preview_grants (
    sub      TEXT PRIMARY KEY,
    used_at  INTEGER NOT NULL,
    job_id   TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS translation_jobs (
    id                    TEXT PRIMARY KEY,
    sub                   TEXT NOT NULL,
    status                TEXT NOT NULL,
    file_name             TEXT NOT NULL,
    language              TEXT NOT NULL,
    source_language       TEXT,
    preview_html          TEXT NOT NULL,
    remaining_source_html TEXT NOT NULL,
    review_warnings       TEXT,
    remaining_cost        REAL NOT NULL DEFAULT 0,
    full_cost             REAL NOT NULL DEFAULT 0,
    created_at            INTEGER NOT NULL,
    updated_at            INTEGER NOT NULL
  )
`);
db.exec('CREATE INDEX IF NOT EXISTS idx_translation_jobs_sub ON translation_jobs (sub, created_at DESC)');

function addColumn(sql: string): void {
  try {
    db.exec(sql);
  } catch {
    /* column already exists on upgraded databases */
  }
}
addColumn('ALTER TABLE translation_jobs ADD COLUMN remaining_pdf BLOB');
addColumn('ALTER TABLE translation_jobs ADD COLUMN preview_end_page INTEGER');

const MAX_HTML_BYTES = 16 * 1024 * 1024;

function clip(html: string): string {
  if (html.length <= MAX_HTML_BYTES) return html;
  return `${html.slice(0, MAX_HTML_BYTES)}\n<!-- StitchSpeak: job HTML was truncated -->`;
}

const stmts = {
  hasGrant: db.prepare<[string]>('SELECT 1 FROM translation_preview_grants WHERE sub = ?'),
  insertGrant: db.prepare<[string, number, string]>(
    'INSERT OR IGNORE INTO translation_preview_grants (sub, used_at, job_id) VALUES (?, ?, ?)',
  ),
  deleteGrant: db.prepare<[string, string]>(
    'DELETE FROM translation_preview_grants WHERE sub = ? AND job_id = ?',
  ),
  deleteGrantsForSub: db.prepare<[string]>('DELETE FROM translation_preview_grants WHERE sub = ?'),
  insertJob: db.prepare<
    [string, string, string, string, string, string | null, string, string, Buffer | null, number | null, string | null, number, number, number, number]
  >(`
    INSERT INTO translation_jobs (
      id, sub, status, file_name, language, source_language, preview_html,
      remaining_source_html, remaining_pdf, preview_end_page, review_warnings,
      remaining_cost, full_cost, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getJob: db.prepare<[string]>(`
    SELECT id, sub, status, file_name, language, source_language, preview_html,
           remaining_source_html, remaining_pdf, preview_end_page, review_warnings,
           remaining_cost, full_cost, created_at, updated_at
    FROM translation_jobs WHERE id = ?
  `),
  getOwnedJob: db.prepare<[string, string]>(`
    SELECT id, sub, status, file_name, language, source_language, preview_html,
           remaining_source_html, remaining_pdf, preview_end_page, review_warnings,
           remaining_cost, full_cost, created_at, updated_at
    FROM translation_jobs WHERE id = ? AND sub = ?
  `),
  latestOpenJob: db.prepare<[string]>(`
    SELECT id, sub, status, file_name, language, source_language, preview_html,
           remaining_source_html, remaining_pdf, preview_end_page, review_warnings,
           remaining_cost, full_cost, created_at, updated_at
    FROM translation_jobs WHERE sub = ? AND status = 'preview'
    ORDER BY created_at DESC LIMIT 1
  `),
  completeJob: db.prepare<[string, string | null, number, string]>(`
    UPDATE translation_jobs
    SET status = 'complete', preview_html = ?, review_warnings = ?, remaining_source_html = '',
        remaining_pdf = NULL, remaining_cost = 0, updated_at = ?
    WHERE id = ?
  `),
  deleteJobsForSub: db.prepare<[string]>('DELETE FROM translation_jobs WHERE sub = ?'),
} as const;

export function hasFreePreviewAvailable(sub: string): boolean {
  return !stmts.hasGrant.get(sub);
}

/** Consume the one-per-account grant. Returns false if it was already used. */
export function claimFreePreview(sub: string, jobId: string): boolean {
  const result = stmts.insertGrant.run(sub, Date.now(), jobId);
  return result.changes === 1;
}

/** Give the grant back if the preview job failed before it was delivered. */
export function releaseFreePreview(sub: string, jobId: string): void {
  stmts.deleteGrant.run(sub, jobId);
}

export type TranslationJobStatus = 'preview' | 'complete';

export interface TranslationPreviewJob {
  id: string;
  sub: string;
  status: TranslationJobStatus;
  fileName: string;
  language: string;
  sourceLanguage: string | null;
  previewHtml: string;
  remainingSourceHtml: string;
  remainingPdf: Buffer | null;
  previewEndPage: number | null;
  reviewWarnings: unknown[];
  remainingCost: number;
  fullCost: number;
  createdAt: number;
  updatedAt: number;
}

function parseWarnings(raw: string | null): unknown[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

interface RawJob {
  id: string;
  sub: string;
  status: TranslationJobStatus;
  file_name: string;
  language: string;
  source_language: string | null;
  preview_html: string;
  remaining_source_html: string;
  remaining_pdf: Buffer | Uint8Array | null;
  preview_end_page: number | null;
  review_warnings: string | null;
  remaining_cost: number;
  full_cost: number;
  created_at: number;
  updated_at: number;
}

function toJob(row: RawJob): TranslationPreviewJob {
  return {
    id: row.id,
    sub: row.sub,
    status: row.status,
    fileName: row.file_name,
    language: row.language,
    sourceLanguage: row.source_language,
    previewHtml: row.preview_html,
    remainingSourceHtml: row.remaining_source_html,
    remainingPdf: row.remaining_pdf ? Buffer.from(row.remaining_pdf) : null,
    previewEndPage: row.preview_end_page,
    reviewWarnings: parseWarnings(row.review_warnings),
    remainingCost: row.remaining_cost,
    fullCost: row.full_cost,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createTranslationJobId(): string {
  return crypto.randomUUID();
}

export function saveTranslationJob(input: {
  id: string;
  sub: string;
  fileName: string;
  language: string;
  sourceLanguage?: string | null;
  previewHtml: string;
  remainingSourceHtml: string;
  remainingPdf?: Buffer | null;
  previewEndPage?: number | null;
  reviewWarnings?: unknown[];
  remainingCost: number;
  fullCost: number;
}): TranslationPreviewJob {
  const now = Date.now();
  stmts.insertJob.run(
    input.id,
    input.sub,
    'preview',
    input.fileName,
    input.language,
    input.sourceLanguage ?? null,
    clip(input.previewHtml),
    clip(input.remainingSourceHtml),
    input.remainingPdf && input.remainingPdf.length > 0 ? input.remainingPdf : null,
    input.previewEndPage ?? null,
    input.reviewWarnings?.length ? JSON.stringify(input.reviewWarnings) : null,
    input.remainingCost,
    input.fullCost,
    now,
    now,
  );
  return getTranslationJob(input.id)!;
}

export function getTranslationJob(id: string): TranslationPreviewJob | null {
  const row = stmts.getJob.get(id) as RawJob | undefined;
  return row ? toJob(row) : null;
}

export function getOwnedTranslationJob(sub: string, id: string): TranslationPreviewJob | null {
  const row = stmts.getOwnedJob.get(id, sub) as RawJob | undefined;
  return row ? toJob(row) : null;
}

export function getLatestOpenTranslationJob(sub: string): TranslationPreviewJob | null {
  const row = stmts.latestOpenJob.get(sub) as RawJob | undefined;
  return row ? toJob(row) : null;
}

export function completeTranslationJob(
  id: string,
  html: string,
  reviewWarnings?: unknown[],
): TranslationPreviewJob | null {
  stmts.completeJob.run(
    clip(html),
    reviewWarnings?.length ? JSON.stringify(reviewWarnings) : null,
    Date.now(),
    id,
  );
  return getTranslationJob(id);
}

export function deleteTranslationPreviewData(sub: string): void {
  stmts.deleteJobsForSub.run(sub);
  stmts.deleteGrantsForSub.run(sub);
}

export function publicJobView(job: TranslationPreviewJob): {
  jobId: string;
  status: TranslationJobStatus;
  fileName: string;
  language: string;
  sourceLanguage: string | null;
  remainingCost: number;
  fullCost: number;
  locked: boolean;
} {
  return {
    jobId: job.id,
    status: job.status,
    fileName: job.fileName,
    language: job.language,
    sourceLanguage: job.sourceLanguage,
    remainingCost: job.remainingCost,
    fullCost: job.fullCost,
    locked: job.status === 'preview',
  };
}
