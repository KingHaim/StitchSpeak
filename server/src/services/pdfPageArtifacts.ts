import { PDFExtract, type PDFExtractPage } from 'pdf.js-extract';

const MARGIN_RATIO = 0.16;
const PAGE_NUMBER_MARGIN_RATIO = 0.09;
const MAX_ARTIFACT_LINES = 24;
const MAX_ARTIFACT_LENGTH = 160;

interface TextRun {
  text: string;
  x: number;
  width: number;
  fontSize: number;
}

interface LineGroup {
  page: number;
  y: number;
  yRatio: number;
  text: string;
}

interface PageLike {
  info: {
    num: number;
    height: number;
  };
  content: Array<{
    str: string;
    x: number;
    y: number;
    width: number;
    font: {
      size: number;
    };
  }>;
}

export interface PdfPageArtifactProfile {
  /**
   * Exact source strings detected in page margins. These are repeated headers,
   * footers, social handles/hashtags, or standalone page numbers.
   */
  phrases: string[];
}

const EMPTY_PROFILE: PdfPageArtifactProfile = { phrases: [] };

function lineTolerance(fontSize: number): number {
  return Math.max(1.5, fontSize * 0.35);
}

function buildLineText(runs: TextRun[]): string {
  const sortedRuns = [...runs].sort((a, b) => a.x - b.x);
  let text = '';
  let previousRight = 0;

  for (const run of sortedRuns) {
    const cleaned = run.text.replace(/\s+/g, ' ').trim();
    if (!cleaned) continue;

    if (!text) {
      text = cleaned;
      previousRight = run.x + run.width;
      continue;
    }

    const gap = run.x - previousRight;
    const needsSpace =
      gap > Math.max(1, run.fontSize * 0.15) &&
      !/^[,.;:!?%)\]]/.test(cleaned) &&
      !/[(/-]$/.test(text);

    text += needsSpace ? ` ${cleaned}` : cleaned;
    previousRight = Math.max(previousRight, run.x + run.width);
  }

  return text.trim();
}

function groupPageLines(page: PageLike): LineGroup[] {
  const items = [...page.content]
    .filter((item) => item.str.trim())
    .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));

  const grouped: Array<{ y: number; runs: TextRun[] }> = [];

  for (const item of items) {
    const fontSize = item.font.size || 10;
    const run: TextRun = {
      text: item.str,
      x: item.x,
      width: item.width,
      fontSize,
    };

    const lastLine = grouped.at(-1);
    if (lastLine && Math.abs(lastLine.y - item.y) <= lineTolerance(fontSize)) {
      lastLine.runs.push(run);
      lastLine.y = (lastLine.y + item.y) / 2;
    } else {
      grouped.push({ y: item.y, runs: [run] });
    }
  }

  const pageHeight = page.info.height || 1;
  return grouped
    .map((line) => ({
      page: page.info.num,
      y: line.y,
      yRatio: Math.min(1, Math.max(0, line.y / pageHeight)),
      text: buildLineText(line.runs),
    }))
    .filter((line) => line.text);
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function normalizeArtifactText(value: string): string {
  return decodeHtmlEntities(value)
    .normalize('NFKD')
    .replace(/\p{Mark}/gu, '')
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\p{Letter}\p{Number}@#._/%+-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDigitPattern(value: string): string {
  return normalizeArtifactText(value).replace(/\p{Number}+/gu, '#');
}

function isInPageMargin(line: LineGroup): boolean {
  return line.yRatio <= MARGIN_RATIO || line.yRatio >= 1 - MARGIN_RATIO;
}

function isInPageNumberMargin(line: LineGroup): boolean {
  return line.yRatio <= PAGE_NUMBER_MARGIN_RATIO || line.yRatio >= 1 - PAGE_NUMBER_MARGIN_RATIO;
}

function isPageNumberLine(line: LineGroup, pageCount: number): boolean {
  if (!isInPageNumberMargin(line)) return false;

  const compact = line.text.replace(/\s+/g, ' ').trim();
  const bareNumber = compact.match(/^\d{1,4}$/);
  if (bareNumber) {
    const pageNumber = Number(bareNumber[0]);
    return pageNumber >= 1 && pageNumber <= pageCount + 2;
  }

  const labelledNumber = compact.match(/^(?:page|p\.|seite|pagina|página)\s+(\d{1,4})(?:\s+(?:of|von|de)\s+\d{1,4})?$/i);
  if (!labelledNumber) return false;

  const pageNumber = Number(labelledNumber[1]);
  return pageNumber >= 1 && pageNumber <= pageCount + 2;
}

function uniquePreservingOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const key = normalizeArtifactText(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }

  return result;
}

