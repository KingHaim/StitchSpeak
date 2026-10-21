function mapVisibleText(html: string, transform: (text: string) => string): string {
  return html
    .split(/(<[^>]+>)/g)
    .map((part) => part.startsWith('<') ? part : transform(part))
    .join('');
}

function isKnittingRepeatAsteriskPair(inner: string): boolean {
  const trimmed = inner.trim().toLocaleLowerCase();
  return trimmed === 'to' || trimmed === 'à' || trimmed === 'a'
    || /\b(?:repeat|répéter|rep|rép)\b/i.test(inner);
}

function sanitizeMarkdownText(text: string): string {
  return text
    .replace(/(^|\n)(\s*)#{1,6}\s+/g, '$1$2')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, (full, inner: string) => (
      isKnittingRepeatAsteriskPair(inner) ? full : `<em>${inner}</em>`
    ))
    .replace(/(?<![\p{L}\p{N}_])_([^_\n]+)_(?![\p{L}\p{N}_])/gu, '<em>$1</em>')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\*\*|__|`/g, '');
}

/** Restore the locked French repeat wording when asterisks were dropped. */
export function restoreFrenchRepeatAsterisksInHtml(html: string): string {
  return mapVisibleText(html, (text) => text.replace(/répéter de à/gi, 'répéter de * à *'));
}

export function sanitizeMarkdownArtifactsInHtml(html: string): string {
  return mapVisibleText(html, sanitizeMarkdownText);
}

export function findMarkdownArtifacts(html: string): string[] {
  const artifacts = new Set<string>();
  mapVisibleText(html, (text) => {
    if (/\*\*/.test(text)) artifacts.add('**');
    if (/__/.test(text)) artifacts.add('__');
    if (/`/.test(text)) artifacts.add('`');
    if (/(^|\n)\s*#{1,6}\s+/.test(text)) artifacts.add('# heading');
    return text;
  });
  return [...artifacts];
}

/** Number atom that may carry a vulgar fraction or decimal (36¼, 45, 3.25). */
const INCH_NUMBER = '(?:\\d+[½¼¾⅛⅜⅝⅞]|\\d+(?:[.,]\\d+)?|[½¼¾⅛⅜⅝⅞])';

export type InchNotation = '"' | 'in';

/**
 * The source's inch notation for a size run. '"' wins when the source uses
 * the inch symbol, even if a later value was already written as "in".
 */
export function detectSourceInchNotation(sourceText: string): InchNotation | null {
  const hasQuote = new RegExp(`${INCH_NUMBER}\\s*["″]`).test(sourceText);
  if (hasQuote) return '"';
  const hasIn = new RegExp(`${INCH_NUMBER}\\s*(?:in|inch|inches)\\b`, 'i').test(sourceText);
  return hasIn ? 'in' : null;
}

function normalizeSpanishMeasurementText(text: string, inchNotation: InchNotation | null): string {
  let next = text;
  if (inchNotation === 'in') {
    // Source wrote "in" — convert leftover " marks, including vulgar fractions.
    next = next.replace(new RegExp(`(${INCH_NUMBER})\\s*["″](?![\\p{L}\\p{N}])`, 'gu'), '$1 in');
  } else if (inchNotation === '"') {
    // Source wrote " — keep it on every value in the run (never 36¼"-45 in).
    next = next.replace(new RegExp(`(${INCH_NUMBER})\\s*(?:in|inch|inches)\\b`, 'giu'), '$1"');
  }
  return next
    .replace(/(?<=\d)\.(?=\d)/g, ',')
    .replace(/(\d)\s*(cm|mm|m|g|kg|in|pts)(?![\p{L}\p{N}])/gu, '$1 $2');
}

function readAttribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  if (!match) return null;
  return match[1] ?? match[2] ?? '';
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

export function normalizeSpanishMeasurementsInHtml(html: string): string {
  return html.replace(
    /<(p|h[1-6]|li|th|td|blockquote)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi,
    (_full, tag: string, attrs = '', inner: string) => {
      const dataO = readAttribute(attrs, 'data-o');
      const notation = dataO != null ? detectSourceInchNotation(decodeEntities(dataO)) : null;
      const transformed = mapVisibleText(inner, (text) => normalizeSpanishMeasurementText(text, notation));
      return `<${tag}${attrs}>${transformed}</${tag}>`;
    },
  );
}

const VULGAR_INCH_VALUE: Record<string, number> = {
  '½': 0.5,
  '¼': 0.25,
  '¾': 0.75,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875,
};

const INCH_ATOM_CORE = '(?:\\d+[½¼¾⅛⅜⅝⅞]|[½¼¾⅛⅜⅝⅞]|\\d+(?:[.,]\\d+)?)';
const INCH_DASH_CLASS = '[\\s‐‑‒–—-]+';
const SOURCE_INCH_RUN_RE = new RegExp(
  `${INCH_ATOM_CORE}["″](?:${INCH_DASH_CLASS}${INCH_ATOM_CORE}["″])+|${INCH_ATOM_CORE}(?:${INCH_DASH_CLASS}${INCH_ATOM_CORE})*\\s*["″]`,
  'gu',
);
const TRANSLATED_INCH_ATOM_RE = new RegExp(
  `${INCH_ATOM_CORE}(?:\\s*(?:["″]|in\\b|inch(?:es)?\\b))?`,
  'giu',
);

