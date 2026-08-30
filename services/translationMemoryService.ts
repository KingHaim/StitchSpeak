import { apiCall } from './api';

export interface TranslationMemoryEntry {
  sourceLanguage: string;
  targetLanguage: string;
  sourceText: string;
  targetText: string;
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  if (quoted) throw new Error('The CSV contains an unclosed quoted field.');
  return rows;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function validateEntries(value: unknown): TranslationMemoryEntry[] {
  const raw = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { entries?: unknown }).entries)
      ? (value as { entries: unknown[] }).entries
      : null;
  if (!raw?.length) throw new Error('The file contains no translation-memory entries.');
  const entries = raw.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`Entry ${index + 1} is invalid.`);
    const record = item as Record<string, unknown>;
    const entry = {
      sourceLanguage: String(record.sourceLanguage ?? '').trim(),
      targetLanguage: String(record.targetLanguage ?? '').trim(),
      sourceText: String(record.sourceText ?? '').trim(),
      targetText: String(record.targetText ?? '').trim(),
    };
    if (Object.values(entry).some((field) => !field)) {
      throw new Error(`Entry ${index + 1} is missing a required field.`);
    }
    return entry;
  });
  if (entries.length > 500) throw new Error('Import at most 500 corrections at a time.');
  return entries;
}

export function parseTranslationMemoryFile(text: string, fileName: string): TranslationMemoryEntry[] {
  if (fileName.toLowerCase().endsWith('.json')) return validateEntries(JSON.parse(text));
  const rows = parseCsvRows(text);
  if (rows.length < 2) throw new Error('The CSV needs a header and at least one correction.');
  const headers = rows[0].map(normalizeHeader);
  const indexOf = (name: string): number => headers.indexOf(normalizeHeader(name));
  const indexes = {
    sourceLanguage: indexOf('sourceLanguage'),
    targetLanguage: indexOf('targetLanguage'),
    sourceText: indexOf('sourceText'),
    targetText: indexOf('targetText'),
  };
  if (Object.values(indexes).some((index) => index < 0)) {
    throw new Error('CSV headers must be sourceLanguage, targetLanguage, sourceText, targetText.');
  }
  return validateEntries(rows.slice(1).map((row) => ({
    sourceLanguage: row[indexes.sourceLanguage],
    targetLanguage: row[indexes.targetLanguage],
    sourceText: row[indexes.sourceText],
    targetText: row[indexes.targetText],
  })));
}

export function importTranslationMemory(entries: TranslationMemoryEntry[]): Promise<{ imported: number; total: number }> {
  return apiCall('/translation-memory/import', 'POST', { entries });
}

export function getTranslationMemory(): Promise<{ entries: TranslationMemoryEntry[]; total: number }> {
  return apiCall('/translation-memory');
}

export function clearTranslationMemory(): Promise<{ deleted: number }> {
  return apiCall('/translation-memory', 'DELETE');
}
