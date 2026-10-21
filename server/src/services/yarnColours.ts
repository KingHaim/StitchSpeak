/**
 * Yarn colour / product names from the materials list (colour name + colour
 * number) stay in the source spelling everywhere — yarn list, instructions,
 * and chart key.
 */

const COLOUR_BEFORE_NUMBER =
  /([A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+){0,3})\s*\(\s*(?:colou?r|col\.?)\s*(?:no\.?)?\s*#?\s*(\d{1,5})\s*\)/g;
const NUMBER_BEFORE_COLOUR =
  /(?:colou?r|col\.?)\s*(?:no\.?)?\s*#?\s*(\d{1,5})\s*,?[ \t]*([A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+){0,3})/g;

export interface YarnColourName {
  name: string;
  number: string;
}

function addColour(found: Map<string, string>, name: string, number: string): void {
  const trimmed = name.replace(/\s+/g, ' ').trim();
  if (!trimmed || !number) return;
  if (!found.has(number)) found.set(number, trimmed);
}

export function extractYarnColourNames(text: string): YarnColourName[] {
  const found = new Map<string, string>();
  for (const match of text.matchAll(COLOUR_BEFORE_NUMBER)) {
    addColour(found, match[1], match[2]);
  }
  for (const match of text.matchAll(NUMBER_BEFORE_COLOUR)) {
    addColour(found, match[2], match[1]);
  }
  return [...found.entries()].map(([number, name]) => ({ name, number }));
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

function readAttribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  if (!match) return null;
  return match[1] ?? match[2] ?? '';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectSourceText(html: string): string {
  const chunks: string[] = [];
  const pattern = /\bdata-o\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    chunks.push(decodeEntities(match[1] ?? match[2] ?? ''));
  }
  return chunks.join('\n');
}

function translatedNameForNumber(visible: string, number: string): string | null {
  const before = visible.match(
    new RegExp(`([\\p{L}][\\p{L}\\s]{0,40}?)\\s*\\(\\s*(?:colou?r|col(?:or)?\\.?|n[úu]m(?:ero)?)\\s*#?\\s*${escapeRegExp(number)}\\s*\\)`, 'iu'),
  );
  if (before?.[1]) return before[1].replace(/\s+/g, ' ').trim();
  const after = visible.match(
    new RegExp(`(?:colou?r|col(?:or)?\\.?|n[úu]m(?:ero)?)\\s*#?\\s*${escapeRegExp(number)}\\s*,?\\s*([\\p{L}][\\p{L}\\s]{0,40})`, 'iu'),
  );
  return after?.[1]?.replace(/\s+/g, ' ').trim() ?? null;
}

export function yarnColourPromptRule(names: YarnColourName[]): string {
  if (names.length === 0) {
    return `- Yarn colour / product names that appear with a colour number in the materials list (for example Coffee, Cherry Jam, Rust, Moss Green, Olive Oil) are product names. Keep the source spelling everywhere: yarn list, instructions, and chart key. Never translate them.`;
  }
  const list = names.map((entry) => `${entry.name} (${entry.number})`).join(', ');
  return `- Yarn colour / product names from the materials list are locked product names. Keep this source spelling everywhere (yarn list, instructions, chart key): ${list}. Never translate them.`;
}

/**
 * Restore source colour names wherever the translation paired a different
 * name with the same colour number, and replace those translated names in
 * later instructions / chart keys.
 */
export function restoreYarnColourNamesInHtml(html: string): string {
  const colours = extractYarnColourNames(collectSourceText(html));
  if (colours.length === 0) return html;

  const aliases = new Map<string, string>();
  html.replace(
    /<(p|h[1-6]|li|th|td|blockquote)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi,
    (_full, _tag: string, _attrs = '', inner: string) => {
      const visible = decodeEntities(inner.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
      for (const colour of colours) {
        const translated = translatedNameForNumber(visible, colour.number);
        if (translated && translated.localeCompare(colour.name, undefined, { sensitivity: 'accent' }) !== 0) {
          aliases.set(translated, colour.name);
        }
      }
      return '';
    },
  );

  if (aliases.size === 0) return html;

  return html.replace(
    /<(p|h[1-6]|li|th|td|blockquote)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi,
    (full, tag: string, attrs = '', inner: string) => {
      const dataO = readAttribute(attrs, 'data-o');
      let next = inner;
      for (const [translated, sourceName] of aliases) {
        const pattern = new RegExp(`(?<![\\p{L}])${escapeRegExp(translated)}(?![\\p{L}])`, 'gu');
        if (dataO && decodeEntities(dataO).includes(sourceName)) {
          next = next.replace(pattern, sourceName);
          continue;
        }
        next = next.replace(pattern, sourceName);
      }
      return next === inner ? full : `<${tag}${attrs}>${next}</${tag}>`;
    },
  );
}
