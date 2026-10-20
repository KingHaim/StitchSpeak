import { describe, expect, it } from 'vitest';
import { documentPreviewWillRun, translationStartLabel } from './previewCta';

describe('preview CTA', () => {
  it('never promises a free preview unless the server marked this document eligible', () => {
    expect(documentPreviewWillRun({
      freePreviewMode: 'admins',
      freePreviewAvailable: true,
      documentPreviewEligible: false,
      fileCount: 1,
    })).toBe(false);
    expect(translationStartLabel({
      isAuthenticated: true,
      insufficientCredits: false,
      previewWillRun: false,
      fileCount: 1,
      creditCost: 6.5,
    })).toBe('Start translation (6.5 credits)');
  });

  it('shows Start free preview only when the server will grant one', () => {
    expect(documentPreviewWillRun({
      freePreviewMode: 'admins',
      freePreviewAvailable: true,
      documentPreviewEligible: true,
      fileCount: 1,
    })).toBe(true);
    expect(translationStartLabel({
      isAuthenticated: true,
      insufficientCredits: false,
      previewWillRun: true,
      fileCount: 1,
      creditCost: 6.5,
    })).toBe('Start free preview');
  });

  it('uses the paid CTA for batches even if one file could preview', () => {
    expect(documentPreviewWillRun({
      freePreviewMode: 'on',
      freePreviewAvailable: true,
      documentPreviewEligible: true,
      fileCount: 2,
    })).toBe(false);
  });
});
