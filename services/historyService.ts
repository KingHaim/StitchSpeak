import type { TranslationRecord, PdfMetrics } from '../types';
import {
  listPatterns as remoteList,
  getPatternHtml as remoteGetHtml,
  savePattern as remoteSave,
  deletePattern as remoteDelete,
  clearPatterns as remoteClear,
} from './patternsService';

const INDEX_KEY = 'ss_translation_history';
const HTML_PREFIX = 'ss_pattern_html_';
const MAX_RECORDS = 50;
// Browser localStorage realistically tops out at ~5 MB per origin, but most
// patterns embed several base64 images and easily exceed the old 512 KB cap.
// Cap individual entries at 4 MB and fail gracefully if the browser still
// rejects the write (eviction logic below handles that).
const MAX_HTML_BYTES = 4 * 1024 * 1024;

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Truncate at the last `>` we can find so we never split an HTML tag in two
 * (especially the giant base64 `<img src="data:...">` that blew past the
 * previous limit and corrupted everything after it).
 */
function safeTruncateHtml(html: string, max: number): string {
  if (html.length <= max) return html;
  const slice = html.slice(0, max);
  const lastClose = slice.lastIndexOf('>');
  const cutoff = lastClose > 0 ? lastClose + 1 : slice.lastIndexOf(' ');
  const safe = cutoff > 0 ? slice.slice(0, cutoff) : slice;
  return `${safe}\n<!-- StitchSpeak: pattern HTML was truncated at ${max} bytes -->`;
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

function localGetHistory(): TranslationRecord[] {
  return readIndex();
}

function localGetHtml(id: string): string | null {
  try {
    return localStorage.getItem(HTML_PREFIX + id);
  } catch {
    return null;
  }
}

function localSave(params: SaveTranslationParams): TranslationRecord {
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

  const html = safeTruncateHtml(translatedHtml, MAX_HTML_BYTES);

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

function localDelete(id: string): void {
  const history = readIndex().filter(r => r.id !== id);
  writeIndex(history);
  try { localStorage.removeItem(HTML_PREFIX + id); } catch { /* ignore */ }
}

function localClear(): void {
  const history = readIndex();
  for (const record of history) {
    try { localStorage.removeItem(HTML_PREFIX + record.id); } catch { /* ignore */ }
  }
  try { localStorage.removeItem(INDEX_KEY); } catch { /* ignore */ }
}

export interface SaveTranslationParams {
  fileName: string;
  fileType: string;
  sourceLanguage?: string;
  targetLanguage: string;
  translatedHtml: string;
  pdfMetrics: PdfMetrics | null;
  cost: number;
}

/**
 * Auth-aware accessors. When `idToken` is provided, patterns are stored
 * server-side (per Google account) and synced across devices. When it's
 * null, we fall back to browser localStorage (guest mode).
 */

export async function loadHistory(idToken: string | null): Promise<TranslationRecord[]> {
  if (idToken) {
    return remoteList(idToken);
  }
  return localGetHistory();
}

export async function loadTranslationHtml(
  id: string,
  idToken: string | null,
): Promise<string | null> {
  if (idToken) {
    return remoteGetHtml(idToken, id);
  }
  return localGetHtml(id);
}

export async function saveTranslation(
  params: SaveTranslationParams,
  idToken: string | null,
): Promise<TranslationRecord> {
  if (idToken) {
    return remoteSave(idToken, {
      fileName: params.fileName,
      fileType: params.fileType,
      sourceLanguage: params.sourceLanguage,
      targetLanguage: params.targetLanguage,
      html: params.translatedHtml,
      pdfMetrics: params.pdfMetrics,
      cost: params.cost,
    });
  }
  return localSave(params);
}

export async function deleteTranslation(
  id: string,
  idToken: string | null,
): Promise<void> {
  if (idToken) {
    await remoteDelete(idToken, id);
    return;
  }
  localDelete(id);
}

export async function clearHistory(idToken: string | null): Promise<void> {
  if (idToken) {
    await remoteClear(idToken);
    return;
  }
  localClear();
}
