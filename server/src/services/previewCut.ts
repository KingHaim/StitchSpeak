/**
 * US10 preview cut — craft rule from Patterns.
 *
 * The free preview must cover the first worked section that contains numbers:
 * the cast-on with all size columns, plus the first rows or rounds of the
 * body or yoke. Then extend to a cap of ~15% of segments or 1.5 pages,
 * whichever ends later. Never cut mid-repeat or mid size-row. Never separate
 * a chart from its key/legend, and never split a size table. If the document
 * has a glossary term, keep at least one in the preview so the bilingual
 * review can surface it.
 *
 * For PDFs, N is the smallest whole-page boundary that satisfies those
 * rules; preview is pages 1..N and resume is N+1..end.
 *
 * The cut is computed on SOURCE text before translation. The API then
 * translates only that slice, so untranslated-to-translated content beyond
 * the cut is never returned.
 */

export const PREVIEW_SEGMENT_FRACTION = 0.15;
export const PREVIEW_PAGE_CAP = 1.5;
export const WORDS_PER_PAGE = 250;

export interface PreviewSegment {
  index: number;
  text: string;
  html: string;
  /** 1-based page, may be fractional for estimated pagination. */
  page: number;
  isSizeRow: boolean;
  isRepeatOpener: boolean;
  isRepeatCloser: boolean;
  isSelfContainedRepeat: boolean;
  hasNumbers: boolean;
  hasGlossaryTerm: boolean;
  isCastOn: boolean;
  isBodyOrYoke: boolean;
  isRowOrRound: boolean;
  isHeading: boolean;
  isChart: boolean;
  isLegend: boolean;
  isSizeTable: boolean;
}

export interface PreviewCut {
  /** Exclusive end index into `segments` (preview is slices [0, end)). */
  end: number;
  segments: PreviewSegment[];
  previewHtml: string;
  remainingHtml: string;
  previewHasNumbers: boolean;
  previewHasGlossaryTerm: boolean;
  documentHasGlossaryTerm: boolean;
  /** Smallest whole page (1-based) that covers the preview cut. */
  previewEndPage: number;
}

const BLOCK_RE = /<(p|h[1-6]|li|tr|table|blockquote|pre)(\s[^>]*)?>[\s\S]*?<\/\1>/gi;

