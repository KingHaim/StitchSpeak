import type { Language, TranslationReviewWarning } from '../types';

const STORAGE_KEY = 'ss_pending_preview_unlock';

export interface PendingPreviewUnlock {
  jobId: string;
  remainingCost: number;
  fullCost?: number;
  clientJobId: string;
  fileName?: string;
  translatedHtml?: string;
  sourceLanguage?: Language;
  targetLanguage?: Language;
  reviewWarnings?: TranslationReviewWarning[];
}

export function writePendingPreviewUnlock(value: PendingPreviewUnlock): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function readPendingPreviewUnlock(): PendingPreviewUnlock | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingPreviewUnlock>;
    if (typeof parsed.jobId !== 'string' || typeof parsed.clientJobId !== 'string') return null;
    return {
      jobId: parsed.jobId,
      remainingCost: typeof parsed.remainingCost === 'number' ? parsed.remainingCost : 0,
      fullCost: typeof parsed.fullCost === 'number' ? parsed.fullCost : undefined,
      clientJobId: parsed.clientJobId,
      fileName: typeof parsed.fileName === 'string' ? parsed.fileName : undefined,
      translatedHtml: typeof parsed.translatedHtml === 'string' ? parsed.translatedHtml : undefined,
      sourceLanguage: parsed.sourceLanguage,
      targetLanguage: parsed.targetLanguage,
      reviewWarnings: Array.isArray(parsed.reviewWarnings) ? parsed.reviewWarnings : undefined,
    };
  } catch {
    return null;
  }
}

export function clearPendingPreviewUnlock(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
