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
