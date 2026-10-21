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
export const PREVIEW_MAX_COVERAGE = 0.5;
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
  isTipOrNote: boolean;
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
const REPEAT_OPEN_RE = /\brep(?:eat)?\.?\s+from|\brep\.?\s+\*|\*\s*$/i;
const REPEAT_CLOSE_RE = /end of (?:the )?repeat|rep(?:eat)? from \* to (?:end|last)|hasta el final/i;
const CAST_ON_RE =
  /\b(cast\s*on|\bco\b|montar(?:\s+puntos)?|anschlagen|monter les mailles|avviare|opzetten|l[aä]gga upp|legge opp|slå op|luoda silmukat)\b/i;
const BODY_YOKE_RE = /\b(body|yoke|canes[uú]|cuerpo|rumpf|empi[eè]cement|delantero|back|manga|sleeve)\b/i;
/** The first worked garment part — not sleeves / finishing / charts. */
const FIRST_WORKED_PART_RE =
  /\b(body|yoke|canes[uú]|cuerpo|rumpf|empi[eè]cement|delantero|back|front|espalda|delantera)\b/i;
/** Next major part after the first worked section. */
const NEXT_PART_RE =
  /\b(sleeves?|mangas?|finishing|acabado|assembly|ensamblaje|making up|charts?|gr[aá]ficos?|neck(?:line)?|collar|cuello|hood|capucha)\b/i;
const ROW_ROUND_RE =
  /\b((?:row|round|rang|tour|vuelta|reihe|md)\s*\.?\s*\d|\b(knit|purl|derecho|revés)\b|\bk\d+(?![a-zA-Z])|\bp\d+(?![a-zA-Z]))/i;
const HEADING_RE = /^h[1-6]$/i;
/**
 * Tip / note / consejo labels. Anchored at the start so "Row 1: note the
 * marker" is not treated as a tip section. "DECREASE TIP" and
 * "CONSEJO DE DISMINUCIÓN" are the prod false-start that used to steal the
 * first-worked-section cut.
 */
const TIP_NOTE_RE =
  /^(decrease\s+tip|increase\s+tip|cast[- ]on\s+tip|bind[- ]off\s+tip|tip|hint|note|notes|consejo(?:\s+de\s+\w+)?|nota|notas|astuce|hinweis|conseil)\b/i;

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
  // A line that *ends* with "rep from *" / "repeat from *" continues on the
  // next line even when it also has a leading `*`. Only treat `*…*` as
  // self-contained when the repeat is closed on the same line.
  const opensOntoNextLine = /(?:rep(?:eat)?\.?\s+from\s+\*|repeat from \*)\s*$/i.test(text.trim());
  const isSelfContainedRepeat =
    REPEAT_OPEN_RE.test(text)
    && !opensOntoNextLine
    && (REPEAT_CLOSE_RE.test(text) || /\*.+\*/.test(text) || /to end/i.test(text));
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
    isTipOrNote: TIP_NOTE_RE.test(text.trim()),
  };
}

function isTipHeading(segment: Pick<PreviewSegment, 'text' | 'isHeading' | 'isCastOn' | 'isTipOrNote'>): boolean {
  if (!segment.isTipOrNote || segment.isCastOn) return false;
  if (segment.isHeading) return true;
  // Short label paragraphs used as faux headings ("DECREASE TIP").
  return segment.text.trim().length <= 80 && !/\d/.test(segment.text);
}

/**
 * True for each segment that sits inside a tip/note/consejo block (the
 * heading plus following body until the next real heading).
 */
function tipSectionFlags(segments: Array<Pick<PreviewSegment, 'text' | 'isHeading' | 'isCastOn' | 'isTipOrNote' | 'hasNumbers' | 'isBodyOrYoke'>>): boolean[] {
  const flags = segments.map(() => false);
  let inTip = false;
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    const startsWorked = (segment.isCastOn && segment.hasNumbers) || segment.isBodyOrYoke;
    if (startsWorked) {
      inTip = false;
    } else if (isTipHeading(segment)) {
      inTip = true;
    } else if (segment.isHeading) {
      inTip = false;
    }
    flags[i] = inTip;
  }
  return flags;
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

/**
 * Index of the first real worked instruction (cast-on with stitch counts,
 * or the first numbered row/round / size row). Tip/note/consejo sections
 * are skipped — "DECREASE TIP" / "CONSEJO DE DISMINUCIÓN" is not the
 * first worked section even when it mentions k2tog.
 */
export function firstWorkedSectionStart(segments: PreviewSegment[]): number {
  if (segments.length === 0) return -1;
  const inTip = tipSectionFlags(segments);
  const castOn = segments.findIndex((segment, index) =>
    !inTip[index] && segment.isCastOn && segment.hasNumbers);
  if (castOn >= 0) return castOn;
  return segments.findIndex((segment, index) =>
    !inTip[index] && segment.hasNumbers && (segment.isRowOrRound || segment.isSizeRow));
}

/**
 * Exclusive end of the cast-on (all size columns) plus its first rows or
 * rounds, snapped to a row / repeat boundary. Fallback when the full first
 * worked section does not fit under the money cap.
 */