function parseInchAtom(raw: string): number | null {
  const core = raw.replace(/\s*(?:["″]|in(?:ch(?:es)?)?)\s*$/i, '').trim();
  if (!core) return null;
  const mixed = core.match(/^(\d+)([½¼¾⅛⅜⅝⅞])$/);
  if (mixed) return Number(mixed[1]) + VULGAR_INCH_VALUE[mixed[2]];
  if (VULGAR_INCH_VALUE[core] != null) return VULGAR_INCH_VALUE[core];
  const value = Number.parseFloat(core.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

function inchValuesEqual(left: number, right: number): boolean {
  return Math.abs(left - right) < 1e-6;
}

function sourceInchAtomValues(run: string): number[] {
  const values: number[] = [];
  const atomRe = new RegExp(`${INCH_ATOM_CORE}["″]?`, 'gu');
  for (const match of run.matchAll(atomRe)) {
    const value = parseInchAtom(match[0]);
    if (value != null) values.push(value);
  }
  return values;
}

interface TranslatedInchAtom {
  start: number;
  end: number;
  value: number;
}

function collectTranslatedInchAtoms(text: string): TranslatedInchAtom[] {
  const atoms: TranslatedInchAtom[] = [];
  const atomRe = new RegExp(TRANSLATED_INCH_ATOM_RE.source, 'giu');
  let match: RegExpExecArray | null;
  while ((match = atomRe.exec(text)) !== null) {
    const value = parseInchAtom(match[0]);
    if (value == null) continue;
    atoms.push({ start: match.index, end: match.index + match[0].length, value });
  }
  return atoms;
}

function dashOnlyBetween(text: string, from: number, to: number): boolean {
  return /^[\s‐‑‒–—-]*$/.test(text.slice(from, to));
}

/**
 * Walk a translated text run atom by atom. When each parsed value matches the
 * source run, splice the exact source substring back — no combinatorial
 * decimal spellings, no split/join over the block.
 */
function restoreSourceInchRunInText(text: string, exact: string): string {
  const sourceValues = sourceInchAtomValues(exact);
  if (sourceValues.length === 0) return text;
  const atoms = collectTranslatedInchAtoms(text);
  for (let start = 0; start <= atoms.length - sourceValues.length; start += 1) {
    const window = atoms.slice(start, start + sourceValues.length);
    let contiguous = true;
    for (let index = 1; index < window.length; index += 1) {
      if (!dashOnlyBetween(text, window[index - 1].end, window[index].start)) {
        contiguous = false;
        break;
      }
    }
    if (!contiguous) continue;
    if (!window.every((atom, index) => inchValuesEqual(atom.value, sourceValues[index]))) continue;
    const from = window[0].start;
    const to = window[window.length - 1].end;
    if (text.slice(from, to) === exact) continue;
    return `${text.slice(0, from)}${exact}${text.slice(to)}`;
  }
  return text;
}

/**
 * Copy source inch strings exactly: unicode vulgar fractions and the " mark.
 * Stops 2⅜" becoming 2,375 in / 2.375" after locale number formatting.
 */
export function restoreSourceInchStringsInHtml(html: string): string {
  return html.replace(
    /<(p|h[1-6]|li|th|td|blockquote)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi,
    (full, tag: string, attrs = '', inner: string) => {
      const dataO = readAttribute(attrs, 'data-o');
      if (dataO == null) return full;
      const source = decodeEntities(dataO);
      const runs = [...source.matchAll(new RegExp(SOURCE_INCH_RUN_RE.source, 'gu'))].map((match) => match[0]);
      if (runs.length === 0) return full;
      const parts = inner.split(/(<[^>]*>)/);
      for (let index = 0; index < parts.length; index += 1) {
        if (parts[index].startsWith('<')) continue;
        let text = parts[index];
        for (const run of runs) {
          text = restoreSourceInchRunInText(text, run.replace(/\s+/g, ''));
        }
        parts[index] = text;
      }
      return `<${tag}${attrs}>${parts.join('')}</${tag}>`;
    },
  );
}

/**
 * A stray empty paragraph or <br> immediately after a heading (CUERPO: before
 * the stitch-count run) is post-processing noise, not an intentional break.
 */
export function collapseStrayBreakAfterHeading(html: string): string {
  const emptyBlock = '(?:<p\\b[^>]*>\\s*(?:<br\\s*\\/?>|&nbsp;|\\u00a0|\\s)*<\\/p>|<br\\s*\\/?>)';
  return html
    .replace(
      new RegExp(`(<(h[1-6])\\b[^>]*>[\\s\\S]*?<\\/\\2>)\\s*(?:${emptyBlock}\\s*)+(?=<)`, 'gi'),
      '$1',
    )
    .replace(
      new RegExp(
        `(<(p)\\b[^>]*>\\s*(?:<strong>)?[^<]{0,40}:\\s*(?:<\\/strong>)?\\s*<\\/p>)\\s*(?:${emptyBlock}\\s*)+(?=<(?:p|h[1-6]|table)\\b)`,
        'gi',
      ),
      '$1',
    )
    .replace(
      /(<(p)\b[^>]*>\s*(?:<strong>)?[^<]{0,40}:\s*(?:<\/strong>)?)\s*(?:<br\s*\/?>\s*)+(<\/p>)/gi,
      '$1$3',
    );
}

/** Spanish output writes k2tog in full — leftover 2pjD is unexplained. */
export function expandSpanishK2togAbbreviation(html: string): string {
  return mapVisibleText(html, (text) =>
    text.replace(/(?<![\p{L}\p{N}])2pjD(?![\p{L}\p{N}-])/giu, 'teje 2 puntos juntos del derecho'));
}
