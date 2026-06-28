import { describe, expect, it } from 'vitest';
import {
  estimateBatchTranslationCost,
  estimateChatCost,
  estimateTranslationCost,
} from './pricingService';
import { CREDIT_PACKAGES } from '../constants';
import type { PdfMetrics } from '../types';

const metrics = (overrides: Partial<PdfMetrics> = {}): PdfMetrics => ({
  pages: 4,
  characters: 8_000,
  estimatedInputTokens: 2_500,
  estimatedOutputTokens: 3_000,
  fileSizeKB: 240,
  ...overrides,
});

describe('pricingService', () => {
  it('rounds translation estimates to the app credit increment', () => {
    const estimate = estimateTranslationCost(metrics());

    expect(estimate.translationCost).toBe(6.5);
    expect(estimate.totalCost).toBe(6.5);
    expect(estimate.breakdown.pageSurcharge).toBe(0);
  });

  it('offers an entry pack that can pay for the minimum translation', () => {
    const minimumTranslation = estimateTranslationCost(metrics({ characters: 1 }));
    expect(CREDIT_PACKAGES[0].credits).toBeGreaterThanOrEqual(minimumTranslation.translationCost);
  });

  it('adds page surcharges after the included page allowance', () => {
    const estimate = estimateTranslationCost(metrics({ pages: 16 }));

    expect(estimate.breakdown.pageSurcharge).toBe(2);
    expect(estimate.translationCost).toBe(8.5);
  });

  it('sums batch estimates per file instead of repricing aggregated tokens', () => {
    const batch = estimateBatchTranslationCost([
      metrics({ estimatedInputTokens: 1_000, estimatedOutputTokens: 1_000 }),
      metrics({ estimatedInputTokens: 2_000, estimatedOutputTokens: 2_000 }),
    ]);

    expect(batch.translationCost).toBe(13);
    expect(batch.totalCost).toBe(13);
    expect(batch.breakdown.inputTokens).toBe(3_000);
  });

  it('keeps the free chat allowance free and charges by package after it', () => {
    expect(estimateChatCost(3)).toBe(0);
    expect(estimateChatCost(4)).toBe(0.1);
    expect(estimateChatCost(24)).toBe(0.2);
  });
});
