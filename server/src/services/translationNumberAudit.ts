import type { TranslationTopologyWarning } from './translationTopology.js';

/**
 * Deterministic post-translation number-fidelity enforcement.
 *
 * The PDF (and DOCX) translation prompts require every block-level text
 * element to carry `data-o` — the original source-language plain text — and
 * sequential `data-seg` ids. That alignment lets us diff the canonical numeric
 * token sequence (stitch counts, size lists, gauge, needle sizes, cm/in
 * measurements) between each source block and its translation without any
 * additional model calls.
 *
 * When a segment's numeric fingerprint drifts, the drifted number/unit tokens
 * are surgically restored from the source INSIDE the already-translated
 * sentence: the surrounding target-language prose is never replaced with
 * source-language text. When a safe token-level restore is not possible
 * (token-count mismatch, ambiguous layout, unverifiable rebuild) the translate
 * path hard-fails with a "needs human check" error — silent number drift must
 * never reach the user as a quiet success.
 */

const SEGMENT_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'th', 'td'];

/** Upper bound so a heavily repaired document cannot flood the UI/API. */
const MAX_RESTORED_WARNINGS = 40;

/**
 * Thrown when translated numbers no longer match the source and a safe
 * token-level restore was not possible. The translate route surfaces it as a
 * client-visible "needs human check" error instead of a quiet success.
 */
export class TranslationNumberFidelityError extends Error {
  readonly status = 422;
  readonly code = 'TRANSLATION_NEEDS_HUMAN_CHECK';

  constructor(detail: string) {
    super(
      `The translated numbers no longer match the source pattern and could not be safely restored (${detail}). `
      + 'This translation needs a human check before it can be delivered.',
    );
    this.name = 'TranslationNumberFidelityError';
  }
}

export interface AlignedNumberSegment {
  /** `seg-N` when the block carries data-seg; undefined for data-o-only cells. */
  sourceId?: string;
  /** Decoded source-language plain text from data-o. */
  sourceText: string;
  /** Decoded plain text of the translated block content. */
  translatedText: string;
}

interface PositionedSegment extends AlignedNumberSegment {
  innerHtml: string;
  contentStart: number;
  contentEnd: number;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&');
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function plainTextFromHtml(html: string): string {
  return collapseWhitespace(decodeEntities(html.replace(/<[^>]*>/g, ' ')));
}

function readAttribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  if (!match) return null;
  return match[1] ?? match[2] ?? '';
}

/**
 * Collect every block element that carries a data-o source-alignment
 * attribute, with its position in the document so drifted numeric tokens can
 * be spliced back in place.
 */
function collectSegments(html: string): PositionedSegment[] {
  const collected: PositionedSegment[] = [];
  const openFrames: Array<{
    tagName: string;
    dataSeg: string | null;
    dataO: string | null;
    contentStart: number;
    openingIndex: number;
  }> = [];
  const pattern = new RegExp(`<\\/?(${SEGMENT_TAGS.join('|')})\\b[^>]*>`, 'gi');
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const tagName = match[1].toLowerCase();
    if (!match[0].startsWith('</')) {
      openFrames.push({
        tagName,
        dataSeg: readAttribute(match[0], 'data-seg'),
        dataO: readAttribute(match[0], 'data-o'),
        contentStart: pattern.lastIndex,
        openingIndex: match.index,
      });
      continue;
    }

    let frameIndex = -1;
    for (let index = openFrames.length - 1; index >= 0; index -= 1) {
      if (openFrames[index].tagName === tagName) {
        frameIndex = index;
        break;
      }
    }
    if (frameIndex < 0) continue;
    const frame = openFrames[frameIndex];
    openFrames.splice(frameIndex, 1);
    if (frame.dataO === null) continue;

    const innerHtml = html.slice(frame.contentStart, match.index);
    collected.push({
      ...(frame.dataSeg ? { sourceId: `seg-${frame.dataSeg}` } : {}),
      sourceText: collapseWhitespace(decodeEntities(frame.dataO)),
      translatedText: plainTextFromHtml(innerHtml),
      innerHtml,
      contentStart: frame.contentStart,
      contentEnd: match.index,
    });
  }

  collected.sort((a, b) => a.contentStart - b.contentStart);
  return collected;
}

/** Aligned segment pairs (exported for tests and future terminology QA). */
export function extractAlignedSegments(html: string): AlignedNumberSegment[] {
  return collectSegments(html).map(({ sourceId, sourceText, translatedText }) => ({
    ...(sourceId ? { sourceId } : {}),
    sourceText,
    translatedText,
  }));
}

