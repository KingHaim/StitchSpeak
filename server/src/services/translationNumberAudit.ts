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
 * (token-count mismatch, ambiguous layout, unverifiable rebuild) the job is
 * still delivered, with an explicit NUMBER_UNRESTORABLE review warning
 * pointing at the affected section — number drift is never silent, but it no
 * longer blocks an otherwise usable translation (Jaime override of the US6
 * hard-fail: soft path, warnings instead of 422 + refund).
 *
 * US6 alignment blind spot: a block that contains sacred numbers (stitch
 * counts, needle sizes, gauge, sizes, repeats, measurements) but NO data-o
 * alignment cannot be audited at all. Such blocks either get a deterministic
 * alignment derived from a KNOWN source (forceAlignmentFromSource, document
 * pipeline only) or ship with an UNAUDITED_NUMBERS review warning.
 * Alignment is never invented from the translated text itself.
 */

const SEGMENT_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'th', 'td'];

/** Upper bound so a heavily repaired document cannot flood the UI/API. */
const MAX_RESTORED_WARNINGS = 40;

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

/** One block-level segment element (aligned or not), with document positions. */
interface BlockFrame {
  tagName: string;
  /** Raw opening tag markup, e.g. `<p data-seg="4" data-o="…">`. */
  openingTag: string;
  /** Index of the opening tag's `<`. */
  openingStart: number;
  contentStart: number;
  /** Index of the closing tag's `<`. */
  contentEnd: number;
  /** Index just past the closing tag's `>`. */
  closeEnd: number;
  dataSeg: string | null;
  /** Raw (undecoded) data-o attribute value; null when the attribute is absent. */
  dataO: string | null;
  /** data-source-id from the document pipeline's annotated source, if present. */
  dataSourceId: string | null;
}

/**
 * Collect every block-level segment element — with or without data-o — with
 * its position in the document so drifted numeric tokens can be spliced back
 * in place and unaligned numeric blocks can be detected.
 */
