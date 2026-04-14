import type { PdfMetrics, PriceEstimate } from '../types';
import { PRICING } from '../constants';

export function estimateTranslationCost(metrics: PdfMetrics): PriceEstimate {
  const { inputCostPer1MTokens, outputCostPer1MTokens, margin, minimumPrice } =
    PRICING.translation;

  const inputCost =
    (metrics.estimatedInputTokens / 1_000_000) * inputCostPer1MTokens;
  const outputCost =
    (metrics.estimatedOutputTokens / 1_000_000) * outputCostPer1MTokens;
  const rawCost = inputCost + outputCost;
  const translationCost = Math.max(
    minimumPrice,
    Math.ceil(rawCost * margin * 100) / 100,
  );

  const chatPackageCost = PRICING.chat.packagePrice;

  return {
    translationCost,
    chatPackageCost,
    totalCost: translationCost,
    breakdown: {
      inputTokens: metrics.estimatedInputTokens,
      outputTokens: metrics.estimatedOutputTokens,
      rawCost: Math.round(rawCost * 10000) / 10000,
      margin,
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