/** Vulgar fractions PDFs commonly use that translations often spell as decimals. */
const VULGAR_FRACTIONS: Record<string, string> = {
  '½': '.5',
  '¼': '.25',
  '¾': '.75',
  '⅛': '.125',
  '⅜': '.375',
  '⅝': '.625',
  '⅞': '.875',
};

function normalizeVulgarFractions(text: string): string {
  return text
    .replace(/(\d)\s*([½¼¾⅛⅜⅝⅞])/g, (_all, digits: string, fraction: string) =>
      `${digits}${VULGAR_FRACTIONS[fraction]}`)
    .replace(/[½¼¾⅛⅜⅝⅞]/g, (fraction) => `0${VULGAR_FRACTIONS[fraction]}`);
}

// Mirrors extractProtectedNumbers in gemini.ts: plain numbers with optional
// decimal part, optional dash range, optional fraction suffix.
const NUMBER_TOKEN_SOURCE = '\\d+(?:[.,]\\d+)?(?:\\s*[‐‑‒–—-]\\s*\\d+(?:[.,]\\d+)?)?(?:\\/\\d+(?:[.,]\\d+)?)?';

interface TokenMatch {
  start: number;
  end: number;
  raw: string;
}

function numberMatches(text: string): TokenMatch[] {
  const pattern = new RegExp(NUMBER_TOKEN_SOURCE, 'g');
  const matches: TokenMatch[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    matches.push({ start: match.index, end: pattern.lastIndex, raw: match[0] });
  }
  return matches;
}

/**
 * Canonical form of one numeric token: decimal commas become dots, every dash
 * variant becomes an en dash, and trailing zeros are dropped so legitimate
 * locale reformatting ("2.5" → "2,50", "5-7" → "5–7") never counts as drift.
 */
function canonicalNumberToken(token: string): string {
  return token
    .replace(/,/g, '.')
    .replace(/\s*[‐‑‒–—-]\s*/g, '–')
    .replace(/\d+(?:\.\d+)?/g, (value) => String(Number.parseFloat(value)));
}

/** Canonical numeric token sequence of a text. */
export function canonicalNumberTokens(text: string): string[] {
  return numberMatches(normalizeVulgarFractions(text)).map((match) => canonicalNumberToken(match.raw));
}

// Localized spellings collapse to one canonical unit so "10\"" vs "10 in" vs
// "10 pulgadas" all agree, while a genuine cm ↔ in swap still differs.
// Bare `m` is intentionally excluded: in Danish knitting prose it is the
// standard abbreviation for maske/masker and commonly follows a stitch count.
const UNIT_CANONICAL: Record<string, string> = {
  cm: 'cm',
  mm: 'mm',
  in: 'in',
  inch: 'in',
  inches: 'in',
  tommer: 'in',
  pulgada: 'in',
  pulgadas: 'in',
  pulg: 'in',
  pouce: 'in',
  pouces: 'in',
  '"': 'in',
  '″': 'in',
  g: 'g',
  gr: 'g',
  grs: 'g',
  gram: 'g',
  grams: 'g',
  gramos: 'g',
  gramme: 'g',
  grammes: 'g',
  kg: 'kg',
  oz: 'oz',
  yd: 'yd',
  yds: 'yd',
  yard: 'yd',
  yards: 'yd',
  yarda: 'yd',
  yardas: 'yd',
};

const UNIT_ALTERNATIVES = Object.keys(UNIT_CANONICAL)
  .sort((a, b) => b.length - a.length)
  .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|');

// English words that commonly follow "in" used as a preposition right after a
// bare number ("knit 2 in each stitch", "decrease 4 in total"). Any other
// following word keeps "in" as a unit ("4 in from the edge", "4 in medido").
const IN_PREPOSITION_FOLLOWERS = new Set([
  'a', 'all', 'back', 'each', 'every', 'first', 'front', 'half', 'last',
  'next', 'one', 'order', 'pattern', 'place', 'round', 'rounds', 'row',
  'rows', 'same', 'st', 'sts', 'stitch', 'stitches', 'that', 'the', 'this',
  'total', 'work',
]);

interface UnitMatch extends TokenMatch {
  canonical: string;
}

/**
 * Measurement units directly attached to a number. Prose like "join 20 sts in
 * the round" (digit not adjacent) never matches, and bare "in" followed by a
 * known English function word is treated as a preposition rather than inches.
 */
