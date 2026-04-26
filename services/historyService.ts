import type { TranslationRecord, PdfMetrics } from '../types';
import {
  listPatterns as remoteList,
  getPatternHtml as remoteGetHtml,
  savePattern as remoteSave,
  deletePattern as remoteDelete,
  clearPatterns as remoteClear,
  uploadPatternSource as remoteUploadSource,
  fetchPatternSource as remoteFetchSource,
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
  /**
   * Optional original source file. When provided alongside an idToken, the
   * server keeps a copy on the persistent volume so future "Add translation"
   * actions can reuse it without asking the user to re-upload.
   */
  sourceFile?: File;
}

export type LoadHistoryResult = {
  records: TranslationRecord[];
  /**
   * Signed in, but the server could not list patterns; showing entries stored
   * in this browser from guest mode or a previous offline session.
   */
  offlineFallback: boolean;
};

export const PATTERNS_SYNCED_EVENT = 'ss-patterns-synced';

function dispatchPatternsSynced(): void {
  try {
    window.dispatchEvent(new CustomEvent(PATTERNS_SYNCED_EVENT));
  } catch {
    /* ignore */
  }
}

/**
 * If the user translated while signed out, patterns live in localStorage only.
 * After sign-in, copy them to the server once the remote library is still empty.
 * Returns true when local guest data was uploaded and cleared.
 */
export async function migrateGuestHistoryToServerIfRemoteEmpty(
  idToken: string,
): Promise<boolean> {
  let remote: TranslationRecord[];
  try {
    remote = await remoteList(idToken);
  } catch {
    return false;
  }
  if (remote.length > 0) return false;

  const localRecords = readIndex();
  if (localRecords.length === 0) return false;

  const pending = localRecords.filter((r) => localGetHtml(r.id)?.trim());
  if (pending.length === 0) return false;

  for (const record of pending) {
    const html = localGetHtml(record.id);
    if (!html?.trim()) continue;
    try {
      await remoteSave(idToken, {
        fileName: record.fileName,
        fileType: record.fileType,
        sourceLanguage: record.sourceLanguage,
        targetLanguage: record.targetLanguage,
        html,
        pdfMetrics: record.pdfMetrics,
        cost: record.cost,
      });
    } catch {
      return false;
    }
  }

  localClear();
  dispatchPatternsSynced();
  return true;
}

/**
 * Auth-aware accessors. When `idToken` is provided, patterns are stored
 * server-side (per Google account) and synced across devices. When it's
 * null, we fall back to browser localStorage (guest mode).
 */

export async function loadHistory(idToken: string | null): Promise<LoadHistoryResult> {
  if (!idToken) {
    return { records: localGetHistory(), offlineFallback: false };
  }
  try {
    const records = await remoteList(idToken);
    return { records, offlineFallback: false };
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 401) throw err;
    const local = localGetHistory();
    if (local.length > 0) {
      console.warn('[history] Server list failed; using browser-stored patterns.', err);
      return { records: local, offlineFallback: true };
    }
    throw err;
  }
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
    const record = await remoteSave(idToken, {
      fileName: params.fileName,
      fileType: params.fileType,
      sourceLanguage: params.sourceLanguage,
      targetLanguage: params.targetLanguage,
      html: params.translatedHtml,
      pdfMetrics: params.pdfMetrics,
      cost: params.cost,
    });
    if (params.sourceFile) {
      try {
        // The server extracts and stores the cover thumbnail as part of this
        // upload, so we don't need a separate render-and-upload step on the
        // client.
        await remoteUploadSource(idToken, record.id, params.sourceFile);
        record.hasSource = true;
        if (params.sourceFile.type === 'application/pdf') {
          record.hasThumbnail = true;
        }
      } catch (err) {
        console.warn(
          '[history] Pattern saved, but source upload failed; "Add translation" will require re-uploading.',
          err,
        );
      }
    }
    return record;
  }
  return localSave(params);
}

/**
 * Fetch the original source file for a saved pattern. Returns null when the
 * pattern has no source on file (older saves, guest mode, server error).
 */
export async function loadPatternSource(
  id: string,
  idToken: string | null,
): Promise<File | null> {
  if (!idToken) return null;
  try {
    return await remoteFetchSource(idToken, id);
  } catch (err) {
    console.warn('[history] Failed to fetch pattern source:', err);
    return null;
  }
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
