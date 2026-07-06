import type { FileMetrics } from '../types';
import { PRICING } from '../constants';
import { loadPdfJs } from './pdfClient';

const ACCEPTED_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/rtf',
  'application/rtf',
]);

const ACCEPTED_EXTENSIONS = new Set(['.pdf', '.docx', '.txt', '.rtf']);

export function isAcceptedFile(file: File): boolean {
  if (ACCEPTED_TYPES.has(file.type)) return true;
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  return ACCEPTED_EXTENSIONS.has(ext);
}

export function getFileExtension(file: File): string {
  return file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
}

async function analyzePdfFile(file: File): Promise<{ pages: number; text: string }> {
  const pdfjsLib = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = pdf.numPages;
  let fullText = '';

  for (let i = 1; i <= pages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: unknown) => (item as { str: string }).str)
      .join(' ');
    fullText += pageText + '\n';
  }

  return { pages, text: fullText };
}

async function analyzeDocxFile(file: File): Promise<{ pages: number; text: string }> {
  // Dynamic import so mammoth is only loaded when needed
  const mammoth = await import('mammoth');
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  const text = result.value;
  // Rough page estimate: ~250 words per page
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const pages = Math.max(1, Math.ceil(wordCount / 250));
  return { pages, text };
}

async function analyzeTextFile(file: File): Promise<{ pages: number; text: string }> {
  const text = await file.text();
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const pages = Math.max(1, Math.ceil(wordCount / 250));
  return { pages, text };
}

export async function analyzeFile(file: File): Promise<FileMetrics> {
  const ext = getFileExtension(file);
  let result: { pages: number; text: string };

  if (ext === '.pdf' || file.type === 'application/pdf') {
    result = await analyzePdfFile(file);
  } else if (ext === '.docx') {
    result = await analyzeDocxFile(file);
  } else {
    result = await analyzeTextFile(file);
  }

  const characters = result.text.length;
  const { charsPerToken, systemPromptTokens, outputMultiplier } =
    PRICING.tokenEstimation;

  const contentTokens = Math.ceil(characters / charsPerToken);
  const estimatedInputTokens = contentTokens + systemPromptTokens;
  const estimatedOutputTokens = Math.ceil(contentTokens * outputMultiplier);

  return {
    pages: result.pages,
    characters,
    estimatedInputTokens,
    estimatedOutputTokens,
    fileSizeKB: Math.round(file.size / 1024),
  };
}