function unitMatches(text: string): UnitMatch[] {
  const pattern = new RegExp(`(?<=\\d)\\s*(${UNIT_ALTERNATIVES})(?![\\p{L}\\p{N}])`, 'giu');
  const matches: UnitMatch[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const raw = match[1];
    const lowered = raw.toLocaleLowerCase();
    if (lowered === 'in') {
      const followingWord = text.slice(pattern.lastIndex).match(/^\s+(\p{L}+)/u)?.[1];
      if (followingWord && IN_PREPOSITION_FOLLOWERS.has(followingWord.toLocaleLowerCase())) continue;
    }
    // Report the unit token itself, not the leading whitespace consumed by \s*.
    const start = match.index + match[0].length - raw.length;
    matches.push({ start, end: pattern.lastIndex, raw, canonical: UNIT_CANONICAL[lowered] ?? lowered });
  }
  return matches;
}

/** Canonical measurement-unit sequence of a text. */
export function canonicalUnitTokens(text: string): string[] {
  return unitMatches(normalizeVulgarFractions(text)).map((match) => match.canonical);
}

function displaySequence(tokens: string[]): string {
  if (tokens.length === 0) return 'none';
  const shown = tokens.slice(0, 12);
  return shown.join(', ') + (tokens.length > shown.length ? ', …' : '');
}

