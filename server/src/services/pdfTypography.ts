import { PDFExtract, type PDFExtractPage, type PDFExtractText } from 'pdf.js-extract';

const MAX_HINTS = 25;

type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4';

interface LineRun {
  text: string;
  x: number;
  width: number;
  fontSize: number;
  fontName: string;
  fontFamily: string;
  isBold: boolean;
}

interface LineGroup {
  y: number;
  runs: LineRun[];
}

export interface TypographyHint {
  text: string;
  fontFamily: string;
  fontSize: number;
  sizeRatio: number;
  page: number;
  tag: HeadingTag;
}

export interface TypographyExtractionResult {
  bodyFamily: string | null;
  hints: TypographyHint[];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

function stripSubsetPrefix(value: string): string {
  return value.replace(/^[A-Z]{6}\+/, '').trim();
}

function normalizeFontFamily(rawName?: string, rawFamily?: string): string {
  const candidate = stripSubsetPrefix(rawFamily?.trim() || rawName?.trim() || '');
  const lower = candidate.toLowerCase();

  if (!candidate) return 'serif';
  if (lower.includes('timesnewroman') || lower.includes('times new roman') || lower.includes('times-roman')) {
    return "'Times New Roman'";
  }
  if (lower.includes('arial')) return 'Arial';
  if (lower.includes('helvetica')) return 'Helvetica';
  if (lower.includes('georgia')) return 'Georgia';
  if (lower.includes('garamond')) return 'Garamond';
  if (lower.includes('palatino')) return 'Palatino';
  if (lower.includes('calibri')) return 'Calibri';
  if (lower.includes('cambria')) return 'Cambria';
  if (lower.includes('avenir')) return 'Avenir';
  if (lower.includes('futura')) return 'Futura';
  if (lower.includes('gillsans') || lower.includes('gill sans')) return "'Gill Sans'";
  if (lower.includes('lora')) return 'Lora';

  if (
    lower.includes('serif') ||
    lower.includes('roman') ||
    lower.includes('times') ||
    lower.includes('garamond') ||
    lower.includes('baskerville') ||
    lower.includes('palatino')
  ) {
    return 'serif';
  }

  if (
    lower.includes('sans') ||
    lower.includes('helvetica') ||
    lower.includes('arial') ||
    lower.includes('avenir') ||
    lower.includes('futura') ||
    lower.includes('gotham') ||
    lower.includes('calibri')
  ) {
    return 'sans-serif';
  }

  return candidate.includes(' ') ? `"${candidate}"` : candidate;
}

function isBoldFont(rawName?: string, rawFamily?: string): boolean {
  const value = `${rawName || ''} ${rawFamily || ''}`.toLowerCase();
  return /(bold|black|heavy|demi|semi ?bold)/.test(value);
}

function lineTolerance(fontSize: number): number {
  return Math.max(1.5, fontSize * 0.35);
}

function buildLineText(runs: LineRun[]): string {
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

function groupLines(page: PDFExtractPage): LineGroup[] {
  const items = [...page.content]
    .filter((item) => item.str.trim())
    .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));

  const lines: LineGroup[] = [];

  for (const item of items) {
    const fontName = stripSubsetPrefix(item.font.name || '');
    const fontFamily = normalizeFontFamily(item.font.name, item.font.family);
    const run: LineRun = {
      text: item.str,
      x: item.x,
      width: item.width,
      fontSize: item.font.size,
      fontName,
      fontFamily,
      isBold: isBoldFont(item.font.name, item.font.family),
    };

    const lastLine = lines.at(-1);
    if (lastLine && Math.abs(lastLine.y - item.y) <= lineTolerance(item.font.size)) {
      lastLine.runs.push(run);
      lastLine.y = (lastLine.y + item.y) / 2;
    } else {
      lines.push({ y: item.y, runs: [run] });
    }
  }

  return lines;
}

function getDominantBodyFamily(pages: PDFExtractPage[]): string | null {
  const weights = new Map<string, number>();

  for (const page of pages) {
    for (const item of page.content) {
      const text = item.str.trim();
      if (!text) continue;
      const family = normalizeFontFamily(item.font.name, item.font.family);
      weights.set(family, (weights.get(family) ?? 0) + text.length);
    }
  }

  let dominant: string | null = null;
  let maxWeight = 0;

  for (const [family, weight] of weights.entries()) {
    if (weight > maxWeight) {
      dominant = family;
      maxWeight = weight;
    }
  }

  return dominant;
}

