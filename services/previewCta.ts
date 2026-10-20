import type { FreePreviewMode } from './creditService';

/**
 * The upload dialog may only promise a free preview when the server has
 * already said this specific document will be granted one. Account-level
 * `freePreviewAvailable` is not enough: a short pattern, a used grant, or a
 * remainder check can still send the job down the paid path.
 */
export function documentPreviewWillRun(input: {
  freePreviewMode: FreePreviewMode;
  freePreviewAvailable: boolean;
  documentPreviewEligible: boolean;
  fileCount: number;
}): boolean {
  return (
    input.freePreviewMode !== 'off'
    && input.freePreviewAvailable
    && input.fileCount === 1
    && input.documentPreviewEligible
  );
}

export function translationStartLabel(input: {
  isAuthenticated: boolean;
  insufficientCredits: boolean;
  previewWillRun: boolean;
  fileCount: number;
  creditCost: number;
}): string {
  if (input.insufficientCredits) return 'Buy credits to continue';
  if (input.isAuthenticated && input.previewWillRun) return 'Start free preview';
  if (input.isAuthenticated) {
    return `Start ${input.fileCount > 1 ? `${input.fileCount} translations` : 'translation'} (${input.creditCost.toFixed(1)} credits)`;
  }
  return `Start ${input.fileCount > 1 ? `${input.fileCount} translations` : 'translation'}`;
}
