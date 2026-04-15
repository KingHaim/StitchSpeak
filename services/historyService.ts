import type { TranslationRecord, PdfMetrics } from '../types';

const STORAGE_KEY = 'ss_translation_history';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function getHistory(): TranslationRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const records: TranslationRecord[] = JSON.parse(raw);
    return records.sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}

export function saveTranslation(params: {
  fileName: string;
  fileType: string;
  targetLanguage: string;
  translatedHtml: string;
  pdfMetrics: PdfMetrics | null;
  cost: number;
}): TranslationRecord {
  const record: TranslationRecord = {
    id: generateId(),
    timestamp: Date.now(),
    ...params,
  };

  const history = getHistory();
  history.unshift(record);

  // Keep at most 50 records to avoid filling localStorage
  const trimmed = history.slice(0, 50);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage may be full -- drop oldest entries and retry
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed.slice(0, 20)));
    } catch { /* give up silently */ }
  }

  return record;
}

export function deleteTranslation(id: string): void {
  const history = getHistory().filter(r => r.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch { /* ignore */ }
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}