const SIZE_ROW_RE = /\d[\d.,/]*\s*\(\s*\d/;
const NUMBER_RE = /\d/;
const REPEAT_OPEN_RE = /\brepeat\b|\brep\.?\s+from|\brep\.?\s+\*|\*\s*$/i;
const REPEAT_CLOSE_RE = /end of (?:the )?repeat|rep(?:eat)? from \* to (?:end|last)|hasta el final/i;
const CAST_ON_RE =
  /\b(cast\s*on|\bco\b|montar(?:\s+puntos)?|anschlagen|monter les mailles|avviare|opzetten|l[aä]gga upp|legge opp|slå op|luoda silmukat)\b/i;
const BODY_YOKE_RE = /\b(body|yoke|canes[uú]|cuerpo|rumpf|empi[eè]cement|delantero|back|manga|sleeve)\b/i;
const ROW_ROUND_RE =
  /\b((?:row|round|rang|tour|vuelta|reihe|md)\s*\.?\s*\d|\b(knit|purl|k\d|p\d|derecho|revés)\b)/i;
const HEADING_RE = /^h[1-6]$/i;

/**
 * High-signal craft terms (full forms and multi-character abbreviations).
 * Single-letter K/P are skipped so size labels are not treated as glossary.
 */
const GLOSSARY_TERM_RE =
  /\b(cast\s*on|bind\s*off|cast\s*off|knit|purl|yarn\s*over|k2tog|ssk|kfb|m1[lr]?|sl1|wyif|wyib|montar puntos|rematar|cerrar|derecho|revés|hebra|disminuci[oó]n|aumento)\b/i;
const CHART_RE = /\b(chart|stitch chart|gr[aá]fico|diagrama(?: de puntos)?)\b/i;
const LEGEND_RE =
  /\b(legend|leyenda|symbol key|chart key|clave de (?:s[ií]mbolos|puntos)|abbreviations)\b/i;

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function readPage(html: string): number | null {
  const match = html.match(/\bdata-page\s*=\s*["']?(\d+(?:\.\d+)?)/i);
  if (!match) return null;
  const page = Number(match[1]);
  return Number.isFinite(page) && page > 0 ? page : null;
}

function readTag(html: string): string {
  return html.match(/^<([a-z0-9]+)\b/i)?.[1] ?? 'p';
}

export function classifySegmentText(text: string, tag = 'p'): Omit<PreviewSegment, 'index' | 'html' | 'page'> {
  const isSelfContainedRepeat =
    REPEAT_OPEN_RE.test(text) && (REPEAT_CLOSE_RE.test(text) || /\*.+\*/.test(text) || /to end/i.test(text));
  const isSizeRow = SIZE_ROW_RE.test(text);
  return {
    text,
    isSizeRow,
    isRepeatOpener: REPEAT_OPEN_RE.test(text),
    isRepeatCloser: REPEAT_CLOSE_RE.test(text) || isSelfContainedRepeat,
    isSelfContainedRepeat,
    hasNumbers: NUMBER_RE.test(text),
    hasGlossaryTerm: GLOSSARY_TERM_RE.test(text),
    isCastOn: CAST_ON_RE.test(text),
    isBodyOrYoke: BODY_YOKE_RE.test(text),
    isRowOrRound: ROW_ROUND_RE.test(text),
    isHeading: HEADING_RE.test(tag),
    isChart: CHART_RE.test(text),
    isLegend: LEGEND_RE.test(text),
    isSizeTable: tag === 'table' && (isSizeRow || SIZE_ROW_RE.test(text)),
  };
}

function assignPages(
  segments: Array<Omit<PreviewSegment, 'page' | 'index'> & { page?: number | null }>,
): PreviewSegment[] {
  let cumulativeWords = 0;
  return segments.map((segment, index) => {
    const words = segment.text.split(/\s+/).filter(Boolean).length;
    const startWords = cumulativeWords;
    cumulativeWords += words;
    const estimated = 1 + startWords / WORDS_PER_PAGE;
    return {
      ...segment,
      index,
      page: segment.page && segment.page > 0 ? segment.page : estimated,
    };
  });
}

export function segmentsFromHtml(html: string): PreviewSegment[] {
  const matches = html.match(BLOCK_RE);
  const blocks = matches && matches.length > 0
    ? matches
    : stripTags(html)
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => `<p>${block}</p>`);

  const raw = blocks
    .map((block) => {
      const text = stripTags(block);
      if (!text) return null;
      const tag = readTag(block);
      return {
        html: block,
        page: readPage(block),
        ...classifySegmentText(text, tag),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return assignPages(raw);
}

function firstWorkedSectionEnd(segments: PreviewSegment[]): number {
  if (segments.length === 0) return 0;

  const castOn = segments.findIndex((segment) => segment.isCastOn && segment.hasNumbers);
  const start = castOn >= 0
    ? castOn
    : segments.findIndex((segment) => segment.hasNumbers && (segment.isRowOrRound || segment.isSizeRow));
  if (start < 0) {
    const anyNumbered = segments.findIndex((segment) => segment.hasNumbers);
    return anyNumbered >= 0 ? anyNumbered + 1 : Math.min(1, segments.length);
  }

  let end = start + 1;
  // Keep every size column that belongs to the cast-on / first instruction.
  while (end < segments.length && segments[end].isSizeRow) end += 1;

  // First rows/rounds of the body or yoke — include the heading if it follows
  // immediately, then one or two numbered rows (and finish any open repeat).
  // Do not keep walking just because later filler also has numbers.
  if (end < segments.length && segments[end].isBodyOrYoke) end += 1;
  let includedRows = 0;
  while (end < segments.length && includedRows < 2) {
    const segment = segments[end];
    if (segment.isHeading && includedRows > 0 && !segment.isBodyOrYoke) break;
    if (segment.isSizeRow) {
      if (includedRows === 0) {
        end += 1;
        continue;
      }
      break;
    }
    if (segment.isRowOrRound || segment.isRepeatOpener) {
      end += 1;
      includedRows += 1;
      if (segment.isSelfContainedRepeat || segment.isRepeatCloser) break;
      if (segment.isRepeatOpener && !segment.isSelfContainedRepeat) {
        while (end < segments.length && !segments[end].isRepeatCloser && !segments[end].isHeading) {
          end += 1;
        }
        if (end < segments.length && segments[end].isRepeatCloser) end += 1;
      }
      continue;
    }
    break;
  }

  return Math.max(end, start + 1);
}

function capEnd(segments: PreviewSegment[]): number {
  if (segments.length === 0) return 0;
  const byFraction = Math.max(1, Math.ceil(segments.length * PREVIEW_SEGMENT_FRACTION));
  let byPages = 0;
  for (let i = 0; i < segments.length; i += 1) {
    if (segments[i].page <= PREVIEW_PAGE_CAP) byPages = i + 1;
  }
  if (byPages === 0) byPages = 1;
  return Math.max(byFraction, byPages);
}

function snapToSafeBoundary(segments: PreviewSegment[], end: number): number {
  let next = Math.max(0, Math.min(end, segments.length));
  if (next === 0 || next >= segments.length) return next;

  if (segments[next - 1].isSizeRow) {
    while (next < segments.length && segments[next].isSizeRow) next += 1;
  }

  let openRepeats = 0;
  for (let i = 0; i < next; i += 1) {
    if (segments[i].isSelfContainedRepeat) continue;
    if (segments[i].isRepeatOpener) openRepeats += 1;
    if (segments[i].isRepeatCloser && openRepeats > 0) openRepeats -= 1;
  }
  while (openRepeats > 0 && next < segments.length) {
    const segment = segments[next];
    next += 1;
    if (segment.isSelfContainedRepeat) continue;
    if (segment.isRepeatOpener) openRepeats += 1;
    if (segment.isRepeatCloser && openRepeats > 0) openRepeats -= 1;
  }

  return next;
}

function ensureCraftCoverage(segments: PreviewSegment[], end: number): number {
  let next = end;
  const documentHasGlossary = segments.some((segment) => segment.hasGlossaryTerm);
  const documentHasNumbers = segments.some((segment) => segment.hasNumbers);

  if (documentHasNumbers && !segments.slice(0, next).some((segment) => segment.hasNumbers)) {
    const firstNumbered = segments.findIndex((segment) => segment.hasNumbers);
    if (firstNumbered >= 0) next = Math.max(next, firstNumbered + 1);
  }

  if (documentHasGlossary && !segments.slice(0, next).some((segment) => segment.hasGlossaryTerm)) {
    const firstGlossary = segments.findIndex((segment) => segment.hasGlossaryTerm);
    if (firstGlossary >= 0) next = Math.max(next, firstGlossary + 1);
  }

  return snapToSafeBoundary(segments, next);
}

function wholePage(page: number): number {
  return Math.max(1, Math.ceil(page));
}

function repeatOpenAcross(segments: PreviewSegment[], page: number): boolean {
  let openRepeats = 0;
  let closerAfter = false;
  for (const segment of segments) {
    const segmentPage = wholePage(segment.page);
    if (segment.isSelfContainedRepeat) continue;
    if (segmentPage <= page) {
      if (segment.isRepeatOpener) openRepeats += 1;
      if (segment.isRepeatCloser && openRepeats > 0) openRepeats -= 1;
    } else if (segment.isRepeatCloser) {
      closerAfter = true;
    }
  }
  return openRepeats > 0 && closerAfter;
}

function sizeTableSplits(segments: PreviewSegment[], page: number): boolean {
  let i = 0;
  while (i < segments.length) {
    const inTable = segments[i].isSizeRow || segments[i].isSizeTable;
    if (!inTable) {
      i += 1;
      continue;
    }
    const start = i;
    while (i < segments.length && (segments[i].isSizeRow || segments[i].isSizeTable)) i += 1;
    const run = segments.slice(start, i);
    const firstPage = wholePage(run[0].page);
    const lastPage = wholePage(run[run.length - 1].page);
    if (firstPage <= page && lastPage > page) return true;
  }
  return false;
}

function nearestLegendIndex(segments: PreviewSegment[], chartIndex: number): number {
  let best = -1;
  let bestDistance = 12;
  for (let i = 0; i < segments.length; i += 1) {
    if (!segments[i].isLegend) continue;
    const distance = Math.abs(i - chartIndex);
    if (distance <= bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  return best;
}

function chartLegendSplits(segments: PreviewSegment[], page: number): boolean {
  for (let i = 0; i < segments.length; i += 1) {
    if (!segments[i].isChart) continue;
    const legendIndex = nearestLegendIndex(segments, i);
    if (legendIndex < 0) continue;
    const chartPage = wholePage(segments[i].page);
    const legendPage = wholePage(segments[legendIndex].page);
    const low = Math.min(chartPage, legendPage);
    const high = Math.max(chartPage, legendPage);
    if (low <= page && high > page) return true;
  }
  return false;
}

export function pageBoundarySplitsProtected(segments: PreviewSegment[], page: number): boolean {
  return (
    repeatOpenAcross(segments, page)
    || sizeTableSplits(segments, page)
    || chartLegendSplits(segments, page)
  );
}

/**
 * Smallest whole page N such that pages 1..N cover the segment cut and do
 * not split a repeat, size table, or chart/legend pair.
 */
export function choosePreviewEndPage(segments: PreviewSegment[], end: number): number {
  if (segments.length === 0) return 1;
  const last = segments[Math.max(0, Math.min(end, segments.length) - 1)];
  let n = last ? wholePage(last.page) : 1;
  const maxPage = Math.max(...segments.map((segment) => wholePage(segment.page)));
  while (n < maxPage && pageBoundarySplitsProtected(segments, n)) n += 1;
  return n;
}

export function htmlForPageRange(segments: PreviewSegment[], startPage: number, endPage: number): string {
  return segments
    .filter((segment) => {
      const page = wholePage(segment.page);
      return page >= startPage && page <= endPage;
    })
    .map((segment) => segment.html)
    .join('\n');
}

export function cutPreviewHtml(sourceHtml: string): PreviewCut {
  const segments = segmentsFromHtml(sourceHtml);
  if (segments.length === 0) {
    return {
      end: 0,
      segments,
      previewHtml: '',
      remainingHtml: '',
      previewHasNumbers: false,
      previewHasGlossaryTerm: false,
      documentHasGlossaryTerm: false,
      previewEndPage: 1,
    };
  }

  const workedEnd = firstWorkedSectionEnd(segments);
  const capped = Math.max(workedEnd, capEnd(segments));
  const end = ensureCraftCoverage(segments, snapToSafeBoundary(segments, capped));
  const previewEndPage = choosePreviewEndPage(segments, end);
  const preview = segments.slice(0, end);
  const remaining = segments.slice(end);

  return {
    end,
    segments,
    previewHtml: preview.map((segment) => segment.html).join('\n'),
    remainingHtml: remaining.map((segment) => segment.html).join('\n'),
    previewHasNumbers: preview.some((segment) => segment.hasNumbers),
    previewHasGlossaryTerm: preview.some((segment) => segment.hasGlossaryTerm),
    documentHasGlossaryTerm: segments.some((segment) => segment.hasGlossaryTerm),
    previewEndPage,
  };
}

export function remainingSourceHasContent(html: string): boolean {
  return stripTags(html).length > 0;
}