function collectBlockFrames(html: string): BlockFrame[] {
  const collected: BlockFrame[] = [];
  const openFrames: Array<{
    tagName: string;
    openingTag: string;
    dataSeg: string | null;
    dataO: string | null;
    dataSourceId: string | null;
    contentStart: number;
    openingStart: number;
  }> = [];
  const pattern = new RegExp(`<\\/?(${SEGMENT_TAGS.join('|')})\\b[^>]*>`, 'gi');
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const tagName = match[1].toLowerCase();
    if (!match[0].startsWith('</')) {
      openFrames.push({
        tagName,
        openingTag: match[0],
        dataSeg: readAttribute(match[0], 'data-seg'),
        dataO: readAttribute(match[0], 'data-o'),
        dataSourceId: readAttribute(match[0], 'data-source-id'),
        contentStart: pattern.lastIndex,
        openingStart: match.index,
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

    collected.push({
      tagName: frame.tagName,
      openingTag: frame.openingTag,
      openingStart: frame.openingStart,
      contentStart: frame.contentStart,
      contentEnd: match.index,
      closeEnd: pattern.lastIndex,
      dataSeg: frame.dataSeg,
      dataO: frame.dataO,
      dataSourceId: frame.dataSourceId,
    });
  }

  collected.sort((a, b) => a.contentStart - b.contentStart);
  return collected;
}

/**
 * Every block element that carries a data-o source-alignment attribute,
 * positioned so drifted numeric tokens can be spliced back in place.
 */
function collectSegments(html: string): PositionedSegment[] {
  return collectBlockFrames(html)
    .filter((frame) => frame.dataO !== null)
    .map((frame) => {
      const innerHtml = html.slice(frame.contentStart, frame.contentEnd);
      return {
        ...(frame.dataSeg ? { sourceId: `seg-${frame.dataSeg}` } : {}),
        sourceText: collapseWhitespace(decodeEntities(frame.dataO as string)),
        translatedText: plainTextFromHtml(innerHtml),
        innerHtml,
        contentStart: frame.contentStart,
        contentEnd: frame.contentEnd,
      };
    });
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

/**
 * Gauge/dimension separators ("10 x 10 cm", "10×10", "22 sts * 30 rows") are
 * layout, not numbers (CTO brief): an x ↔ × ↔ * respelling between two
 * numbers must never register as drift, so they collapse to whitespace before
 * token extraction. Only separators BETWEEN digits are touched — "repeat 2x
 * more" keeps its multiplier untouched.
 */
function normalizeGaugeSeparators(text: string): string {
  return text.replace(/(?<=\d)\s*[x×*]\s*(?=\d)/gi, ' ');
}

/** Shared pre-tokenization normalization for numbers, units, and skeletons. */
function normalizeTokenText(text: string): string {
  return normalizeGaugeSeparators(normalizeVulgarFractions(text));
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
  return numberMatches(normalizeTokenText(text)).map((match) => canonicalNumberToken(match.raw));
}

// Localized spellings collapse to one canonical unit so "10\"" vs "10 in" vs
// "10 pulgadas" all agree, while a genuine cm ↔ in swap still differs.
// Spelled-out forms are only mapped for units whose abbreviation is also
// tokenized (cm, mm, in, g, kg, oz, yd) — mapping e.g. "metros" without bare
// `m` would flag every "100 m" ↔ "100 metros" pair as unit drift. Bare `m`
// is intentionally excluded: in Danish knitting prose it is the standard
// abbreviation for maske/masker and commonly follows a stitch count.
const UNIT_CANONICAL: Record<string, string> = {
  cm: 'cm',
  centimeter: 'cm',
  centimeters: 'cm',
  centimetre: 'cm',
  centimetres: 'cm',
  centimetro: 'cm',
  centimetros: 'cm',
  centímetro: 'cm',
  centímetros: 'cm',
  centimètre: 'cm',
  centimètres: 'cm',
  centimetri: 'cm',
  zentimeter: 'cm',
  mm: 'mm',
  millimeter: 'mm',
  millimeters: 'mm',
  millimetre: 'mm',
  millimetres: 'mm',
  milimetro: 'mm',
  milimetros: 'mm',
  milímetro: 'mm',
  milímetros: 'mm',
  millimètre: 'mm',
  millimètres: 'mm',
  millimetri: 'mm',
  in: 'in',
  inch: 'in',
  inches: 'in',
  tomme: 'in',
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
  gramo: 'g',
  gramos: 'g',
  gramme: 'g',
  grammes: 'g',
  grammo: 'g',
  grammi: 'g',
  kg: 'kg',
  kilo: 'kg',
  kilos: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  kilogramo: 'kg',
  kilogramos: 'kg',
  kilogramme: 'kg',
  kilogrammes: 'kg',
  oz: 'oz',
  ounce: 'oz',
  ounces: 'oz',
  onza: 'oz',
  onzas: 'oz',
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

// Bare gram abbreviations are too greedy near stitch instructions: in
// increase prose ("M1 g", "work 1 g lifting the strand between sts") a stray
// `g` after a digit is knitting shorthand — an increase abbreviation or a
// left/right marker — never a mass. Spelled-out gram words ("grams",
// "gramos", …) are unambiguous and always tokenize.
const BARE_GRAM_TOKENS = new Set(['g', 'gr', 'grs']);

// Words that keep a bare `g` reading as grams when they follow it — yarn
// quantities like "100 g of wool" / "100 g de lana" / "50 g per skein". Any
// other letter-starting follower ("1 g lifting …") reads as knitting
// shorthand rather than mass; end-of-text, punctuation, and digits keep the
// gram reading ("Yarn: 100 g", "100 g (3.5 oz)").
const MASS_CONTEXT_FOLLOWERS = new Set([
  'of', 'de', 'di', 'da', 'af', 'av', 'van', 'von', 'per', 'pr', 'each',
  'approx', 'aprox', 'ca', 'about',
  'yarn', 'wool', 'lana', 'laine', 'garn', 'wolle', 'uld', 'ull',
  'skein', 'skeins', 'ball', 'balls', 'hank', 'hanks',
  'ovillo', 'ovillos', 'pelote', 'pelotes', 'nøgle', 'nøgler', 'madeja', 'madejas',
]);

/**
 * True when the digit run ending right before `index` belongs to an increase
 * abbreviation (M1/M1L/M1R and localized variants): the digits are directly
 * preceded by the letter M, as in "M1 g" — that `g` is never a mass unit.
 */
function digitBelongsToIncreaseAbbreviation(text: string, index: number): boolean {
  let cursor = index;
  while (cursor > 0 && /\d/.test(text[cursor - 1])) cursor -= 1;
  return cursor > 0 && (text[cursor - 1] === 'm' || text[cursor - 1] === 'M');
}

/**
 * True when what follows a bare gram token reads as a mass measurement: end
 * of text, punctuation, a digit — or a known mass-context word. A
 * letter-starting follower outside that list ("1 g lifting the bar") means
 * the `g` is knitting prose, not grams.
 */
function hasMassContextAfter(text: string, index: number): boolean {
  const followingWord = text.slice(index).match(/^\s*(\p{L}+)/u)?.[1];
  if (!followingWord) return true;
  return MASS_CONTEXT_FOLLOWERS.has(followingWord.toLocaleLowerCase());
}

/**
 * Measurement units directly attached to a number. Prose like "join 20 sts in
 * the round" (digit not adjacent) never matches, bare "in" followed by a
 * known English function word is treated as a preposition rather than inches,
 * and bare `g`/`gr`/`grs` only counts as grams outside increase-abbreviation
 * prose (M1/M1L/M1R, "lifting …") — see BARE_GRAM_TOKENS above.
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
    if (BARE_GRAM_TOKENS.has(lowered)) {
      if (digitBelongsToIncreaseAbbreviation(text, match.index)) continue;
      if (!hasMassContextAfter(text, pattern.lastIndex)) continue;
    }
    // Report the unit token itself, not the leading whitespace consumed by \s*.
    const start = match.index + match[0].length - raw.length;
    matches.push({ start, end: pattern.lastIndex, raw, canonical: UNIT_CANONICAL[lowered] ?? lowered });
  }
  return matches;
}

/** Canonical measurement-unit sequence of a text. */
export function canonicalUnitTokens(text: string): string[] {
  return unitMatches(normalizeTokenText(text)).map((match) => match.canonical);
}

function displaySequence(tokens: string[]): string {
  if (tokens.length === 0) return 'none';
  const shown = tokens.slice(0, 12);
  return shown.join(', ') + (tokens.length > shown.length ? ', …' : '');
}

function textExcerpt(text: string): string {
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

function segmentExcerpt(segment: AlignedNumberSegment): string {
  return textExcerpt(segment.sourceText);
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
  const sourceNumberTokens = numberMatches(normalizeTokenText(segment.sourceText));

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

function findFirstDriftedSegment(html: string, skipKeys?: ReadonlySet<string>): DriftedSegment | null {
  const occurrences = new Map<string, number>();
  for (const segment of collectSegments(html)) {
    if (!segment.sourceText) continue;
    const occurrence = occurrences.get(segment.sourceText) ?? 0;
    occurrences.set(segment.sourceText, occurrence + 1);
    const key = segment.sourceId ?? `cell:${occurrence}:${segment.sourceText}`;
    if (skipKeys?.has(key)) continue;
    const prints = fingerprintSegment(segment);
    if (!hasDrift(prints)) continue;
    return { segment, prints, key };
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
 * One drifted segment the deterministic token-level restore could NOT fix.
 * Carries everything the recovery ladder needs to retry just this segment
 * with the source numeric skeleton locked.
 */
export interface UnrestorableNumberDrift {
  /** Stable identity within the document (data-seg id or cell occurrence). */
  key: string;
  /** `seg-N` when the block carries data-seg. */
  sourceId?: string;
  /** Decoded source-language plain text from data-o. */
  sourceText: string;
  /** Current translated plain text of the block. */
  translatedText: string;
  /** Locked source number tokens (vulgar fractions normalized), in order. */
  lockedNumbers: string[];
  /** Locked canonical source unit tokens, in order. */
  lockedUnits: string[];
  /** Human-readable drift description for server logs. */
  detail: string;
}

/** Locked numeric skeleton of a source text: raw number tokens + canonical units. */
export function sourceNumberSkeleton(sourceText: string): { numbers: string[]; units: string[] } {
  return {
    numbers: numberMatches(normalizeTokenText(sourceText)).map((match) => match.raw),
    units: canonicalUnitTokens(sourceText),
  };
}

/**
 * True when a candidate replacement text carries exactly the source's
 * canonical number and unit sequences — the acceptance gate every recovery
 * retry must pass before its text is spliced into the document.
 */
export function textMatchesNumberSkeleton(sourceText: string, candidateText: string): boolean {
  return canonicalNumberTokens(sourceText).join('|') === canonicalNumberTokens(candidateText).join('|')
    && canonicalUnitTokens(sourceText).join('|') === canonicalUnitTokens(candidateText).join('|');
}

function segmentKey(segment: PositionedSegment, occurrence: number): string {
  return segment.sourceId ?? `cell:${occurrence}:${segment.sourceText}`;
}

interface NumberFidelityAudit {
  html: string;
  restored: TranslationTopologyWarning[];
  unrestorable: UnrestorableNumberDrift[];
}

function toUnrestorable(drift: DriftedSegment, detail: string): UnrestorableNumberDrift {
  const skeleton = sourceNumberSkeleton(drift.segment.sourceText);
  return {
    key: drift.key,
    ...(drift.segment.sourceId ? { sourceId: drift.segment.sourceId } : {}),
    sourceText: drift.segment.sourceText,
    translatedText: drift.segment.translatedText,
    lockedNumbers: skeleton.numbers,
    lockedUnits: skeleton.units,
    detail,
  };
}

/**
 * Core audit pass shared by strict enforcement and the recovery ladder:
 * restores every safely-restorable segment in place and collects (instead of
 * throwing on) the segments where a safe token-level restore is impossible.
 */
function auditNumberFidelity(html: string): NumberFidelityAudit {
  const restored: TranslationTopologyWarning[] = [];
  const unrestorable: UnrestorableNumberDrift[] = [];
  const attempted = new Set<string>();
  const skip = new Set<string>();
  let working = html;

  // Fix one segment per pass and re-parse, so document offsets stay valid and
  // every restore is re-verified by the next pass before it can succeed.
  for (;;) {
    const drift = findFirstDriftedSegment(working, skip);
    if (!drift) break;
    if (attempted.has(drift.key)) {
      skip.add(drift.key);
      unrestorable.push(toUnrestorable(drift, `${driftDetail(drift)} — restore could not be verified`));
      continue;
    }
    attempted.add(drift.key);

    const restoredInner = restoreSegmentInnerHtml(drift.segment, drift.prints);
    if (restoredInner === null) {
      skip.add(drift.key);
      unrestorable.push(toUnrestorable(drift, driftDetail(drift)));
      continue;
    }
    working = `${working.slice(0, drift.segment.contentStart)}${restoredInner}${working.slice(drift.segment.contentEnd)}`;
    restored.push(restoredWarning(drift));
  }

  return { html: working, restored, unrestorable };
}

/**
 * Drifted segments that the deterministic preserve-from-source restore cannot
 * fix — the exact set the recovery ladder retries with a locked skeleton.
 * Restorable drift is intentionally NOT reflected in the returned data; the
 * final enforcement pass re-applies those restores deterministically.
 */
export function collectUnrestorableNumberDrift(html: string): UnrestorableNumberDrift[] {
  return auditNumberFidelity(html).unrestorable;
}

/**
 * Replace the inner content of the identified segments with plain replacement
 * text (HTML-escaped), preserving the block tags and their data-seg/data-o
 * alignment attributes. Used by the recovery ladder to splice verified
 * segment retranslations back into the document.
 */
export function applySegmentTextRepairs(
  html: string,
  repairs: Array<{ key: string; text: string }>,
): string {
  if (repairs.length === 0) return html;
  const byKey = new Map(repairs.map((repair) => [repair.key, repair.text]));

  const occurrences = new Map<string, number>();
  const targets: Array<{ segment: PositionedSegment; text: string }> = [];
  for (const segment of collectSegments(html)) {
    if (!segment.sourceText) continue;
    const occurrence = occurrences.get(segment.sourceText) ?? 0;
    occurrences.set(segment.sourceText, occurrence + 1);
    const text = byKey.get(segmentKey(segment, occurrence));
    if (text === undefined) continue;
    targets.push({ segment, text });
  }

  // Splice right-to-left so earlier offsets stay valid.
  targets.sort((a, b) => b.segment.contentStart - a.segment.contentStart);
  let working = html;
  for (const { segment, text } of targets) {
    working = `${working.slice(0, segment.contentStart)}${escapeHtmlText(text)}${working.slice(segment.contentEnd)}`;
  }
  return working;
}

// --- US6: numeric blocks without data-o alignment ---------------------------

/** [IMG_N]/[ROW_N] placeholders — the only blocks allowed to carry digits without data-o. */
const MARKER_TOKEN_PATTERN = /\[\s*(?:IMG|ROW)[_\s-]?\d+\s*\]/gi;

/** Strip [IMG_N]/[ROW_N] placeholders so marker digits never count as pattern numbers. */
function stripMarkerTokens(text: string): string {
  return collapseWhitespace(text.replace(MARKER_TOKEN_PATTERN, ' '));
}

/** True when the block carries a data-o the audit can actually diff against. */
function hasAuditableAlignment(frame: BlockFrame): boolean {
  return frame.dataO !== null && collapseWhitespace(decodeEntities(frame.dataO)) !== '';
}

/** One block whose numbers no data-o alignment covers — unauditable content. */
export interface UnauditedNumericBlock {
  tagName: string;
  /** `seg-N` when the block carries data-seg. */
  sourceId?: string;
  /** data-source-id when the document pipeline annotated the block. */
  dataSourceId?: string;
  /** Plain text of the block's own unaudited content. */
  text: string;
  /** Canonical numeric tokens found in that text. */
  numbers: string[];
}

interface UnauditedNumericFrame {
  frame: BlockFrame;
  text: string;
  numbers: string[];
}

/**
 * Blocks whose numeric tokens no data-o alignment covers. A block is exempt
 * only when an audited ancestor's data-o fingerprint already spans its text
 * (the ancestor's translated text includes every descendant). Text belonging
 * to nested segment blocks is attributed to those blocks, not the parent, so
 * each violation points at the innermost offender.
 */
function collectUnauditedNumericFrames(html: string): UnauditedNumericFrame[] {
  const frames = collectBlockFrames(html);
  const audited = frames.filter(hasAuditableAlignment);
  const found: UnauditedNumericFrame[] = [];

  for (const frame of frames) {
    if (hasAuditableAlignment(frame)) continue;
    if (audited.some((ancestor) =>
      ancestor.contentStart <= frame.openingStart && frame.closeEnd <= ancestor.contentEnd)) {
      continue;
    }

    const nestedRanges = frames
      .filter((nested) =>
        nested !== frame
        && frame.contentStart <= nested.openingStart
        && nested.closeEnd <= frame.contentEnd)
      .map((nested) => [nested.openingStart, nested.closeEnd] as const)
      .sort((a, b) => a[0] - b[0]);
    let ownHtml = '';
    let cursor = frame.contentStart;
    for (const [start, end] of nestedRanges) {
      if (start > cursor) ownHtml += html.slice(cursor, start);
      cursor = Math.max(cursor, end);
    }
    ownHtml += html.slice(cursor, frame.contentEnd);

    const text = stripMarkerTokens(plainTextFromHtml(ownHtml));
    if (!text) continue;
    const numbers = canonicalNumberTokens(text);
    if (numbers.length === 0) continue;
    found.push({ frame, text, numbers });
  }

  return found;
}

/**
 * Blocks with sacred numbers but no (or empty) data-o alignment — content the
 * number audit cannot cover. Exported for tests and the force-alignment path.
 */
export function collectUnauditedNumericBlocks(html: string): UnauditedNumericBlock[] {
  return collectUnauditedNumericFrames(html).map(({ frame, text, numbers }) => ({
    tagName: frame.tagName,
    ...(frame.dataSeg ? { sourceId: `seg-${frame.dataSeg}` } : {}),
    ...(frame.dataSourceId ? { dataSourceId: frame.dataSourceId } : {}),
    text,
    numbers,
  }));
}

/**
 * Review warning for a block whose numbers could not be checked against the
 * source at all (no data-o alignment — product US6, soft path). User-visible
 * copy: keep the "automated" wording, never "AI".
 */
function unauditedNumbersWarning(block: UnauditedNumericBlock): TranslationTopologyWarning {
  return {
    code: 'UNAUDITED_NUMBERS',
    ...(block.sourceId ? { sourceId: block.sourceId } : {}),
    message: `In "${textExcerpt(block.text)}": the numbers [${displaySequence(block.numbers)}] could not be checked against the source by the automated audit — compare this section with the original pattern.`,
  };
}

/**
 * Review warning for a drifted segment the deterministic restore (and, when
 * it ran, the recovery ladder) could not fix. User-visible copy.
 */
function unrestorableDriftWarning(drift: UnrestorableNumberDrift): TranslationTopologyWarning {
  return {
    code: 'NUMBER_UNRESTORABLE',
    ...(drift.sourceId ? { sourceId: drift.sourceId } : {}),
    message: `In "${textExcerpt(drift.sourceText)}": the translated numbers [${displaySequence(canonicalNumberTokens(drift.translatedText))}] do not match the source numbers [${displaySequence(canonicalNumberTokens(drift.sourceText))}] and could not be restored automatically — check this section against the original pattern.`,
  };
}

function escapeAttributeValue(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Deterministic "force alignment" (US6): give numeric blocks that are missing
 * data-o an alignment derived from a KNOWN source — the annotated source
 * document, keyed by data-source-id. Only blocks that would otherwise fail
 * the unaudited-numbers gate are touched, and the injected data-o then flows
 * through the normal restore / recovery-ladder / warning machinery. Blocks
 * without a source lookup stay unaligned and surface an UNAUDITED_NUMBERS
 * review warning downstream: alignment is never invented from the translated
 * text itself.
 */
export function forceAlignmentFromSource(
  html: string,
  sourceTextById: ReadonlyMap<string, string>,
): { html: string; forcedCount: number } {
  const targets = collectUnauditedNumericFrames(html)
    .map(({ frame }) => frame)
    .filter((frame) => frame.dataSourceId !== null)
    .map((frame) => ({
      frame,
      sourceText: stripMarkerTokens(sourceTextById.get(frame.dataSourceId as string) ?? ''),
    }))
    .filter(({ sourceText }) => sourceText !== '');

  if (targets.length === 0) return { html, forcedCount: 0 };

  // Rewrite right-to-left so earlier offsets stay valid.
  targets.sort((a, b) => b.frame.openingStart - a.frame.openingStart);
  let working = html;
  for (const { frame, sourceText } of targets) {
    const escaped = escapeAttributeValue(sourceText);
    const rewritten = /\bdata-o\s*=/i.test(frame.openingTag)
      ? frame.openingTag.replace(/\bdata-o\s*=\s*(?:"[^"]*"|'[^']*')/i, `data-o="${escaped}"`)
      : `${frame.openingTag.slice(0, -1)} data-o="${escaped}">`;
    working = `${working.slice(0, frame.openingStart)}${rewritten}${working.slice(frame.contentStart)}`;
  }
  return { html: working, forcedCount: targets.length };
}

function capWarnings(
  warnings: TranslationTopologyWarning[],
  summary: (extra: number) => TranslationTopologyWarning,
): TranslationTopologyWarning[] {
  if (warnings.length <= MAX_RESTORED_WARNINGS) return warnings;
  const extra = warnings.length - MAX_RESTORED_WARNINGS;
  return [...warnings.slice(0, MAX_RESTORED_WARNINGS), summary(extra)];
}

/**
 * The exact NUMBER_UNRESTORABLE warning set (capped) for a list of drifts.
 * Shared by the enforcement pass and the US7 post-translate verifier, which
 * re-emits warnings only for the segments whose verdict stayed KEEP.
 *
 * CTO-brief invariant, enforced at this single choke point before anything is
 * emitted: a segment whose translated number AND unit token lists already
 * match the source skeleton is CLEAR by definition — it can never surface as
 * an unrestorable warning (or later stay KEEP), no matter how it was flagged
 * upstream.
 */
export function buildUnrestorableDriftWarnings(
  drifts: UnrestorableNumberDrift[],
): TranslationTopologyWarning[] {
  const loud = drifts.filter(
    (drift) => !textMatchesNumberSkeleton(drift.sourceText, drift.translatedText),
  );
  return capWarnings(loud.map(unrestorableDriftWarning), (extra) => ({
    code: 'NUMBER_UNRESTORABLE',
    message: `${extra} more segment${extra === 1 ? '' : 's'} had translated numbers that do not match the source — review them against the original pattern.`,
  }));
}

/**
 * Enforce number fidelity over every aligned segment: restore drifted tokens
 * from the source in place. Number issues the deterministic machinery cannot
 * fix are surfaced as review warnings on a completed job instead of failing
 * it (Jaime override / CTO brief: warnings, never a 422 hard-fail) —
 * UNAUDITED_NUMBERS for blocks carrying numbers with no data-o alignment
 * (US6) and NUMBER_UNRESTORABLE for drift no safe restore could fix. Number
 * problems are never silent, but they never block delivery.
 */
export function enforceTranslatedNumberFidelity(html: string): {
  html: string;
  reviewWarnings: TranslationTopologyWarning[];
} {
  const unaudited = collectUnauditedNumericBlocks(html).map(unauditedNumbersWarning);
  const audit = auditNumberFidelity(html);

  return {
    html: audit.html,
    reviewWarnings: [
      ...capWarnings(audit.restored, (extra) => ({
        code: 'NUMBER_RESTORED',
        message: `${extra} more segment${extra === 1 ? '' : 's'} had numbers restored from the source.`,
      })),
      ...capWarnings(unaudited, (extra) => ({
        code: 'UNAUDITED_NUMBERS',
        message: `${extra} more section${extra === 1 ? '' : 's'} carried numbers that could not be checked against the source — review them against the original pattern.`,
      })),
      ...buildUnrestorableDriftWarnings(audit.unrestorable),
    ],
  };
}
