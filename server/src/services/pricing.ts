import { PDFExtract } from 'pdf.js-extract';
import mammoth from 'mammoth';
import { detectSourceKind } from './documentExtract.js';

/**
 * Server-side source of truth for pricing. Credits are denominated 1:1 in EUR.
 * The client may show estimates, but every charge is computed and deducted
 * here so the amount can't be tampered with.
 */
export const PRICING = {
  translation: {
    // Gemini 3.1 Pro Preview standard pricing (<=200k-token prompts),
    // refreshed June 2026. Keep this conservative because output pricing also
    // includes thinking tokens.
    inputCostPer1MTokens: 2.0,
    outputCostPer1MTokens: 12.0,
    fixedMargin: 6.0,
    includedPages: 10,
    pageSurcharge: 1.0,
    pagesPerSurchargeStep: 5,
  },
  chat: {
    packageSize: 20,
    packagePrice: 0.1,
    freeMessages: 3,
  },
  techEdit: {
    // Tech editing runs two Gemini Pro passes (structured extraction +
    // editorial review) with a HIGH thinking budget, so the raw API cost is
    // roughly double a translation. The margin prices the value: a human tech
    // edit runs EUR 50-150 per pattern.
    inputCostPer1MTokens: 2.0,
    outputCostPer1MTokens: 12.0,
    passes: 2,
    fixedMargin: 9.0,
    includedPages: 10,
    pageSurcharge: 1.5,
    pagesPerSurchargeStep: 5,
    // Hard cap: unlike translation, a tech edit of a huge document blows the
    // Gemini deadline and degrades report quality, so refuse instead of
    // just charging more.
    maxPages: 40,
  },
  gradingExtract: {
    // One Gemini Pro structured-extraction pass over the pattern document
    // (half a tech edit's API work), pulling gauge, sizes, the measurement
    // table and shaping into the grading form.
    inputCostPer1MTokens: 2.0,
    outputCostPer1MTokens: 12.0,
    fixedMargin: 2.0,
    includedPages: 10,
    pageSurcharge: 1.0,
    pagesPerSurchargeStep: 5,
    maxPages: 30,
  },
  tokenEstimation: {
    charsPerToken: 4,
    systemPromptTokens: 500,
    outputMultiplier: 1.2,
  },
} as const;

export interface CreditPack {
  id: string;
  credits: number;
  /** Price in EUR. */
  price: number;
  label: string;
}

/**
 * Canonical credit packs. The client renders these but the server is
 * authoritative: checkout always charges `price` for `credits`, keyed by `id`.
 */
export const CREDIT_PACKS: CreditPack[] = [
  { id: 'credits_7', credits: 7, price: 7.0, label: '7 credits' },
  { id: 'credits_10', credits: 10, price: 8.5, label: '10 credits' },
  { id: 'credits_25', credits: 25, price: 19.0, label: '25 credits' },
  { id: 'credits_50', credits: 50, price: 35.0, label: '50 credits' },
];

export function getCreditPack(id: string): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.id === id);
}

function roundUpToHalf(amount: number): number {
  return Math.ceil(amount / 0.5) * 0.5;
}

export interface DocumentMetrics {
  pages: number;
  characters: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
}

function metricsFromText(text: string, pages: number): DocumentMetrics {
  const { charsPerToken, systemPromptTokens, outputMultiplier } = PRICING.tokenEstimation;
  const characters = text.length;
  const contentTokens = Math.ceil(characters / charsPerToken);
  return {
    pages: Math.max(1, pages),
    characters,
    estimatedInputTokens: contentTokens + systemPromptTokens,
    estimatedOutputTokens: Math.ceil(contentTokens * outputMultiplier),
  };
}

const pdfExtract = new PDFExtract();

async function analyzePdf(buffer: Buffer): Promise<DocumentMetrics> {
  const data = await pdfExtract.extractBuffer(buffer, {});
  const pages = data.pages.length || 1;
  const text = data.pages
    .map((page) => page.content.map((item) => item.str).join(' '))
    .join('\n');
  return metricsFromText(text, pages);
}

async function analyzeDocx(buffer: Buffer): Promise<DocumentMetrics> {
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value || '';
  const words = text.split(/\s+/).filter(Boolean).length;
  return metricsFromText(text, Math.ceil(words / 250));
}