function segmentExcerpt(segment: AlignedNumberSegment): string {
  const text = segment.sourceText;
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

interface SegmentFingerprints {
  sourceNumbers: string[];
  translatedNumbers: string[];
  sourceUnits: string[];
  translatedUnits: string[];
}

function fingerprintSegment(segment: AlignedNumberSegment): SegmentFingerprints {
  return {
    sourceNumbers: canonicalNumberTokens(segment.sourceText),
    translatedNumbers: canonicalNumberTokens(segment.translatedText),
    sourceUnits: canonicalUnitTokens(segment.sourceText),
    translatedUnits: canonicalUnitTokens(segment.translatedText),
  };
}

function hasDrift(prints: SegmentFingerprints): boolean {
  return prints.sourceNumbers.join('|') !== prints.translatedNumbers.join('|')
    || prints.sourceUnits.join('|') !== prints.translatedUnits.join('|');
}

/**
 * Token-surgical restore: splice the source numeric/unit tokens over the
 * drifted ones inside the translated inner HTML, leaving every surrounding
 * target-language word and inline tag untouched. Returns null when a safe
 * 1:1 token mapping does not exist.
 */
function restoreSegmentInnerHtml(segment: PositionedSegment, prints: SegmentFingerprints): string | null {
  const sourceNumberTokens = numberMatches(normalizeVulgarFractions(segment.sourceText));

  // Split into text/tag parts so replacements can never touch markup.
  const parts = segment.innerHtml.split(/(<[^>]*>)/);
  const decodedParts = parts.map((part) => (part.startsWith('<') ? null : decodeEntities(part)));

  const positionedNumbers: Array<TokenMatch & { part: number }> = [];
  const positionedUnits: Array<UnitMatch & { part: number }> = [];
  decodedParts.forEach((decoded, part) => {
    if (decoded === null) return;
    for (const token of numberMatches(decoded)) positionedNumbers.push({ ...token, part });
    for (const token of unitMatches(decoded)) positionedUnits.push({ ...token, part });
  });

  // The positional view must agree with the fingerprint view (tokens split by
  // inline tags or written as vulgar fractions would drift apart); otherwise
  // the layout is ambiguous and the restore is unsafe.
  const positionalNumberCanonical = positionedNumbers.map((token) => canonicalNumberToken(token.raw));
  if (positionalNumberCanonical.join('|') !== prints.translatedNumbers.join('|')) return null;
  const positionalUnitCanonical = positionedUnits.map((token) => token.canonical);
  if (positionalUnitCanonical.join('|') !== prints.translatedUnits.join('|')) return null;

  // A safe restore requires a 1:1 token mapping. Dropped or injected tokens
  // (a missing size in a size list, an added conversion) are ambiguous.
  if (positionedNumbers.length !== sourceNumberTokens.length) return null;
  if (positionedUnits.length !== prints.sourceUnits.length) return null;

  interface Edit { part: number; start: number; end: number; replacement: string }
  const edits: Edit[] = [];

  positionedNumbers.forEach((token, index) => {
    const sourceRaw = sourceNumberTokens[index].raw;
    if (canonicalNumberToken(token.raw) === canonicalNumberToken(sourceRaw)) return;
    edits.push({ part: token.part, start: token.start, end: token.end, replacement: sourceRaw });
  });

  positionedUnits.forEach((token, index) => {
    const sourceUnit = prints.sourceUnits[index];
    if (token.canonical === sourceUnit) return;
    const decoded = decodedParts[token.part] ?? '';
    const needsSpace = token.start > 0 && /\d/.test(decoded[token.start - 1]);
    edits.push({
      part: token.part,
      start: token.start,
      end: token.end,
      replacement: `${needsSpace ? ' ' : ''}${sourceUnit}`,
    });
  });

  if (edits.length === 0) return null;

  const rebuiltParts = [...parts];
  const editsByPart = new Map<number, Edit[]>();
  for (const edit of edits) {
    const list = editsByPart.get(edit.part) ?? [];
    list.push(edit);
    editsByPart.set(edit.part, list);
  }
  for (const [part, partEdits] of editsByPart) {
    let text = decodedParts[part] ?? '';
    partEdits.sort((a, b) => b.start - a.start);
    for (const edit of partEdits) {
      text = `${text.slice(0, edit.start)}${edit.replacement}${text.slice(edit.end)}`;
    }
    rebuiltParts[part] = escapeHtmlText(text);
  }
  return rebuiltParts.join('');
}

interface DriftedSegment {
  segment: PositionedSegment;
  prints: SegmentFingerprints;
  /** Stable identity across re-parses so a non-converging restore is caught. */
  key: string;
}

function findFirstDriftedSegment(html: string): DriftedSegment | null {
  const occurrences = new Map<string, number>();
  for (const segment of collectSegments(html)) {
    if (!segment.sourceText) continue;
    const occurrence = occurrences.get(segment.sourceText) ?? 0;
    occurrences.set(segment.sourceText, occurrence + 1);
    const prints = fingerprintSegment(segment);
    if (!hasDrift(prints)) continue;
    return {
      segment,
      prints,
      key: segment.sourceId ?? `cell:${occurrence}:${segment.sourceText}`,
    };
  }
  return null;
}

function driftDetail(drift: DriftedSegment): string {
  const { segment, prints } = drift;
  const label = segment.sourceId ? `segment ${segment.sourceId}` : 'table cell';
  return `${label} "${segmentExcerpt(segment)}": source numbers [${displaySequence(prints.sourceNumbers)}] / units [${displaySequence(prints.sourceUnits)}], translated [${displaySequence(prints.translatedNumbers)}] / [${displaySequence(prints.translatedUnits)}]`;
}

function restoredWarning(drift: DriftedSegment): TranslationTopologyWarning {
  const { segment, prints } = drift;
  const details: string[] = [];
  if (prints.sourceNumbers.join('|') !== prints.translatedNumbers.join('|')) {
    details.push(`numbers [${displaySequence(prints.translatedNumbers)}] → [${displaySequence(prints.sourceNumbers)}]`);
  }
  if (prints.sourceUnits.join('|') !== prints.translatedUnits.join('|')) {
    details.push(`units [${displaySequence(prints.translatedUnits)}] → [${displaySequence(prints.sourceUnits)}]`);
  }
  return {
    code: 'NUMBER_RESTORED',
    ...(segment.sourceId ? { sourceId: segment.sourceId } : {}),
    message: `In "${segmentExcerpt(segment)}": restored ${details.join('; ')} to match the source.`,
  };
}

/**
 * Enforce number fidelity over every aligned segment: restore drifted tokens
 * from the source in place, or throw TranslationNumberFidelityError when a
 * safe restore is impossible. Never returns HTML with unresolved number drift.
 */
export function enforceTranslatedNumberFidelity(html: string): {
  html: string;
  reviewWarnings: TranslationTopologyWarning[];
} {
  const restored: TranslationTopologyWarning[] = [];
  const attempted = new Set<string>();
  let working = html;

  // Fix one segment per pass and re-parse, so document offsets stay valid and
  // every restore is re-verified by the next pass before it can succeed.
  for (;;) {
    const drift = findFirstDriftedSegment(working);
    if (!drift) break;
    if (attempted.has(drift.key)) {
      throw new TranslationNumberFidelityError(`${driftDetail(drift)} — restore could not be verified`);
    }
    attempted.add(drift.key);

    const restoredInner = restoreSegmentInnerHtml(drift.segment, drift.prints);
    if (restoredInner === null) {
      throw new TranslationNumberFidelityError(driftDetail(drift));
    }
    working = `${working.slice(0, drift.segment.contentStart)}${restoredInner}${working.slice(drift.segment.contentEnd)}`;
    restored.push(restoredWarning(drift));
  }

  if (restored.length > MAX_RESTORED_WARNINGS) {
    const extra = restored.length - MAX_RESTORED_WARNINGS;
    return {
      html: working,
      reviewWarnings: [
        ...restored.slice(0, MAX_RESTORED_WARNINGS),
        {
          code: 'NUMBER_RESTORED',
          message: `${extra} more segment${extra === 1 ? '' : 's'} had numbers restored from the source.`,
        },
      ],
    };
  }

  return { html: working, reviewWarnings: restored };
}
