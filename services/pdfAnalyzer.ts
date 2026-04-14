import * as pdfjsLib from 'pdfjs-dist';
import type { PdfMetrics } from '../types';
import { PRICING } from '../constants';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString();

export async function analyzePdf(file: File): Promise<PdfMetrics> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pages = pdf.numPages;
  let fullText = '';

  for (let i = 1; i <= pages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => item.str)
      .join(' ');
    fullText += pageText + '\n';
  }

  const characters = fullText.length;
  const { charsPerToken, systemPromptTokens, outputMultiplier } =
    PRICING.tokenEstimation;

  const contentTokens = Math.ceil(characters / charsPerToken);
  const estimatedInputTokens = contentTokens + systemPromptTokens;
  const estimatedOutputTokens = Math.ceil(contentTokens * outputMultiplier);

  return {
    pages,
    characters,
    estimatedInputTokens,
    estimatedOutputTokens,
    fileSizeKB: Math.round(file.size / 1024),
  };
}
