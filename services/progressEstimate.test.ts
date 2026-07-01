import { describe, expect, it } from 'vitest';
import { estimatedTranslationProgress } from './progressEstimate';

describe('estimatedTranslationProgress', () => {
  it('moves faster near the beginning than near the end', () => {
    const pages = 12;
    const expectedMs = 22_000 + pages * 4_000;
    const at10 = estimatedTranslationProgress(expectedMs * 0.1, pages);
    const at20 = estimatedTranslationProgress(expectedMs * 0.2, pages);
    const at80 = estimatedTranslationProgress(expectedMs * 0.8, pages);
    const at90 = estimatedTranslationProgress(expectedMs * 0.9, pages);

    expect(at20 - at10).toBeGreaterThan(at90 - at80);
  });

  it('never claims completion before the server confirms it', () => {
    expect(estimatedTranslationProgress(60 * 60 * 1000, 1)).toBe(95);
  });
});
