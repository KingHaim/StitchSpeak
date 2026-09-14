import type { TranslationTopologyWarning } from './translationTopology.js';

/**
 * Deterministic post-translation number-fidelity audit.
 *
 * The PDF (and DOCX) translation prompts require every block-level text
 * element to carry `data-o` — the original source-language plain text — and
 * sequential `data-seg` ids. That alignment lets us diff the canonical numeric
 * token sequence (stitch counts, size lists, gauge, needle sizes, cm/in
 * measurements) between each source block and its translation without any
 * additional model calls. Silent changes surface as NUMBER_CHANGED review
 * warnings on the existing reviewWarnings path.
 */

const SEGMENT_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'th', 'td'];

/** Upper bound so a catastrophically broken document cannot flood the UI/API. */
const MAX_NUMBER_WARNINGS = 40;

export interface AlignedNumberSegment {
  /** `seg-N` when the block carries data-seg; undefined for data-o-only cells. */
  sourceId?: string;
  /** Decoded source-language plain text from data-o. */
  sourceText: string;
  /** Decoded plain text of the translated block content. */
  translatedText: string;
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
 * attribute, pairing its original text with its translated plain text.
 */
export function extractAlignedSegments(html: string): AlignedNumberSegment[] {
  const collected: Array<AlignedNumberSegment & { openingIndex: number }> = [];
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

    collected.push({
      ...(frame.dataSeg ? { sourceId: `seg-${frame.dataSeg}` } : {}),
      sourceText: collapseWhitespace(decodeEntities(frame.dataO)),
      translatedText: plainTextFromHtml(html.slice(frame.contentStart, match.index)),
      openingIndex: frame.openingIndex,
    });
  }

  collected.sort((a, b) => a.openingIndex - b.openingIndex);
  return collected.map(({ openingIndex: _unused, ...segment }) => segment);
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
const NUMBER_TOKEN_PATTERN = /\d+(?:[.,]\d+)?(?:\s*[‐‑‒–—-]\s*\d+(?:[.,]\d+)?)?(?:\/\d+(?:[.,]\d+)?)?/g;

/**
 * Canonical numeric token sequence: decimal commas become dots, every dash
 * variant becomes an en dash, and trailing zeros are dropped so legitimate
 * locale reformatting ("2.5" → "2,50", "5-7" → "5–7") never false-positives.
 */
export function canonicalNumberTokens(text: string): string[] {
  const normalized = normalizeVulgarFractions(text);
  return (normalized.match(NUMBER_TOKEN_PATTERN) ?? []).map((token) => token
    .replace(/,/g, '.')
    .replace(/\s*[‐‑‒–—-]\s*/g, '–')
    .replace(/\d+(?:\.\d+)?/g, (value) => String(Number.parseFloat(value))));
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

/**
 * Canonical measurement-unit sequence. Units only count when directly attached
 * to a number, so prose like "join 20 sts in the round" (digit not adjacent)
 * never matches, and bare "in" followed by a known English function word is
 * treated as a preposition rather than inches.
 */
export function canonicalUnitTokens(text: string): string[] {
  const normalized = normalizeVulgarFractions(text);
  const pattern = new RegExp(`(?<=\\d)\\s*(${UNIT_ALTERNATIVES})(?![\\p{L}\\p{N}])`, 'giu');
  const units: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(normalized)) !== null) {
    const raw = match[1].toLocaleLowerCase();
    if (raw === 'in') {
      const followingWord = normalized.slice(pattern.lastIndex).match(/^\s+(\p{L}+)/u)?.[1];
      if (followingWord && IN_PREPOSITION_FOLLOWERS.has(followingWord.toLocaleLowerCase())) continue;
    }
    units.push(UNIT_CANONICAL[raw] ?? raw);
  }
  return units;
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

/**
 * Diff the canonical numeric fingerprint of every aligned segment and emit a
 * NUMBER_CHANGED review warning naming the segment and both sequences.
 */
export function auditTranslatedNumbers(html: string): TranslationTopologyWarning[] {
  const warnings: TranslationTopologyWarning[] = [];
  let suppressed = 0;

  for (const segment of extractAlignedSegments(html)) {
    if (!segment.sourceText) continue;

    const sourceNumbers = canonicalNumberTokens(segment.sourceText);
    const translatedNumbers = canonicalNumberTokens(segment.translatedText);
    const sourceUnits = canonicalUnitTokens(segment.sourceText);
    const translatedUnits = canonicalUnitTokens(segment.translatedText);
    const numbersChanged = sourceNumbers.join('|') !== translatedNumbers.join('|');
    const unitsChanged = sourceUnits.join('|') !== translatedUnits.join('|');
    if (!numbersChanged && !unitsChanged) continue;

    if (warnings.length >= MAX_NUMBER_WARNINGS) {
      suppressed += 1;
      continue;
    }

    const details: string[] = [];
    if (numbersChanged) {
      details.push(`numbers changed from [${displaySequence(sourceNumbers)}] to [${displaySequence(translatedNumbers)}]`);
    }
    if (unitsChanged) {
      details.push(`measurement units changed from [${displaySequence(sourceUnits)}] to [${displaySequence(translatedUnits)}]`);
    }

    warnings.push({
      code: 'NUMBER_CHANGED',
      ...(segment.sourceId ? { sourceId: segment.sourceId } : {}),
      message: `In "${segmentExcerpt(segment)}": ${details.join('; ')}. Verify stitch counts, sizes, and measurements.`,
    });
  }

  if (suppressed > 0) {
    warnings.push({
      code: 'NUMBER_CHANGED',
      message: `${suppressed} more segment${suppressed === 1 ? '' : 's'} changed numeric values; review the full translation against the source.`,
    });
  }

  return warnings;
}
