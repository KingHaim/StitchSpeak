/**
 * Shared, session-scoped hint passed from My Patterns → Dashboard when the
 * user clicks "Add translation" on a saved pattern. It tells the dashboard
 * which source file we're adding another translation for, and which target
 * languages are already covered, so we can pre-select a fresh language and
 * show a contextual banner above the upload zone.
 *
 * The serializable parts (filename, languages) live in `sessionStorage` so
 * they survive page reloads. The original-source `File` object lives in
 * module memory only — it is the most common case (same browser tab) and
 * means we don't have to base64 megabytes into storage.
 */

export interface AddTranslationHint {
  sourceFileName: string;
  /** Display labels (e.g. "French", "German") of target languages already on file. */
  existingLanguages: string[];
  /** Server-side pattern id whose source file can be re-fetched if missing. */
  sourcePatternId?: string;
  /** True when the source file is stored server-side and `sourcePatternId` is fetchable. */
  hasRemoteSource?: boolean;
}

const STORAGE_KEY = 'ss_add_translation_hint';
const EVENT_NAME = 'ss-add-translation-hint';

let pendingSourceFile: File | null = null;

export function setAddTranslationHint(
  hint: AddTranslationHint,
  sourceFile?: File | null,
): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(hint));
  } catch {
    /* sessionStorage unavailable — keep going so the in-memory File still works */
  }
  pendingSourceFile = sourceFile ?? null;
  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    /* ignore */
  }
}

export function readAddTranslationHint(): AddTranslationHint | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AddTranslationHint;
    if (typeof parsed?.sourceFileName !== 'string' || !Array.isArray(parsed.existingLanguages)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Pop the cached source File and clear the reference (one-shot consumption). */
export function takePendingSourceFile(): File | null {
  const file = pendingSourceFile;
  pendingSourceFile = null;
  return file;
}

export function clearAddTranslationHint(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  pendingSourceFile = null;
  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    /* ignore */
  }
}

/** Listen for cross-component changes (e.g. set from HistoryPage, read on Dashboard). */
export function onAddTranslationHintChange(handler: () => void): () => void {
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
