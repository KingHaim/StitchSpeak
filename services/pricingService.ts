import type { PdfMetrics, PriceEstimate } from '../types';
import { PRICING } from '../constants';

export function estimateTranslationCost(metrics: PdfMetrics): PriceEstimate {
  const { inputCostPer1MTokens, outputCostPer1MTokens, fixedMargin } =
    PRICING.translation;

  const inputCost =
    (metrics.estimatedInputTokens / 1_000_000) * inputCostPer1MTokens;
  const outputCost =
    (metrics.estimatedOutputTokens / 1_000_000) * outputCostPer1MTokens;
  const rawCost = inputCost + outputCost;
  const translationCost =
    Math.ceil((rawCost + fixedMargin) / 0.5) * 0.5;

  const chatPackageCost = PRICING.chat.packagePrice;

  return {
    translationCost,
    chatPackageCost,
    totalCost: translationCost,
    breakdown: {
      inputTokens: metrics.estimatedInputTokens,
      outputTokens: metrics.estimatedOutputTokens,
      rawCost: Math.round(rawCost * 10000) / 10000,
      margin: fixedMargin,
    },
  };
}

export function estimateBatchTranslationCost(metricsList: PdfMetrics[]): PriceEstimate {
  const estimates = metricsList.map(estimateTranslationCost);
  const translationCost = estimates.reduce((sum, estimate) => sum + estimate.translationCost, 0);

  return {
    translationCost,
    chatPackageCost: PRICING.chat.packagePrice,
    totalCost: translationCost,
    breakdown: {
      inputTokens: estimates.reduce((sum, estimate) => sum + estimate.breakdown.inputTokens, 0),
      outputTokens: estimates.reduce((sum, estimate) => sum + estimate.breakdown.outputTokens, 0),
      rawCost: Math.round(estimates.reduce((sum, estimate) => sum + estimate.breakdown.rawCost, 0) * 10000) / 10000,
      margin: estimates.reduce((sum, estimate) => sum + estimate.breakdown.margin, 0),
    },
  };
}

export function estimateChatCost(messageCount: number): number {
  const { packageSize, packagePrice, freeMessages } = PRICING.chat;
  const billable = Math.max(0, messageCount - freeMessages);
  return Math.ceil(billable / packageSize) * packagePrice;
}

export function formatPrice(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
