import type { TranslationRecord, PdfMetrics } from '../types';

const INDEX_KEY = 'ss_translation_history';
const HTML_PREFIX = 'ss_pattern_html_';
const MAX_RECORDS = 50;
const MAX_HTML_BYTES = 512 * 1024; // 512 KB per pattern

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function readIndex(): TranslationRecord[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as TranslationRecord[]).sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}

function writeIndex(records: TranslationRecord[]): void {
  const stripped = records.map(({ translatedHtml: _, ...rest }) => rest);
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(stripped));
  } catch { /* ignore — index is tiny, but be safe */ }
}

export function getHistory(): TranslationRecord[] {
  return readIndex();
}

export function getTranslationHtml(id: string): string | null {
  try {
    return localStorage.getItem(HTML_PREFIX + id);
  } catch {
    return null;
  }
}

export function saveTranslation(params: {
  fileName: string;
  fileType: string;
  sourceLanguage?: string;
  targetLanguage: string;
  translatedHtml: string;
  pdfMetrics: PdfMetrics | null;
  cost: number;
}): TranslationRecord {
  const { translatedHtml, ...metadata } = params;
  const id = generateId();

  const record: TranslationRecord = {
    id,
    timestamp: Date.now(),
    ...metadata,
  };

  const history = readIndex();
  history.unshift(record);

  const evicted = history.splice(MAX_RECORDS);
  for (const old of evicted) {
    try { localStorage.removeItem(HTML_PREFIX + old.id); } catch { /* ignore */ }
  }

  writeIndex(history);

  const html = translatedHtml.length > MAX_HTML_BYTES
    ? translatedHtml.slice(0, MAX_HTML_BYTES)
    : translatedHtml;

  try {
    localStorage.setItem(HTML_PREFIX + id, html);
  } catch {
    evictOldestHtml(history);
    try {
      localStorage.setItem(HTML_PREFIX + id, html);
    } catch { /* give up — metadata is still saved */ }
  }

  return record;
}

function evictOldestHtml(history: TranslationRecord[]): void {
  for (let i = history.length - 1; i >= 0; i--) {
    const key = HTML_PREFIX + history[i].id;
    try {
      if (localStorage.getItem(key) !== null) {
        localStorage.removeItem(key);
        return;
      }
    } catch { /* ignore */ }
  }
}

export function deleteTranslation(id: string): void {
  const history = readIndex().filter(r => r.id !== id);
  writeIndex(history);
  try { localStorage.removeItem(HTML_PREFIX + id); } catch { /* ignore */ }
}

export function clearHistory(): void {
  const history = readIndex();
  for (const record of history) {
    try { localStorage.removeItem(HTML_PREFIX + record.id); } catch { /* ignore */ }
  }
  try { localStorage.removeItem(INDEX_KEY); } catch { /* ignore */ }
}