function inferHeadingTag(sizeRatio: number): HeadingTag {
  if (sizeRatio >= 1.6) return 'h1';
  if (sizeRatio >= 1.3) return 'h2';
  if (sizeRatio >= 1.15) return 'h3';
  return 'h4';
}

function shouldKeepHeading(text: string): boolean {
  if (text.length < 2 || text.length > 140) return false;
  if (/^[\d\s./-]+$/.test(text)) return false;
  if (/[.!?]$/.test(text) && !/:$/.test(text)) return false;
  return true;
}

function lineToHint(
  line: LineGroup,
  pageNumber: number,
  bodyFontSize: number,
): TypographyHint | null {
  const text = buildLineText(line.runs);
  if (!shouldKeepHeading(text)) return null;

  const totalChars = line.runs.reduce((sum, run) => sum + Math.max(run.text.trim().length, 1), 0);
  if (!totalChars || !bodyFontSize) return null;

  const weightedFontSize =
    line.runs.reduce((sum, run) => sum + run.fontSize * Math.max(run.text.trim().length, 1), 0) / totalChars;

  const familyWeights = new Map<string, number>();
  const boldWeight = line.runs.reduce(
    (sum, run) => sum + (run.isBold ? Math.max(run.text.trim().length, 1) : 0),
    0,
  );

  for (const run of line.runs) {
    const weight = Math.max(run.text.trim().length, 1);
    familyWeights.set(run.fontFamily, (familyWeights.get(run.fontFamily) ?? 0) + weight);
  }

  let dominantFamily = 'serif';
  let dominantWeight = 0;
  for (const [family, weight] of familyWeights.entries()) {
    if (weight > dominantWeight) {
      dominantFamily = family;
      dominantWeight = weight;
    }
  }

  const sizeRatio = Number((weightedFontSize / bodyFontSize).toFixed(2));
  const isBoldLine = boldWeight / totalChars >= 0.5;
  const qualifies = sizeRatio >= 1.15 || (isBoldLine && sizeRatio >= 1.05);

  if (!qualifies) return null;

  return {
    text,
    fontFamily: dominantFamily,
    fontSize: Number(weightedFontSize.toFixed(2)),
    sizeRatio,
    page: pageNumber,
    tag: inferHeadingTag(sizeRatio),
  };
}

export async function extractTypographyHints(
  pdfBuffer: Buffer,
): Promise<TypographyExtractionResult> {
  const extractor = new PDFExtract();
  let result;

  try {
    result = await extractor.extractBuffer(pdfBuffer);
  } catch (err) {
    console.error('[pdfTypography] Extraction failed, continuing without typography hints:', err);
    return { bodyFamily: null, hints: [] };
  }

  const fontSizes = result.pages
    .flatMap((page) => page.content)
    .map((item) => item.font.size)
    .filter((size) => Number.isFinite(size) && size > 0);

  const bodyFontSize = median(fontSizes);
  if (!bodyFontSize) {
    return { bodyFamily: getDominantBodyFamily(result.pages), hints: [] };
  }

  const seen = new Set<string>();
  const hints: TypographyHint[] = [];

  for (const page of result.pages) {
    const lines = groupLines(page);

    for (const line of lines) {
      if (hints.length >= MAX_HINTS) break;

      const hint = lineToHint(line, page.info.num, bodyFontSize);
      if (!hint) continue;

      const dedupeKey = hint.text.replace(/\s+/g, ' ').trim().toLowerCase();
      if (seen.has(dedupeKey)) continue;

      seen.add(dedupeKey);
      hints.push(hint);
    }

    if (hints.length >= MAX_HINTS) break;
  }

  return {
    bodyFamily: getDominantBodyFamily(result.pages),
    hints,
  };
}

export function buildTypographyCatalog(result: TypographyExtractionResult): string {
  if (!result.bodyFamily && result.hints.length === 0) return '';

  const lines = ['--- TYPOGRAPHY HINTS ---'];

  if (result.bodyFamily) {
    lines.push(`BODY: font="${result.bodyFamily}"`);
  }

  for (const hint of result.hints) {
    const safeText = hint.text.replace(/"/g, '\\"');
    lines.push(
      `${hint.tag.toUpperCase()}: "${safeText}" font="${hint.fontFamily}" size=${hint.sizeRatio.toFixed(2)}x page=${hint.page}`,
    );
  }

  lines.push('--- END TYPOGRAPHY HINTS ---');
  return lines.join('\n');
}
