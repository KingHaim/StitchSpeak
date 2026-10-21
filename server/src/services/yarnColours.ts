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

const COLOUR_LABEL = '(?:colou?r|col(?:or)?\\.?|n[úu]m(?:ero)?)';
const COLOUR_CLAUSE_SPLIT = /[,;:.()]+/;
const COLOUR_HARD_STOP = /^(para|el|la|los|las|en|y|con|hilo|hilos|yarn|un|una|al|a|o|u|the|for|of|and|with|to)$/iu;
const COLOUR_LINKER = /^(de|del)$/iu;
const COLOUR_BRAND = /^(drops|yarn)$/iu;

function colourNameWords(region: string): string[] {
  return region
    .split(/\s+/u)
    .map((word) => word.replace(/^[\s,:;–—.-]+|[\s,:;–—.-]+$/gu, '').trim())
    .filter(Boolean);
}

function firstColourClause(region: string): string {
  return region.replace(/^[\s,;:.()]+/, '').split(COLOUR_CLAUSE_SPLIT)[0]?.trim() ?? '';
}

function lastColourClause(region: string): string {
  const trimmed = region.replace(/[\s,;:.()]+$/, '');
  const parts = trimmed.split(COLOUR_CLAUSE_SPLIT);
  return parts[parts.length - 1]?.trim() ?? '';
}

function collectAdjacentColourNames(words: string[], direction: 'forward' | 'backward'): string | null {
  const brandInClause = words.some((word) => COLOUR_BRAND.test(word) || COLOUR_HARD_STOP.test(word));
  const taken: string[] = [];
  const step = direction === 'forward' ? 1 : -1;
  for (
    let index = direction === 'forward' ? 0 : words.length - 1;
    index >= 0 && index < words.length && taken.length < 3;
    index += step
  ) {
    const word = words[index];
    if (COLOUR_HARD_STOP.test(word) || COLOUR_BRAND.test(word)) break;
    if (COLOUR_LINKER.test(word)) {
      const next = words[index + step];
      if (!next || COLOUR_HARD_STOP.test(next) || COLOUR_BRAND.test(next)) break;
      if (direction === 'forward') taken.push(word);
      else taken.unshift(word);
      continue;
    }
    if (direction === 'forward') taken.push(word);
    else taken.unshift(word);
    // Yarn/brand prefix on the same clause (`hilo DROPS Air Café`): only the
    // word touching `(color N)` is the colour name.
    if (direction === 'backward' && brandInClause) break;
  }
  return taken.length > 0 ? taken.join(' ') : null;
}

/** Visible colour-name tokens paired with a colour number — for tests and restore. */
export function translatedNameForNumber(visible: string, number: string): string | null {
  const escaped = escapeRegExp(number);
  const before = visible.match(
    new RegExp(`([\\s\\S]*?)\\(\\s*${COLOUR_LABEL}\\s*#?\\s*${escaped}\\s*\\)`, 'iu'),
  );
  const beforeName = before?.[1]
    ? collectAdjacentColourNames(colourNameWords(lastColourClause(before[1])), 'backward')
    : null;
  if (beforeName) return beforeName;
  const after = visible.match(new RegExp(`${COLOUR_LABEL}\\s*#?\\s*${escaped}([\\s\\S]*)`, 'iu'));
  return after?.[1]
    ? collectAdjacentColourNames(colourNameWords(firstColourClause(after[1])), 'forward')
    : null;
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
      let next = inner;
      for (const [translated, sourceName] of aliases) {
        const pattern = new RegExp(`(?<![\\p{L}])${escapeRegExp(translated)}(?![\\p{L}])`, 'gu');
        next = next.replace(pattern, sourceName);
      }
      return next === inner ? full : `<${tag}${attrs}>${next}</${tag}>`;
    },
  );
}