export function detectPdfPageArtifactsFromPages(pages: PageLike[]): PdfPageArtifactProfile {
  if (pages.length <= 1) return EMPTY_PROFILE;

  const marginLines = pages
    .flatMap((page) => groupPageLines(page))
    .filter(isInPageMargin)
    .filter((line) => line.text.length <= MAX_ARTIFACT_LENGTH);

  if (marginLines.length === 0) return EMPTY_PROFILE;

  const exactCounts = new Map<string, Set<number>>();
  const digitPatternCounts = new Map<string, Set<number>>();

  for (const line of marginLines) {
    const normalized = normalizeArtifactText(line.text);
    if (!normalized) continue;

    const exactPages = exactCounts.get(normalized) ?? new Set<number>();
    exactPages.add(line.page);
    exactCounts.set(normalized, exactPages);

    const digitPattern = normalizeDigitPattern(line.text);
    if (digitPattern.includes('#')) {
      const digitPages = digitPatternCounts.get(digitPattern) ?? new Set<number>();
      digitPages.add(line.page);
      digitPatternCounts.set(digitPattern, digitPages);
    }
  }

  const artifactLines = marginLines.filter((line) => {
    const normalized = normalizeArtifactText(line.text);
    if (!normalized) return false;
    if (isPageNumberLine(line, pages.length)) return true;
    if ((exactCounts.get(normalized)?.size ?? 0) >= 2) return true;
    return (digitPatternCounts.get(normalizeDigitPattern(line.text))?.size ?? 0) >= 2;
  });

  const phrases = uniquePreservingOrder(artifactLines.map((line) => line.text))
    .slice(0, MAX_ARTIFACT_LINES);

  return phrases.length ? { phrases } : EMPTY_PROFILE;
}

export async function detectPdfPageArtifacts(pdfBuffer: Buffer): Promise<PdfPageArtifactProfile> {
  const extractor = new PDFExtract();

  try {
    const result = await extractor.extractBuffer(pdfBuffer);
    return detectPdfPageArtifactsFromPages(result.pages as PDFExtractPage[]);
  } catch (err) {
    console.error('[pdfPageArtifacts] Extraction failed, continuing without artifact hints:', err);
    return EMPTY_PROFILE;
  }
}

function escapePromptString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function buildPdfPageArtifactInstruction(profile: PdfPageArtifactProfile): string {
  if (profile.phrases.length === 0) return '';

  const lines = profile.phrases.map((phrase) => `- "${escapePromptString(phrase)}"`);
  return `
The following strings were detected as repeated PDF page headers, footers, or page numbers in the page margins. They are layout artifacts, NOT knitting instructions. Do not translate them, do not emit them, and do not create data-seg/data-o blocks for them. If one appears at an original page break, skip it and continue with the next real pattern line.
--- PDF PAGE ARTIFACTS TO OMIT ---
${lines.join('\n')}
--- END PDF PAGE ARTIFACTS ---`;
}

function stripHtmlTags(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function stableTokens(value: string): string[] {
  return Array.from(
    new Set(
      (value.match(/(?:[@#][\p{Letter}\p{Number}_.-]+|https?:\/\/\S+|www\.\S+)/giu) ?? [])
        .map((token) => normalizeArtifactText(token))
        .filter(Boolean),
    ),
  );
}

function dataOriginalFromAttributes(attrs: string): string {
  const match = attrs.match(/\sdata-o\s*=\s*(["'])([\s\S]*?)\1/i);
  return match ? decodeHtmlEntities(match[2]) : '';
}

function isImageMarkerOnly(innerHtml: string): boolean {
  const text = stripHtmlTags(innerHtml);
  return /^\[\s*(?:IMG|ROW)[_\s-]?\d+\s*\]$/i.test(text);
}

function shouldRemoveBlock(
  attrs: string,
  innerHtml: string,
  normalizedPhrases: Set<string>,
  tokens: string[],
): boolean {
  if (isImageMarkerOnly(innerHtml)) return false;

  const original = normalizeArtifactText(dataOriginalFromAttributes(attrs));
  const visible = normalizeArtifactText(stripHtmlTags(innerHtml));

  if (original && normalizedPhrases.has(original)) return true;
  if (visible && normalizedPhrases.has(visible)) return true;

  if (visible.length <= MAX_ARTIFACT_LENGTH || original.length <= MAX_ARTIFACT_LENGTH) {
    return tokens.some((token) => {
      if (!token) return false;
      return (visible && visible.includes(token)) || (original && original.includes(token));
    });
  }

  return false;
}

export function removePdfPageArtifacts(
  html: string,
  profile: PdfPageArtifactProfile,
): string {
  if (!html || profile.phrases.length === 0) return html;

  const normalizedPhrases = new Set(
    profile.phrases.map((phrase) => normalizeArtifactText(phrase)).filter(Boolean),
  );
  const tokens = Array.from(new Set(profile.phrases.flatMap(stableTokens)));
  if (normalizedPhrases.size === 0 && tokens.length === 0) return html;

  return html
    .replace(/<(h[1-4]|p|li)\b([^>]*)>([\s\S]*?)<\/\1>/gi, (match, _tag: string, attrs: string, inner: string) =>
      shouldRemoveBlock(attrs, inner, normalizedPhrases, tokens) ? '' : match,
    )
    .replace(/\n{3,}/g, '\n\n');
}
