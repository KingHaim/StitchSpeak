import type { TranslationRecord } from '../types';

/**
 * Hint passed from My Patterns → Dashboard when the user clicks "Open in
 * studio" on a saved pattern. The Dashboard reads this on mount and rebuilds
 * a TranslationJob from the saved record so the user can keep chatting with
 * the AI about that pattern, with full chat history hydrated from the server.
 *
 * Intentionally lives in module memory (one-shot) — no need to round-trip
 * everything through sessionStorage.
 */

export interface OpenPatternHint {
  record: TranslationRecord;
  /**
   * The translated HTML, already fetched by HistoryPage to avoid a second
   * round-trip. The Dashboard expects a non-empty string.
   */
  translatedHtml: string;
}

let pendingOpenHint: OpenPatternHint | null = null;

const EVENT_NAME = 'ss-open-pattern-hint';

export function setOpenPatternHint(hint: OpenPatternHint): void {
  pendingOpenHint = hint;
  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    /* ignore */
  }
}

/** Pop the pending hint (one-shot consumption). */
export function takeOpenPatternHint(): OpenPatternHint | null {
  const hint = pendingOpenHint;
  pendingOpenHint = null;
  return hint;
}

export function onOpenPatternHintChange(handler: () => void): () => void {
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
