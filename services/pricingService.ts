import type { PdfMetrics, PriceEstimate } from '../types';
import { PRICING } from '../constants';

function roundUpToHalf(amount: number): number {
  return Math.ceil(amount / 0.5) * 0.5;
}

function calculatePageSurcharge(pages: number): number {
  const { includedPages, pageSurcharge, pagesPerSurchargeStep } =
    PRICING.translation;
  const extraPages = Math.max(0, pages - includedPages);

  if (extraPages === 0) return 0;

  return Math.ceil(extraPages / pagesPerSurchargeStep) * pageSurcharge;
}

export function estimateTranslationCost(metrics: PdfMetrics): PriceEstimate {
  const { inputCostPer1MTokens, outputCostPer1MTokens, fixedMargin } =
    PRICING.translation;

  const inputCost =
    (metrics.estimatedInputTokens / 1_000_000) * inputCostPer1MTokens;
  const outputCost =
    (metrics.estimatedOutputTokens / 1_000_000) * outputCostPer1MTokens;
  const rawCost = inputCost + outputCost;
  const baseCost = roundUpToHalf(rawCost + fixedMargin);
  const pageSurcharge = calculatePageSurcharge(metrics.pages);
  const translationCost = roundUpToHalf(baseCost + pageSurcharge);

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
      pageSurcharge,
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
      pageSurcharge: estimates.reduce((sum, estimate) => sum + estimate.breakdown.pageSurcharge, 0),
    },
  };
}

/** Mirrors the server's techEditCostFromMetrics (server/src/services/pricing.ts). */
export function estimateTechEditCost(metrics: PdfMetrics): number {
  const { inputCostPer1MTokens, outputCostPer1MTokens, passes, fixedMargin } = PRICING.techEdit;
  const inputCost =
    (metrics.estimatedInputTokens / 1_000_000) * inputCostPer1MTokens * passes;
  const outputCost =
    (metrics.estimatedOutputTokens / 1_000_000) * outputCostPer1MTokens;
  const baseCost = roundUpToHalf(inputCost + outputCost + fixedMargin);

  const { includedPages, pageSurcharge, pagesPerSurchargeStep } = PRICING.techEdit;
  const extraPages = Math.max(0, metrics.pages - includedPages);
  const surcharge =
    extraPages === 0 ? 0 : Math.ceil(extraPages / pagesPerSurchargeStep) * pageSurcharge;

  return roundUpToHalf(baseCost + surcharge);
}

export function estimateChatCost(messageCount: number): number {
  const { packageSize, packagePrice, freeMessages } = PRICING.chat;
  const billable = Math.max(0, messageCount - freeMessages);
  return Math.ceil(billable / packageSize) * packagePrice;
}

export function formatPrice(amount: number): string {
  return `€${amount.toFixed(2)}`;
}