function analyzePlainText(buffer: Buffer): DocumentMetrics {
  const text = buffer.toString('utf8');
  const words = text.split(/\s+/).filter(Boolean).length;
  return metricsFromText(text, Math.ceil(words / 250));
}

/**
 * Compute document metrics on the server from the uploaded buffer so pricing
 * never depends on client-reported numbers.
 */
export async function computeDocumentMetrics(
  buffer: Buffer,
  mimeType?: string,
  fileName?: string,
): Promise<DocumentMetrics> {
  const kind = detectSourceKind(buffer, mimeType, fileName);
  switch (kind) {
    case 'pdf':
      return analyzePdf(buffer);
    case 'docx':
      return analyzeDocx(buffer);
    case 'rtf':
    case 'text':
    default:
      return analyzePlainText(buffer);
  }
}

/** Translation cost in credits (EUR), computed from server-side metrics. */
export function translationCostFromMetrics(metrics: DocumentMetrics): number {
  const { inputCostPer1MTokens, outputCostPer1MTokens, fixedMargin } = PRICING.translation;
  const inputCost = (metrics.estimatedInputTokens / 1_000_000) * inputCostPer1MTokens;
  const outputCost = (metrics.estimatedOutputTokens / 1_000_000) * outputCostPer1MTokens;
  const baseCost = roundUpToHalf(inputCost + outputCost + fixedMargin);

  const { includedPages, pageSurcharge, pagesPerSurchargeStep } = PRICING.translation;
  const extraPages = Math.max(0, metrics.pages - includedPages);
  const surcharge =
    extraPages === 0 ? 0 : Math.ceil(extraPages / pagesPerSurchargeStep) * pageSurcharge;

  return roundUpToHalf(baseCost + surcharge);
}

/** Tech edit cost in credits (EUR), computed from server-side metrics. */
export function techEditCostFromMetrics(metrics: DocumentMetrics): number {
  const { inputCostPer1MTokens, outputCostPer1MTokens, passes, fixedMargin } = PRICING.techEdit;
  // Both passes re-read the full document; output (structured JSON + report)
  // is much smaller than a full translation, so reuse the estimated output
  // token count once across the two passes.
  const inputCost = (metrics.estimatedInputTokens / 1_000_000) * inputCostPer1MTokens * passes;
  const outputCost = (metrics.estimatedOutputTokens / 1_000_000) * outputCostPer1MTokens;
  const baseCost = roundUpToHalf(inputCost + outputCost + fixedMargin);

  const { includedPages, pageSurcharge, pagesPerSurchargeStep } = PRICING.techEdit;
  const extraPages = Math.max(0, metrics.pages - includedPages);
  const surcharge =
    extraPages === 0 ? 0 : Math.ceil(extraPages / pagesPerSurchargeStep) * pageSurcharge;

  return roundUpToHalf(baseCost + surcharge);
}

/** Grading extraction cost in credits (EUR), computed from server-side metrics. */
export function gradingExtractCostFromMetrics(metrics: DocumentMetrics): number {
  const { inputCostPer1MTokens, outputCostPer1MTokens, fixedMargin } = PRICING.gradingExtract;
  // A single pass reads the full document; the structured JSON output is small
  // relative to the document, so a quarter of the translation output estimate
  // is generous.
  const inputCost = (metrics.estimatedInputTokens / 1_000_000) * inputCostPer1MTokens;
  const outputCost = (metrics.estimatedOutputTokens / 4 / 1_000_000) * outputCostPer1MTokens;
  const baseCost = roundUpToHalf(inputCost + outputCost + fixedMargin);

  const { includedPages, pageSurcharge, pagesPerSurchargeStep } = PRICING.gradingExtract;
  const extraPages = Math.max(0, metrics.pages - includedPages);
  const surcharge =
    extraPages === 0 ? 0 : Math.ceil(extraPages / pagesPerSurchargeStep) * pageSurcharge;

  return roundUpToHalf(baseCost + surcharge);
}

/** Cost in credits to unlock an additional chat package of `messages` messages. */
export function chatUnlockCost(messages: number): number {
  const { packageSize, packagePrice } = PRICING.chat;
  const packages = Math.ceil(messages / packageSize);
  return Math.round(packages * packagePrice * 100) / 100;
}