export function castOnAndFirstRowsEnd(segments: PreviewSegment[]): number {
  if (segments.length === 0) return 0;

  const start = firstWorkedSectionStart(segments);
  if (start < 0) {
    const inTip = tipSectionFlags(segments);
    const anyNumbered = segments.findIndex((segment, index) => !inTip[index] && segment.hasNumbers);
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
    if (isLaterPartStart(segment)) break;
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

  return snapToSafeBoundary(segments, Math.max(end, start + 1));
}

function isLaterPartStart(segment: PreviewSegment): boolean {
  const trimmed = segment.text.trim();
  if (/^later\b/i.test(trimmed)) return true;
  if (FIRST_WORKED_PART_RE.test(segment.text) && !NEXT_PART_RE.test(segment.text)) return false;
  if (!NEXT_PART_RE.test(segment.text)) return false;
  if (segment.isHeading) return true;
  if (trimmed.length <= 80 && !segment.hasNumbers) return true;
  return /^(sleeves?|mangas?|finishing|acabado|assembly|ensamblaje|making up|charts?|gr[aá]ficos?|neck(?:line)?|collar|cuello|hood|capucha)\b/i.test(trimmed);
}

/**
 * Exclusive end of the first worked section (cast-on with stitch counts,
 * then body/yoke rows until the next major part — sleeves, finishing,
 * charts). Never stops mid-repeat.
 */
export function firstWorkedSectionEnd(segments: PreviewSegment[]): number {
  const opening = castOnAndFirstRowsEnd(segments);
  if (opening <= 0 || opening >= segments.length) return opening;

  let end = opening;
  while (end < segments.length) {
    const segment = segments[end];
    if (isLaterPartStart(segment)) break;
    if (segment.isHeading && !FIRST_WORKED_PART_RE.test(segment.text) && !segment.isCastOn && !segment.isTipOrNote) {
      break;
    }
    const instructionalRow = /^(row|round|rang|tour|vuelta|reihe|md)\s*\.?\s*\d/i.test(segment.text.trim());
    const keep = instructionalRow
      || segment.isSizeRow
      || segment.isCastOn
      || segment.isBodyOrYoke
      || segment.isRepeatOpener
      || segment.isRepeatCloser
      || segment.isSelfContainedRepeat
      || segment.isTipOrNote
      || (segment.isHeading && FIRST_WORKED_PART_RE.test(segment.text));
    if (!keep) break;
    end += 1;
  }

  return snapToSafeBoundary(segments, Math.max(end, opening));
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

/** Exclusive end just before the last unclosed repeat opener (never mid-repeat). */
function cutBeforeOpenRepeat(segments: PreviewSegment[], end: number): number {
  let next = Math.max(0, Math.min(end, segments.length));
  let openRepeats = 0;
  let lastOpener = -1;
  for (let i = 0; i < next; i += 1) {
    if (segments[i].isSelfContainedRepeat) continue;
    if (segments[i].isRepeatOpener) {
      openRepeats += 1;
      lastOpener = i;
    }
    if (segments[i].isRepeatCloser && openRepeats > 0) openRepeats -= 1;
  }
  if (openRepeats > 0 && lastOpener >= 0) return lastOpener;
  return next;
}

/**
 * Snap a segment cut to a safe boundary without crossing `maxEnd`. If a
 * repeat would straddle the cap, cut before the opener — never mid `*…*` /
 * "rep from".
 */
export function boundPreviewEnd(segments: PreviewSegment[], end: number, maxEnd: number): number {
  const desired = Math.max(0, Math.min(end, segments.length));
  const cap = Math.max(0, Math.min(maxEnd, segments.length));
  const snapped = snapToSafeBoundary(segments, desired);
  if (snapped <= cap) return snapped;
  return cutBeforeOpenRepeat(segments, Math.min(desired, cap));
}

/**
 * Whole-page cut that does not split a protected span and does not exceed
 * `maxPage`. Walks back when a repeat / table / chart would cross the cap.
 */
export function boundPreviewPage(segments: PreviewSegment[], page: number, maxPage: number): number {
  let n = Math.max(1, Math.min(page, maxPage));
  while (n >= 1 && pageBoundarySplitsProtected(segments, n)) n -= 1;
  return Math.max(1, n);
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

export function documentPageCount(segments: PreviewSegment[]): number {
  if (segments.length === 0) return 1;
  return Math.max(...segments.map((segment) => wholePage(segment.page)));
}

/**
 * A free preview is only offered when the cut leaves a meaningful remainder.
 * Short patterns whose cut covers the whole source must go down the paid path
 * so the full translation is never given away. The preview itself may cover
 * at most 50% of source segments (HTML/text) or pages (PDF), and a PDF must
 * keep at least one page for unlock.
 */
export function previewLeavesMeaningfulRemainder(
  cut: PreviewCut,
  options: { isPdf?: boolean } = {},
): boolean {
  if (cut.end <= 0 || cut.segments.length === 0) return false;
  if (cut.end >= cut.segments.length) return false;
  if (!remainingSourceHasContent(cut.remainingHtml)) return false;

  const pages = documentPageCount(cut.segments);
  if (options.isPdf) {
    if (cut.previewEndPage >= pages) return false;
    return cut.previewEndPage / pages <= PREVIEW_MAX_COVERAGE;
  }
  return cut.end / cut.segments.length <= PREVIEW_MAX_COVERAGE;
}
