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
    .replace(/(?<=\d)\s*[-‐‑‒—]\s*(?=\d)/g, '–')
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

const VULGAR_TO_DECIMALS: Record<string, string[]> = {
  '½': ['0.5', '0,5', '.5', ',5'],
  '¼': ['0.25', '0,25', '.25', ',25'],
  '¾': ['0.75', '0,75', '.75', ',75'],
  '⅛': ['0.125', '0,125', '.125', ',125'],
  '⅜': ['0.375', '0,375', '.375', ',375'],
  '⅝': ['0.625', '0,625', '.625', ',625'],
  '⅞': ['0.875', '0,875', '.875', ',875'],
};

const SOURCE_INCH_RUN_RE =
  /(?:\d+[½¼¾⅛⅜⅝⅞]|[½¼¾⅛⅜⅝⅞]|\d+(?:[.,]\d+)?)(?:\s*[‐‑‒–—-]\s*(?:\d+[½¼¾⅛⅜⅝⅞]|[½¼¾⅛⅜⅝⅞]|\d+(?:[.,]\d+)?))*\s*["″]/gu;

function decimalVariantsForInchAtom(atom: string): string[] {
  const variants = new Set<string>([atom]);
  const mixed = atom.match(/^(\d+)([½¼¾⅛⅜⅝⅞])$/);
  const bare = atom.match(/^([½¼¾⅛⅜⅝⅞])$/);
  const fraction = mixed?.[2] ?? bare?.[1];
  if (fraction && VULGAR_TO_DECIMALS[fraction]) {
    for (const decimal of VULGAR_TO_DECIMALS[fraction]) {
      variants.add(mixed ? `${mixed[1]}${decimal.replace(/^0/, '')}` : decimal);
      variants.add(mixed ? `${mixed[1]}${decimal}` : decimal);
    }
  }
  return [...variants];
}

function inchRunCorruptions(sourceRun: string): string[] {
  const mark = sourceRun.trim().endsWith('″') ? '″' : '"';
  const body = sourceRun.replace(/["″]\s*$/, '').trim();
  const atoms = body.split(/\s*[‐‑‒–—-]\s*/);
  const atomVariants = atoms.map(decimalVariantsForInchAtom);
  const joiners = ['-', '–', '-'];
  const corruptions = new Set<string>();
  for (const joiner of joiners) {
    const combos = atomVariants.reduce<string[][]>((acc, options) => {
      if (acc.length === 0) return options.map((option) => [option]);
      return acc.flatMap((prefix) => options.map((option) => [...prefix, option]));
    }, []);
    for (const combo of combos) {
      const joined = combo.join(joiner);
      corruptions.add(`${joined}${mark}`);
      corruptions.add(`${joined} in`);
      corruptions.add(`${joined}in`);
    }
  }
  return [...corruptions].filter((value) => value !== sourceRun);
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
      const runs = source.match(SOURCE_INCH_RUN_RE);
      if (!runs || runs.length === 0) return full;
      let next = inner;
      for (const run of runs) {
        const exact = run.replace(/\s+/g, '');
        for (const corruption of inchRunCorruptions(exact)) {
          next = next.split(corruption).join(exact);
        }
        next = next.replace(
          new RegExp(
            `${exact.replace(/["″]$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(?:in|inch|inches)\\b`,
            'gi',
          ),
          exact,
        );
      }
      return `<${tag}${attrs}>${next}</${tag}>`;
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
