import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'translation-memory.db');
const MAX_ENTRIES_PER_USER = 2_000;
const MAX_PROMPT_ENTRIES = 120;
const MAX_PROMPT_CHARS = 18_000;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.exec(`
  CREATE TABLE IF NOT EXISTS translation_memory (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sub             TEXT NOT NULL,
    source_language TEXT NOT NULL,
    target_language TEXT NOT NULL,
    source_text     TEXT NOT NULL,
    target_text     TEXT NOT NULL,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    UNIQUE (sub, source_language, target_language, source_text)
  );
  CREATE INDEX IF NOT EXISTS idx_translation_memory_pair
    ON translation_memory (sub, target_language, source_language, updated_at DESC);
`);

export interface TranslationMemoryEntry {
  sourceLanguage: string;
  targetLanguage: string;
  sourceText: string;
  targetText: string;
}

interface TranslationMemoryRow {
  source_language: string;
  target_language: string;
  source_text: string;
  target_text: string;
}

function normalizeLanguage(value: string): string {
  const normalized = value.trim().replace(/\s+/g, ' ').slice(0, 80);
  const aliases: Record<string, string> = {
    en: 'English', english: 'English', de: 'German', german: 'German',
    fr: 'French', french: 'French', es: 'Spanish', spanish: 'Spanish',
    it: 'Italian', italian: 'Italian', nl: 'Dutch', dutch: 'Dutch',
    sv: 'Swedish', swedish: 'Swedish', no: 'Norwegian', norwegian: 'Norwegian',
    da: 'Danish', dk: 'Danish', danish: 'Danish', fi: 'Finnish', finnish: 'Finnish',
    pt: 'Portuguese', portuguese: 'Portuguese', ja: 'Japanese', japanese: 'Japanese',
    ko: 'Korean', korean: 'Korean', ru: 'Russian', russian: 'Russian',
  };
  return aliases[normalized.toLowerCase()] ?? normalized;
}

function normalizeText(value: string): string {
  return value.trim().replace(/\r\n?/g, '\n').slice(0, 2_000);
}

function toEntry(row: TranslationMemoryRow): TranslationMemoryEntry {
  return {
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    sourceText: row.source_text,
    targetText: row.target_text,
  };
}

export function importTranslationMemory(
  sub: string,
  entries: TranslationMemoryEntry[],
): { imported: number; total: number } {
  const cleaned = entries.flatMap((entry) => {
    const sourceLanguage = normalizeLanguage(entry.sourceLanguage);
    const targetLanguage = normalizeLanguage(entry.targetLanguage);
    const sourceText = normalizeText(entry.sourceText);
    const targetText = normalizeText(entry.targetText);
    return sourceLanguage && targetLanguage && sourceText && targetText
      ? [{ sourceLanguage, targetLanguage, sourceText, targetText }]
      : [];
  });

  const now = Date.now();
  const upsert = db.prepare(`
    INSERT INTO translation_memory (
      sub, source_language, target_language, source_text, target_text, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (sub, source_language, target_language, source_text)
    DO UPDATE SET target_text = excluded.target_text, updated_at = excluded.updated_at
  `);
  const transaction = db.transaction(() => {
    for (const entry of cleaned) {
      upsert.run(
        sub,
        entry.sourceLanguage,
        entry.targetLanguage,
        entry.sourceText,
        entry.targetText,
        now,
        now,
      );
    }
    const total = (db.prepare('SELECT COUNT(*) AS count FROM translation_memory WHERE sub = ?')
      .get(sub) as { count: number }).count;
    if (total > MAX_ENTRIES_PER_USER) {
      throw new Error(`Translation memory is limited to ${MAX_ENTRIES_PER_USER} entries per account.`);
    }
  });
  transaction();

  const total = (db.prepare('SELECT COUNT(*) AS count FROM translation_memory WHERE sub = ?')
    .get(sub) as { count: number }).count;
  return { imported: cleaned.length, total };
}

export function listTranslationMemory(sub: string): TranslationMemoryEntry[] {
  const rows = db.prepare(`
    SELECT source_language, target_language, source_text, target_text
    FROM translation_memory WHERE sub = ? ORDER BY updated_at DESC, id DESC
  `).all(sub) as TranslationMemoryRow[];
  return rows.map(toEntry);
}

export function getTranslationMemoryForPrompt(
  sub: string,
  sourceLanguage: string | undefined,
  targetLanguage: string,
): TranslationMemoryEntry[] {
  const target = normalizeLanguage(targetLanguage);
  const source = sourceLanguage ? normalizeLanguage(sourceLanguage) : null;
  const rows = (source
    ? db.prepare(`
        SELECT source_language, target_language, source_text, target_text
        FROM translation_memory
        WHERE sub = ? AND lower(target_language) = lower(?) AND lower(source_language) = lower(?)
        ORDER BY updated_at DESC LIMIT ?
      `).all(sub, target, source, MAX_PROMPT_ENTRIES)
    : db.prepare(`
        SELECT source_language, target_language, source_text, target_text
        FROM translation_memory
        WHERE sub = ? AND lower(target_language) = lower(?)
        ORDER BY updated_at DESC LIMIT ?
      `).all(sub, target, MAX_PROMPT_ENTRIES)) as TranslationMemoryRow[];

  const selected: TranslationMemoryEntry[] = [];
  let chars = 0;
  for (const row of rows) {
    const entry = toEntry(row);
    const length = entry.sourceText.length + entry.targetText.length;
    if (chars + length > MAX_PROMPT_CHARS) continue;
    selected.push(entry);
    chars += length;
  }
  return selected;
}

export function deleteTranslationMemory(sub: string): number {
  return db.prepare('DELETE FROM translation_memory WHERE sub = ?').run(sub).changes;
}
